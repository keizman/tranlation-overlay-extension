/**
 * 滑动翻译服务
 * 检测段落右滑手势触发单段落翻译
 * 支持切换模式：首次右滑翻译，再次右滑恢复原始
 */

import { TranslationTriggerMode } from '@/src/modules/shared/types/core';

export interface SwipeConfig {
  minSwipeDistance: number; // 最小滑动距离 (px)
  maxSwipeTime: number; // 最大滑动时间 (ms)
  swipeDirection: 'left' | 'right'; // 滑动方向
}

const DEFAULT_SWIPE_CONFIG: SwipeConfig = {
  minSwipeDistance: 80,
  maxSwipeTime: 500,
  swipeDirection: 'right',
};

// 标记已翻译的元素属性
const TRANSLATED_ATTR = 'data-wxt-swipe-translated';
const ORIGINAL_HTML_ATTR = 'data-wxt-original-html';

export class SwipeTranslationService {
  private config: SwipeConfig;
  private isEnabled: boolean = false;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private targetElement: HTMLElement | null = null;
  private onSwipeTranslate: ((element: HTMLElement) => Promise<void>) | null =
    null;

  constructor(config: Partial<SwipeConfig> = {}) {
    this.config = { ...DEFAULT_SWIPE_CONFIG, ...config };
  }

  /**
   * 启用滑动翻译
   */
  enable(onSwipeTranslate: (element: HTMLElement) => Promise<void>): void {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.onSwipeTranslate = onSwipeTranslate;

    document.addEventListener('touchstart', this.handleTouchStart, {
      passive: true,
    });
    document.addEventListener('touchend', this.handleTouchEnd, {
      passive: true,
    });
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);

    console.log('[SwipeTranslation] 已启用滑动翻译');
  }

  /**
   * 禁用滑动翻译
   */
  disable(): void {
    if (!this.isEnabled) return;

    this.isEnabled = false;
    this.onSwipeTranslate = null;

    document.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchend', this.handleTouchEnd);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);

    console.log('[SwipeTranslation] 已禁用滑动翻译');
  }

  /**
   * 根据设置更新状态
   */
  updateFromSettings(
    triggerMode: TranslationTriggerMode,
    onSwipeTranslate: (element: HTMLElement) => Promise<void>,
  ): void {
    if (triggerMode === TranslationTriggerMode.SWIPE) {
      this.enable(onSwipeTranslate);
    } else {
      this.disable();
    }
  }

  // ================== 事件处理 ==================

  private handleTouchStart = (e: TouchEvent): void => {
    if (!this.isEnabled || e.touches.length !== 1) return;

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.targetElement = this.findParagraphElement(e.target as HTMLElement);
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (!this.isEnabled || e.changedTouches.length !== 1) return;

    const touch = e.changedTouches[0];
    this.processSwipe(touch.clientX, touch.clientY);
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.isEnabled) return;

    this.touchStartX = e.clientX;
    this.touchStartY = e.clientY;
    this.touchStartTime = Date.now();
    this.targetElement = this.findParagraphElement(e.target as HTMLElement);
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (!this.isEnabled) return;

    this.processSwipe(e.clientX, e.clientY);
  };

  /**
   * 处理滑动
   */
  private processSwipe(endX: number, endY: number): void {
    const deltaX = endX - this.touchStartX;
    const deltaY = endY - this.touchStartY;
    const duration = Date.now() - this.touchStartTime;

    // 检查是否是有效的水平滑动
    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 2;
    const isValidDistance = Math.abs(deltaX) >= this.config.minSwipeDistance;
    const isValidTime = duration <= this.config.maxSwipeTime;
    const isRightSwipe =
      this.config.swipeDirection === 'right' ? deltaX > 0 : deltaX < 0;

    if (
      isHorizontalSwipe &&
      isValidDistance &&
      isValidTime &&
      isRightSwipe &&
      this.targetElement
    ) {
      console.log(
        `[SwipeTranslation] 检测到右滑 (${Math.abs(deltaX)}px, ${duration}ms)`,
      );
      this.handleSwipeAction(this.targetElement);
    }

    // 重置状态
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.targetElement = null;
  }

  /**
   * 处理滑动动作 - 切换模式
   * 情况1：无翻译 -> 触发翻译
   * 情况2：有翻译（自动或滑动触发） -> 隐藏/恢复翻译
   */
  private async handleSwipeAction(element: HTMLElement): Promise<void> {
    // 检查是否由滑动触发的翻译
    const isSwipeTranslated = element.hasAttribute(TRANSLATED_ATTR);

    // 检查是否存在自动翻译的内容（通过自动翻译模式添加的翻译标注）
    const translationTerms = element.querySelectorAll('.wxt-translation-term');
    const hasAutoTranslations = translationTerms.length > 0;

    // 检查自动翻译是否已被隐藏
    const isTranslationHidden =
      hasAutoTranslations &&
      (translationTerms[0] as HTMLElement).style.display === 'none';

    if (isSwipeTranslated) {
      // 滑动翻译的段落 -> 恢复原始（移除所有翻译）
      this.restoreOriginal(element);
    } else if (hasAutoTranslations) {
      // 有自动翻译 -> 切换翻译可见性
      this.toggleTranslationVisibility(
        element,
        translationTerms,
        isTranslationHidden,
      );
    } else {
      // 无翻译 -> 执行翻译
      await this.triggerTranslation(element);
    }
  }

  /**
   * 切换翻译可见性（用于自动翻译的段落）
   */
  private toggleTranslationVisibility(
    element: HTMLElement,
    translationTerms: NodeListOf<Element>,
    isCurrentlyHidden: boolean,
  ): void {
    const newDisplay = isCurrentlyHidden ? '' : 'none';

    translationTerms.forEach((term) => {
      (term as HTMLElement).style.display = newDisplay;
    });

    if (isCurrentlyHidden) {
      element.classList.remove('wxt-translations-hidden');
      console.log('[SwipeTranslation] 已显示翻译');
    } else {
      element.classList.add('wxt-translations-hidden');
      console.log('[SwipeTranslation] 已隐藏翻译');
    }
  }

  /**
   * 查找段落元素
   */
  private findParagraphElement(target: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = target;

    // 向上查找直到找到段落级别的元素
    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      const isBlockElement = [
        'p',
        'div',
        'article',
        'section',
        'li',
        'td',
        'th',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ].includes(tagName);

      // 有文本内容且是块级元素
      if (isBlockElement && current.innerText.trim().length > 10) {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  /**
   * 触发翻译
   */
  private async triggerTranslation(element: HTMLElement): Promise<void> {
    if (!this.onSwipeTranslate) return;

    // 保存原始 HTML 用于恢复
    if (!element.hasAttribute(ORIGINAL_HTML_ATTR)) {
      element.setAttribute(ORIGINAL_HTML_ATTR, element.innerHTML);
    }

    // 添加视觉反馈
    element.classList.add('wxt-swipe-translating');

    try {
      await this.onSwipeTranslate(element);
      // 标记为已翻译
      element.setAttribute(TRANSLATED_ATTR, 'true');
      console.log('[SwipeTranslation] 翻译完成');
    } catch (error) {
      console.error('[SwipeTranslation] 翻译失败:', error);
    } finally {
      element.classList.remove('wxt-swipe-translating');
    }
  }

  /**
   * 恢复原始内容
   */
  private restoreOriginal(element: HTMLElement): void {
    const originalHtml = element.getAttribute(ORIGINAL_HTML_ATTR);

    if (originalHtml) {
      element.innerHTML = originalHtml;
      element.removeAttribute(TRANSLATED_ATTR);
      console.log('[SwipeTranslation] 已恢复原始内容');
    }
  }

  /**
   * 检查元素是否已翻译
   */
  isElementTranslated(element: HTMLElement): boolean {
    return element.hasAttribute(TRANSLATED_ATTR);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SwipeConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.disable();
  }
}
