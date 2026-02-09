/**
 * 懒加载服务 - 管理基于视口的懒加载翻译功能
 *
 * 核心功能：
 * 1. 管理 Intersection Observer 实例
 * 2. 协调视口检测和翻译触发
 * 3. 处理动态内容的观察者更新
 * 4. 提供性能优化和错误处理
 */

import type { LazyLoadingConfig } from '../../shared/types/core';
import type { ContentSegment } from '../../processing/ProcessingStateManager';
import {
  SegmentObserver,
  type SegmentObserverCallback,
} from '../utils/SegmentObserver';

/**
 * 懒加载回调函数类型
 */
export type LazyLoadingCallback = (segments: ContentSegment[]) => Promise<void>;

/**
 * 懒加载服务状态
 */
interface LazyLoadingState {
  /** 是否已初始化 */
  initialized: boolean;
  /** 是否已启用 */
  enabled: boolean;
  /** 待处理的段落队列 */
  processingQueue: Set<string>;
  /** 已处理的段落记录 */
  processedSegments: Set<string>;
  /** 段落缓存 */
  segmentCache: Map<string, ContentSegment>;
  /** 当前观察中的段落 */
  observedSegments: Map<string, ContentSegment>;
  /** 失败重试次数 */
  failedAttempts: Map<string, number>;
}

/**
 * 懒加载服务
 */
export class LazyLoadingService {
  private config: LazyLoadingConfig;
  private observer: SegmentObserver | null = null;
  private processingCallback: LazyLoadingCallback | null = null;
  private state: LazyLoadingState;
  private processingTimer: number | null = null;
  private reconcileTimer: number | null = null;
  private processingInFlight = false;
  private retryTimers = new Set<number>();
  private scrollHandler = this.handleViewportMutation.bind(this);
  private resizeHandler = this.handleViewportMutation.bind(this);
  private isDestroyed = false;

  private readonly PROCESS_DEBOUNCE_MS = 60;
  private readonly RECONCILE_THROTTLE_MS = 120;
  private readonly PROCESS_BATCH_SIZE = 8;
  private readonly MAX_RETRY_COUNT = 2;
  private readonly RETRY_BASE_DELAY_MS = 300;

  constructor(config: LazyLoadingConfig) {
    this.config = { ...config };
    this.state = {
      initialized: false,
      enabled: false,
      processingQueue: new Set(),
      processedSegments: new Set(),
      segmentCache: new Map(),
      observedSegments: new Map(),
      failedAttempts: new Map(),
    };
  }

  /**
   * 初始化懒加载服务
   */
  initialize(): void {
    if (this.state.initialized) return;

    this.state.initialized = true;
    this.state.enabled = this.normalizeEnabled(this.config.enabled);
    this.config = {
      ...this.config,
      preloadDistance: this.normalizePreloadDistance(
        this.config.preloadDistance,
      ),
    };

    if (this.state.enabled) {
      this.createObserver();
      this.bindViewportListeners();
    }
  }

  /**
   * 创建观察器
   */
  private createObserver(): void {
    const previouslyObserved = Array.from(this.state.observedSegments.values());

    if (this.observer) {
      this.observer.destroy();
    }

    const observerCallback: SegmentObserverCallback = (
      visibleSegments,
      _invisibleSegments,
    ) => {
      this.handleVisibilityChange(visibleSegments);
    };

    const observerOptions = {
      preloadDistance: this.config.preloadDistance,
    };

    this.observer = new SegmentObserver(observerCallback, observerOptions);

    if (previouslyObserved.length > 0) {
      this.observer.observeMultiple(previouslyObserved);
    }

    this.scheduleReconcile();
  }

  /**
   * 处理段落可见性变化
   */
  private handleVisibilityChange(visibleSegments: ContentSegment[]): void {
    if (!this.state.enabled || this.isDestroyed || visibleSegments.length === 0)
      return;
    this.scheduleProcessing(visibleSegments);
  }

  /**
   * 调度处理
   */
  private scheduleProcessing(segments: ContentSegment[]): void {
    if (!this.state.enabled || this.isDestroyed) return;

    let hasNewSegment = false;

    for (const segment of segments) {
      if (!this.shouldQueueSegment(segment)) continue;

      const fingerprint = segment.fingerprint;
      this.state.processingQueue.add(fingerprint);
      this.state.segmentCache.set(fingerprint, segment);
      hasNewSegment = true;
    }

    if (hasNewSegment) {
      this.queueProcessingRun();
    }
  }

  /**
   * 处理队列中的段落（持续排空）
   */
  private async processQueuedSegments(): Promise<void> {
    if (
      !this.processingCallback ||
      this.isDestroyed ||
      !this.state.enabled ||
      this.processingInFlight
    ) {
      return;
    }

    this.processingInFlight = true;

    try {
      while (
        !this.isDestroyed &&
        this.state.enabled &&
        this.state.processingQueue.size > 0
      ) {
        const fingerprints = Array.from(this.state.processingQueue).slice(
          0,
          this.PROCESS_BATCH_SIZE,
        );

        const batchSegments: ContentSegment[] = [];
        for (const fingerprint of fingerprints) {
          this.state.processingQueue.delete(fingerprint);

          const segment = this.state.segmentCache.get(fingerprint);
          if (!segment || !this.shouldQueueSegment(segment)) {
            this.cleanupSegmentFromQueue(fingerprint);
            continue;
          }

          batchSegments.push(segment);
        }

        if (batchSegments.length === 0) {
          continue;
        }

        await this.processBatch(batchSegments);
      }
    } finally {
      this.processingInFlight = false;
      if (this.state.processingQueue.size > 0) {
        this.queueProcessingRun();
      }
    }
  }

  /**
   * 批次处理（失败时降级到单条）
   */
  private async processBatch(segments: ContentSegment[]): Promise<void> {
    if (!this.processingCallback || segments.length === 0) return;

    try {
      await this.processingCallback(segments);
      segments.forEach((segment) => this.markSegmentProcessed(segment));
      return;
    } catch (error) {
      console.warn('[LazyLoadingService] 批次处理失败，降级为单条重试:', error);
    }

    for (const segment of segments) {
      if (!this.processingCallback || this.isDestroyed || !this.state.enabled) {
        return;
      }

      try {
        await this.processingCallback([segment]);
        this.markSegmentProcessed(segment);
      } catch (error) {
        this.handleSegmentFailure(segment, error);
      }
    }
  }

  /**
   * 标记段落处理完成
   */
  private markSegmentProcessed(segment: ContentSegment): void {
    const fingerprint = segment.fingerprint;

    this.state.processedSegments.add(fingerprint);
    this.state.failedAttempts.delete(fingerprint);
    this.state.processingQueue.delete(fingerprint);
    this.state.segmentCache.delete(fingerprint);
    this.state.observedSegments.delete(fingerprint);

    if (this.observer) {
      this.observer.unobserve(segment);
    }
  }

  /**
   * 处理单条失败
   */
  private handleSegmentFailure(segment: ContentSegment, error: unknown): void {
    const fingerprint = segment.fingerprint;
    const currentRetry = (this.state.failedAttempts.get(fingerprint) ?? 0) + 1;
    this.state.failedAttempts.set(fingerprint, currentRetry);

    if (currentRetry > this.MAX_RETRY_COUNT) {
      console.warn('[LazyLoadingService] 段落重试超过上限，跳过本轮:', {
        fingerprint,
        error,
      });
      this.markSegmentProcessed(segment);
      return;
    }

    this.scheduleRetry(segment, currentRetry);
  }

  /**
   * 安排重试
   */
  private scheduleRetry(segment: ContentSegment, retryCount: number): void {
    const delay = this.RETRY_BASE_DELAY_MS * retryCount;
    const fingerprint = segment.fingerprint;

    const timerId = window.setTimeout(() => {
      this.retryTimers.delete(timerId);
      if (this.isDestroyed || !this.state.enabled) return;
      if (!this.state.observedSegments.has(fingerprint)) return;
      this.scheduleProcessing([segment]);
    }, delay);

    this.retryTimers.add(timerId);
  }

  /**
   * 开始观察段落
   */
  observeSegments(segments: ContentSegment[]): void {
    if (!this.state.initialized || this.isDestroyed) return;

    for (const segment of segments) {
      const fingerprint = segment.fingerprint;
      const previousSegment = this.state.observedSegments.get(fingerprint);

      if (previousSegment && previousSegment.element !== segment.element) {
        this.observer?.unobserve(previousSegment);
      }

      this.state.observedSegments.set(fingerprint, segment);
      this.state.segmentCache.set(fingerprint, segment);
    }

    if (!this.state.enabled || !this.observer) return;

    this.observer.observeMultiple(segments);
    this.scheduleReconcile();
  }

  /**
   * 停止观察段落
   */
  unobserveSegments(segments: ContentSegment[]): void {
    if (this.isDestroyed) return;

    // 兼容旧调用：传空数组表示清理当前会话
    if (segments.length === 0) {
      this.clearSession();
      return;
    }

    for (const segment of segments) {
      const fingerprint = segment.fingerprint;
      this.state.processingQueue.delete(fingerprint);
      this.state.segmentCache.delete(fingerprint);
      this.state.observedSegments.delete(fingerprint);
      this.state.failedAttempts.delete(fingerprint);
      this.observer?.unobserve(segment);
    }
  }

  /**
   * 设置处理回调
   */
  setProcessingCallback(callback: LazyLoadingCallback): void {
    this.processingCallback = callback;
  }

  /**
   * 开启新会话（用于重新触发翻译）
   */
  beginSession(): void {
    if (this.isDestroyed) return;
    this.clearSession();
    if (this.state.enabled) {
      this.createObserver();
      this.bindViewportListeners();
    }
  }

  /**
   * 清理当前会话
   */
  clearSession(): void {
    if (this.isDestroyed) return;
    this.stopRuntimeProcessing(true);
    this.state.processedSegments.clear();
    this.state.failedAttempts.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: LazyLoadingConfig): void {
    if (this.isDestroyed) return;

    const normalizedConfig: LazyLoadingConfig = {
      ...newConfig,
      enabled: this.normalizeEnabled(newConfig.enabled),
      preloadDistance: this.normalizePreloadDistance(newConfig.preloadDistance),
    };
    const oldEnabled = this.state.enabled;
    const preloadChanged =
      this.config.preloadDistance !== normalizedConfig.preloadDistance;
    this.config = normalizedConfig;
    this.state.enabled = normalizedConfig.enabled;

    if (!oldEnabled && this.state.enabled) {
      this.createObserver();
      this.bindViewportListeners();
      this.scheduleReconcile();
      return;
    }

    if (oldEnabled && !this.state.enabled) {
      this.stopRuntimeProcessing(false);
      return;
    }

    if (this.state.enabled && preloadChanged) {
      if (this.state.initialized) {
        this.createObserver();
      }
    }
  }

  /**
   * 停止运行时观察和计时器
   */
  private stopRuntimeProcessing(clearObserved: boolean): void {
    this.observer?.disconnect();

    this.state.processingQueue.clear();
    this.state.segmentCache.clear();
    if (clearObserved) {
      this.state.observedSegments.clear();
    }

    if (this.processingTimer !== null) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }

    if (this.reconcileTimer !== null) {
      clearTimeout(this.reconcileTimer);
      this.reconcileTimer = null;
    }

    this.clearRetryTimers();
    this.unbindViewportListeners();
  }

  /**
   * 清理队列侧缓存
   */
  private cleanupSegmentFromQueue(fingerprint: string): void {
    this.state.processingQueue.delete(fingerprint);
    this.state.segmentCache.delete(fingerprint);
  }

  /**
   * 判断段落是否可入队
   */
  private shouldQueueSegment(segment: ContentSegment): boolean {
    const fingerprint = segment.fingerprint;
    if (!fingerprint) return false;
    if (!(segment.element instanceof Element) || !segment.element.isConnected) {
      return false;
    }
    if (this.state.processedSegments.has(fingerprint)) return false;
    const retryCount = this.state.failedAttempts.get(fingerprint) ?? 0;
    return retryCount <= this.MAX_RETRY_COUNT;
  }

  /**
   * 视口变化处理（滚动兜底）
   */
  private handleViewportMutation(): void {
    if (!this.state.enabled || this.isDestroyed) return;
    if (this.reconcileTimer !== null) return;

    this.reconcileTimer = window.setTimeout(() => {
      this.reconcileTimer = null;
      this.reconcileVisibleSegments();
    }, this.RECONCILE_THROTTLE_MS);
  }

  /**
   * 触发一次重检
   */
  private scheduleReconcile(): void {
    this.handleViewportMutation();
  }

  /**
   * 重检当前可见区域（IO兜底）
   */
  private reconcileVisibleSegments(): void {
    if (!this.state.enabled || this.isDestroyed) return;

    const viewportHeight = window.innerHeight || 0;
    const preloadPx = Math.max(
      0,
      viewportHeight *
        this.normalizePreloadDistance(this.config.preloadDistance),
    );

    const visibleSegments: ContentSegment[] = [];
    for (const [
      fingerprint,
      segment,
    ] of this.state.observedSegments.entries()) {
      if (!this.shouldQueueSegment(segment)) continue;

      const element = segment.element;
      if (!(element instanceof Element) || !element.isConnected) {
        this.state.observedSegments.delete(fingerprint);
        this.cleanupSegmentFromQueue(fingerprint);
        this.state.failedAttempts.delete(fingerprint);
        continue;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;

      const withinWindow =
        rect.bottom >= -preloadPx && rect.top <= viewportHeight + preloadPx;
      if (withinWindow) {
        visibleSegments.push(segment);
      }
    }

    if (visibleSegments.length > 0) {
      this.scheduleProcessing(visibleSegments);
    }
  }

  /**
   * 安排一次处理循环
   */
  private queueProcessingRun(): void {
    if (this.processingTimer !== null || this.processingInFlight) return;
    if (this.isDestroyed || !this.state.enabled) return;

    this.processingTimer = window.setTimeout(() => {
      this.processingTimer = null;
      void this.processQueuedSegments();
    }, this.PROCESS_DEBOUNCE_MS);
  }

  /**
   * 绑定视口监听器
   */
  private bindViewportListeners(): void {
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
    window.addEventListener('resize', this.resizeHandler, { passive: true });
  }

  /**
   * 解绑视口监听器
   */
  private unbindViewportListeners(): void {
    window.removeEventListener('scroll', this.scrollHandler);
    window.removeEventListener('resize', this.resizeHandler);
  }

  /**
   * 清理重试定时器
   */
  private clearRetryTimers(): void {
    for (const timerId of this.retryTimers) {
      clearTimeout(timerId);
    }
    this.retryTimers.clear();
  }

  /**
   * 规范化启用标记
   */
  private normalizeEnabled(enabled: boolean): boolean {
    return Boolean(enabled);
  }

  /**
   * 规范化预加载距离
   */
  private normalizePreloadDistance(distance: number): number {
    if (!Number.isFinite(distance)) return 0.5;
    return Math.min(Math.max(distance, 0), 3);
  }

  // 基础状态查询方法
  isEnabled(): boolean {
    return this.state.initialized && this.state.enabled;
  }

  isInitialized(): boolean {
    return this.state.initialized;
  }

  getConfig(): Readonly<LazyLoadingConfig> {
    return { ...this.config };
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.stopRuntimeProcessing(true);
    this.state.processedSegments.clear();
    this.state.failedAttempts.clear();
    if (this.observer) {
      this.observer.destroy();
      this.observer = null;
    }
  }
}
