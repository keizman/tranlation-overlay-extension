/**
 * 高亮动画器
 * HighlightAnimator - 播放位置高亮同步 (逐词动画)
 *
 * 实现方案：
 * - 句子级 marks 用于大致定位
 * - 词级估算用于逐词高亮动画
 * - 暂停时冻结高亮位置
 * - 恢复时继续滚动
 */

import type {
  TTSTimepoint,
  TextSlice,
  SentenceInfo,
} from '../../shared/types/fullTextTTS';
import { createModuleLogger } from '../../shared/utils/DebugLogger';
import {
  estimateWordTimings,
  mergeToGlobalTimings,
  findCurrentWordIndex,
  type WordTiming,
} from './WordTimingEstimator';

const logger = createModuleLogger('HighlightAnimator');

/**
 * 高亮样式类名
 */
const HIGHLIGHT_CLASS = 'fulltext-tts-highlight';
const HIGHLIGHT_WORD_CLASS = 'fulltext-tts-word';
const HIGHLIGHT_WORD_ACTIVE_CLASS = 'fulltext-tts-word-active';

/**
 * 注入高亮样式 (段落背景 + 走字渐变)
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
      background: linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(59, 130, 246, 0.05) 100%);
      border-radius: 4px;
      padding: 2px 4px;
    }
    .${HIGHLIGHT_WORD_CLASS} {
      display: inline;
      transition: background 0.15s ease, color 0.15s ease;
      border-radius: 3px;
    }
    .${HIGHLIGHT_WORD_ACTIVE_CLASS} {
      background: linear-gradient(120deg, #a8edea 0%, #fed6e3 100%);
      color: #333;
      padding: 1px 2px;
    }
  `;
  document.head.appendChild(style);
  logger.log('高亮样式已注入 (段落背景 + 走字渐变)');
}

/**
 * 全局词时间信息
 */
interface GlobalWordTiming {
  word: string;
  globalStartTime: number;
  globalCharOffset: number;
  spanElement?: HTMLSpanElement;
}

/**
 * 高亮动画器
 */
export class HighlightAnimator {
  private currentElement: HTMLElement | null = null;
  private originalHTML: string = '';
  private slice: TextSlice | null = null;
  private timepoints: TTSTimepoint[] = [];
  private audioDuration: number = 0;

  // 词级高亮状态
  private globalWordTimings: GlobalWordTiming[] = [];
  private currentWordIndex: number = -1;
  private wordSpans: HTMLSpanElement[] = [];
  private enableWordLevel: boolean = true;

  // 动画状态
  private animationFrame: number | null = null;
  private isPaused: boolean = false;
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
   * @param audioDuration 音频总时长 (秒)
   * @param enableWordLevel 是否启用逐词高亮
   */
  startSync(
    element: HTMLElement,
    slice: TextSlice,
    timepoints: TTSTimepoint[],
    getCurrentTime: () => number,
    audioDuration: number = 0,
    enableWordLevel: boolean = true,
  ): void {
    this.stop();

    this.currentElement = element;
    this.originalHTML = element.innerHTML;
    this.slice = slice;
    this.timepoints = timepoints;
    this.audioDuration = audioDuration;
    this.currentTimeGetter = getCurrentTime;
    this.isPaused = false;
    this.enableWordLevel = enableWordLevel;

    // 添加段落高亮类
    element.classList.add(HIGHLIGHT_CLASS);

    if (enableWordLevel) {
      // 计算词级时间并设置 DOM
      this.setupWordLevelHighlight(slice, timepoints, audioDuration);
    }

    // 开始动画循环
    this.startAnimationLoop();

    // 滚动到元素
    this.scrollToElement();

    logger.log('开始高亮同步:', {
      text: slice.text.substring(0, 50) + '...',
      timepointsCount: timepoints.length,
      wordCount: this.globalWordTimings.length,
      enableWordLevel,
    });
  }

  /**
   * 设置词级高亮
   */
  private setupWordLevelHighlight(
    slice: TextSlice,
    timepoints: TTSTimepoint[],
    audioDuration: number,
  ): void {
    const sentences = slice.sentences || [];
    if (sentences.length === 0) {
      logger.warn('无句子信息，跳过词级高亮');
      return;
    }

    // 计算句子时长
    const sentenceDurations = this.calculateSentenceDurations(
      sentences,
      timepoints,
      audioDuration,
    );

    // 计算每个句子的词级时间
    const sentenceWordTimings: {
      sentenceStartTime: number;
      wordTimings: WordTiming[];
      globalCharOffset: number;
    }[] = [];

    let sentenceStartTime = 0;
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const duration = sentenceDurations[i] || 0;

      const wordTimings = estimateWordTimings(sentence.text, duration);
      sentenceWordTimings.push({
        sentenceStartTime,
        wordTimings,
        globalCharOffset: sentence.startOffset,
      });

      sentenceStartTime += duration;
    }

    // 合并为全局词时间
    this.globalWordTimings = mergeToGlobalTimings(sentenceWordTimings);

    logger.log(`词级时间计算完成: ${this.globalWordTimings.length} 个词`);

    // 在 DOM 中包装每个词
    this.wrapWordsInDOM();
  }

  /**
   * 计算句子时长 (基于词数估算)
   * 使用 Web Audio API 提供的精确音频时长 + 词数比例分配
   */
  private calculateSentenceDurations(
    sentences: SentenceInfo[],
    _timepoints: TTSTimepoint[], // 不再使用 timepoints
    audioDuration: number,
  ): number[] {
    // 计算总词数
    const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
    if (totalWords === 0) {
      // 平均分配
      const avgDuration = audioDuration / Math.max(sentences.length, 1);
      return sentences.map(() => avgDuration);
    }

    // 按词数比例分配时长
    const durations: number[] = [];
    for (const sentence of sentences) {
      const ratio = sentence.wordCount / totalWords;
      durations.push(audioDuration * ratio);
    }

    logger.log(
      `句子时长 (词数估算): [${durations.map((d) => d.toFixed(2)).join(', ')}]s, 总时长: ${audioDuration.toFixed(2)}s`,
    );

    return durations;
  }

  /**
   * 在 DOM 中用 span 包装每个词
   */
  private wrapWordsInDOM(): void {
    if (!this.currentElement || this.globalWordTimings.length === 0) {
      return;
    }

    const text = this.slice?.text || '';
    let wrappedHTML = '';
    let lastIndex = 0;

    // 创建 (原始索引, 字符偏移) 对并按偏移排序
    const indexedTimings = this.globalWordTimings.map((t, origIdx) => ({
      ...t,
      originalIndex: origIdx,
    }));
    indexedTimings.sort((a, b) => a.globalCharOffset - b.globalCharOffset);

    for (const timing of indexedTimings) {
      const relativeOffset =
        timing.globalCharOffset - (this.slice?.startOffset || 0);

      // 添加词之前的文本（空格、标点等）
      if (relativeOffset > lastIndex) {
        wrappedHTML += this.escapeHTML(
          text.substring(lastIndex, relativeOffset),
        );
      }

      // 包装词，使用原始时间顺序索引
      const wordEnd = relativeOffset + timing.word.length;
      const wordText = text.substring(relativeOffset, wordEnd);
      wrappedHTML += `<span class="${HIGHLIGHT_WORD_CLASS}" data-word-index="${timing.originalIndex}">${this.escapeHTML(wordText)}</span>`;
      lastIndex = wordEnd;
    }

    // 添加剩余文本
    if (lastIndex < text.length) {
      wrappedHTML += this.escapeHTML(text.substring(lastIndex));
    }

    // 更新 DOM
    this.currentElement.innerHTML = wrappedHTML;

    // 按原始索引顺序收集 span 引用
    this.wordSpans = new Array(this.globalWordTimings.length);
    const allSpans = this.currentElement.querySelectorAll(
      `.${HIGHLIGHT_WORD_CLASS}`,
    );
    allSpans.forEach((span) => {
      const idx = parseInt((span as HTMLElement).dataset.wordIndex || '-1', 10);
      if (idx >= 0 && idx < this.wordSpans.length) {
        this.wordSpans[idx] = span as HTMLSpanElement;
      }
    });

    // 检查是否所有词都正确映射
    const missingCount = this.wordSpans.filter((s) => !s).length;
    if (missingCount > 0) {
      logger.warn(`[DEBUG] 词映射异常: ${missingCount} 个词未找到 span 元素`);
    }

    logger.log(
      `DOM 包装完成: ${allSpans.length} 个词 span, 映射 ${this.wordSpans.length} 个`,
    );
  }

  /**
   * HTML 转义
   */
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
    if (!this.enableWordLevel || this.globalWordTimings.length === 0) {
      return;
    }

    // 找到当前词索引
    const wordIndex = findCurrentWordIndex(
      currentTime,
      this.globalWordTimings.map((w) => ({
        globalStartTime: w.globalStartTime,
      })),
    );

    // 如果索引没变，不需要更新
    if (wordIndex === this.currentWordIndex) {
      return;
    }

    // 移除旧高亮
    if (
      this.currentWordIndex >= 0 &&
      this.currentWordIndex < this.wordSpans.length
    ) {
      const oldSpan = this.wordSpans[this.currentWordIndex];
      if (oldSpan) {
        oldSpan.classList.remove(HIGHLIGHT_WORD_ACTIVE_CLASS);
      }
    }

    // 添加新高亮
    if (wordIndex >= 0 && wordIndex < this.wordSpans.length) {
      const newSpan = this.wordSpans[wordIndex];
      if (newSpan) {
        newSpan.classList.add(HIGHLIGHT_WORD_ACTIVE_CLASS);

        // 每10个词或跳跃超过1时记录日志
        const jump = wordIndex - this.currentWordIndex;
        if (wordIndex % 10 === 0 || jump > 1) {
          const word = this.globalWordTimings[wordIndex]?.word || '?';
          logger.log(
            `[HIGHLIGHT] 词[${wordIndex}] "${word}" @ ${currentTime.toFixed(2)}s, 跳跃=${jump}`,
          );
        }

        // 可选：滚动到当前词（如果不在视野内）
        const rect = newSpan.getBoundingClientRect();
        const isInViewport = rect.top >= 0 && rect.bottom <= window.innerHeight;
        if (!isInViewport) {
          newSpan.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        // 词 span 缺失 - 严重问题
        logger.warn(
          `[DEBUG] 词[${wordIndex}] span 为空! 时间=${currentTime.toFixed(2)}s`,
        );
      }
    }

    this.currentWordIndex = wordIndex;
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

    // 恢复原始 HTML
    if (this.currentElement && this.originalHTML) {
      this.currentElement.innerHTML = this.originalHTML;
      this.currentElement.classList.remove(HIGHLIGHT_CLASS);
    }

    // 重置状态
    this.currentElement = null;
    this.originalHTML = '';
    this.slice = null;
    this.timepoints = [];
    this.audioDuration = 0;
    this.globalWordTimings = [];
    this.currentWordIndex = -1;
    this.wordSpans = [];
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
