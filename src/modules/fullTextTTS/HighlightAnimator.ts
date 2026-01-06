/**
 * 高亮动画器
 * HighlightAnimator - 播放位置高亮同步
 *
 * 实现方案：
 * - 根据 SSML timepoints 时间点同步高亮
 * - 暂停时冻结高亮位置
 * - 恢复时继续滚动
 * - 复用 WordHighlighter 样式
 */

import type { TTSTimepoint, TextSlice } from '../shared/types/fullTextTTS';

/**
 * 创建模块日志器
 */
const createLogger = (prefix: string) => ({
  log: (...args: unknown[]) => console.log('[' + prefix + ']', ...args),
  warn: (...args: unknown[]) => console.warn('[' + prefix + ']', ...args),
  error: (...args: unknown[]) => console.error('[' + prefix + ']', ...args),
});

const logger = createLogger('HighlightAnimator');

/**
 * 高亮样式类名
 */
const HIGHLIGHT_CLASS = 'fulltext-tts-highlight';
const HIGHLIGHT_WORD_CLASS = 'fulltext-tts-word';

/**
 * 注入高亮样式
 */
export function injectFullTextTTSHighlightStyles(): void {
  const styleId = 'fulltext-tts-highlight-styles';
  if (document.getElementById(styleId)) {
    return;
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.3) 0%, rgba(59, 130, 246, 0.1) 100%);
      border-radius: 2px;
      transition: background 0.15s ease;
    }
    .${HIGHLIGHT_WORD_CLASS} {
      background-color: rgba(59, 130, 246, 0.4);
      border-radius: 2px;
      padding: 0 2px;
      margin: 0 -2px;
      transition: background-color 0.1s ease;
    }
  `;
  document.head.appendChild(style);
  logger.log('高亮样式已注入');
}

/**
 * 高亮动画器
 */
export class HighlightAnimator {
  private currentElement: HTMLElement | null = null;
  private originalHTML: string = '';
  private slice: TextSlice | null = null;
  private timepoints: TTSTimepoint[] = [];
  private markToCharOffset: Map<string, number> = new Map();

  // 高亮状态
  private currentHighlightIndex: number = -1;
  private highlightRange: Range | null = null;
  private isPaused: boolean = false;

  // 时间同步
  private animationFrame: number | null = null;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private currentTimeGetter: (() => number) | null = null;

  constructor() {
    injectFullTextTTSHighlightStyles();
  }

  /**
   * 开始同步高亮
   * @param element 目标元素
   * @param slice 文本切片
   * @param timepoints API 返回的时间点
   * @param getCurrentTime 获取当前播放时间的函数
   */
  startSync(
    element: HTMLElement,
    slice: TextSlice,
    timepoints: TTSTimepoint[],
    getCurrentTime: () => number,
  ): void {
    this.stop();

    this.currentElement = element;
    this.originalHTML = element.innerHTML;
    this.slice = slice;
    this.timepoints = timepoints;
    this.currentTimeGetter = getCurrentTime;
    this.isPaused = false;

    // 构建 mark 名称到字符偏移的映射
    this.markToCharOffset.clear();
    for (const mark of slice.marks) {
      this.markToCharOffset.set(mark.name, mark.charOffset);
    }

    // 添加高亮类
    element.classList.add(HIGHLIGHT_CLASS);

    // 开始动画循环
    this.startAnimationLoop();

    // 滚动到元素
    this.scrollToElement();

    logger.log('开始高亮同步:', {
      text: slice.text.substring(0, 50) + '...',
      timepointsCount: timepoints.length,
    });
  }

  /**
   * 开始动画循环
   */
  private startAnimationLoop(): void {
    const update = () => {
      if (!this.currentTimeGetter || this.isPaused) {
        return;
      }

      const currentTime = this.currentTimeGetter();
      this.updateHighlight(currentTime);

      this.animationFrame = requestAnimationFrame(update);
    };

    this.animationFrame = requestAnimationFrame(update);
  }

  /**
   * 更新高亮位置
   */
  private updateHighlight(currentTime: number): void {
    if (!this.timepoints.length) {
      return;
    }

    // 找到当前时间对应的 mark 索引
    let markIndex = -1;
    for (let i = 0; i < this.timepoints.length; i++) {
      if (this.timepoints[i].timeSeconds <= currentTime) {
        markIndex = i;
      } else {
        break;
      }
    }

    // 如果索引没变，不需要更新
    if (markIndex === this.currentHighlightIndex) {
      return;
    }

    this.currentHighlightIndex = markIndex;

    // 获取对应的字符偏移
    if (markIndex >= 0 && markIndex < this.timepoints.length) {
      const markName = this.timepoints[markIndex].markName;
      const charOffset = this.markToCharOffset.get(markName);
      if (charOffset !== undefined) {
        logger.log(
          `高亮更新: mark=${markName}, offset=${charOffset}, time=${currentTime.toFixed(2)}s`,
        );
      }
    }
  }

  /**
   * 暂停高亮
   */
  pause(): void {
    if (this.isPaused) {
      return;
    }

    this.isPaused = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    logger.log('高亮暂停');
  }

  /**
   * 恢复高亮
   */
  resume(): void {
    if (!this.isPaused) {
      return;
    }

    this.isPaused = false;
    this.startAnimationLoop();

    logger.log('高亮恢复');
  }

  /**
   * 停止高亮
   */
  stop(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    // 移除高亮类
    if (this.currentElement) {
      this.currentElement.classList.remove(HIGHLIGHT_CLASS);
    }

    // 重置状态
    this.currentElement = null;
    this.originalHTML = '';
    this.slice = null;
    this.timepoints = [];
    this.markToCharOffset.clear();
    this.currentHighlightIndex = -1;
    this.highlightRange = null;
    this.isPaused = false;
    this.currentTimeGetter = null;

    logger.log('高亮停止');
  }

  /**
   * 滚动到当前元素
   */
  scrollToElement(): void {
    if (!this.currentElement) {
      return;
    }

    this.currentElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  /**
   * 获取当前元素
   */
  getCurrentElement(): HTMLElement | null {
    return this.currentElement;
  }

  /**
   * 检查是否正在同步
   */
  isSyncing(): boolean {
    return this.currentElement !== null && !this.isPaused;
  }
}

/**
 * HighlightAnimator 单例
 */
let highlightAnimatorInstance: HighlightAnimator | null = null;

/**
 * 获取 HighlightAnimator 单例
 */
export function getHighlightAnimator(): HighlightAnimator {
  if (!highlightAnimatorInstance) {
    highlightAnimatorInstance = new HighlightAnimator();
  }
  return highlightAnimatorInstance;
}
