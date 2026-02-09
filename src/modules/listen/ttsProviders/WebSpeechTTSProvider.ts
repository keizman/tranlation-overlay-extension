/**
 * Web Speech API TTS提供者
 * 通过 architecture 的 SpeakingService 统一调用平台能力
 */

import { speakingService } from '../../architecture/bootstrap/defaultAdapters';
import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { TTSResult } from '../types';

export class WebSpeechTTSProvider implements ITTSProvider {
  readonly name = 'web-speech';

  private config: TTSProviderConfig;
  private voices: SpeechSynthesisVoice[] = [];
  private isInitialized = false;

  constructor(config: TTSProviderConfig = {}) {
    this.config = {
      lang: 'en-US',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      ...config,
    };
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.loadVoices();
    this.isInitialized = true;
  }

  private async loadVoices(): Promise<void> {
    const voices = await speakingService.getVoices();
    this.voices = voices.map(
      (voice) =>
        ({
          voiceURI: voice.id,
          name: voice.name,
          lang: voice.lang,
          localService: voice.localService,
          default: voice.isDefault,
        }) as SpeechSynthesisVoice,
    );
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

      await this.initialize();
      this.stop();

      const finalConfig = { ...this.config, ...config };
      await speakingService.speak({
        text,
        lang: finalConfig.lang || 'en-US',
        voiceId: finalConfig.voice,
        rate: finalConfig.rate,
        pitch: finalConfig.pitch,
        volume: finalConfig.volume,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }

  stop(): void {
    speakingService.stop();
  }

  isSpeaking(): boolean {
    return speakingService.isSpeaking();
  }

  isAvailable(): boolean {
    return speakingService.isAvailable();
  }

  updateConfig(config: Partial<TTSProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSProviderConfig {
    return { ...this.config };
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  getVoicesByLanguage(lang: string): SpeechSynthesisVoice[] {
    return this.voices.filter((voice) =>
      voice.lang.toLowerCase().startsWith(lang.toLowerCase()),
    );
  }
}
