import type {
  AudioPlaybackPort,
  AudioPlaybackSession,
} from '../../../core/ports';

const WARM_UP_DURATION_SECONDS = 0.01;

class BrowserAudioPlaybackSession implements AudioPlaybackSession {
  public readonly id: string;
  public readonly durationSeconds: number;
  public readonly finished: Promise<void>;

  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private startTime = 0;
  private pauseTime = 0;
  private playbackOffset = 0;
  private playing = false;
  private paused = false;
  private resolved = false;
  private resolveFinished!: () => void;

  constructor(
    private readonly audioContext: AudioContext,
    private readonly audioBuffer: AudioBuffer,
    startOffsetSeconds: number,
    private readonly onEnded: () => void,
  ) {
    this.id = `audio-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.durationSeconds = audioBuffer.duration;
    this.finished = new Promise<void>((resolve) => {
      this.resolveFinished = resolve;
    });
    this.startPlayback(startOffsetSeconds);
  }

  stop(): void {
    this.stopSource();
    this.playing = false;
    this.paused = false;
    this.resolveIfNeeded();
  }

  pause(): void {
    if (!this.playing || this.paused) return;
    this.pauseTime = this.getCurrentTime();
    this.stopSource();
    this.paused = true;
    this.playing = false;
  }

  resume(): void {
    if (!this.paused) return;
    this.startPlayback(this.pauseTime);
  }

  getCurrentTime(): number {
    if (this.paused) return this.pauseTime;
    if (!this.playing) return this.pauseTime;
    return (
      this.playbackOffset + (this.audioContext.currentTime - this.startTime)
    );
  }

  isPlaying(): boolean {
    return this.playing && !this.paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  private startPlayback(offset: number): void {
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    this.stopSource();

    this.source = this.audioContext.createBufferSource();
    this.source.buffer = this.audioBuffer;

    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 1;

    this.source.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    this.playbackOffset = offset;
    this.startTime = this.audioContext.currentTime;
    this.playing = true;
    this.paused = false;

    this.source.onended = () => {
      if (!this.playing || this.paused) return;
      this.playing = false;
      this.pauseTime = this.durationSeconds;
      this.resolveIfNeeded();
      this.onEnded();
    };

    this.source.start(0, offset);
  }

  private stopSource(): void {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch (_) {
      // ignore when already stopped
    }
    this.source.onended = null;
    this.source = null;
    this.gainNode = null;
  }

  private resolveIfNeeded(): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveFinished();
  }
}

export class BrowserAudioPlaybackAdapter implements AudioPlaybackPort {
  private audioContext: AudioContext | null = null;
  private warmedUp = false;
  private currentSession: BrowserAudioPlaybackSession | null = null;
  private currentHtmlAudio: HTMLAudioElement | null = null;

  async warmUp(): Promise<void> {
    const audioContext = this.getAudioContext();
    await this.ensureContextRunning(audioContext);

    if (this.warmedUp) return;

    const buffer = audioContext.createBuffer(
      1,
      audioContext.sampleRate * WARM_UP_DURATION_SECONDS,
      audioContext.sampleRate,
    );
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    this.warmedUp = true;
  }

  async playBlob(blob: Blob): Promise<AudioPlaybackSession> {
    const arrayBuffer = await blob.arrayBuffer();
    return this.playArrayBuffer(arrayBuffer);
  }

  async playUrl(url: string): Promise<AudioPlaybackSession> {
    this.stop();

    let resolveFinished!: () => void;
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve;
    });

    const audio = new Audio(url);
    this.currentHtmlAudio = audio;

    const session: AudioPlaybackSession = {
      id: `audio-url-session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      durationSeconds: 0,
      finished,
      stop: () => {
        audio.pause();
        audio.currentTime = 0;
        if (audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(audio.src);
        }
        if (this.currentHtmlAudio === audio) {
          this.currentHtmlAudio = null;
        }
        resolveFinished();
      },
      pause: () => {
        audio.pause();
      },
      resume: () => {
        void audio.play();
      },
      getCurrentTime: () => audio.currentTime || 0,
      isPlaying: () => !audio.paused,
      isPaused: () => audio.paused,
    };

    audio.onloadedmetadata = () => {
      session.durationSeconds = Number.isFinite(audio.duration)
        ? audio.duration
        : 0;
    };
    audio.onended = () => {
      if (this.currentHtmlAudio === audio) {
        this.currentHtmlAudio = null;
      }
      resolveFinished();
    };
    audio.onerror = () => {
      if (this.currentHtmlAudio === audio) {
        this.currentHtmlAudio = null;
      }
      resolveFinished();
    };

    await audio.play();
    return session;
  }

  async playArrayBuffer(
    arrayBuffer: ArrayBuffer,
    startOffsetSeconds: number = 0,
  ): Promise<AudioPlaybackSession> {
    const audioContext = this.getAudioContext();
    await this.ensureContextRunning(audioContext);

    this.stop(this.currentSession);

    const decodedBuffer = await audioContext.decodeAudioData(
      arrayBuffer.slice(0),
    );
    const session = new BrowserAudioPlaybackSession(
      audioContext,
      decodedBuffer,
      startOffsetSeconds,
      () => {
        if (this.currentSession === session) {
          this.currentSession = null;
        }
      },
    );

    this.currentSession = session;
    return session;
  }

  async decodeDuration(arrayBuffer: ArrayBuffer): Promise<number> {
    const audioContext = this.getAudioContext();
    await this.ensureContextRunning(audioContext);
    const decodedBuffer = await audioContext.decodeAudioData(
      arrayBuffer.slice(0),
    );
    return decodedBuffer.duration;
  }

  stop(session?: AudioPlaybackSession | null): void {
    if (session) {
      session.stop();
      if (this.currentSession?.id === session.id) {
        this.currentSession = null;
      }
      return;
    }

    if (this.currentSession) {
      this.currentSession.stop();
      this.currentSession = null;
    }

    if (this.currentHtmlAudio) {
      this.currentHtmlAudio.pause();
      this.currentHtmlAudio.currentTime = 0;
      if (this.currentHtmlAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentHtmlAudio.src);
      }
      this.currentHtmlAudio = null;
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error('AudioContext not supported');
      }
      this.audioContext = new AudioContextClass();
      this.warmedUp = false;
    }

    return this.audioContext!;
  }

  private async ensureContextRunning(
    audioContext: AudioContext,
  ): Promise<void> {
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  }
}
