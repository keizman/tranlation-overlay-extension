import { MessageType } from '@/src/modules/core/messaging/types';
import { WebsiteManager } from '@/src/modules/options/website-management/manager';
import { ElementPickerService } from './ElementPickerService';

const CUSTOM_FILTER_STYLE_ID = 'illa-custom-filters-style';
const WEBSITE_UPDATED_MESSAGE = MessageType.WEBSITE_MANAGEMENT_UPDATED;
const START_PICKER_MESSAGE = 'start-element-picker-mode';

interface PickerStartResponse {
  success: boolean;
  error?: string;
}

export class CustomFilterService {
  private websiteManager: WebsiteManager;
  private picker: ElementPickerService | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private lastUrl = '';
  private urlWatchTimer: number | null = null;
  private readonly onMessageBound = (message: any) =>
    this.handleMessage(message);

  constructor() {
    this.websiteManager = new WebsiteManager();
  }

  async init(): Promise<void> {
    this.lastUrl = window.location.href;
    await this.applyFilters();
    browser.runtime.onMessage.addListener(this.onMessageBound);
    this.startUrlWatcher();
  }

  destroy(): void {
    browser.runtime.onMessage.removeListener(this.onMessageBound);
    this.stopUrlWatcher();
    this.picker?.stop(true);
    this.picker = null;
    this.clearInjectedStyle();
  }

  async applyFilters(): Promise<void> {
    const selectors =
      await this.websiteManager.getMatchingCustomFilterSelectors(
        window.location.href,
      );
    const cssBlocks: string[] = [];
    for (const rawSelector of selectors) {
      const selector = rawSelector.trim();
      if (!selector || !this.isValidSelector(selector)) {
        continue;
      }
      cssBlocks.push(`${selector}{display:none !important;}`);
    }
    this.updateInjectedStyle(cssBlocks.join('\n'));
  }

  private async handleMessage(message: any): Promise<any> {
    if (!message || typeof message !== 'object') {
      return undefined;
    }

    if (message.type === START_PICKER_MESSAGE) {
      console.info('[PickerFlow][Content] Picker message received', {
        url: window.location.href,
      });
      return this.startPickerMode();
    }

    if (message.type === WEBSITE_UPDATED_MESSAGE) {
      await this.applyFilters();
      return { success: true };
    }

    return undefined;
  }

  private async startPickerMode(): Promise<PickerStartResponse> {
    const enabled = await this.websiteManager.isCustomFiltersEnabled();
    if (!enabled) {
      console.info('[PickerFlow][Content] Picker rejected: filters disabled');
      return {
        success: false,
        error:
          'My custom filters are disabled. Enable "My filters" first in Website Management.',
      };
    }

    if (this.picker) {
      this.picker.stop(true);
      this.picker = null;
    }

    const hostname = this.getCurrentHostname();
    if (!hostname) {
      console.info('[PickerFlow][Content] Picker rejected: hostname missing');
      return {
        success: false,
        error: 'Unable to detect current hostname.',
      };
    }

    this.picker = new ElementPickerService({
      onCancel: () => {
        console.info('[PickerFlow][Content] Picker cancelled by user');
        this.picker = null;
      },
      onConfirm: async (selector) => {
        console.info('[PickerFlow][Content] Picker confirmed selector', {
          hostname,
          selector,
        });
        const added = await this.websiteManager.appendCustomFilterLine(
          `${hostname}##${selector}`,
        );
        if (!added) {
          throw new Error('Failed to add filter rule.');
        }
        await this.applyFilters();
        await this.broadcastWebsiteUpdated();
        this.picker = null;
        if (window.top === window) {
          window.location.reload();
        }
      },
    });

    console.info('[PickerFlow][Content] Picker started', {
      hostname,
      url: window.location.href,
    });
    this.picker.start();
    return { success: true };
  }

  private startUrlWatcher(): void {
    this.stopUrlWatcher();
    this.urlWatchTimer = window.setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl === this.lastUrl) {
        return;
      }
      this.lastUrl = currentUrl;
      this.applyFilters().catch((error) => {
        console.warn(
          '[CustomFilterService] Failed to re-apply filters:',
          error,
        );
      });
    }, 1000);
  }

  private stopUrlWatcher(): void {
    if (this.urlWatchTimer !== null) {
      window.clearInterval(this.urlWatchTimer);
      this.urlWatchTimer = null;
    }
  }

  private getCurrentHostname(): string {
    try {
      return window.location.hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private isValidSelector(selector: string): boolean {
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  private updateInjectedStyle(cssText: string): void {
    if (!this.styleElement) {
      this.styleElement = document.getElementById(
        CUSTOM_FILTER_STYLE_ID,
      ) as HTMLStyleElement | null;
    }
    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      this.styleElement.id = CUSTOM_FILTER_STYLE_ID;
      document.documentElement.appendChild(this.styleElement);
    }
    this.styleElement.textContent = cssText;
  }

  private clearInjectedStyle(): void {
    this.styleElement?.remove();
    this.styleElement = null;
  }

  private async broadcastWebsiteUpdated(): Promise<void> {
    try {
      await browser.runtime.sendMessage({ type: WEBSITE_UPDATED_MESSAGE });
    } catch {
      // ignore when background is unavailable
    }
  }
}
