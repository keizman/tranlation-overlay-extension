import type {
  AudioInputPort,
  AudioRecognitionConfig,
  AudioRecognitionResult,
  AudioInputSession,
} from '../../../core/ports';

type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  start: () => void;
  stop: () => void;
};

export class BrowserAudioInputAdapter implements AudioInputPort {
  private recognition: RecognitionLike | null = null;

  isAvailable(): boolean {
    return this.getRecognitionConstructor() !== null;
  }

  async startCapture(
    config: AudioRecognitionConfig,
    onResult: (result: AudioRecognitionResult) => void,
    onError: (error: Error) => void,
  ): Promise<AudioInputSession> {
    const RecognitionCtor = this.getRecognitionConstructor();
    if (!RecognitionCtor) {
      throw new Error('SpeechRecognition is not available');
    }

    this.stopCapture();

    const recognition = new RecognitionCtor() as RecognitionLike;
    recognition.continuous = config.continuous ?? true;
    recognition.interimResults = config.interimResults ?? true;
    recognition.lang = config.language || 'en-US';
    recognition.maxAlternatives = config.maxAlternatives ?? 1;
    recognition.onresult = (event: any) => {
      const index = event.resultIndex ?? 0;
      const result = event.results?.[index]?.[0];
      if (!result) return;
      onResult({
        transcript: result.transcript || '',
        isFinal: !!event.results?.[index]?.isFinal,
        confidence: result.confidence,
      });
    };
    recognition.onerror = (event: any) => {
      onError(new Error(event?.error || 'Speech recognition failed'));
    };

    recognition.start();
    this.recognition = recognition;

    return {
      stop: () => {
        recognition.stop();
        if (this.recognition === recognition) {
          this.recognition = null;
        }
      },
    };
  }

  stopCapture(): void {
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
  }

  private getRecognitionConstructor(): (new () => RecognitionLike) | null {
    if (typeof window === 'undefined') return null;
    const anyWindow = window as any;
    return (
      anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition || null
    );
  }
}
