import { browser } from 'wxt/browser';
import type { SettingsStoragePort } from '../../core/ports';

export class BrowserSyncSettingsStorageAdapter implements SettingsStoragePort {
  async get(key: string): Promise<unknown> {
    const result = await browser.storage.sync.get(key);
    return result[key];
  }

  async set(key: string, value: unknown): Promise<void> {
    await browser.storage.sync.set({ [key]: value });
  }

  async remove(key: string): Promise<void> {
    await browser.storage.sync.remove(key);
  }
}
