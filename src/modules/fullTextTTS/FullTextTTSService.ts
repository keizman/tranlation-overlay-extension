/**
 * 全文TTS主控制器
 * FullTextTTSService - 协调所有 TTS 服务
 *
 * 状态流转：
 * IDLE → (play) → LOADING → PLAYING → (pause) → PAUSED → (resume) → PLAYING
 *                                    → (stop) → IDLE
 *                 PLAYING → (ended) → LOADING → PLAYING (下一段)
 *                                   → IDLE (全部完成)
 */

import type {
  FullTextTTSPlayState,
  FullTextTTSConfig,
  ParagraphInfo,
  StateChangeCallback,
  PositionUpdateCallback,
  PlaybackProgress,
} from '../shared/types/fullTextTTS';
import {
  FullTextTTSProvider,
  getFullTextTTSProvider,
} from './FullTextTTSProvider';
import { AudioCache } from './AudioCache';
import { AudioPlayer, getAudioPlayer, destroyAudioPlayer } from './AudioPlayer';
import { DOMTextExtractor, getDOMTextExtractor } from './DOMTextExtractor';
import { HighlightAnimator, getHighlightAnimator } from './HighlightAnimator';
import { createModuleLogger } from '../shared/utils/DebugLogger';

const logger = createModuleLogger('FullTextTTSService');

/**
 * 全文 TTS 服务
 */
export class FullTextTTSService {
  private state: FullTextTTSPlayState = 'IDLE';
  private paragraphs: ParagraphInfo[] = [];
  private currentParagraphIndex: number = 0;
  private currentSliceIndex: number = 0;

  // 服务组件
  private provider: FullTextTTSProvider | null = null;
  private audioCache: AudioCache | null = null;
  private audioPlayer: AudioPlayer | null = null;
  private textExtractor: DOMTextExtractor | null = null;
  private highlightAnimator: HighlightAnimator | null = null;

  // 配置
  private config: FullTextTTSConfig | null = null;

  // 回调
  private stateChangeCallbacks: StateChangeCallback[] = [];
  private positionUpdateCallbacks: PositionUpdateCallback[] = [];

  constructor() {
    this.textExtractor = getDOMTextExtractor();
    this.audioPlayer = getAudioPlayer();
    this.highlightAnimator = getHighlightAnimator();

    // 设置音频播放器回调
    this.audioPlayer.setCallbacks({
      onEnded: () => this.onSliceEnded(),
      onTimeUpdate: (time, duration) => this.onTimeUpdate(time, duration),
      onError: (error) => this.onError(error),
    });
  }

  /**
   * 初始化服务
   */
  initialize(config: FullTextTTSConfig): void {
    this.config = config;
    this.provider = getFullTextTTSProvider(config);
    this.audioCache = new AudioCache(this.provider);

    logger.log('服务已初始化');
  }

  /**
   * 更新配置
   */
  updateConfig(config: FullTextTTSConfig): void {
    this.config = config;
    if (this.provider) {
      this.provider.updateConfig(config);
    }
    logger.log('配置已更新');
  }

  /**
   * 开始全文朗读
   */
  async startFullTextReading(): Promise<void> {
    if (!this.provider || !this.audioCache) {
      throw new Error('服务未初始化');
    }

    // 提取页面段落
    this.paragraphs = this.textExtractor!.extractParagraphs();

    if (this.paragraphs.length === 0) {
      logger.warn('未找到可朗读的段落');
      return;
    }

    logger.log(`开始全文朗读: ${this.paragraphs.length} 个段落`);

    // 重置位置
    this.currentParagraphIndex = 0;
    this.currentSliceIndex = 0;

    // 设置切片数据
    const allSlices = this.paragraphs.flatMap((p) => p.slices);
    this.audioCache.setSlices(allSlices);

    // 开始播放
    await this.playCurrentSlice();
  }

  /**
   * 播放当前切片
   */
  private async playCurrentSlice(): Promise<void> {
    if (!this.audioCache || !this.audioPlayer) {
      return;
    }

    // 计算全局切片索引
    const globalSliceIndex = this.getGlobalSliceIndex();
    const paragraph = this.paragraphs[this.currentParagraphIndex];
    const slice = paragraph?.slices[this.currentSliceIndex];

    if (!paragraph || !slice) {
      logger.log('播放完成');
      this.setState('IDLE');
      return;
    }

    logger.log(
      `播放: 段落 ${this.currentParagraphIndex + 1}/${this.paragraphs.length}, 切片 ${this.currentSliceIndex + 1}/${paragraph.slices.length}`,
    );

    // 设置加载状态
    this.setState('LOADING');

    try {
      // 获取或加载音频
      const cacheEntry = await this.audioCache.getOrLoad(globalSliceIndex);

      if (!cacheEntry) {
        throw new Error('加载音频失败');
      }

      // 先播放音频 (会解码并设置 duration)
      await this.audioPlayer.play(cacheEntry.audioBuffer);

      // 获取音频时长
      const audioDuration = this.audioPlayer.getDuration();

      // 开始高亮同步 (传入 audioDuration 用于词级估算)
      this.highlightAnimator?.startSync(
        paragraph.element,
        slice,
        cacheEntry.timepoints,
        () => this.audioPlayer?.getCurrentTime() || 0,
        audioDuration,
        true, // enableWordLevel - 可从用户设置读取
      );

      // 设置播放状态
      this.setState('PLAYING');

      // 触发预加载
      this.audioCache.prefetch(globalSliceIndex);
    } catch (error) {
      logger.error('播放失败:', error);
      this.setState('IDLE');
      throw error;
    }
  }

  /**
   * 暂停播放
   */
  pause(): void {
    if (this.state !== 'PLAYING') {
      return;
    }

    this.audioPlayer?.pause();
    this.highlightAnimator?.pause();
    this.audioCache?.setPaused(true);
    this.setState('PAUSED');

    logger.log('已暂停');
  }

  /**
   * 恢复播放
   */
  resume(): void {
    if (this.state !== 'PAUSED') {
      return;
    }

    this.audioPlayer?.resume();
    this.highlightAnimator?.resume();
    this.audioCache?.setPaused(false);
    this.setState('PLAYING');

    logger.log('已恢复');
  }

  /**
   * 停止播放
   */
  stop(): void {
    this.audioPlayer?.stop();
    this.highlightAnimator?.stop();
    this.audioCache?.clear();
    this.audioCache?.setPaused(false);

    this.currentParagraphIndex = 0;
    this.currentSliceIndex = 0;
    this.paragraphs = [];

    this.setState('IDLE');

    logger.log('已停止');
  }

  /**
   * 上一段落
   */
  async previousParagraph(): Promise<void> {
    if (this.currentParagraphIndex <= 0) {
      logger.log('已是第一段');
      return;
    }

    this.audioPlayer?.stop();
    this.highlightAnimator?.stop();

    this.currentParagraphIndex--;
    this.currentSliceIndex = 0;

    await this.playCurrentSlice();
  }

  /**
   * 下一段落
   */
  async nextParagraph(): Promise<void> {
    if (this.currentParagraphIndex >= this.paragraphs.length - 1) {
      logger.log('已是最后一段');
      this.stop();
      return;
    }

    this.audioPlayer?.stop();
    this.highlightAnimator?.stop();

    this.currentParagraphIndex++;
    this.currentSliceIndex = 0;

    await this.playCurrentSlice();
  }

  /**
   * 切片播放结束回调
   */
  private async onSliceEnded(): Promise<void> {
    if (this.state !== 'PLAYING') {
      return;
    }

    const paragraph = this.paragraphs[this.currentParagraphIndex];
    if (!paragraph) {
      this.stop();
      return;
    }

    // 清理当前切片缓存
    const globalSliceIndex = this.getGlobalSliceIndex();
    this.audioCache?.evict(globalSliceIndex);

    // 移动到下一个切片
    this.currentSliceIndex++;

    // 检查当前段落是否播放完成
    if (this.currentSliceIndex >= paragraph.slices.length) {
      // 移动到下一段落
      this.currentParagraphIndex++;
      this.currentSliceIndex = 0;

      // 检查是否全部完成
      if (this.currentParagraphIndex >= this.paragraphs.length) {
        logger.log('全部播放完成');
        this.stop();
        return;
      }
    }

    // 播放下一个切片
    await this.playCurrentSlice();
  }

  /**
   * 时间更新回调
   */
  private onTimeUpdate(time: number, duration: number): void {
    // 可用于进度条等
  }

  /**
   * 错误回调
   */
  private onError(error: Error): void {
    logger.error('播放错误:', error);
    this.setState('IDLE');
  }

  /**
   * 计算全局切片索引
   */
  private getGlobalSliceIndex(): number {
    let index = 0;
    for (let i = 0; i < this.currentParagraphIndex; i++) {
      index += this.paragraphs[i].slices.length;
    }
    return index + this.currentSliceIndex;
  }

  /**
   * 设置状态
   */
  private setState(state: FullTextTTSPlayState): void {
    if (this.state === state) {
      return;
    }

    const prevState = this.state;
    this.state = state;

    logger.log(`状态变更: ${prevState} → ${state}`);

    // 触发回调
    for (const callback of this.stateChangeCallbacks) {
      callback(state);
    }
  }

  /**
   * 获取当前状态
   */
  getState(): FullTextTTSPlayState {
    return this.state;
  }

  /**
   * 获取播放进度
   */
  getProgress(): PlaybackProgress {
    return {
      paragraphIndex: this.currentParagraphIndex,
      sliceIndex: this.currentSliceIndex,
      charOffset: 0, // TODO: 根据时间计算
      totalParagraphs: this.paragraphs.length,
    };
  }

  /**
   * 注册状态变更回调
   */
  onStateChange(callback: StateChangeCallback): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 注册位置更新回调
   */
  onPositionUpdate(callback: PositionUpdateCallback): () => void {
    this.positionUpdateCallbacks.push(callback);
    return () => {
      const index = this.positionUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        this.positionUpdateCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.stop();
    destroyAudioPlayer();
    this.provider = null;
    this.audioCache = null;
    this.audioPlayer = null;
    this.stateChangeCallbacks = [];
    this.positionUpdateCallbacks = [];

    logger.log('服务已销毁');
  }
}

/**
 * FullTextTTSService 单例
 */
let serviceInstance: FullTextTTSService | null = null;

/**
 * 获取 FullTextTTSService 单例
 */
export function getFullTextTTSService(): FullTextTTSService {
  if (!serviceInstance) {
    serviceInstance = new FullTextTTSService();
  }
  return serviceInstance;
}

/**
 * 销毁 FullTextTTSService 单例
 */
export function destroyFullTextTTSService(): void {
  if (serviceInstance) {
    serviceInstance.destroy();
    serviceInstance = null;
  }
}
