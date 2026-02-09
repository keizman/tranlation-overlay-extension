import type { TtsPort, TtsSpeakRequest, TtsVoice } from '../../../core/ports';

const VOICE_LOAD_TIMEOUT_MS = 1000;

export class BrowserTtsAdapter implements TtsPort {
  private readonly synthesis: SpeechSynthesis | null;

  constructor() {
    this.synthesis =
      typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  isAvailable(): boolean {
    return !!this.synthesis;
  }

  async listVoices(): Promise<TtsVoice[]> {
    if (!this.synthesis) return [];

    const voices = await this.loadVoices();
    return voices.map((voice) => ({
      id: voice.name,
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService,
      isDefault: voice.default,
    }));
  }

  async speak(request: TtsSpeakRequest): Promise<void> {
    if (!this.synthesis) {
      throw new Error('speechSynthesis is not available');
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = request.lang || 'en-US';
    utterance.rate = request.rate ?? 1;
    utterance.pitch = request.pitch ?? 1;
    utterance.volume = request.volume ?? 1;

    const voices = await this.loadVoices();
    const selectedVoice = this.selectVoice(
      voices,
      request.voiceId,
      request.lang,
    );
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event) =>
        reject(new Error(`TTS failed: ${event.error}`));
      this.synthesis!.speak(utterance);
    });
  }

  stop(): void {
    if (this.synthesis?.speaking) {
      this.synthesis.cancel();
    }
  }

  pause(): void {
    if (this.synthesis?.speaking) {
      this.synthesis.pause();
    }
  }

  resume(): void {
    if (this.synthesis?.paused) {
      this.synthesis.resume();
    }
  }

  isSpeaking(): boolean {
    return !!this.synthesis?.speaking;
  }

  isPaused(): boolean {
    return !!this.synthesis?.paused;
  }

  private async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    if (!this.synthesis) return [];

    const existing = this.synthesis.getVoices();
    if (existing.length > 0) {
      return existing;
    }

    return new Promise((resolve) => {
      const timeoutId = window.setTimeout(() => {
        resolve(this.synthesis!.getVoices());
      }, VOICE_LOAD_TIMEOUT_MS);

      this.synthesis!.onvoiceschanged = () => {
        window.clearTimeout(timeoutId);
        resolve(this.synthesis!.getVoices());
      };
    });
  }

  private selectVoice(
    voices: SpeechSynthesisVoice[],
    voiceId?: string,
    lang?: string,
  ): SpeechSynthesisVoice | null {
    if (voices.length === 0) return null;

    if (voiceId) {
      const exactVoice = voices.find((voice) => voice.name === voiceId);
      if (exactVoice) return exactVoice;
    }

    if (lang) {
      const langMatch = voices.find((voice) =>
        voice.lang.toLowerCase().startsWith(lang.toLowerCase()),
      );
      if (langMatch) return langMatch;
    }

    return voices[0];
  }
}
