/**
 * 音频缓存服务
 * AudioCache - 管理音频预加载和缓存
 *
 * 缓存策略：
 * - 保持：当前播放 + 前1段 + 后2段
 * - 触发：当前片段 fetch 完成后，预加载下一个
 * - 丢弃：播放完成后清理过期缓存，触发下一个预加载
 * - 暂停保护：暂停状态不触发新请求
 */

import type { AudioCacheEntry, TextSlice } from '../shared/types/fullTextTTS';
import { PRECACHE_BEFORE, PRECACHE_AFTER } from './constants';
import { FullTextTTSProvider } from './FullTextTTSProvider';

/**
 * 创建模块日志器
 */
const createLogger = (prefix: string) => ({
  log: (...args: unknown[]) => console.log('[' + prefix + ']', ...args),
  warn: (...args: unknown[]) => console.warn('[' + prefix + ']', ...args),
  error: (...args: unknown[]) => console.error('[' + prefix + ']', ...args),
});

const logger = createLogger('AudioCache');

/**
 * 音频缓存管理器
 */
export class AudioCache {
  private cache: Map<number, AudioCacheEntry> = new Map();
  private pendingRequests: Map<number, Promise<AudioCacheEntry | null>> =
    new Map();
  private provider: FullTextTTSProvider;
  private slices: TextSlice[] = [];
  private isPaused: boolean = false;

  constructor(provider: FullTextTTSProvider) {
    this.provider = provider;
  }

  /**
   * 设置切片数据
   */
  setSlices(slices: TextSlice[]): void {
    this.slices = slices;
    this.clear();
  }

  /**
   * 获取缓存条目
   */
  get(sliceIndex: number): AudioCacheEntry | undefined {
    return this.cache.get(sliceIndex);
  }

  /**
   * 检查是否有缓存
   */
  has(sliceIndex: number): boolean {
    return this.cache.has(sliceIndex);
  }

  /**
   * 检查是否正在加载
   */
  isLoading(sliceIndex: number): boolean {
    return this.pendingRequests.has(sliceIndex);
  }

  /**
   * 获取或加载缓存条目
   * @param sliceIndex 切片索引
   * @returns 缓存条目或 null
   */
  async getOrLoad(sliceIndex: number): Promise<AudioCacheEntry | null> {
    // 检查缓存
    const cached = this.cache.get(sliceIndex);
    if (cached) {
      logger.log(`缓存命中: slice ${sliceIndex}`);
      return cached;
    }

    // 检查是否正在加载
    const pending = this.pendingRequests.get(sliceIndex);
    if (pending) {
      logger.log(`等待加载中: slice ${sliceIndex}`);
      return pending;
    }

    // 开始加载
    return this.load(sliceIndex);
  }

  /**
   * 加载单个切片
   */
  private async load(sliceIndex: number): Promise<AudioCacheEntry | null> {
    if (sliceIndex < 0 || sliceIndex >= this.slices.length) {
      return null;
    }

    const slice = this.slices[sliceIndex];
    logger.log(
      `开始加载: slice ${sliceIndex}, ssml 长度: ${slice.ssml.length}`,
    );

    const loadPromise = (async (): Promise<AudioCacheEntry | null> => {
      try {
        const { audioBuffer, timepoints } =
          await this.provider.synthesizeToArrayBuffer(slice.ssml);

        const entry: AudioCacheEntry = {
          sliceIndex,
          audioBuffer,
          timepoints,
          blob: new Blob([audioBuffer], { type: 'audio/mpeg' }),
        };

        this.cache.set(sliceIndex, entry);
        logger.log(
          `加载完成: slice ${sliceIndex}, buffer 大小: ${audioBuffer.byteLength}`,
        );

        // 加载完成后触发预加载（如果未暂停）
        if (!this.isPaused) {
          this.prefetchNext(sliceIndex);
        }

        return entry;
      } catch (error) {
        logger.error(`加载失败: slice ${sliceIndex}`, error);
        return null;
      } finally {
        this.pendingRequests.delete(sliceIndex);
      }
    })();

    this.pendingRequests.set(sliceIndex, loadPromise);
    return loadPromise;
  }

  /**
   * 预加载下一个切片
   */
  private prefetchNext(currentIndex: number): void {
    const nextIndex = currentIndex + 1;
    if (
      nextIndex < this.slices.length &&
      !this.has(nextIndex) &&
      !this.isLoading(nextIndex)
    ) {
      logger.log(`预加载: slice ${nextIndex}`);
      this.load(nextIndex);
    }
  }

  /**
   * 预加载当前位置周围的切片
   * @param currentIndex 当前播放索引
   */
  prefetch(currentIndex: number): void {
    if (this.isPaused) {
      logger.log('暂停状态，跳过预加载');
      return;
    }

    const totalSlices = this.slices.length;

    // 预加载前 PRECACHE_BEFORE 个
    for (let i = 1; i <= PRECACHE_BEFORE; i++) {
      const index = currentIndex - i;
      if (index >= 0 && !this.has(index) && !this.isLoading(index)) {
        this.load(index);
      }
    }

    // 预加载后 PRECACHE_AFTER 个
    for (let i = 1; i <= PRECACHE_AFTER; i++) {
      const index = currentIndex + i;
      if (index < totalSlices && !this.has(index) && !this.isLoading(index)) {
        this.load(index);
      }
    }
  }

  /**
   * 清理过期缓存
   * @param playedIndex 已播放完成的索引
   */
  evict(playedIndex: number): void {
    // 清理超出缓存范围的条目
    for (const [index] of this.cache) {
      if (index < playedIndex - PRECACHE_BEFORE) {
        logger.log(`清理过期缓存: slice ${index}`);
        this.cache.delete(index);
      }
    }

    // 触发新的预加载
    if (!this.isPaused) {
      this.prefetchNext(playedIndex);
    }
  }

  /**
   * 设置暂停状态
   */
  setPaused(paused: boolean): void {
    this.isPaused = paused;
    logger.log(`暂停状态: ${paused}`);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
    // 注意：不取消正在进行的请求，让它们自然完成
    logger.log('缓存已清空');
  }

  /**
   * 获取缓存统计
   */
  getStats(): { cached: number; pending: number; total: number } {
    return {
      cached: this.cache.size,
      pending: this.pendingRequests.size,
      total: this.slices.length,
    };
  }
}
