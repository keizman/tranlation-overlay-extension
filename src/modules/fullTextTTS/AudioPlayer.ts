/**
 * 音频播放器
 * AudioPlayer - Web Audio API 播放器
 *
 * 特性：
 * - 使用 AudioContext 单例
 * - 淡入淡出 (0.05s) 避免爆音
 * - 支持暂停/恢复
 * - 支持时间回调
 */

import { FADE_DURATION } from './constants';
import { createModuleLogger } from '../shared/utils/DebugLogger';

const logger = createModuleLogger('AudioPlayer');

/**
 * 播放事件回调
 */
export interface AudioPlayerCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  onError?: (error: Error) => void;
}

/**
 * 音频播放器
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private currentBuffer: AudioBuffer | null = null;

  // 播放状态
  private isPlaying: boolean = false;
  private isPaused: boolean = false;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private playbackOffset: number = 0;

  // 回调
  private callbacks: AudioPlayerCallbacks = {};

  // 时间更新定时器
  private timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initAudioContext();
  }

  /**
   * 初始化 AudioContext
   */
  private initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      logger.log('AudioContext 已初始化');
    }
  }

  /**
   * 确保 AudioContext 处于运行状态
   */
  private async ensureContextRunning(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      logger.log('AudioContext 已恢复');
    }
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: AudioPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 播放音频 ArrayBuffer
   * @param buffer 音频 ArrayBuffer
   * @param startOffset 起始偏移时间 (秒)
   */
  async play(buffer: ArrayBuffer, startOffset: number = 0): Promise<void> {
    await this.ensureContextRunning();

    if (!this.audioContext) {
      throw new Error('AudioContext 未初始化');
    }

    // 停止当前播放
    this.stopInternal(false);

    try {
      // 解码音频
      const audioBuffer = await this.audioContext.decodeAudioData(
        buffer.slice(0),
      );
      this.currentBuffer = audioBuffer;
      this.playbackOffset = startOffset;

      // 开始播放
      this.startPlayback(startOffset);

      logger.log(
        `开始播放: duration=${audioBuffer.duration.toFixed(2)}s, offset=${startOffset.toFixed(2)}s`,
      );
    } catch (error) {
      logger.error('音频解码失败:', error);
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error('音频解码失败'),
      );
      throw error;
    }
  }

  /**
   * 开始/恢复播放
   */
  private startPlayback(offset: number): void {
    if (!this.audioContext || !this.currentBuffer) {
      return;
    }

    // 创建源节点
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = this.currentBuffer;

    // 创建增益节点 (用于淡入淡出)
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0;

    // 连接节点
    this.currentSource.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);

    // 淡入
    const now = this.audioContext.currentTime;
    this.gainNode.gain.linearRampToValueAtTime(1, now + FADE_DURATION);

    // 记录时间
    this.startTime = this.audioContext.currentTime;
    this.playbackOffset = offset;
    this.isPlaying = true;
    this.isPaused = false;

    // 开始播放
    this.currentSource.start(0, offset);

    // 监听播放结束
    this.currentSource.onended = () => {
      if (this.isPlaying && !this.isPaused) {
        this.onPlaybackEnded();
      }
    };

    // 开始时间更新
    this.startTimeUpdate();
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (!this.isPlaying || this.isPaused) {
      return;
    }

    if (this.audioContext && this.gainNode) {
      // 淡出
      const now = this.audioContext.currentTime;
      this.gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

      // 计算已播放时间
      this.pauseTime = this.getCurrentTime();
    }

    // 延迟停止源节点 (等待淡出完成)
    setTimeout(
      () => {
        if (this.currentSource) {
          try {
            this.currentSource.stop();
          } catch (_e) {
            // 忽略已停止的错误
          }
          this.currentSource = null;
        }
      },
      FADE_DURATION * 1000 + 50,
    );

    this.isPaused = true;
    this.stopTimeUpdate();

    logger.log(`暂停播放: pauseTime=${this.pauseTime.toFixed(2)}s`);
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (!this.isPaused || !this.currentBuffer) {
      return;
    }

    logger.log(`恢复播放: from=${this.pauseTime.toFixed(2)}s`);
    this.startPlayback(this.pauseTime);
  }

  /**
   * 停止播放
   */
  stop(): void {
    this.stopInternal(true);
  }

  /**
   * 内部停止方法
   */
  private stopInternal(triggerCallback: boolean): void {
    if (this.audioContext && this.gainNode && this.currentSource) {
      // 淡出
      const now = this.audioContext.currentTime;
      this.gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION);

      // 延迟停止
      setTimeout(
        () => {
          if (this.currentSource) {
            try {
              this.currentSource.stop();
            } catch (_e) {
              // 忽略
            }
            this.currentSource = null;
          }
        },
        FADE_DURATION * 1000 + 50,
      );
    }

    this.isPlaying = false;
    this.isPaused = false;
    this.startTime = 0;
    this.pauseTime = 0;
    this.playbackOffset = 0;
    this.stopTimeUpdate();

    if (triggerCallback) {
      logger.log('停止播放');
    }
  }

  /**
   * 播放结束处理
   */
  private onPlaybackEnded(): void {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopTimeUpdate();
    this.currentSource = null;

    logger.log('播放结束');
    this.callbacks.onEnded?.();
  }

  /**
   * 获取当前播放时间
   */
  getCurrentTime(): number {
    if (this.isPaused) {
      return this.pauseTime;
    }

    if (!this.isPlaying || !this.audioContext) {
      return 0;
    }

    return (
      this.playbackOffset + (this.audioContext.currentTime - this.startTime)
    );
  }

  /**
   * 获取音频总时长
   */
  getDuration(): number {
    return this.currentBuffer?.duration || 0;
  }

  /**
   * 检查是否正在播放
   */
  getIsPlaying(): boolean {
    return this.isPlaying && !this.isPaused;
  }

  /**
   * 检查是否暂停
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * 开始时间更新
   */
  private startTimeUpdate(): void {
    this.stopTimeUpdate();
    this.timeUpdateInterval = setInterval(() => {
      if (this.callbacks.onTimeUpdate) {
        this.callbacks.onTimeUpdate(this.getCurrentTime(), this.getDuration());
      }
    }, 100); // 100ms 更新一次
  }

  /**
   * 停止时间更新
   */
  private stopTimeUpdate(): void {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  /**
   * 销毁播放器
   */
  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.currentBuffer = null;
    logger.log('播放器已销毁');
  }
}

/**
 * AudioPlayer 单例
 */
let audioPlayerInstance: AudioPlayer | null = null;

/**
 * 获取 AudioPlayer 单例
 */
export function getAudioPlayer(): AudioPlayer {
  if (!audioPlayerInstance) {
    audioPlayerInstance = new AudioPlayer();
  }
  return audioPlayerInstance;
}

/**
 * 销毁 AudioPlayer 单例
 */
export function destroyAudioPlayer(): void {
  if (audioPlayerInstance) {
    audioPlayerInstance.destroy();
    audioPlayerInstance = null;
  }
}
