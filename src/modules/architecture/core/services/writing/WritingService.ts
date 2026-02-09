import type { ClipboardPort, TextInjectionPort } from '../../ports/writing';

export class WritingService {
  constructor(
    private readonly clipboardPort: ClipboardPort,
    private readonly textInjectionPort: TextInjectionPort,
  ) {}

  async copyToClipboard(text: string): Promise<void> {
    await this.clipboardPort.writeText(text);
  }

  async readClipboardText(): Promise<string> {
    return this.clipboardPort.readText();
  }

  replaceSelection(text: string): boolean {
    return this.textInjectionPort.replaceSelection(text);
  }

  insertAtCursor(text: string): boolean {
    return this.textInjectionPort.insertAtCursor(text);
  }
}
