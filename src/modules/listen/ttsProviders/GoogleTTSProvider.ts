/**
 * Google TTS提供者
 * 使用Google翻译的语音接口提供朗读功能（通过JWT认证代理）
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';
import { TIMER_CONSTANTS } from '../../pronunciation/config';
import { httpClient } from '../../auth/RequestInterceptor';

const GOOGLE_TTS_ENDPOINT = '/translate_tts';

export class GoogleTTSProvider implements ITTSProvider {
  readonly name = 'google';

  private config: TTSProviderConfig;
  private currentAudio: HTMLAudioElement | null = null;

  constructor(config: TTSProviderConfig = {}) {
    this.config = {
      accent: 'us', // 默认美式发音
      ...config,
    };
  }

  async speak(
    text: string,
    config?: Partial<TTSProviderConfig>,
  ): Promise<TTSResult> {
    try {
      if (!text || typeof text !== 'string') {
        return {
          success: false,
          error: '文本参数无效',
        };
      }

      // 停止当前朗读
      this.stop();

      const finalConfig = { ...this.config, ...config };
      const lang = finalConfig.accent === 'uk' ? 'en-GB' : 'en-US';

      const params = new URLSearchParams({
        ie: 'UTF-8',
        client: 'gtx',
        tl: lang,
        q: text,
      });
      const audioUrl = `${GOOGLE_TTS_ENDPOINT}?${params.toString()}`;

      console.log(`[DEBUG] Google TTS URL: ${audioUrl}, lang: ${lang}`);

      const audio = new Audio();
      this.currentAudio = audio;

      return new Promise((resolve) => {
        let isResolved = false;

        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            this.currentAudio = null;
            resolve({
              success: false,
              error: 'Google语音加载超时',
            });
          }
        }, TIMER_CONSTANTS.YOUDAO_TIMEOUT);

        const cleanup = () => {
          clearTimeout(timeout);
          this.currentAudio = null;
        };

        audio.onended = () => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({ success: true });
          }
        };

        audio.onerror = () => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({
              success: false,
              error: 'Google语音播放失败',
            });
          }
        };

        audio.oncanplay = () => {
          audio.play().catch((error) => {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              resolve({
                success: false,
                error: `音频播放失败: ${error.message}`,
              });
            }
          });
        };

        audio.onabort = () => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({
              success: false,
              error: 'Google语音加载被中断',
            });
          }
        };

        httpClient
          .get(audioUrl)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const blob = await response.blob();
            if (blob.size > 0) {
              audio.src = URL.createObjectURL(blob);
              audio.load();
              return;
            }

            if (!isResolved) {
              isResolved = true;
              cleanup();
              resolve({
                success: false,
                error: 'Google语音获取失败',
              });
            }
          })
          .catch((error) => {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              resolve({
                success: false,
                error: `Google语音请求失败: ${error.message}`,
              });
            }
          });
      });
    } catch (error) {
      this.currentAudio = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  stop(): void {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      // Revoke object URL to free memory
      if (this.currentAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentAudio.src);
      }
      this.currentAudio = null;
    }
  }

  isSpeaking(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
  }

  isAvailable(): boolean {
    return typeof Audio !== 'undefined' && typeof fetch !== 'undefined';
  }

  updateConfig(config: Partial<TTSProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSProviderConfig {
    return { ...this.config };
  }
}
