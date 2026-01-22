/**
 * Web Speech API TTS提供者
 * 封装浏览器原生的语音合成功能
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';

export class WebSpeechTTSProvider implements ITTSProvider {
  readonly name = 'web-speech';

  private config: TTSProviderConfig;
  private synthesis: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private isInitialized = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor(config: TTSProviderConfig = {}) {
    this.config = {
      lang: 'en-US',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config,
    };
    this.synthesis = window.speechSynthesis;
    this.initialize();
  }

  /**
   * 初始化TTS服务
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 等待语音列表加载
    await this.loadVoices();
    this.isInitialized = true;
  }

  /**
   * 加载可用的语音
   */
  private loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      const loadVoicesHandler = () => {
        this.voices = this.synthesis.getVoices();
        if (this.voices.length > 0) {
          resolve();
        }
      };

      // 有些浏览器需要异步加载语音
      if (this.synthesis.getVoices().length > 0) {
        loadVoicesHandler();
      } else {
        this.synthesis.onvoiceschanged = loadVoicesHandler;
        // 设置超时防止无限等待
        setTimeout(() => {
          if (this.voices.length === 0) {
            this.voices = this.synthesis.getVoices();
          }
          resolve();
        }, 1000);
      }
    });
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

      // 确保已初始化
      await this.initialize();

      // 停止当前朗读
      this.stop();

      const finalConfig = { ...this.config, ...config };
      const utterance = new SpeechSynthesisUtterance(text);
      this.currentUtterance = utterance;

      // 设置语音参数
      utterance.lang = finalConfig.lang || 'en-US';
      utterance.rate = finalConfig.rate || 1.0;
      utterance.pitch = finalConfig.pitch || 1.0;
      utterance.volume = finalConfig.volume || 1.0;

      // 选择合适的语音
      const voice = this.selectVoice(
        finalConfig.lang || 'en-US',
        finalConfig.voice,
      );
      if (voice) {
        utterance.voice = voice;
      }

      return new Promise((resolve) => {
        utterance.onend = () => {
          this.currentUtterance = null;
          resolve({ success: true });
        };

        utterance.onerror = (event) => {
          this.currentUtterance = null;
          resolve({
            success: false,
            error: `朗读失败: ${event.error}`,
          });
        };

        this.synthesis.speak(utterance);
      });
    } catch (error) {
      this.currentUtterance = null;
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  stop(): void {
    if (this.synthesis.speaking) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
  }

  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  isAvailable(): boolean {
    return 'speechSynthesis' in window;
  }

  updateConfig(config: Partial<TTSProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSProviderConfig {
    return { ...this.config };
  }

  /**
   * 获取可用的语音列表
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  /**
   * 获取指定语言的语音
   */
  getVoicesByLanguage(lang: string): SpeechSynthesisVoice[] {
    return this.voices.filter((voice) =>
      voice.lang.toLowerCase().startsWith(lang.toLowerCase()),
    );
  }

  /**
   * 选择合适的语音
   */
  private selectVoice(
    lang: string,
    preferredVoice?: string,
  ): SpeechSynthesisVoice | null {
    if (this.voices.length === 0) return null;

    // 如果指定了特定语音，尝试找到它
    if (preferredVoice) {
      const voice = this.voices.find((v) => v.name === preferredVoice);
      if (voice) return voice;
    }

    // 寻找匹配语言的语音
    const languageVoices = this.getVoicesByLanguage(lang);
    if (languageVoices.length > 0) {
      // 优先选择本地语音
      const localVoice = languageVoices.find((v) => v.localService);
      if (localVoice) return localVoice;

      // 否则返回第一个匹配的语音
      return languageVoices[0];
    }

    return null;
  }
}
