/**
 * 音频播放器
 * AudioPlayer - 基于 architecture AudioPlaybackService 的播放器
 */

import { audioPlaybackService } from '../../architecture/bootstrap/defaultAdapters';
import type { AudioPlaybackSession } from '../../architecture/core/ports';
import { createModuleLogger } from '../../shared/utils/DebugLogger';

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
  private currentSession: AudioPlaybackSession | null = null;
  private currentBuffer: ArrayBuffer | null = null;
  private currentDuration = 0;
  private pauseTime = 0;

  // 播放状态
  private isPlaying = false;
  private isPaused = false;

  // 回调
  private callbacks: AudioPlayerCallbacks = {};

  // 时间更新定时器
  private timeUpdateInterval: ReturnType<typeof setInterval> | null = null;

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
    this.stopInternal(false);

    try {
      await audioPlaybackService.warmUp();

      this.currentBuffer = buffer.slice(0);
      this.currentSession = await audioPlaybackService.playArrayBuffer(
        this.currentBuffer,
        startOffset,
      );
      this.currentDuration = this.currentSession.durationSeconds;

      this.isPlaying = true;
      this.isPaused = false;
      this.pauseTime = startOffset;

      const currentSession = this.currentSession;
      void currentSession.finished.then(() => {
        if (this.currentSession !== currentSession) return;
        if (this.isPlaying && !this.isPaused) {
          this.onPlaybackEnded();
        }
      });

      this.startTimeUpdate();
      logger.log(
        `开始播放: duration=${this.currentDuration.toFixed(2)}s, offset=${startOffset.toFixed(2)}s`,
      );
    } catch (error) {
      logger.error('音频播放失败:', error);
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error('音频播放失败'),
      );
      throw error;
    }
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (!this.currentSession || !this.isPlaying || this.isPaused) {
      return;
    }

    this.pauseTime = this.currentSession.getCurrentTime();
    this.currentSession.pause();
    this.isPaused = true;
    this.stopTimeUpdate();

    logger.log(`暂停播放: pauseTime=${this.pauseTime.toFixed(2)}s`);
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (!this.currentSession || !this.isPaused) {
      return;
    }

    logger.log(`恢复播放: from=${this.pauseTime.toFixed(2)}s`);
    this.currentSession.resume();
    this.isPaused = false;
    this.isPlaying = true;
    this.startTimeUpdate();
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
    if (this.currentSession) {
      audioPlaybackService.stop(this.currentSession);
      this.currentSession = null;
    }

    this.isPlaying = false;
    this.isPaused = false;
    this.pauseTime = 0;
    this.currentDuration = 0;
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
    this.pauseTime = this.currentDuration;
    this.stopTimeUpdate();
    this.currentSession = null;

    logger.log('播放结束');
    this.callbacks.onEnded?.();
  }

  /**
   * 获取当前播放时间
   */
  getCurrentTime(): number {
    if (this.currentSession) {
      return this.currentSession.getCurrentTime();
    }
    return this.pauseTime;
  }

  /**
   * 获取音频总时长
   */
  getDuration(): number {
    return this.currentDuration;
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
    }, 100);
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
