import type {
  AudioPlaybackPort,
  AudioPlaybackSession,
} from '../../ports/speaking';

export class AudioPlaybackService {
  constructor(private readonly audioPlaybackPort: AudioPlaybackPort) {}

  async warmUp(): Promise<void> {
    await this.audioPlaybackPort.warmUp();
  }

  async playBlob(blob: Blob): Promise<AudioPlaybackSession> {
    return this.audioPlaybackPort.playBlob(blob);
  }

  async playUrl(url: string): Promise<AudioPlaybackSession> {
    return this.audioPlaybackPort.playUrl(url);
  }

  async playArrayBuffer(
    arrayBuffer: ArrayBuffer,
    startOffsetSeconds: number = 0,
  ): Promise<AudioPlaybackSession> {
    return this.audioPlaybackPort.playArrayBuffer(
      arrayBuffer,
      startOffsetSeconds,
    );
  }

  async decodeDuration(arrayBuffer: ArrayBuffer): Promise<number> {
    return this.audioPlaybackPort.decodeDuration(arrayBuffer);
  }

  stop(session?: AudioPlaybackSession | null): void {
    this.audioPlaybackPort.stop(session);
  }
}
