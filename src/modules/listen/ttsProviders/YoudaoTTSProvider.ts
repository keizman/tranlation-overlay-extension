/**
 * 有道词典TTS提供者
 * 使用有道词典的语音接口提供朗读功能
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';
import { TIMER_CONSTANTS, API_CONSTANTS } from '../../pronunciation/config';

export class YoudaoTTSProvider implements ITTSProvider {
  readonly name = 'youdao';

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
      const accent = finalConfig.accent || 'us';

      // 构建有道词典语音URL
      const type = accent === 'us' ? 2 : 1; // 1=英式, 2=美式
      const audioUrl = `${API_CONSTANTS.YOUDAO_TTS_BASE_URL}?type=${type}&audio=${encodeURIComponent(text)}`;

      console.log(
        `[DEBUG] 有道TTS URL: ${audioUrl}, accent: ${accent}, type: ${type}`,
      );

      // 创建音频元素
      const audio = new Audio(audioUrl);
      this.currentAudio = audio;

      return new Promise((resolve) => {
        let isResolved = false;

        // 设置超时机制，防止无限等待
        const timeout = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            this.currentAudio = null;
            resolve({
              success: false,
              error: '有道语音加载超时',
            });
          }
        }, TIMER_CONSTANTS.YOUDAO_TIMEOUT); // 有道TTS超时

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

        audio.onerror = (event) => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({
              success: false,
              error: '有道语音播放失败',
            });
          }
        };

        audio.onloadstart = () => {
          // 音频开始加载
        };

        audio.oncanplay = () => {
          // 音频可以播放
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

        // 网络错误处理
        audio.onabort = () => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({
              success: false,
              error: '有道语音加载被中断',
            });
          }
        };

        audio.onstalled = () => {
          // 加载停滞，但不立即失败，等待超时处理
        };

        // 开始加载音频
        try {
          audio.load();
        } catch (error) {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            resolve({
              success: false,
              error: `有道语音初始化失败: ${error}`,
            });
          }
        }
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
      this.currentAudio = null;
    }
  }

  isSpeaking(): boolean {
    return this.currentAudio !== null && !this.currentAudio.paused;
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

      const audio = new Audio(audioUrl);

      return new Promise((resolve) => {
        audio.oncanplaythrough = () => {
          resolve(true);
        };

        audio.onerror = () => {
          resolve(false);
        };

        audio.load();
      });
    } catch (_) {
      return false;
    }
  }
}
