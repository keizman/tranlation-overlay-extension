/**
 * 全文TTS底栏管理器
 * FullTextTTSBarManager - 管理底栏的生命周期和状态
 */

import type { UserSettings } from '../../shared/types/storage';
import type { FullTextTTSPlayState } from '../../shared/types/fullTextTTS';
import {
  getFullTextTTSService,
  destroyFullTextTTSService,
} from '../fullTextTTS/FullTextTTSService';
import { browser } from 'wxt/browser';
import { createModuleLogger } from '../../shared/utils/DebugLogger';

/**
 * 模块日志器 - 输出到控制台和调试面板
 */
const logger = createModuleLogger('TTSBar');

/**
 * 底栏容器 ID
 */
const BAR_CONTAINER_ID = 'fulltext-tts-bar-container';

/**
 * 底栏 HTML 模板
 */
const createBarHTML = (
  isCollapsed: boolean,
  state: FullTextTTSPlayState,
  isConfigured: boolean = true,
) => {
  if (isCollapsed) {
    return `
      <div id="${BAR_CONTAINER_ID}" class="fulltext-tts-bar-collapsed">
        <button class="fulltext-tts-expand-btn" title="展开TTS底栏">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m18 15-6-6-6 6"/>
          </svg>
        </button>
      </div>
    `;
  }

  const isPlaying = state === 'PLAYING';
  const isLoading = state === 'LOADING';
  // 未配置时也禁用播放控制按钮
  const isDisabled = state === 'LOADING' || !isConfigured;

  return `
    <div id="${BAR_CONTAINER_ID}" class="fulltext-tts-bar">
      <!-- 左侧: 倍速 (占位) -->
      <div class="fulltext-tts-bar-left">
        <button class="fulltext-tts-speed-btn" disabled title="倍速 (开发中)">
          1.0x
        </button>
      </div>

      <!-- 中间: 播放控制 -->
      <div class="fulltext-tts-bar-center">
        <button class="fulltext-tts-control-btn" data-action="prev" ${isDisabled ? 'disabled' : ''} title="上一段">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="19 20 9 12 19 4 19 20"/>
            <line x1="5" x2="5" y1="19" y2="5"/>
          </svg>
        </button>
        <button class="fulltext-tts-play-btn ${isConfigured ? '' : 'disabled'}" data-action="play" ${isDisabled ? 'disabled' : ''} title="${!isConfigured ? '请先配置TTS API' : isPlaying ? '暂停' : '播放'}">
          ${
            isLoading
              ? '<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
              : isPlaying
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
          }
        </button>
        <button class="fulltext-tts-control-btn" data-action="next" ${isDisabled ? 'disabled' : ''} title="下一段">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="5 4 15 12 5 20 5 4"/>
            <line x1="19" x2="19" y1="5" y2="19"/>
          </svg>
        </button>
      </div>

      <!-- 右侧: 设置和收起 -->
      <div class="fulltext-tts-bar-right">
        <button class="fulltext-tts-control-btn" data-action="settings" title="设置">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
        <button class="fulltext-tts-control-btn" data-action="collapse" title="收起">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </button>
      </div>
    </div>
  `;
};

/**
 * 底栏样式
 */
const BAR_STYLES = `
  .fulltext-tts-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: rgba(30, 30, 30, 0.95);
    backdrop-filter: blur(10px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    z-index: 99999;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.2);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .fulltext-tts-bar-collapsed {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 99999;
  }

  .fulltext-tts-expand-btn {
    width: 44px;
    height: 28px;
    background: rgba(30, 30, 30, 0.9);
    border: none;
    border-radius: 14px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  .fulltext-tts-expand-btn:hover {
    background: rgba(50, 50, 50, 0.95);
    color: white;
    transform: translateY(-2px);
  }

  .fulltext-tts-bar-left,
  .fulltext-tts-bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 100px;
  }

  .fulltext-tts-bar-right {
    justify-content: flex-end;
  }

  .fulltext-tts-bar-center {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .fulltext-tts-speed-btn {
    padding: 4px 10px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: not-allowed;
  }

  .fulltext-tts-control-btn {
    width: 36px;
    height: 36px;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .fulltext-tts-control-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .fulltext-tts-control-btn:disabled {
    color: rgba(255, 255, 255, 0.3);
    cursor: not-allowed;
  }

  .fulltext-tts-play-btn {
    width: 48px;
    height: 48px;
    background: #3b82f6;
    border: none;
    border-radius: 50%;
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .fulltext-tts-play-btn:hover {
    background: #2563eb;
    transform: scale(1.05);
  }

  .fulltext-tts-play-btn:active {
    transform: scale(0.95);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .animate-spin {
    animation: spin 1s linear infinite;
  }
`;

/**
 * 全文TTS底栏管理器
 */
export class FullTextTTSBarManager {
  private isInitialized: boolean = false;
  private isBarVisible: boolean = false;
  private isCollapsed: boolean = true;
  private currentState: FullTextTTSPlayState = 'IDLE';
  private settings: UserSettings | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private unsubscribeStateChange: (() => void) | null = null;
  private isConfigured: boolean = false; // API是否已正确配置

  /**
   * 初始化底栏管理器
   */
  async init(settings: UserSettings): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.settings = settings;
    this.isCollapsed = settings.fullTextTTSBarCollapsed;

    // 检查是否启用
    if (!settings.enableFullTextTTSBar) {
      logger.log('底栏未启用');
      return;
    }

    // 迁移：确保 fullTextTTSVoiceName 字段存在 (使用 sync storage，与 StorageService 一致)
    try {
      const result = await browser.storage.sync.get('user_settings');
      const serializedData = result.user_settings;
      if (serializedData) {
        const storedSettings = JSON.parse(serializedData);
        if (!storedSettings.fullTextTTSVoiceName) {
          logger.log('迁移语音模型设置: 添加默认值 en-US-Standard-H');
          storedSettings.fullTextTTSVoiceName = 'en-US-Standard-H';
          await browser.storage.sync.set({
            user_settings: JSON.stringify(storedSettings),
          });
        }
      }
    } catch (e) {
      logger.warn('迁移语音模型设置失败:', e);
    }

    // 检查是否有配置
    const activeConfig = settings.fullTextTTSConfigs.find(
      (c) => c.id === settings.activeFullTextTTSConfigId,
    );

    // 检查配置是否完整（有API Key）
    this.isConfigured = !!activeConfig?.config.apiKey;
    if (!this.isConfigured) {
      logger.warn('未配置 TTS API - 底栏将显示但播放功能禁用');
    }

    // 注入样式
    this.injectStyles();

    // 仅在配置完整时初始化 TTS 服务
    if (this.isConfigured && activeConfig) {
      const ttsService = getFullTextTTSService();
      ttsService.initialize(activeConfig.config);

      // 监听状态变化
      this.unsubscribeStateChange = ttsService.onStateChange(
        (state: FullTextTTSPlayState) => {
          this.currentState = state;
          this.updateBarUI();
        },
      );
    }

    // 显示底栏
    this.show();

    this.isInitialized = true;
    logger.log(
      '底栏管理器已初始化',
      this.isConfigured ? '(已配置)' : '(未配置，播放功能禁用)',
    );
  }

  /**
   * 注入样式
   */
  private injectStyles(): void {
    if (document.getElementById('fulltext-tts-bar-styles')) {
      return;
    }

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'fulltext-tts-bar-styles';
    this.styleElement.textContent = BAR_STYLES;
    document.head.appendChild(this.styleElement);
  }

  /**
   * 显示底栏
   */
  show(): void {
    this.isBarVisible = true;
    this.renderBar();
    this.attachEventListeners();
    logger.log('底栏已显示');
  }

  /**
   * 隐藏底栏
   */
  hide(): void {
    this.isBarVisible = false;
    const container = document.getElementById(BAR_CONTAINER_ID);
    if (container) {
      container.remove();
    }
    logger.log('底栏已隐藏');
  }

  /**
   * 渲染底栏
   */
  private renderBar(): void {
    // 移除已存在的
    const existing = document.getElementById(BAR_CONTAINER_ID);
    if (existing) {
      existing.remove();
    }

    // 创建新的
    const wrapper = document.createElement('div');
    wrapper.innerHTML = createBarHTML(
      this.isCollapsed,
      this.currentState,
      this.isConfigured,
    );
    const bar = wrapper.firstElementChild;
    if (bar) {
      document.body.appendChild(bar);
    }
  }

  /**
   * 更新底栏 UI
   */
  private updateBarUI(): void {
    if (!this.isBarVisible) return;
    this.renderBar();
    this.attachEventListeners();
  }

  /**
   * 绑定事件监听器
   */
  private attachEventListeners(): void {
    const container = document.getElementById(BAR_CONTAINER_ID);
    if (!container) return;

    // 展开按钮
    const expandBtn = container.querySelector('.fulltext-tts-expand-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => this.expand());
    }

    // 播放按钮
    const playBtn = container.querySelector('[data-action="play"]');
    if (playBtn) {
      playBtn.addEventListener('click', () => this.handlePlay());
    }

    // 上一段
    const prevBtn = container.querySelector('[data-action="prev"]');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.handlePrev());
    }

    // 下一段
    const nextBtn = container.querySelector('[data-action="next"]');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.handleNext());
    }

    // 设置
    const settingsBtn = container.querySelector('[data-action="settings"]');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.handleSettings());
    }

    // 收起
    const collapseBtn = container.querySelector('[data-action="collapse"]');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this.collapse());
    }
  }

  /**
   * 折叠底栏
   */
  async collapse(): Promise<void> {
    // 停止播放
    const ttsService = getFullTextTTSService();
    ttsService.stop();

    this.isCollapsed = true;
    this.updateBarUI();

    // 保存状态
    await this.saveCollapsedState(true);

    logger.log('底栏已折叠');
  }

  /**
   * 展开底栏
   */
  async expand(): Promise<void> {
    this.isCollapsed = false;
    this.updateBarUI();

    // 保存状态
    await this.saveCollapsedState(false);

    logger.log('底栏已展开');
  }

  /**
   * 保存折叠状态 (使用 sync storage，与 StorageService 一致)
   */
  private async saveCollapsedState(collapsed: boolean): Promise<void> {
    try {
      const result = await browser.storage.sync.get('user_settings');
      const serializedData = result.user_settings;
      if (serializedData) {
        const storedSettings = JSON.parse(serializedData);
        storedSettings.fullTextTTSBarCollapsed = collapsed;
        await browser.storage.sync.set({
          user_settings: JSON.stringify(storedSettings),
        });
      }
    } catch (e) {
      logger.error('保存折叠状态失败:', e);
    }
  }

  /**
   * 处理播放/暂停
   */
  private async handlePlay(): Promise<void> {
    // 未配置时不处理播放
    if (!this.isConfigured) {
      logger.warn('请先配置 TTS API');
      this.handleSettings(); // 引导用户去设置
      return;
    }

    const ttsService = getFullTextTTSService();
    const state = ttsService.getState();

    switch (state) {
      case 'IDLE':
        await ttsService.startFullTextReading();
        break;
      case 'PLAYING':
        ttsService.pause();
        break;
      case 'PAUSED':
        ttsService.resume();
        break;
    }
  }

  /**
   * 处理上一段
   */
  private async handlePrev(): Promise<void> {
    const ttsService = getFullTextTTSService();
    await ttsService.previousParagraph();
  }

  /**
   * 处理下一段
   */
  private async handleNext(): Promise<void> {
    const ttsService = getFullTextTTSService();
    await ttsService.nextParagraph();
  }

  /**
   * 处理设置
   */
  private handleSettings(): void {
    logger.log('打开TTS设置页面: open-options hash=#tts');
    // 打开扩展设置页面的TTS部分
    browser.runtime.sendMessage({ type: 'open-options', hash: '#tts' });
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.hide();

    if (this.unsubscribeStateChange) {
      this.unsubscribeStateChange();
      this.unsubscribeStateChange = null;
    }

    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }

    destroyFullTextTTSService();
    this.isInitialized = false;

    logger.log('底栏管理器已销毁');
  }
}

/**
 * 单例实例
 */
let barManagerInstance: FullTextTTSBarManager | null = null;

/**
 * 获取底栏管理器单例
 */
export function getFullTextTTSBarManager(): FullTextTTSBarManager {
  if (!barManagerInstance) {
    barManagerInstance = new FullTextTTSBarManager();
  }
  return barManagerInstance;
}

/**
 * 销毁底栏管理器
 */
export function destroyFullTextTTSBarManager(): void {
  if (barManagerInstance) {
    barManagerInstance.destroy();
    barManagerInstance = null;
  }
}
