import type {
  SpeechBoundaryPort,
  SpeechBoundaryRequest,
} from '../../ports/speaking';

export class SpeechBoundaryService {
  constructor(private readonly speechBoundaryPort: SpeechBoundaryPort) {}

  isAvailable(): boolean {
    return this.speechBoundaryPort.isAvailable();
  }

  async speakWithWordBoundary(
    request: SpeechBoundaryRequest,
    onWordBoundary: (charIndex: number) => void,
  ): Promise<void> {
    await this.speechBoundaryPort.speakWithWordBoundary(
      request,
      onWordBoundary,
    );
  }

  cancel(): void {
    this.speechBoundaryPort.cancel();
  }
}
