/**
 * 滑动翻译服务
 * 检测段落右滑手势触发单段落翻译
 * 支持切换模式：首次右滑翻译，再次右滑恢复原始
 */

import { fetchGoogleTranslation } from '../utils/GoogleTranslateUtils';

export interface SwipeConfig {
  minSwipeDistance: number; // 最小滑动距离 (px)
  maxSwipeTime: number; // 最大滑动时间 (ms)
  swipeDirection: 'left' | 'right'; // 滑动方向
}

const DEFAULT_SWIPE_CONFIG: SwipeConfig = {
  minSwipeDistance: 80,
  maxSwipeTime: 500,
  swipeDirection: 'left', // 默认为左滑
};

// 标记已翻译的元素属性
const TRANSLATED_ATTR = 'data-wxt-swipe-translated';
const _ORIGINAL_HTML_ATTR = 'data-wxt-original-html';
// 缓存键属性
const _CACHE_KEY_ATTR = 'data-wxt-cache-key';

export class SwipeTranslationService {
  private config: SwipeConfig;
  private isEnabled: boolean = false;
  private touchStartX: number = 0;
  private touchStartY: number = 0;
  private touchStartTime: number = 0;
  private targetElement: HTMLElement | null = null;

  // 简单内存缓存：原文哈希/前缀 -> 翻译文本
  private translationCache = new Map<string, string>();

  // 标记翻译容器的类名
  private readonly TRANSLATION_CONTAINER_CLASS =
    'wxt-immersive-translation-container';

  constructor(config: Partial<SwipeConfig> = {}) {
    this.config = { ...DEFAULT_SWIPE_CONFIG, ...config };
  }

  /**
   * 启用滑动翻译
   */
  enable(): void {
    if (this.isEnabled) return;

    this.isEnabled = true;

    document.addEventListener('touchstart', this.handleTouchStart, {
      passive: true,
    });
    document.addEventListener('touchend', this.handleTouchEnd, {
      passive: true,
    });
    // 鼠标事件仅用于测试，实际移动端主要靠 touch
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);

    console.log('[SwipeTranslation] 已启用滑动翻译 (左滑)');
  }

  /**
   * 禁用滑动翻译
   */
  disable(): void {
    if (!this.isEnabled) return;

    this.isEnabled = false;

    document.removeEventListener('touchstart', this.handleTouchStart);
    document.removeEventListener('touchend', this.handleTouchEnd);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);

    console.log('[SwipeTranslation] 已禁用滑动翻译');
  }

  /**
   * 更新配置 (包括右滑设置)
   */
  updateSettings(settings: { leftSwipe: boolean; rightSwipe: boolean }): void {
    // 只要开启其中一个，就启用服务监听
    if (settings.leftSwipe || settings.rightSwipe) {
      (this.config as any).leftSwipe = settings.leftSwipe;
      (this.config as any).rightSwipe = settings.rightSwipe;
      this.enable();
    } else {
      (this.config as any).leftSwipe = false;
      (this.config as any).rightSwipe = false;
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

    const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY) * 2;
    const isValidDistance = Math.abs(deltaX) >= this.config.minSwipeDistance;
    const isValidTime = duration <= this.config.maxSwipeTime;

    if (
      isHorizontalSwipe &&
      isValidDistance &&
      isValidTime &&
      this.targetElement
    ) {
      const isLeftSwipe = deltaX < 0;
      const isRightSwipe = deltaX > 0;

      // 左滑 -> 翻译 (如果启用)
      if (isLeftSwipe && (this.config as any).leftSwipe) {
        console.log(`[SwipeTranslation] 左滑 -> 触发翻译`);
        this.handleLeftSwipe(this.targetElement);
      }
      // 右滑 -> 隐藏 (如果启用)
      else if (isRightSwipe && (this.config as any).rightSwipe) {
        console.log(`[SwipeTranslation] 右滑 -> 隐藏翻译`);
        this.handleRightSwipe(this.targetElement);
      }
    }

    // 重置状态
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
    this.targetElement = null;
  }

  /**
   * 左滑处理：显示翻译
   */
  private async handleLeftSwipe(element: HTMLElement): Promise<void> {
    const isTranslated = element.hasAttribute(TRANSLATED_ATTR);

    // 获取现有的翻译容器
    const existingContainer = element.nextElementSibling;
    const hasExistingContainer =
      existingContainer &&
      existingContainer.classList.contains(this.TRANSLATION_CONTAINER_CLASS);

    if (isTranslated && hasExistingContainer) {
      const container = existingContainer as HTMLElement;
      // 左滑切换显示/隐藏 (toggle)
      if (container.style.display !== 'none') {
        container.style.display = 'none';
      } else {
        container.style.display = 'block';
      }
    } else {
      // 未翻译 -> 执行翻译
      await this.performTranslation(element);
    }
  }

  /**
   * 右滑处理：隐藏/关闭翻译
   */
  private handleRightSwipe(element: HTMLElement): Promise<void> {
    const existingContainer = element.nextElementSibling;
    if (
      existingContainer &&
      existingContainer.classList.contains(this.TRANSLATION_CONTAINER_CLASS)
    ) {
      (existingContainer as HTMLElement).style.display = 'none';
      console.log('[SwipeTranslation] 右滑隐藏');
    }
    return Promise.resolve();
  }

  /**
   * 执行翻译 (带缓存)
   */
  private async performTranslation(element: HTMLElement): Promise<void> {
    const originalText = element.innerText.trim();
    if (!originalText) return;

    // 生成简单的缓存键 (使用文本内容)
    // 简单起见，直接用文本作为键。如果文本太长，可以截取
    const cacheKey = originalText;

    // 添加视觉反馈 (半透明或加载中样式)
    element.style.opacity = '0.6';
    element.style.transition = 'opacity 0.3s';

    try {
      let translatedText = '';

      // 1. 检查缓存
      if (this.translationCache.has(cacheKey)) {
        console.log('[SwipeTranslation] 命中缓存');
        translatedText = this.translationCache.get(cacheKey)!;
      } else {
        // 2. 调用 Google API
        console.log('[SwipeTranslation] 请求 Google API...');
        const result = await fetchGoogleTranslation(originalText);
        translatedText = result.translatedText;
        // 写入缓存
        this.translationCache.set(cacheKey, translatedText);
      }

      // 3. 显示翻译
      this.showTranslation(element, translatedText);
    } catch (error) {
      console.error('[SwipeTranslation] 翻译失败:', error);
      // 可以在这里添加错误提示 UI
    } finally {
      element.style.opacity = '1';
    }
  }

  /**
   * 显示翻译结果 (沉浸式：原文下方的新行)
   */
  private showTranslation(element: HTMLElement, translatedText: string): void {
    // 标记已翻译
    element.setAttribute(TRANSLATED_ATTR, 'true');

    // 检查是否已有容器
    let container = element.nextElementSibling as HTMLElement;
    if (
      !container ||
      !container.classList.contains(this.TRANSLATION_CONTAINER_CLASS)
    ) {
      // 创建新容器
      container = document.createElement('div');
      container.className = this.TRANSLATION_CONTAINER_CLASS;

      // 样式设置：模仿沉浸式翻译风格
      container.style.marginTop = '6px';
      container.style.marginBottom = '12px';
      container.style.color = 'rgb(100, 116, 139)'; // Slate-500
      container.style.fontWeight = '500';
      container.style.fontSize = '0.95em';
      container.style.lineHeight = '1.5';

      // 插入到原文之后
      if (element.parentNode) {
        element.parentNode.insertBefore(container, element.nextSibling);

        // 如果原元素是 inline 元素 (如 span)，尝试设为 block 或 inline-block 以确保换行效果
        // 但通常 paragraphTTS 针对的是块级元素
      }
    }

    container.innerText = translatedText;
    container.style.display = 'block';
  }

  /**
   * 恢复原始内容 (移除翻译行)
   */
  private restoreOriginal(element: HTMLElement): void {
    const container = element.nextElementSibling;
    if (
      container &&
      container.classList.contains(this.TRANSLATION_CONTAINER_CLASS)
    ) {
      container.remove();
    }
    element.removeAttribute(TRANSLATED_ATTR);
    console.log('[SwipeTranslation] 已移除翻译');
  }

  /**
   * 查找段落元素
   */
  private findParagraphElement(target: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = target;

    // 向上查找直到找到段落级别的元素
    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      // 这里可以限制只针对 P 标签，或者扩充
      const isBlockElement = [
        'p',
        'div',
        'article',
        'section',
        'li',
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
    this.translationCache.clear();
  }
}
