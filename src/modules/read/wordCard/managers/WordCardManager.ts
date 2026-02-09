/**
 * 词典卡片管理器
 * 负责卡片的生命周期管理、事件处理、API 调用
 */

import type { WordCardSettings, CardPosition, WordCardState } from '../types';
import { DEFAULT_WORD_CARD_SETTINGS } from '../types';
import { queryWord } from '../utils/api';
import { getSelectionInfo, shouldShowWordCard } from '../utils/detection';
import { calculateCardPosition, clampPosition } from '../utils/positioning';
import {
  createCardHTML,
  createLoadingHTML,
  createErrorHTML,
  createIconHTML,
} from '../components/WordCard';
import { createModuleLogger } from '../../../shared/utils/Report';
import { httpClient } from '../../../auth/RequestInterceptor';
import {
  audioPlaybackService,
  speakingService,
} from '../../../architecture/bootstrap/defaultAdapters';
import type { AudioPlaybackSession } from '../../../architecture/core/ports';

const logger = createModuleLogger('WordCard');
const GOOGLE_TTS_ENDPOINT = '/translate_tts';

// 注入样式
import '../styles/wordCard.css';

// ============================================================================
// WordCardManager
// ============================================================================

export class WordCardManager {
  private static instance: WordCardManager | null = null;
  private static readonly TRIGGER_DEDUP_WINDOW_MS = 900;
  private static readonly TOUCHEND_SUPPRESS_WINDOW_MS = 1200;

  private settings: WordCardSettings = DEFAULT_WORD_CARD_SETTINGS;
  private state: WordCardState = {
    visible: false,
    loading: false,
    word: '',
    position: { x: 0, y: 0 },
    pinned: false,
    starred: false,
    data: null,
    error: null,
  };

  private cardElement: HTMLElement | null = null;
  private iconElement: HTMLElement | null = null;
  private eventListeners: Array<{
    element: EventTarget;
    type: string;
    handler: EventListener;
  }> = [];

  // 拖拽状态
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private cardStartX = 0;
  private cardStartY = 0;
  private lastTriggerWord = '';
  private lastTriggerAt = 0;
  private lastTriggerSource = '';
  private lastSelectionChangeShowAt = 0;
  private currentAudioSession: AudioPlaybackSession | null = null;

  // ============================================================================
  // 单例
  // ============================================================================

  private constructor() {}

  public static getInstance(): WordCardManager {
    if (!WordCardManager.instance) {
      WordCardManager.instance = new WordCardManager();
    }
    return WordCardManager.instance;
  }

  // ============================================================================
  // 初始化
  // ============================================================================

  public init(settings: WordCardSettings): void {
    this.settings = { ...DEFAULT_WORD_CARD_SETTINGS, ...settings };
    logger.log('Initialized with settings:', this.settings);

    if (this.settings.enabled) {
      this.setupEventListeners();
    } else {
      logger.log('WordCard is disabled in init');
    }
  }

  public updateSettings(settings: Partial<WordCardSettings>): void {
    const wasEnabled = this.settings.enabled;
    this.settings = { ...this.settings, ...settings };

    if (!wasEnabled && this.settings.enabled) {
      this.setupEventListeners();
    } else if (wasEnabled && !this.settings.enabled) {
      this.removeEventListeners();
      this.hideCard();
      this.hideIcon();
    }
  }

  // ============================================================================
  // 事件监听
  // ============================================================================

  private setupEventListeners(): void {
    logger.log('Setting up event listeners', {
      selectCaptureMode: this.settings.selectCaptureMode,
      dbClickCaptureMode: this.settings.dbClickCaptureMode,
    });

    // 选中文本事件 - 同时支持鼠标和触摸
    if (this.settings.selectCaptureMode) {
      this.addListener(
        document,
        'mouseup',
        this.handleMouseUp.bind(this) as EventListener,
      );
      // 移动端触摸支持
      this.addListener(
        document,
        'touchend',
        this.handleTouchEnd.bind(this) as EventListener,
      );
      // 选择变化事件 (备用方案)
      this.addListener(
        document,
        'selectionchange',
        this.handleSelectionChange.bind(this) as EventListener,
      );
    }

    // 双击事件
    if (this.settings.dbClickCaptureMode) {
      this.addListener(
        document,
        'dblclick',
        this.handleDblClick.bind(this) as EventListener,
      );
    }

    // 单击事件
    if (this.settings.singleClickCaptureMode) {
      this.addListener(
        document,
        'click',
        this.handleClick.bind(this) as EventListener,
      );
    }

    // 点击外部关闭
    this.addListener(
      document,
      'mousedown',
      this.handleDocumentMouseDown.bind(this) as EventListener,
    );
    this.addListener(
      document,
      'touchstart',
      this.handleDocumentMouseDown.bind(this) as EventListener,
    );

    // ESC 关闭
    this.addListener(
      document,
      'keydown',
      this.handleKeyDown.bind(this) as EventListener,
    );

    logger.log('Event listeners set up successfully');
  }

  private addListener(
    element: EventTarget,
    type: string,
    handler: EventListener,
  ): void {
    element.addEventListener(type, handler);
    this.eventListeners.push({ element, type, handler });
  }

  private removeEventListeners(): void {
    for (const { element, type, handler } of this.eventListeners) {
      element.removeEventListener(type, handler);
    }
    this.eventListeners = [];
  }

  // ============================================================================
  // 事件处理
  // ============================================================================

  private handleMouseUp(e: MouseEvent): void {
    // 忽略卡片内的点击
    if (this.cardElement?.contains(e.target as Node)) {
      return;
    }

    // 忽略图标点击
    if (this.iconElement?.contains(e.target as Node)) {
      return;
    }

    // 延迟检查选中文本
    setTimeout(() => {
      const info = getSelectionInfo();
      logger.log('MouseUp selection check:', info);

      if (!info || !info.isWord || !info.rect) {
        logger.log('Selection invalid or not a word', { info });
        return;
      }

      const shouldShow = shouldShowWordCard(info.text, this.settings, 'select');
      logger.log(`Should show card for "${info.text}"? ${shouldShow}`, {
        mode: 'select',
        settings: this.settings,
      });

      if (shouldShow) {
        if (this.settings.showExplainIcon) {
          // 显示查词图标
          this.showIcon(info.text, {
            x: info.rect.right + 5,
            y: info.rect.top + info.rect.height / 2 - 14,
          });
        } else {
          // 直接显示卡片
          const position = calculateCardPosition(info.rect);
          this.showCard(info.text, position);
        }
      }
    }, 10);
  }

  /**
   * 处理触摸结束事件 (移动端)
   */
  private handleTouchEnd(e: TouchEvent): void {
    // 忽略卡片内的触摸
    if (this.cardElement?.contains(e.target as Node)) {
      return;
    }

    // 忽略图标触摸
    if (this.iconElement?.contains(e.target as Node)) {
      return;
    }

    // 延迟检查选中文本 (移动端需要更长延迟)
    setTimeout(() => {
      this.checkAndShowCard('touchend');
    }, 300);
  }

  /**
   * 处理选择变化事件 (备用方案)
   */
  private selectionChangeTimer: ReturnType<typeof setTimeout> | null = null;

  private handleSelectionChange(): void {
    // 使用防抖，避免频繁触发
    if (this.selectionChangeTimer) {
      clearTimeout(this.selectionChangeTimer);
    }

    this.selectionChangeTimer = setTimeout(() => {
      this.selectionChangeTimer = null;
      this.checkAndShowCard('selectionchange');
    }, 500);
  }

  /**
   * 通用的选中检查和显示卡片逻辑
   */
  private checkAndShowCard(source: string): void {
    const info = getSelectionInfo();
    logger.log(`${source} selection check:`, info);

    if (!info || !info.isWord || !info.rect) {
      logger.log(`${source}: Selection invalid or not a word`, { info });
      return;
    }

    const shouldShow = shouldShowWordCard(info.text, this.settings, 'select');
    logger.log(`${source}: Should show card for "${info.text}"? ${shouldShow}`);

    if (shouldShow) {
      const normalizedWord = info.text.toLowerCase();
      const now = Date.now();
      const isSameWordInWindow =
        normalizedWord === this.lastTriggerWord &&
        now - this.lastTriggerAt <= WordCardManager.TRIGGER_DEDUP_WINDOW_MS;

      if (source === 'touchend') {
        const isSuppressedBySelectionChange =
          now - this.lastSelectionChangeShowAt <=
          WordCardManager.TOUCHEND_SUPPRESS_WINDOW_MS;
        if (isSuppressedBySelectionChange) {
          logger.log('touchend skipped due to recent selectionchange trigger', {
            word: info.text,
            suppressWindowMs: WordCardManager.TOUCHEND_SUPPRESS_WINDOW_MS,
            sinceSelectionChangeMs: now - this.lastSelectionChangeShowAt,
          });
          return;
        }
      }

      if (isSameWordInWindow) {
        logger.log('duplicate trigger skipped', {
          word: info.text,
          currentSource: source,
          lastSource: this.lastTriggerSource,
          dedupWindowMs: WordCardManager.TRIGGER_DEDUP_WINDOW_MS,
          elapsedMs: now - this.lastTriggerAt,
        });
        return;
      }

      this.lastTriggerWord = normalizedWord;
      this.lastTriggerAt = now;
      this.lastTriggerSource = source;
      if (source === 'selectionchange') {
        this.lastSelectionChangeShowAt = now;
      }

      if (this.settings.showExplainIcon) {
        this.showIcon(info.text, {
          x: info.rect.right + 5,
          y: info.rect.top + info.rect.height / 2 - 14,
        });
      } else {
        const position = calculateCardPosition(info.rect);
        this.showCard(info.text, position);
      }
    }
  }

  private handleDblClick(e: MouseEvent): void {
    const info = getSelectionInfo();
    logger.log('DblClick selection check:', info);

    if (!info || !info.isWord || !info.rect) {
      return;
    }

    const shouldShow = shouldShowWordCard(info.text, this.settings, 'dblclick');
    logger.log(`Should show card (dblclick) for "${info.text}"? ${shouldShow}`);

    if (shouldShow) {
      const position = calculateCardPosition(info.rect);
      this.showCard(info.text, position);
    }
  }

  private handleClick(e: MouseEvent): void {
    // 单击取词需要特殊处理：获取点击位置的单词
    // TODO: 实现单击取词逻辑
  }

  private handleDocumentMouseDown(e: MouseEvent): void {
    // 如果卡片被 pin 住，不关闭
    if (this.state.pinned) {
      return;
    }

    // 点击卡片外部关闭
    if (
      this.cardElement &&
      this.state.visible &&
      !this.cardElement.contains(e.target as Node)
    ) {
      // 不要立即关闭，检查是否点击了图标
      if (this.iconElement?.contains(e.target as Node)) {
        return;
      }
      this.hideCard();
    }

    // 点击其他地方隐藏图标
    if (this.iconElement && !this.iconElement.contains(e.target as Node)) {
      this.hideIcon();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.state.visible) {
      this.hideCard();
      this.hideIcon();
    }
  }

  // ============================================================================
  // 图标操作
  // ============================================================================

  private showIcon(word: string, position: CardPosition): void {
    this.hideIcon();

    this.iconElement = document.createElement('div');
    this.iconElement.className = 'wxt-word-card-icon';
    this.iconElement.innerHTML = createIconHTML();
    this.iconElement.style.left = `${position.x}px`;
    this.iconElement.style.top = `${position.y}px`;

    this.iconElement.addEventListener('click', (e) => {
      e.stopPropagation();
      const info = getSelectionInfo();
      const rect =
        info?.rect ||
        ({
          left: position.x,
          right: position.x + 28,
          top: position.y,
          bottom: position.y + 28,
          width: 28,
          height: 28,
        } as DOMRect);

      this.hideIcon();
      this.showCard(word, calculateCardPosition(rect));
    });

    document.body.appendChild(this.iconElement);
  }

  private hideIcon(): void {
    if (this.iconElement) {
      this.iconElement.remove();
      this.iconElement = null;
    }
  }

  // ============================================================================
  // 卡片操作
  // ============================================================================

  public async showCard(word: string, position: CardPosition): Promise<void> {
    logger.log(`Showing card for: ${word}`, { position });
    logger.log('WordCard query request', {
      word,
      apiEndpoint: this.settings.apiEndpoint,
    });

    this.state = {
      ...this.state,
      visible: true,
      loading: true,
      word,
      position,
      data: null,
      error: null,
    };

    this.renderCard();

    try {
      const data = await queryWord(word, this.settings.apiEndpoint);
      this.state = {
        ...this.state,
        loading: false,
        data,
      };
      this.renderCard();

      // 自动发音
      if (this.settings.autoSpeak && data.word) {
        this.speakWord(data.word, 'us');
      }
    } catch (err: any) {
      logger.error('Query failed', {
        word,
        apiEndpoint: this.settings.apiEndpoint,
        error:
          err instanceof Error
            ? {
                name: err.name,
                message: err.message,
                stack: err.stack,
              }
            : String(err),
      });
      this.state = {
        ...this.state,
        loading: false,
        error: err.message || 'Failed to load',
      };
      this.renderCard();
    }
  }

  public hideCard(): void {
    if (this.cardElement) {
      this.cardElement.remove();
      this.cardElement = null;
    }
    this.state = {
      ...this.state,
      visible: false,
      pinned: false,
    };
  }

  // ============================================================================
  // 渲染
  // ============================================================================

  private renderCard(): void {
    if (!this.cardElement) {
      this.cardElement = document.createElement('div');
      this.cardElement.className = 'wxt-word-card';
      document.body.appendChild(this.cardElement);
      this.setupCardEvents();
    }

    // 更新位置
    this.cardElement.style.left = `${this.state.position.x}px`;
    this.cardElement.style.top = `${this.state.position.y}px`;

    // 更新内容
    if (this.state.loading) {
      this.cardElement.innerHTML = createLoadingHTML();
    } else if (this.state.error) {
      this.cardElement.innerHTML = createErrorHTML(this.state.error);
    } else if (this.state.data) {
      this.cardElement.innerHTML = createCardHTML(this.state.data, {
        starred: this.state.starred,
        pinned: this.state.pinned,
      });
    }
  }

  private setupCardEvents(): void {
    if (!this.cardElement) return;

    // 委托事件处理
    this.cardElement.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;
      if (!button) return;

      const action = button.dataset.action;
      switch (action) {
        case 'close':
          this.hideCard();
          break;
        case 'pin':
          this.togglePin();
          break;
        case 'star':
          this.toggleStar();
          break;
        case 'speak':
          const accent = button.dataset.accent as 'us' | 'uk';
          if (this.state.data?.word) {
            this.speakWord(this.state.data.word, accent);
          }
          break;
        case 'lookup':
          const word = button.dataset.word;
          if (word) {
            this.showCard(word, this.state.position);
          }
          break;
        case 'menu':
          // TODO: 显示菜单
          break;
        case 'toggle-dict':
          button.classList.toggle('collapsed');
          break;
      }
    });

    // 拖拽
    const header = this.cardElement.querySelector('.wxt-word-card-header');
    if (header) {
      header.addEventListener(
        'mousedown',
        this.handleDragStart.bind(this) as EventListener,
      );
    }
  }

  // ============================================================================
  // 拖拽
  // ============================================================================

  private handleDragStart(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    // 不拖拽按钮
    if (target.closest('button')) {
      return;
    }

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.cardStartX = this.state.position.x;
    this.cardStartY = this.state.position.y;

    document.addEventListener('mousemove', this.handleDragMove);
    document.addEventListener('mouseup', this.handleDragEnd);
  }

  private handleDragMove = (e: MouseEvent): void => {
    if (!this.isDragging || !this.cardElement) return;

    const deltaX = e.clientX - this.dragStartX;
    const deltaY = e.clientY - this.dragStartY;

    const newPosition = clampPosition(
      this.cardStartX + deltaX,
      this.cardStartY + deltaY,
    );

    this.state.position = newPosition;
    this.cardElement.style.left = `${newPosition.x}px`;
    this.cardElement.style.top = `${newPosition.y}px`;
  };

  private handleDragEnd = (): void => {
    this.isDragging = false;
    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
  };

  // ============================================================================
  // 操作
  // ============================================================================

  private togglePin(): void {
    this.state.pinned = !this.state.pinned;
    this.renderCard();
  }

  private toggleStar(): void {
    this.state.starred = !this.state.starred;
    this.renderCard();
    // TODO: 保存到生词本
  }

  private async speakWord(word: string, accent: 'us' | 'uk'): Promise<void> {
    audioPlaybackService.stop(this.currentAudioSession);
    this.currentAudioSession = null;

    // 检查 API 返回的音频 URL
    const audioUrl = this.state.data?.audio?.[accent];

    if (audioUrl && audioUrl.trim() !== '') {
      // 使用 API 返回的音频 URL
      try {
        const session = await audioPlaybackService.playUrl(audioUrl);
        this.currentAudioSession = session;
        return;
      } catch (err) {
        console.warn(
          '[WordCard] API audio failed, falling back to Google TTS:',
          err,
        );
      }
    }

    const langCode = accent === 'us' ? 'en-US' : 'en-GB';
    const params = new URLSearchParams({
      ie: 'UTF-8',
      client: 'gtx',
      tl: langCode,
      q: word,
    });
    const ttsUrl = `${GOOGLE_TTS_ENDPOINT}?${params.toString()}`;

    try {
      const response = await httpClient.get(ttsUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      if (blob.size > 0) {
        const session = await audioPlaybackService.playBlob(blob);
        this.currentAudioSession = session;
      } else {
        console.warn(
          '[WordCard] Google TTS failed, falling back to Web Speech API',
        );
        this.speakWordFallback(word, accent);
      }
    } catch (err) {
      console.warn(
        '[WordCard] TTS request failed, falling back to Web Speech API:',
        err,
      );
      this.speakWordFallback(word, accent);
    }
  }

  private speakWordFallback(word: string, accent: 'us' | 'uk'): void {
    // 最终回退: 使用 Web Speech API
    void speakingService.speak({
      text: word,
      lang: accent === 'us' ? 'en-US' : 'en-GB',
      rate: 0.9,
    });
  }

  // ============================================================================
  // 销毁
  // ============================================================================

  public destroy(): void {
    audioPlaybackService.stop(this.currentAudioSession);
    this.currentAudioSession = null;
    this.removeEventListeners();
    this.hideCard();
    this.hideIcon();
    WordCardManager.instance = null;
  }
}
