import type { TextInjectionPort } from '../../../core/ports';

export class BrowserTextInjectionAdapter implements TextInjectionPort {
  replaceSelection(text: string): boolean {
    const activeElement = document.activeElement;

    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement
    ) {
      const start = activeElement.selectionStart ?? 0;
      const end = activeElement.selectionEnd ?? 0;
      activeElement.setRangeText(text, start, end, 'end');
      return true;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    selection.removeAllRanges();
    return true;
  }

  insertAtCursor(text: string): boolean {
    const activeElement = document.activeElement;

    if (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement
    ) {
      const start = activeElement.selectionStart ?? activeElement.value.length;
      activeElement.setRangeText(text, start, start, 'end');
      return true;
    }

    if (
      activeElement instanceof HTMLElement &&
      activeElement.isContentEditable &&
      document.execCommand
    ) {
      return document.execCommand('insertText', false, text);
    }

    return false;
  }
}
