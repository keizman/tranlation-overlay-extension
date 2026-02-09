import type {
  SpeechBoundaryPort,
  SpeechBoundaryRequest,
} from '../../../core/ports';

export class BrowserSpeechBoundaryAdapter implements SpeechBoundaryPort {
  private synthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    this.synthesis =
      typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  isAvailable(): boolean {
    return !!this.synthesis;
  }

  async speakWithWordBoundary(
    request: SpeechBoundaryRequest,
    onWordBoundary: (charIndex: number) => void,
  ): Promise<void> {
    if (!this.synthesis) {
      throw new Error('speechSynthesis is not available');
    }

    this.cancel();

    await new Promise<void>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(request.text);
      this.currentUtterance = utterance;

      utterance.volume = 0;
      utterance.rate = request.rate ?? 1;
      utterance.lang = request.lang || 'en-US';

      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === 'word') {
          onWordBoundary(event.charIndex);
        }
      };

      utterance.onend = () => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        resolve();
      };

      utterance.onerror = () => {
        if (this.currentUtterance === utterance) {
          this.currentUtterance = null;
        }
        resolve();
      };

      this.synthesis!.speak(utterance);
    });
  }

  cancel(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
    this.currentUtterance = null;
  }
}
