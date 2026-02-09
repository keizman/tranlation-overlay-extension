export interface SpeechBoundaryRequest {
  text: string;
  lang?: string;
  rate?: number;
}

export interface SpeechBoundaryPort {
  isAvailable(): boolean;
  speakWithWordBoundary(
    request: SpeechBoundaryRequest,
    onWordBoundary: (charIndex: number) => void,
  ): Promise<void>;
  cancel(): void;
}
