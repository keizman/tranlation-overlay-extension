/**
 * 有道词典TTS提供者
 * 使用有道词典的语音接口提供朗读功能
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';
import { TIMER_CONSTANTS, API_CONSTANTS } from '../../pronunciation/config';
import { audioPlaybackService } from '../../architecture/bootstrap/defaultAdapters';
import type { AudioPlaybackSession } from '../../architecture/core/ports';

export class YoudaoTTSProvider implements ITTSProvider {
  readonly name = 'youdao';

  private config: TTSProviderConfig;
  private currentSession: AudioPlaybackSession | null = null;

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
      const accent = finalConfig.accent || 'us';

      // 构建有道词典语音URL
      const type = accent === 'us' ? 2 : 1; // 1=英式, 2=美式
      const audioUrl = `${API_CONSTANTS.YOUDAO_TTS_BASE_URL}?type=${type}&audio=${encodeURIComponent(text)}`;

      console.log(
        `[DEBUG] 有道TTS URL: ${audioUrl}, accent: ${accent}, type: ${type}`,
      );

      await audioPlaybackService.warmUp();

      return new Promise((resolve) => {
        let isResolved = false;

        // 设置超时机制，防止无限等待
        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            audioPlaybackService.stop(this.currentSession);
            this.currentSession = null;
            resolve({
              success: false,
              error: '有道语音加载超时',
            });
          }
        }, TIMER_CONSTANTS.YOUDAO_TIMEOUT); // 有道TTS超时

        const cleanup = () => {
          clearTimeout(timeout);
          this.currentSession = null;
        };

        audioPlaybackService
          .playUrl(audioUrl)
          .then((session) => {
            this.currentSession = session;
            void session.finished.then(() => {
              if (this.currentSession?.id !== session.id) return;
              if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve({ success: true });
              }
            });
          })
          .catch((error) => {
            if (!isResolved) {
              isResolved = true;
              cleanup();
              resolve({
                success: false,
                error: `有道语音初始化失败: ${String(error)}`,
              });
            }
          });
      });
    } catch (error) {
      this.currentSession = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  stop(): void {
    if (this.currentSession) {
      audioPlaybackService.stop(this.currentSession);
      this.currentSession = null;
    }
  }

  isSpeaking(): boolean {
    return !!this.currentSession && this.currentSession.isPlaying();
  }

  isAvailable(): boolean {
    // 检查是否支持Audio API
    return typeof Audio !== 'undefined';
  }

  updateConfig(config: Partial<TTSProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSProviderConfig {
    return { ...this.config };
  }

  /**
   * 预加载音频（可选功能）
   * @param text 要预加载的文本
   * @param accent 发音类型
   */
  async preloadAudio(
    text: string,
    accent: 'us' | 'uk' = 'us',
  ): Promise<boolean> {
    try {
      const type = accent === 'us' ? 2 : 1;
      const audioUrl = `${API_CONSTANTS.YOUDAO_TTS_BASE_URL}?type=${type}&audio=${encodeURIComponent(text)}`;
      const session = await audioPlaybackService.playUrl(audioUrl);
      audioPlaybackService.stop(session);
      return true;
    } catch (_) {
      return false;
    }
  }
}
