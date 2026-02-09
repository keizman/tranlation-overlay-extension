import { UserSettings, TriggerMode } from '@/src/modules/shared/types';
import { ProcessingService } from './ProcessingService';
import { ConfigurationService } from './ConfigurationService';
import { StyleManager } from '@/src/modules/styles';
import { TextReplacerService } from '@/src/modules/core/translation/TextReplacerService';
import { ParagraphTranslationService } from '@/src/modules/core/translation/ParagraphTranslationService';
import { FloatingBallManager } from '@/src/modules/floatingBall';
import { IListenerService } from '../types';
import { isProcessingResultNode, isDescendant } from '../utils/domUtils';
import { TranslationStateManager } from '../ContentManager';
import { createModuleLogger } from '../../shared/utils/Report';
import { DEFAULT_FLOATING_BALL_CONFIG } from '../../shared/constants/defaults';
import { UserFeedbackService } from './UserFeedbackService';

const logger = createModuleLogger('ListenerService');

/**
 * 监听器服务 - 负责消息监听和DOM观察
 */
export class ListenerService implements IListenerService {
  private settings: UserSettings;
  private processingService: ProcessingService;
  private configurationService: ConfigurationService;
  private styleManager: StyleManager;
  private textReplacer: TextReplacerService;
  private paragraphService: ParagraphTranslationService;
  private floatingBallManager: FloatingBallManager;
  private translationStateManager: TranslationStateManager;
  private userFeedback: UserFeedbackService;
  private onSettingsUpdated?: (settings: UserSettings) => void;
  private domObserver?: MutationObserver;
  private debounceTimer?: number;

  constructor(
    settings: UserSettings,
    processingService: ProcessingService,
    configurationService: ConfigurationService,
    styleManager: StyleManager,
    textReplacer: TextReplacerService,
    floatingBallManager: FloatingBallManager,
    translationStateManager: TranslationStateManager,
    onSettingsUpdated?: (settings: UserSettings) => void,
  ) {
    this.settings = settings;
    this.processingService = processingService;
    this.configurationService = configurationService;
    this.styleManager = styleManager;
    this.textReplacer = textReplacer;
    this.paragraphService = ParagraphTranslationService.getInstance();
    this.floatingBallManager = floatingBallManager;
    this.translationStateManager = translationStateManager;
    this.userFeedback = UserFeedbackService.getInstance();
    this.onSettingsUpdated = onSettingsUpdated;
  }

  /**
   * 设置消息监听器
   */
  setupMessageListeners(): void {
    browser.runtime.onMessage.addListener((message) =>
      this.handleMessage(message),
    );
  }

  /**
   * 设置DOM观察器（仅在自动模式下）
   */
  setupDomObserver(): void {
    if (this.settings.triggerMode === TriggerMode.AUTOMATIC) {
      this.createDomObserver();
    }
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    if (this.domObserver) {
      this.domObserver.disconnect();
      this.domObserver = undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  /**
   * 处理消息
   */
  private async handleMessage(message: any): Promise<any> {
    if (
      message.type === 'settings_updated' ||
      message.type === 'api_config_updated'
    ) {
      await this.handleSettingsUpdate(message.settings);
      return { success: true };
    } else if (message.type === 'translate-page-command') {
      return this.executeUserAction('translate-page-command', () =>
        this.toggleTranslationState(),
      );
    } else if (message.type === 'MANUAL_TRANSLATE') {
      if (this.settings.triggerMode === TriggerMode.MANUAL) {
        const isConfigValid = await this.validateConfigForUserAction();
        if (!isConfigValid) {
          logger.warn(
            'Manual translate config check failed, continuing for guest/manual mode',
          );
        }
        return this.executeUserAction('manual-translate', async () => {
          await this.processingService.processPage();
        });
      }
      return { success: true };
    } else if (message.type === 'PARAGRAPH_TRANSLATE') {
      const isConfigValid = await this.validateConfigForUserAction();
      if (!isConfigValid) {
        logger.warn(
          'Paragraph translate config check failed, continuing for guest/manual mode',
        );
      }
      return this.executeUserAction('paragraph-translate', async () => {
        await this.paragraphService.start();
      });
    }

    return undefined;
  }

  /**
   * 切换翻译状态
   */
  private async toggleTranslationState(): Promise<void> {
    const isConfigValid = await this.validateConfigForUserAction();
    if (!isConfigValid) {
      logger.warn(
        'Toggle translation config check failed, continuing for guest/manual mode',
      );
    }

    await this.translationStateManager.toggleTranslationState();
  }

  private async executeUserAction(
    action: string,
    handler: () => Promise<void>,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await handler();
      return { success: true };
    } catch (error) {
      const userMessage = this.userFeedback.showActionError(action, error);
      logger.error('User action execution failed', {
        action,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: userMessage,
      };
    }
  }

  private async validateConfigForUserAction(): Promise<boolean> {
    try {
      return !!(await browser.runtime.sendMessage({
        type: 'validate-configuration',
        source: 'user_action',
      }));
    } catch (error) {
      logger.warn('validate-configuration request failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * 处理设置更新
   */
  private async handleSettingsUpdate(newSettings: UserSettings): Promise<void> {
    const needsPageReload =
      this.settings.triggerMode !== newSettings.triggerMode ||
      this.settings.isEnabled !== newSettings.isEnabled ||
      this.settings.enablePronunciationTooltip !==
        newSettings.enablePronunciationTooltip ||
      this.settings.userLevel !== newSettings.userLevel ||
      this.settings.useGptApi !== newSettings.useGptApi ||
      this.settings.multilingualConfig.targetLanguage !==
        newSettings.multilingualConfig.targetLanguage ||
      this.settings.multilingualConfig.nativeLanguage !==
        newSettings.multilingualConfig.nativeLanguage;

    if (needsPageReload) {
      window.location.reload();
      return;
    }

    Object.assign(this.settings, newSettings);
    this.settings.floatingBall = {
      ...DEFAULT_FLOATING_BALL_CONFIG,
      ...(this.settings.floatingBall || {}),
    };
    this.configurationService.updateConfiguration(
      this.settings,
      this.styleManager,
      this.textReplacer,
    );
    this.processingService.updateSettings(this.settings);
    this.floatingBallManager.updateConfig(this.settings.floatingBall);
    this.onSettingsUpdated?.(this.settings);
  }

  /**
   * 创建DOM观察器
   */
  private createDomObserver(): void {
    const nodesToProcess = new Set<Node>();

    this.domObserver = new MutationObserver((mutations) => {
      let hasValidChanges = false;

      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (isProcessingResultNode(node)) return;

            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              const textContent = element.textContent?.trim();
              if (textContent && textContent.length > 15) {
                nodesToProcess.add(node);
                hasValidChanges = true;
              }
            }
          });
        } else if (
          mutation.type === 'characterData' &&
          mutation.target.parentElement
        ) {
          if (!isProcessingResultNode(mutation.target.parentElement)) {
            nodesToProcess.add(mutation.target.parentElement);
            hasValidChanges = true;
          }
        }
      });

      if (hasValidChanges) {
        this.debouncedProcessNodes(nodesToProcess);
      }
    });

    this.domObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /**
   * 防抖处理节点
   */
  private debouncedProcessNodes(nodesToProcess: Set<Node>): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(async () => {
      if (nodesToProcess.size === 0) return;

      const topLevelNodes = new Set<Node>();
      nodesToProcess.forEach((node) => {
        if (
          document.body.contains(node) &&
          !isDescendant(node, nodesToProcess)
        ) {
          topLevelNodes.add(node);
        }
      });

      if (this.domObserver) {
        this.domObserver.disconnect();
      }

      try {
        for (const node of topLevelNodes) {
          await this.processingService.processNode(node);
        }
      } catch (error) {
        console.error('[ListenerService] DOM节点处理失败:', error);
      }

      nodesToProcess.clear();

      if (this.domObserver) {
        this.domObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }, 150);
  }
}
