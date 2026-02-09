import { browser } from 'wxt/browser';
import type { RuntimeMessagingPort } from '../../core/ports';

export class BrowserRuntimeMessagingAdapter implements RuntimeMessagingPort {
  async queryTabs(options: Record<string, unknown> = {}): Promise<any[]> {
    return browser.tabs.query(options as any);
  }

  async sendToTab<TMessage = unknown, TResponse = unknown>(
    tabId: number,
    message: TMessage,
  ): Promise<TResponse> {
    return browser.tabs.sendMessage(
      tabId,
      message as any,
    ) as Promise<TResponse>;
  }

  async sendToRuntime<TMessage = unknown, TResponse = unknown>(
    message: TMessage,
  ): Promise<TResponse> {
    return browser.runtime.sendMessage(message as any) as Promise<TResponse>;
  }
}
