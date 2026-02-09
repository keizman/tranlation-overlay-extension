import { browser } from 'wxt/browser';
import { UserSettings, TriggerMode } from '@/src/modules/shared/types';
import { initializeLocale } from '@/src/i18n';
import { TranslationMode } from '@/src/modules/shared/types/core';
import { StyleManager } from '@/src/modules/styles';
import { TextProcessorService } from '@/src/modules/core/translation/TextProcessorService';
import { TextReplacerService } from '@/src/modules/core/translation/TextReplacerService';
import { ParagraphTranslationService } from '@/src/modules/core/translation/ParagraphTranslationService';

import { FloatingBallManager } from '@/src/modules/floatingBall';
import { WebsiteManager } from '@/src/modules/options/website-management/manager';

import { ConfigurationService } from './services/ConfigurationService';
import { ProcessingService } from './services/ProcessingService';
import { ListenerService } from './services/ListenerService';
import { detectPageLanguage } from './utils/domUtils';
import { IContentManager, ServiceContainer } from './types';
import { LazyLoadingService } from './services/LazyLoadingService';
import { ContentSegment } from '../processing/ProcessingStateManager';
import { languageService } from '../core/translation/LanguageService';
import { ParagraphTTSService } from './services/ParagraphTTSService';
import { SwipeTranslationService } from './services/SwipeTranslationService';
import {
  getSPANavigationDetector,
  destroySPANavigationDetector,
} from './services/SPANavigationDetector';
import {
  getFullTextTTSBarManager,
  destroyFullTextTTSBarManager,
} from '../listen/floatingBar';
import { WordCardManager } from '../read/wordCard';
import { createModuleLogger } from '../shared/utils/Report';
import { DEFAULT_FLOATING_BALL_CONFIG } from '../shared/constants/defaults';

const logger = createModuleLogger('ContentManager');

/**
 * 翻译显示状态管理器
 *
 * 功能：
 * - 通过全局CSS类控制页面翻译内容的显示/隐藏
 * - 支持快捷键和悬浮球的状态切换
 * - 自动同步悬浮球的视觉状态
 *
 * 设计理念：
 * - 使用CSS类控制，避免逐个元素操作，提高性能
 * - 新添加的翻译内容自动继承当前显示状态
 * - 状态变化时实时更新悬浮球视觉反馈
 */
export class TranslationStateManager {
  /** 翻译内容是否可见 */
  private isTranslationVisible = true;

  /** 页面处理服务引用 */
  private processingService?: ProcessingService;

  /** 段落翻译服务引用 */
  private paragraphTranslationService?: ParagraphTranslationService;

  /** 悬浮球管理器引用 */
  private floatingBallManager?: any;

  /** 控制翻译内容隐藏的CSS类名 */
  private readonly HIDDEN_CLASS = 'wxt-translation-hidden';

  /** 翻译内容选择器 */
  private readonly TRANSLATION_SELECTOR = '.wxt-translation-term';

  constructor(
    processingService?: ProcessingService,
    floatingBallManager?: any,
    paragraphTranslationService?: ParagraphTranslationService,
  ) {
    this.processingService = processingService;
    this.floatingBallManager = floatingBallManager;
    this.paragraphTranslationService = paragraphTranslationService;
  }

  /**
   * 切换翻译显示状态
   *
   * 逻辑：
   * 1. 如果页面无翻译内容，先执行翻译
   * 2. 如果有翻译内容，直接切换显示状态
   * 3. 更新悬浮球视觉状态
   */
  async toggleTranslationState(): Promise<void> {
    const hasTranslatedContent = this.hasTranslatedContent();

    if (!hasTranslatedContent) {
      // 页面无翻译内容，执行翻译
      await this.executeTranslation();
    } else {
      // 页面有翻译内容，切换显示状态
      this.toggleVisibilityState();
    }

    // 同步悬浮球状态
    this.syncFloatingBallState();
  }

  /**
   * 执行页面翻译
   * @private
   */
  private async executeTranslation(): Promise<void> {
    // 获取用户设置来确定翻译模式
    const storageService = (
      await import('../core/storage/StorageService')
    ).StorageService.getInstance();
    const settings = await storageService.getUserSettings();

    if (settings.translationMode === TranslationMode.PARAGRAPH) {
      // 段落翻译模式：使用段落翻译服务
      if (this.paragraphTranslationService) {
        await this.paragraphTranslationService.start();
      }
    } else {
      // 单词翻译模式：使用原有的处理服务
      if (this.processingService) {
        await this.processingService.processPage();
      }
    }

    this.isTranslationVisible = true;
    document.body.classList.remove(this.HIDDEN_CLASS);
  }

  /**
   * 切换可见性状态
   * @private
   */
  private toggleVisibilityState(): void {
    this.isTranslationVisible = !this.isTranslationVisible;

    if (this.isTranslationVisible) {
      document.body.classList.remove(this.HIDDEN_CLASS);
    } else {
      document.body.classList.add(this.HIDDEN_CLASS);
    }
  }

  /**
   * 同步悬浮球状态
   * @private
   */
  private syncFloatingBallState(): void {
    if (this.floatingBallManager?.updateTranslationStateIndicator) {
      this.floatingBallManager.updateTranslationStateIndicator();
    }
  }

  /**
   * 检查页面是否有翻译内容
   * @private
   */
  private hasTranslatedContent(): boolean {
    // 检查单词翻译内容
    const hasWordTranslation =
      document.querySelector(this.TRANSLATION_SELECTOR) !== null;

    // 检查段落翻译内容
    const hasParagraphTranslation =
      document.querySelector('.illa-paragraph-translation') !== null;

    return hasWordTranslation || hasParagraphTranslation;
  }

  /**
   * 获取当前显示状态
   */
  getTranslationVisibility(): boolean {
    return this.isTranslationVisible;
  }

  /**
   * 清除所有翻译内容（包括段落翻译）
   */
  public clearAllTranslations(): void {
    try {
      // 清除段落翻译
      if (this.paragraphTranslationService) {
        this.paragraphTranslationService.clearAllTranslations();
      }
    } catch (error) {
      console.error('[ContentManager] 清除翻译失败:', error);
    }
  }

  /**
   * 重置状态 (用于SPA导航后)
   * 清除所有翻译内容和状态，准备处理新页面
   */
  public reset(): void {
    console.log('[TranslationStateManager] 重置翻译状态 (SPA导航)');

    // 清除单词翻译内容
    const wordTranslations = document.querySelectorAll(
      this.TRANSLATION_SELECTOR,
    );
    wordTranslations.forEach((el) => el.remove());

    // 清除段落翻译内容
    const paragraphTranslations = document.querySelectorAll(
      '.illa-paragraph-translation',
    );
    paragraphTranslations.forEach((el) => el.remove());

    // 通过段落翻译服务清除
    this.clearAllTranslations();

    // 重置状态
    this.isTranslationVisible = true;
    document.body.classList.remove(this.HIDDEN_CLASS);

    // 同步悬浮球状态
    this.syncFloatingBallState();
  }

  /**
   * 更新处理服务引用
   */
  updateProcessingService(processingService: ProcessingService): void {
    this.processingService = processingService;
  }

  /**
   * 更新悬浮球管理器引用
   */
  updateFloatingBallManager(floatingBallManager: any): void {
    this.floatingBallManager = floatingBallManager;
  }
}

/**
 * Content Script 主管理服务
 * 负责协调所有子服务，管理生命周期
 */
export class ContentManager implements IContentManager {
  private configurationService: ConfigurationService;
  private processingService?: ProcessingService;
  private listenerService?: ListenerService;
  private services?: ServiceContainer;
  private settings?: UserSettings;
  private paragraphTTSService?: ParagraphTTSService;
  private swipeTranslationService?: SwipeTranslationService;
  private translationStateManager?: TranslationStateManager;
  // 新增：存储检测到的页面语言
  private detectedPageLanguage?: string;
  // 新增：最终确定的翻译目标语言
  private finalTargetLanguage?: string;
  private paragraphService = ParagraphTranslationService.getInstance();
  private wordCardManager?: WordCardManager;
  constructor() {
    this.configurationService = new ConfigurationService();
  }

  /**
   * 初始化Content Script
   */
  async init(): Promise<void> {
    try {
      logger.log('ContentManager init started', {
        url: window.location.href,
      });

      // 检查网站规则
      const websiteStatus = await this.checkWebsiteStatus();
      if (websiteStatus === 'blacklisted') {
        logger.warn('Website is blacklisted, skipping initialization');
        return;
      }

      // 初始化语言设置
      initializeLocale();

      // 验证配置
      await this.validateConfiguration();

      // 获取用户设置
      this.settings = await this.configurationService.getUserSettings();
      this.settings.floatingBall = {
        ...DEFAULT_FLOATING_BALL_CONFIG,
        ...(this.settings.floatingBall || {}),
      };
      logger.log('Settings loaded', {
        isEnabled: this.settings.isEnabled,
        triggerMode: this.settings.triggerMode,
        floatingBallEnabled: this.settings.floatingBall.enabled,
      });
      if (!this.settings.isEnabled) {
        logger.warn('Extension disabled by settings, skipping initialization');
        return;
      }

      // 处理语言检测
      await this.handleLanguageDetection();

      // 初始化所有服务
      await this.initializeServices();

      // 应用初始配置
      this.applyInitialConfiguration();

      // 初始化悬浮球
      await this.initializeFloatingBall();

      // 设置监听器
      this.setupListeners();

      // 根据触发模式执行初始处理
      await this.handleInitialProcessing(websiteStatus);
      logger.log('ContentManager init completed');
    } catch (error) {
      logger.error('ContentManager initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    try {
      this.listenerService?.destroy();
      this.services?.lazyLoadingService?.destroy();
      this.paragraphTTSService?.destroy();
      this.swipeTranslationService?.destroy();
      this.wordCardManager?.destroy();
      destroySPANavigationDetector();
      destroyFullTextTTSBarManager();
      console.log('[ContentManager] 服务已销毁');
    } catch (error) {
      console.error('[ContentManager] 销毁服务时出错:', error);
    }
  }

  /**
   * 更新设置
   */
  updateSettings(newSettings: UserSettings): void {
    this.settings = newSettings;

    // 更新ProcessingService设置
    this.processingService?.updateSettings(newSettings);

    // 更新配置服务
    if (this.services) {
      this.configurationService.updateConfiguration(
        newSettings,
        this.services.styleManager,
        this.services.textReplacer,
      );
    }

    this.updateRuntimeFeatureServices(newSettings);
  }

  /**
   * 更新运行时功能服务（无需整页刷新）
   */
  private updateRuntimeFeatureServices(newSettings: UserSettings): void {
    // 更新词典卡片设置
    if (this.wordCardManager && newSettings.wordCard) {
      logger.log('Updating WordCard settings', newSettings.wordCard);
      this.wordCardManager.updateSettings(newSettings.wordCard);
    } else if (newSettings.wordCard) {
      logger.log(
        'WordCard enabled in settings update, initializing',
        newSettings.wordCard,
      );
      this.wordCardManager = WordCardManager.getInstance();
      this.wordCardManager.init(newSettings.wordCard);
    } else {
      logger.log('WordCard settings missing or manager missing', {
        hasManager: !!this.wordCardManager,
        hasSettings: !!newSettings.wordCard,
      });
    }

    // 更新手势翻译设置
    const gestureSettings = {
      leftSwipe: !!newSettings.gestureTranslation?.leftSwipe,
      rightSwipe: !!newSettings.gestureTranslation?.rightSwipe,
    };
    this.swipeTranslationService?.updateSettings(gestureSettings);

    // 更新段落 TTS 开关
    if (this.paragraphTTSService) {
      if (newSettings.paragraphTTS?.enabled ?? true) {
        this.paragraphTTSService.enable();
      } else {
        this.paragraphTTSService.disable();
      }
    }
  }

  /**
   * 检查网站状态
   */
  private async checkWebsiteStatus(): Promise<string> {
    const websiteManager = new WebsiteManager();
    return await websiteManager.getWebsiteStatus(window.location.href);
  }

  /**
   * 验证配置
   */
  private async validateConfiguration(): Promise<void> {
    try {
      const isConfigValid = await browser.runtime.sendMessage({
        type: 'validate-configuration',
        source: 'page_load',
      });
      if (!isConfigValid) {
        logger.warn('Configuration validation failed on page load');
      }
    } catch (error) {
      logger.warn('Configuration validation request failed, continuing init', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 处理语言检测
   * 检测页面语言并确定翻译方向，避免重复计算
   */
  private async handleLanguageDetection(): Promise<void> {
    if (!this.settings) return;

    // 检测页面语言
    this.detectedPageLanguage = await detectPageLanguage();

    // 确定翻译目标语言
    this.finalTargetLanguage = this.determineFinalTargetLanguage();

    console.log(
      `[ContentManager] 页面语言: ${this.detectedPageLanguage}, 翻译目标语言: ${this.finalTargetLanguage}`,
    );
  }

  /**
   * 确定翻译目标语言
   * 根据页面语言和用户配置确定翻译方向
   */
  private determineFinalTargetLanguage(): string {
    if (!this.settings || !this.detectedPageLanguage) {
      return this.settings?.multilingualConfig.targetLanguage || 'en';
    }

    const config = this.settings.multilingualConfig;

    // 标准化语言代码
    const normalizedPageLang = languageService.normalizeLanguageCode(
      this.detectedPageLanguage,
    );
    const normalizedTargetLang = languageService.normalizeLanguageCode(
      config.targetLanguage,
    );
    const normalizedNativeLang = languageService.normalizeLanguageCode(
      config.nativeLanguage,
    );

    // 页面语言 = 目标语言 → 翻译到母语
    if (normalizedPageLang === normalizedTargetLang) {
      return config.nativeLanguage;
    }

    // 页面语言 = 母语 → 翻译到目标语言
    if (normalizedPageLang === normalizedNativeLang) {
      return config.targetLanguage;
    }

    // 其他情况 → 翻译到目标语言
    return config.targetLanguage;
  }

  /**
   * 初始化所有核心服务
   */
  private async initializeServices(): Promise<void> {
    if (!this.settings) {
      throw new Error('Settings not loaded');
    }

    // 创建服务实例
    const styleManager = new StyleManager();

    const activeConfig = this.configurationService.getActiveApiConfig(
      this.settings,
    );
    const textProcessor = TextProcessorService.getInstance({
      enablePronunciationTooltip: this.settings.enablePronunciationTooltip,
      apiConfig: activeConfig?.config,
    });

    // 创建优化的用户设置，使用预先确定的翻译目标语言
    const optimizedSettings = this.createOptimizedSettings();
    const textReplacer = TextReplacerService.getInstance(
      this.configurationService.createReplacementConfig(optimizedSettings),
    );

    // 创建懒加载服务
    const lazyLoadingService = this.initializeLazyLoading(this.settings);

    // 初始化段落翻译服务，传递懒加载服务
    const paragraphTranslationService =
      ParagraphTranslationService.getInstance(lazyLoadingService);

    const floatingBallManager = new FloatingBallManager(
      this.settings.floatingBall,
    );

    // 保存服务容器
    this.services = {
      styleManager,
      textProcessor,
      textReplacer,
      floatingBallManager,
      lazyLoadingService,
      paragraphTranslationService, // 添加段落翻译服务
    };

    // 创建业务服务
    this.processingService = new ProcessingService(
      textProcessor,
      textReplacer,
      optimizedSettings,
      lazyLoadingService,
    );

    // 创建翻译状态管理器
    this.translationStateManager = new TranslationStateManager(
      this.processingService,
      this.services.floatingBallManager,
      this.services.paragraphTranslationService, // 直接传入段落翻译服务
    );

    this.listenerService = new ListenerService(
      optimizedSettings,
      this.processingService,
      this.configurationService,
      styleManager,
      textReplacer,
      floatingBallManager,
      this.translationStateManager,
      (updatedSettings) => this.updateRuntimeFeatureServices(updatedSettings),
    );

    try {
      // 初始化段落TTS服务（双击朗读 + 高亮）
      this.paragraphTTSService = new ParagraphTTSService({
        showDebugPanel: this.settings.showDebugPanel ?? false,
        enabled: this.settings.paragraphTTS?.enabled ?? true,
      });
      this.paragraphTTSService.enable();
    } catch (error) {
      logger.error('ParagraphTTS init failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      // 初始化滑动翻译服务（左滑翻译/恢复切换）
      this.swipeTranslationService = new SwipeTranslationService();
      this.swipeTranslationService.updateSettings({
        leftSwipe: !!this.settings.gestureTranslation?.leftSwipe,
        rightSwipe: !!this.settings.gestureTranslation?.rightSwipe,
      });
      logger.log('Swipe translation service initialized');
    } catch (error) {
      logger.error('Swipe translation service init failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      // 初始化全文TTS底栏
      const ttsBarManager = getFullTextTTSBarManager();
      await ttsBarManager.init(optimizedSettings);
    } catch (error) {
      logger.error('Full text TTS bar init failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      // 初始化词典卡片管理器
      if (this.settings.wordCard) {
        this.wordCardManager = WordCardManager.getInstance();
        this.wordCardManager.init(this.settings.wordCard);
        logger.log('WordCard initialized', this.settings.wordCard);
      } else {
        logger.log('WordCard settings missing in init');
      }
    } catch (error) {
      logger.error('WordCard init failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 创建优化的用户设置
   * 使用预确定的翻译目标语言，提升性能
   */
  private createOptimizedSettings(): UserSettings {
    if (!this.settings || !this.finalTargetLanguage) {
      return this.settings!;
    }

    return {
      ...this.settings,
      multilingualConfig: {
        ...this.settings.multilingualConfig,
        targetLanguage: this.finalTargetLanguage,
      },
    };
  }

  /**
   * 应用初始配置
   */
  private applyInitialConfiguration(): void {
    if (!this.settings || !this.services) return;

    this.configurationService.updateConfiguration(
      this.settings,
      this.services.styleManager,
      this.services.textReplacer,
    );
  }

  /**
   * 初始化悬浮球
   */
  private async initializeFloatingBall(): Promise<void> {
    if (!this.services?.floatingBallManager || !this.translationStateManager)
      return;

    await this.services.floatingBallManager.init(async () => {
      // 悬浮球点击状态切换回调
      try {
        const isConfigValid = await browser.runtime.sendMessage({
          type: 'validate-configuration',
          source: 'user_action',
        });
        if (!isConfigValid) {
          logger.warn(
            'User action config validation failed, continue for guest/manual mode',
          );
        }
      } catch (error) {
        logger.warn('User action config validation request failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      if (this.translationStateManager) {
        try {
          await this.translationStateManager.toggleTranslationState();
        } catch (error) {
          logger.error('Toggle translation state failed from floating ball', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });
    logger.log('Floating ball initialized');
  }

  /**
   * 设置监听器
   */
  private setupListeners(): void {
    this.listenerService?.setupMessageListeners();
    this.listenerService?.setupDomObserver();

    // 启动 SPA 导航检测
    this.setupSPANavigationDetection();
  }

  /**
   * 设置 SPA 导航检测
   * 检测单页应用导航，重置翻译状态以支持新内容翻译
   */
  private setupSPANavigationDetection(): void {
    const detector = getSPANavigationDetector();
    detector.start();

    detector.onNavigate((newUrl, oldUrl) => {
      // URL 变化或大规模 DOM 变化
      if (newUrl === oldUrl) {
        // 内容替换（URL 未变但内容大规模变化）
        console.log('[ContentManager] 检测到内容替换，重置翻译状态');
      } else {
        console.log(`[ContentManager] 检测到 SPA 导航: ${oldUrl} -> ${newUrl}`);
      }

      // 重置翻译状态，准备处理新内容
      this.translationStateManager?.reset();
    });

    console.log('[ContentManager] SPA 导航检测已启动');
  }

  /**
   * 处理初始页面处理
   */
  private async handleInitialProcessing(websiteStatus: string): Promise<void> {
    if (!this.settings || !this.processingService) return;

    // 根据触发模式或白名单执行操作
    if (
      websiteStatus === 'whitelisted' ||
      this.settings.triggerMode === TriggerMode.AUTOMATIC
    ) {
      try {
        // 判断是单词模式还有还是段落翻译
        if (this.settings.translationMode === TranslationMode.PARAGRAPH) {
          // 段落翻译模式
          await this.paragraphService.start();
        } else {
          // 单词翻译模式
          await this.processingService.processPage();
        }
      } catch (error) {
        console.error('[ContentManager] 初始页面处理失败:', error);
      }
    }
  }

  /**
   * 初始化懒加载服务
   */
  private initializeLazyLoading(
    settings: UserSettings,
  ): LazyLoadingService | undefined {
    if (!settings.lazyLoading || !settings.lazyLoading.enabled) {
      return undefined;
    }

    const lazyLoadingService = new LazyLoadingService(settings.lazyLoading);
    lazyLoadingService.initialize();

    // 设置处理回调
    lazyLoadingService.setProcessingCallback(
      async (segments: ContentSegment[]) => {
        if (this.processingService) {
          await this.processingService.processSegmentsLazy(segments);
        }
      },
    );

    return lazyLoadingService;
  }
}
