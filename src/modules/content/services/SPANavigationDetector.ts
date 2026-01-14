/**
 * SPA导航检测服务
 * 通用的单页应用导航检测，支持各种SPA框架和网站
 *
 * 检测方式：
 * 1. history.pushState/replaceState 拦截
 * 2. popstate 事件监听
 * 3. URL 轮询检测
 * 4. 大规模 DOM 变化检测
 */

import { createModuleLogger } from '../../shared/utils/DebugLogger';

const logger = createModuleLogger('SPANavigationDetector');

export interface SPANavigationCallback {
  (newUrl: string, oldUrl: string): void;
}

export class SPANavigationDetector {
  private lastUrl: string;
  private urlPollInterval: number | null = null;
  private callbacks: Set<SPANavigationCallback> = new Set();
  private isDestroyed = false;

  // 原始的 history 方法
  private originalPushState: typeof history.pushState;
  private originalReplaceState: typeof history.replaceState;

  // DOM 变化检测
  private domObserver: MutationObserver | null = null;
  private domChangeAccumulator = 0;
  private domChangeTimer: number | null = null;
  private readonly DOM_CHANGE_THRESHOLD = 50; // 50个节点变化视为大规模变化
  private readonly DOM_CHANGE_DEBOUNCE = 500; // 500ms防抖

  constructor() {
    this.lastUrl = window.location.href;
    this.originalPushState = history.pushState.bind(history);
    this.originalReplaceState = history.replaceState.bind(history);
  }

  /**
   * 启动导航检测
   */
  start(): void {
    if (this.isDestroyed) return;

    logger.log('启动SPA导航检测');

    // 1. 拦截 history.pushState
    this.interceptHistoryMethods();

    // 2. 监听 popstate (浏览器前进/后退)
    window.addEventListener('popstate', this.handlePopState);

    // 3. 监听 hashchange
    window.addEventListener('hashchange', this.handleHashChange);

    // 4. URL 轮询 (作为兜底方案)
    this.startUrlPolling();

    // 5. 大规模 DOM 变化检测
    this.startDomObserver();
  }

  /**
   * 停止导航检测
   */
  stop(): void {
    this.isDestroyed = true;

    // 恢复原始 history 方法
    history.pushState = this.originalPushState;
    history.replaceState = this.originalReplaceState;

    // 移除事件监听
    window.removeEventListener('popstate', this.handlePopState);
    window.removeEventListener('hashchange', this.handleHashChange);

    // 停止轮询
    if (this.urlPollInterval) {
      clearInterval(this.urlPollInterval);
      this.urlPollInterval = null;
    }

    // 停止 DOM 观察
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = null;
    }

    if (this.domChangeTimer) {
      clearTimeout(this.domChangeTimer);
      this.domChangeTimer = null;
    }

    this.callbacks.clear();
    logger.log('SPA导航检测已停止');
  }

  /**
   * 注册导航回调
   */
  onNavigate(callback: SPANavigationCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * 拦截 history 方法
   */
  private interceptHistoryMethods(): void {
    // 拦截 pushState
    history.pushState = (
      state: any,
      title: string,
      url?: string | URL | null,
    ) => {
      const oldUrl = window.location.href;
      this.originalPushState.call(history, state, title, url);
      const newUrl = window.location.href;

      if (oldUrl !== newUrl) {
        this.handleNavigation(newUrl, oldUrl, 'pushState');
      }
    };

    // 拦截 replaceState
    history.replaceState = (
      state: any,
      title: string,
      url?: string | URL | null,
    ) => {
      const oldUrl = window.location.href;
      this.originalReplaceState.call(history, state, title, url);
      const newUrl = window.location.href;

      if (oldUrl !== newUrl) {
        this.handleNavigation(newUrl, oldUrl, 'replaceState');
      }
    };
  }

  /**
   * 处理 popstate 事件
   */
  private handlePopState = (): void => {
    const newUrl = window.location.href;
    if (this.lastUrl !== newUrl) {
      this.handleNavigation(newUrl, this.lastUrl, 'popstate');
    }
  };

  /**
   * 处理 hashchange 事件
   */
  private handleHashChange = (): void => {
    const newUrl = window.location.href;
    if (this.lastUrl !== newUrl) {
      this.handleNavigation(newUrl, this.lastUrl, 'hashchange');
    }
  };

  /**
   * 启动 URL 轮询
   */
  private startUrlPolling(): void {
    // 每 500ms 检查一次 URL 变化 (兜底方案)
    this.urlPollInterval = window.setInterval(() => {
      const currentUrl = window.location.href;
      if (this.lastUrl !== currentUrl) {
        this.handleNavigation(currentUrl, this.lastUrl, 'polling');
      }
    }, 500);
  }

  /**
   * 启动 DOM 变化观察
   * 注意：禁用此功能，因为翻译内容的插入会被误判为 SPA 导航
   * URL 变化检测（pushState、popstate、hashchange、轮询）已经足够可靠
   */
  private startDomObserver(): void {
    // 禁用 DOM 观察器以避免误判翻译插入为 SPA 导航
    // 如果需要启用，需要过滤掉翻译相关的类名
    logger.log('DOM 变化观察已禁用（避免与翻译插入冲突）');

    // 原始代码保留但不执行
    /*
        this.domObserver = new MutationObserver((mutations) => {
            // 过滤掉翻译相关的节点变化
            let nodeChanges = 0;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof Element) {
                        // 忽略翻译相关类名
                        if (node.classList?.contains('wxt-translation-term') ||
                            node.classList?.contains('illa-paragraph-translation') ||
                            node.classList?.contains('illa-tts-highlight')) {
                            return;
                        }
                    }
                    nodeChanges++;
                });
                mutation.removedNodes.forEach(() => nodeChanges++);
            });

            this.domChangeAccumulator += nodeChanges;

            if (this.domChangeTimer) {
                clearTimeout(this.domChangeTimer);
            }

            this.domChangeTimer = window.setTimeout(() => {
                if (this.domChangeAccumulator >= this.DOM_CHANGE_THRESHOLD) {
                    logger.log(`检测到大规模DOM变化: ${this.domChangeAccumulator} 个节点`);
                    this.handleContentReplacement();
                }
                this.domChangeAccumulator = 0;
            }, this.DOM_CHANGE_DEBOUNCE);
        });

        this.domObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
        */
  }

  /**
   * 处理导航事件
   */
  private handleNavigation(
    newUrl: string,
    oldUrl: string,
    source: string,
  ): void {
    logger.log(`检测到导航 [${source}]: ${oldUrl} -> ${newUrl}`);
    this.lastUrl = newUrl;

    // 触发所有回调
    this.callbacks.forEach((callback) => {
      try {
        callback(newUrl, oldUrl);
      } catch (error) {
        logger.error('导航回调执行失败:', error);
      }
    });
  }

  /**
   * 处理内容替换（URL未变但内容大规模变化）
   */
  private handleContentReplacement(): void {
    const currentUrl = window.location.href;
    // 使用特殊标记表示这是内容替换而非URL变化
    this.callbacks.forEach((callback) => {
      try {
        callback(currentUrl, currentUrl); // 相同URL表示内容替换
      } catch (error) {
        logger.error('内容替换回调执行失败:', error);
      }
    });
  }
}

// 单例实例
let detectorInstance: SPANavigationDetector | null = null;

export function getSPANavigationDetector(): SPANavigationDetector {
  if (!detectorInstance) {
    detectorInstance = new SPANavigationDetector();
  }
  return detectorInstance;
}

export function destroySPANavigationDetector(): void {
  if (detectorInstance) {
    detectorInstance.stop();
    detectorInstance = null;
  }
}
