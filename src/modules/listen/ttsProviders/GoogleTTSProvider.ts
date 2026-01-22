/**
 * Google TTS提供者
 * 使用Google翻译的语音接口提供朗读功能（通过nginx代理）
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';
import { TIMER_CONSTANTS } from '../../pronunciation/config';

// Google TTS proxy configuration
const GOOGLE_TTS_BASE_URL = 'https://translate.planktonfly.com/translate_tts';
const GOOGLE_TTS_AUTH = 'Basic bXl1c2VyOjEyMzQ1NjY='; // myuser:1234566

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
      // Google TTS uses language codes like 'en', 'en-US', 'en-GB'
      const lang = finalConfig.accent === 'uk' ? 'en-GB' : 'en-US';

      // 构建Google TTS代理URL
      const audioUrl = `${GOOGLE_TTS_BASE_URL}?ie=UTF-8&client=gtx&tl=${lang}&q=${encodeURIComponent(text)}`;

      console.log(`[DEBUG] Google TTS URL: ${audioUrl}, lang: ${lang}`);

      // 创建音频元素
      const audio = new Audio();
      this.currentAudio = audio;

      return new Promise((resolve) => {
        let isResolved = false;

        // 设置超时机制
        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            this.currentAudio = null;
            resolve({
              success: false,
              error: 'Google语音加载超时',
            });
          }
        }, TIMER_CONSTANTS.YOUDAO_TIMEOUT); // 复用超时常量

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

        // 使用fetch获取音频(需要认证头)
        this.fetchAudioWithAuth(audioUrl)
          .then((blob) => {
            if (blob) {
              audio.src = URL.createObjectURL(blob);
              audio.load();
            } else {
              if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve({
                  success: false,
                  error: 'Google语音获取失败',
                });
              }
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

  /**
   * 使用认证头获取音频
   */
  private async fetchAudioWithAuth(url: string): Promise<Blob | null> {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Proxy-Target': 'google',
          Authorization: GOOGLE_TTS_AUTH,
        },
      });

      if (response.ok) {
        return await response.blob();
      }
      console.error(`[GoogleTTS] 请求失败: ${response.status}`);
      return null;
    } catch (error) {
      console.error('[GoogleTTS] 请求异常:', error);
      return null;
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
