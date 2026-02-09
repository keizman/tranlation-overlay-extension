export interface AudioRecognitionConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
}

export interface AudioRecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface AudioInputSession {
  stop(): void;
}

export interface AudioInputPort {
  isAvailable(): boolean;
  startCapture(
    config: AudioRecognitionConfig,
    onResult: (result: AudioRecognitionResult) => void,
    onError: (error: Error) => void,
  ): Promise<AudioInputSession>;
  stopCapture(): void;
}
