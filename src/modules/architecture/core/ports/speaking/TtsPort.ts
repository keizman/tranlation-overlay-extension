export interface TtsVoice {
  id: string;
  name: string;
  lang: string;
  localService: boolean;
  isDefault: boolean;
}

export interface TtsSpeakRequest {
  text: string;
  lang?: string;
  voiceId?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface TtsPort {
  isAvailable(): boolean;
  listVoices(): Promise<TtsVoice[]>;
  speak(request: TtsSpeakRequest): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  isSpeaking(): boolean;
  isPaused(): boolean;
}
