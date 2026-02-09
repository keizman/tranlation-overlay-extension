import type { ClipboardPort } from '../../../core/ports';

export class BrowserClipboardAdapter implements ClipboardPort {
  async readText(): Promise<string> {
    if (!navigator.clipboard?.readText) {
      throw new Error('Clipboard read is not available');
    }
    return navigator.clipboard.readText();
  }

  async writeText(text: string): Promise<void> {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard write is not available');
    }
    await navigator.clipboard.writeText(text);
  }
}
