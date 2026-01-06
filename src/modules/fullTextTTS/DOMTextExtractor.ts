/**
 * DOM 文本提取器
 * DOMTextExtractor - 从页面提取可朗读的段落
 *
 * 过滤规则：
 * - 排除翻译内容 (.translation-overlay-text, .translation-tooltip-*)
 * - 排除脚本/样式/隐藏元素
 * - 只提取可见段落
 */

import type { ParagraphInfo } from '../shared/types/fullTextTTS';
import { TextSlicer } from './TextSlicer';

/**
 * 创建模块日志器
 */
const createLogger = (prefix: string) => ({
  log: (...args: unknown[]) => console.log('[' + prefix + ']', ...args),
  warn: (...args: unknown[]) => console.warn('[' + prefix + ']', ...args),
  error: (...args: unknown[]) => console.error('[' + prefix + ']', ...args),
});

const logger = createLogger('DOMTextExtractor');

/**
 * 需要排除的选择器
 */
const EXCLUDE_SELECTORS = [
  // 翻译相关
  '.translation-overlay-text',
  '.translation-tooltip-container',
  '.translation-tooltip-content',
  '[data-translation-overlay]',
  // 脚本/样式
  'script',
  'style',
  'noscript',
  // 表单/交互
  'input',
  'textarea',
  'select',
  'button',
  // 媒体
  'img',
  'video',
  'audio',
  'canvas',
  'svg',
  // 隐藏元素
  '[hidden]',
  '[aria-hidden="true"]',
  // 导航/页脚
  'nav',
  'header',
  'footer',
  'aside',
  // 代码块
  'code',
  'pre',
];

/**
 * 段落元素选择器
 */
const PARAGRAPH_SELECTORS = [
  'p',
  'article > div',
  'main > div',
  '.content > div',
  'section > div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'li',
  'blockquote',
];

/**
 * DOM 文本提取器
 */
export class DOMTextExtractor {
  private textSlicer: TextSlicer;
  private excludeSelectors: string[];
  private minTextLength: number;

  constructor(
    options: {
      minTextLength?: number;
      additionalExcludeSelectors?: string[];
    } = {},
  ) {
    this.textSlicer = new TextSlicer();
    this.minTextLength = options.minTextLength ?? 20;
    this.excludeSelectors = [
      ...EXCLUDE_SELECTORS,
      ...(options.additionalExcludeSelectors || []),
    ];
  }

  /**
   * 提取页面段落
   * @returns 段落信息数组
   */
  extractParagraphs(): ParagraphInfo[] {
    const paragraphs: ParagraphInfo[] = [];
    const seenTexts = new Set<string>();

    // 查找所有候选段落元素
    const candidates = this.findCandidateElements();

    for (const element of candidates) {
      // 检查是否应该排除
      if (this.shouldExclude(element)) {
        continue;
      }

      // 提取文本
      const text = this.extractText(element);

      // 过滤空文本和重复文本
      if (!text || text.length < this.minTextLength) {
        continue;
      }

      // 去重 (避免嵌套元素导致重复)
      const textKey = text.trim().substring(0, 100);
      if (seenTexts.has(textKey)) {
        continue;
      }
      seenTexts.add(textKey);

      // 切片
      const slices = this.textSlicer.slice(text);

      paragraphs.push({
        element,
        text,
        slices,
      });
    }

    logger.log(`提取到 ${paragraphs.length} 个段落`);
    return paragraphs;
  }

  /**
   * 查找候选段落元素
   */
  private findCandidateElements(): HTMLElement[] {
    const candidates: HTMLElement[] = [];

    for (const selector of PARAGRAPH_SELECTORS) {
      const elements = document.querySelectorAll<HTMLElement>(selector);
      for (const el of elements) {
        if (!candidates.includes(el)) {
          candidates.push(el);
        }
      }
    }

    // 按文档顺序排序
    candidates.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    return candidates;
  }

  /**
   * 检查元素是否应该被排除
   */
  private shouldExclude(element: HTMLElement): boolean {
    // 检查元素自身是否匹配排除选择器
    for (const selector of this.excludeSelectors) {
      if (element.matches(selector)) {
        return true;
      }
    }

    // 检查是否是排除元素的后代
    const closestExcluded = element.closest(this.excludeSelectors.join(','));
    if (closestExcluded) {
      return true;
    }

    // 检查可见性
    if (!this.isVisible(element)) {
      return true;
    }

    return false;
  }

  /**
   * 检查元素是否可见
   */
  private isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);

    if (style.display === 'none') {
      return false;
    }

    if (style.visibility === 'hidden') {
      return false;
    }

    if (style.opacity === '0') {
      return false;
    }

    // 检查尺寸
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  }

  /**
   * 提取元素的纯文本 (排除翻译内容)
   */
  private extractText(element: HTMLElement): string {
    // 克隆元素以避免修改原始 DOM
    const clone = element.cloneNode(true) as HTMLElement;

    // 移除翻译相关元素
    for (const selector of this.excludeSelectors) {
      const toRemove = clone.querySelectorAll(selector);
      for (const el of toRemove) {
        el.remove();
      }
    }

    // 获取文本内容
    let text = clone.textContent || '';

    // 清理文本
    text = text
      .replace(/\s+/g, ' ') // 合并多个空白
      .trim();

    return text;
  }

  /**
   * 获取指定元素的段落信息
   */
  getParagraphInfo(element: HTMLElement): ParagraphInfo | null {
    if (this.shouldExclude(element)) {
      return null;
    }

    const text = this.extractText(element);
    if (!text || text.length < this.minTextLength) {
      return null;
    }

    const slices = this.textSlicer.slice(text);

    return {
      element,
      text,
      slices,
    };
  }
}

/**
 * DOMTextExtractor 单例
 */
let extractorInstance: DOMTextExtractor | null = null;

/**
 * 获取 DOMTextExtractor 单例
 */
export function getDOMTextExtractor(options?: {
  minTextLength?: number;
  additionalExcludeSelectors?: string[];
}): DOMTextExtractor {
  if (!extractorInstance) {
    extractorInstance = new DOMTextExtractor(options);
  }
  return extractorInstance;
}
