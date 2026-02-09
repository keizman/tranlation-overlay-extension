import type { TtsPort, TtsSpeakRequest, TtsVoice } from '../../ports/speaking';

export class SpeakingService {
  constructor(private readonly ttsPort: TtsPort) {}

  isAvailable(): boolean {
    return this.ttsPort.isAvailable();
  }

  async speak(request: TtsSpeakRequest): Promise<void> {
    await this.ttsPort.speak(request);
  }

  stop(): void {
    this.ttsPort.stop();
  }

  pause(): void {
    this.ttsPort.pause();
  }

  resume(): void {
    this.ttsPort.resume();
  }

  isSpeaking(): boolean {
    return this.ttsPort.isSpeaking();
  }

  isPaused(): boolean {
    return this.ttsPort.isPaused();
  }

  async getVoices(): Promise<TtsVoice[]> {
    return this.ttsPort.listVoices();
  }
}
