/**
 * 文本转语音服务
 * 通过 architecture 层的 SpeakingService 访问平台能力
 */

import { speakingService } from '../../architecture/bootstrap/defaultAdapters';
import type { TTSConfig } from '../config';
import type { TTSResult } from '../../listen/types';

export class TTSService {
  private config: TTSConfig;
  private voices: SpeechSynthesisVoice[] = [];
  private isInitialized = false;

  constructor(config: TTSConfig) {
    this.config = config;
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

  async speak(text: string, config?: Partial<TTSConfig>): Promise<TTSResult> {
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

  pause(): void {
    speakingService.pause();
  }

  resume(): void {
    speakingService.resume();
  }

  isSpeaking(): boolean {
    return speakingService.isSpeaking();
  }

  isPaused(): boolean {
    return speakingService.isPaused();
  }

  isAvailable(): boolean {
    return speakingService.isAvailable();
  }

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices;
  }

  getVoicesByLanguage(lang: string): SpeechSynthesisVoice[] {
    return this.voices.filter((voice) =>
      voice.lang.toLowerCase().startsWith(lang.toLowerCase()),
    );
  }

  updateConfig(config: Partial<TTSConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TTSConfig {
    return { ...this.config };
  }
}
