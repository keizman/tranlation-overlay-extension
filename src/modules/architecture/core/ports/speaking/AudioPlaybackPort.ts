export interface AudioPlaybackSession {
  id: string;
  durationSeconds: number;
  finished: Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  getCurrentTime(): number;
  isPlaying(): boolean;
  isPaused(): boolean;
}

export interface AudioPlaybackPort {
  warmUp(): Promise<void>;
  playUrl(url: string): Promise<AudioPlaybackSession>;
  playBlob(blob: Blob): Promise<AudioPlaybackSession>;
  playArrayBuffer(
    arrayBuffer: ArrayBuffer,
    startOffsetSeconds?: number,
  ): Promise<AudioPlaybackSession>;
  decodeDuration(arrayBuffer: ArrayBuffer): Promise<number>;
  stop(session?: AudioPlaybackSession | null): void;
}
