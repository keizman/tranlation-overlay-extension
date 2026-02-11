/**
 * Background Script - 使用现代化服务架构
 */

import { browser } from 'wxt/browser';
import { StorageService } from '@/src/modules/core/storage';
import { NotificationService } from '@/src/modules/background/services/NotificationService';
import { ApiProxyService } from '@/src/modules/background/services/ApiProxyService';
import { CommandService } from '@/src/modules/background/services/CommandService';
import { InitializationService } from '@/src/modules/background/services/InitializationService';
import { UpdateCheckService } from '@/src/modules/background/services/UpdateCheckService';
import {
  MESSAGE_TYPES,
  BACKGROUND_CONSTANTS,
} from '@/src/modules/background/types';
import { MessageType } from '@/src/modules/core/messaging/types';
import { authManager } from '@/src/modules/auth';
import { AndroidAppNativeControlAdapter } from '@/src/modules/architecture/adapters/app';
import type { UserSettings } from '@/src/modules/shared/types';

export default defineBackground(() => {
  const USER_SETTINGS_STORAGE_KEY = 'user_settings';
  const manifest = browser.runtime.getManifest();
  const extensionVersion = manifest.version;
  const extensionId = browser.runtime.id;

  console.info('[Background] Extension startup', {
    version: extensionVersion,
    extensionId,
    context: 'service_worker_boot',
  });

  // 服务实例
  const storageService = StorageService.getInstance();
  const notificationService = NotificationService.getInstance();
  const apiProxyService = ApiProxyService.getInstance();
  const commandService = CommandService.getInstance();
  const initializationService = InitializationService.getInstance();
  const updateCheckService = UpdateCheckService.getInstance();
  const appNativeControlAdapter = new AndroidAppNativeControlAdapter();

  // 传统管理器已移除 - 统一到InitializationService中管理

  /**
   * 初始化所有服务
   */
  async function initializeServices(): Promise<void> {
    try {
      // 初始化认证服务
      await authManager.init();

      // 初始化命令服务
      commandService.initialize();

      // 初始化更新检查服务
      await updateCheckService.init();

      // 初始化运行时事件监听器 (Chrome MV3 Service Worker 每次唤醒都需要)
      // 这确保 contextMenus.onClicked 等事件在 SW 休眠后重新注册
      await initializationService.initializeRuntime();

      // 尝试在启动时同步一次 app 专属系统菜单开关（失败不影响扩展工作）
      const currentSettings = await storageService.getUserSettings();
      await syncAppSelectionBannerSetting(currentSettings, 'startup');

      console.log('[Background] 所有服务初始化完成');
    } catch (error) {
      console.error('[Background] 服务初始化失败:', error);
    }
  }

  /**
   * 处理扩展安装事件
   */
  browser.runtime.onInstalled.addListener(async (details) => {
    try {
      const result = await initializationService.handleInstallation(details);

      if (result.success) {
        console.log('[Background] 安装处理成功');
        if (result.warnings.length > 0) {
          console.warn('[Background] 安装警告:', result.warnings);
        }
      } else {
        console.error('[Background] 安装处理失败:', result.errors);
      }

      await authManager.checkAndRefreshIfNeeded();
    } catch (error) {
      console.error('[Background] 安装处理异常:', error);
    }
  });

  browser.runtime.onStartup.addListener(async () => {
    console.log('[Background] 浏览器启动');
    await authManager.checkAndRefreshIfNeeded();
  });

  // 兜底同步链路：只要存储里的 user_settings 变化，就同步一次 app 开关状态。
  // 这样即使 options -> background 的 runtime message 在某些环境下失败，也能保持行为一致。
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' && areaName !== 'local') {
      return;
    }

    const settingsChange = changes[USER_SETTINGS_STORAGE_KEY];
    if (!settingsChange || typeof settingsChange.newValue === 'undefined') {
      return;
    }

    const parsedSettings = parseStoredUserSettings(settingsChange.newValue);
    if (!parsedSettings) {
      console.warn(
        '[Background] Failed to parse user_settings from storage change',
      );
      return;
    }

    syncAppSelectionBannerSetting(parsedSettings, 'settings_updated').catch(
      (error) => {
        console.warn(
          '[Background] App selection banner sync failed from storage listener',
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      },
    );
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'tokenCheck') {
      await authManager.handleAlarm();
    }
  });

  chrome.idle.onStateChanged.addListener(async (newState) => {
    if (newState === 'active') {
      console.log('[Background] 用户返回活动状态');
      await authManager.checkAndRefreshIfNeeded();
    }
  });

  /**
   * 处理运行时消息
   */
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(`[Background] 收到消息: ${message.type}`);

    switch (message.type) {
      case MESSAGE_TYPES.SHOW_NOTIFICATION:
        handleShowNotification(message);
        return false;

      case MESSAGE_TYPES.OPEN_POPUP:
        handleOpenPopup();
        return false;

      case MESSAGE_TYPES.OPEN_OPTIONS:
        handleOpenOptions(message);
        return false;

      case MESSAGE_TYPES.VALIDATE_CONFIG:
        handleValidateConfiguration(message, sendResponse);
        return true; // 保持消息通道开放

      case MESSAGE_TYPES.API_REQUEST:
        handleApiRequest(message, sendResponse);
        return true; // 保持消息通道开放

      case MessageType.CONTEXT_MENU_ACTION:
        handleContextMenuAction(message, sendResponse);
        return true; // 保持消息通道开放

      case MESSAGE_TYPES.SETTINGS_UPDATED:
      case MESSAGE_TYPES.API_CONFIG_UPDATED:
        handleSettingsUpdated(message, sendResponse);
        return true; // 保持消息通道开放

      case MESSAGE_TYPES.SET_SELECTION_BANNER_DISABLED:
        handleSetSelectionBannerDisabled(message, sendResponse);
        return true;

      // 处理更新检查相关消息
      case 'CHECK_UPDATE':
      case 'CLEAR_UPDATE_BADGE':
      case 'DISMISS_UPDATE':
      case 'GET_UPDATE_INFO':
        handleUpdateMessage(message, sendResponse);
        return true; // 保持消息通道开放

      case 'GET_TOKEN':
        handleGetToken(sendResponse);
        return true;

      case 'LOGIN_SUCCESS':
        handleLoginSuccess(message, sendResponse);
        return true;

      case 'LOGOUT':
        handleLogout(sendResponse);
        return true;

      case 'GET_AUTH_STATE':
        handleGetAuthState(sendResponse);
        return true;

      default:
        console.warn(`[Background] 未知消息类型: ${message.type}`);
        return false;
    }
  });

  /**
   * 处理显示通知消息
   */
  async function handleShowNotification(message: any): Promise<void> {
    try {
      await notificationService.showNotification({
        type: 'basic',
        title: message.options.title || '通知',
        message: message.options.message || '',
        iconUrl: message.options.iconUrl,
      });
    } catch (error) {
      console.error('[Background] 显示通知失败:', error);
    }
  }

  /**
   * 处理打开popup消息
   */
  async function handleOpenPopup(): Promise<void> {
    try {
      browser.action.openPopup();
    } catch (error) {
      console.error('[Background] 无法打开popup:', error);
      // 回退到打开options页面
      const optionsUrl = browser.runtime.getURL(
        BACKGROUND_CONSTANTS.OPTIONS_PATH,
      );
      browser.tabs.create({ url: optionsUrl });
    }
  }

  /**
   * 处理打开选项页面消息
   */
  async function handleOpenOptions(message?: any): Promise<void> {
    let optionsUrl = browser.runtime.getURL(BACKGROUND_CONSTANTS.OPTIONS_PATH);
    // 支持 hash 参数用于跳转到特定模块
    if (message?.hash) {
      optionsUrl += message.hash;
    }
    browser.tabs.create({ url: optionsUrl });
  }

  /**
   * 处理验证配置消息
   */
  function handleValidateConfiguration(
    message: any,
    sendResponse: (response: boolean) => void,
  ): void {
    (async () => {
      try {
        const settings = await storageService.getUserSettings();

        // 检查多配置系统中的活跃配置
        const activeConfig = settings.apiConfigs?.find(
          (config) => config.id === settings.activeApiConfigId,
        );
        const isConfigValid = !!activeConfig?.config?.apiKey;

        if (isConfigValid) {
          sendResponse(true);
          return;
        }

        // 配置无效时显示通知
        await notificationService.showApiConfigError(message.source);
        sendResponse(false);
      } catch (error) {
        console.error('[Background] 配置验证失败:', error);
        sendResponse(false);
      }
    })();
  }

  /**
   * 处理API请求消息
   */
  function handleApiRequest(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        const response = await apiProxyService.handleApiRequest(message);
        sendResponse(response);
      } catch (error) {
        console.error('[Background] API请求处理失败:', error);
        sendResponse({
          success: false,
          error: {
            message: error instanceof Error ? error.message : '未知错误',
          },
        });
      }
    })();
  }

  /**
   * 处理右键菜单动作消息
   */
  function handleContextMenuAction(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        console.log('[Background] 处理右键菜单动作:', message.data);

        // 通过InitializationService获取ContextMenuManager实例
        // 这里暂时返回成功，因为实际的处理逻辑已经在ContextMenuManager中
        sendResponse({
          success: true,
          message: '右键菜单动作已处理',
        });
      } catch (error) {
        console.error('[Background] 右键菜单动作处理失败:', error);
        sendResponse({
          success: false,
          error: {
            message: error instanceof Error ? error.message : '未知错误',
          },
        });
      }
    })();
  }

  /**
   * 转发设置更新到标签页内容脚本
   */
  function handleSettingsUpdated(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        const tabs = await browser.tabs.query({});
        let delivered = 0;
        let appControlResult: unknown = null;

        await Promise.all(
          tabs
            .filter((tab) => typeof tab.id === 'number')
            .map(async (tab) => {
              try {
                await browser.tabs.sendMessage(tab.id!, message);
                delivered += 1;
              } catch {
                // 忽略没有注入 content script 的页面（如 chrome:// 页面）
              }
            }),
        );

        if (message?.settings) {
          appControlResult = await syncAppSelectionBannerSetting(
            message.settings as UserSettings,
            'settings_updated',
          );
        }

        sendResponse({
          success: true,
          delivered,
          totalTabs: tabs.length,
          appControlResult,
        });
      } catch (error) {
        console.error('[Background] 设置更新转发失败:', error);
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    })();
  }

  function handleSetSelectionBannerDisabled(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        const disabled = !!message?.disabled;
        const result =
          await appNativeControlAdapter.setSystemSelectionBannerDisabled(
            disabled,
          );

        if (result.ok) {
          console.log(
            '[Background] Direct app selection banner toggle synced',
            {
              disabled: result.disabled,
            },
          );
        } else {
          console.warn(
            '[Background] Direct app selection banner toggle failed',
            {
              desiredDisabled: disabled,
              supported: result.supported,
              error: result.error,
            },
          );
        }

        sendResponse({
          success: result.ok,
          result,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.warn(
          '[Background] Direct app selection banner toggle exception',
          {
            error: errorMessage,
          },
        );
        sendResponse({
          success: false,
          error: errorMessage,
        });
      }
    })();
  }

  async function syncAppSelectionBannerSetting(
    settings: UserSettings,
    source: 'startup' | 'settings_updated',
  ) {
    try {
      const result =
        await appNativeControlAdapter.setSystemSelectionBannerDisabled(
          !!settings.disableSystemSelectionBanner,
        );
      if (result.ok) {
        console.log('[Background] App selection banner state synced', {
          source,
          disabled: result.disabled,
        });
      } else {
        console.warn('[Background] App selection banner sync skipped/failed', {
          source,
          supported: result.supported,
          error: result.error,
          desiredDisabled: settings.disableSystemSelectionBanner,
        });
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[Background] App selection banner sync exception', {
        source,
        error: message,
      });
      return {
        ok: false,
        supported: false,
        error: message,
      };
    }
  }

  function parseStoredUserSettings(rawValue: unknown): UserSettings | null {
    try {
      if (typeof rawValue === 'string') {
        return JSON.parse(rawValue) as UserSettings;
      }

      if (rawValue && typeof rawValue === 'object') {
        return rawValue as UserSettings;
      }

      return null;
    } catch (error) {
      console.warn('[Background] parseStoredUserSettings failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 处理更新检查相关消息
   */
  function handleUpdateMessage(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        const handled = await updateCheckService.handleMessage(
          message,
          sendResponse,
        );
        if (!handled) {
          sendResponse({
            success: false,
            error: { message: '未知的更新消息类型' },
          });
        }
      } catch (error) {
        console.error('[Background] 更新消息处理失败:', error);
        sendResponse({
          success: false,
          error: {
            message: error instanceof Error ? error.message : '未知错误',
          },
        });
      }
    })();
  }

  function handleGetToken(sendResponse: (response: any) => void): void {
    (async () => {
      try {
        await authManager.init();
        const token = await authManager.getValidToken();
        sendResponse({ token });
      } catch (error) {
        sendResponse({
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    })();
  }

  function handleLoginSuccess(
    message: any,
    sendResponse: (response: any) => void,
  ): void {
    (async () => {
      try {
        await authManager.onLoginSuccess(message.userId);
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    })();
  }

  function handleLogout(sendResponse: (response: any) => void): void {
    (async () => {
      try {
        await authManager.onLogout();
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    })();
  }

  function handleGetAuthState(sendResponse: (response: any) => void): void {
    (async () => {
      try {
        await authManager.init();
        const authState = await chrome.storage.local.get('authState');
        sendResponse({ state: authState.authState || null });
      } catch (error) {
        sendResponse({
          error: error instanceof Error ? error.message : '未知错误',
        });
      }
    })();
  }

  // 初始化服务
  initializeServices();
});
