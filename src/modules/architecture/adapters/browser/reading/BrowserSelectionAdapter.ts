import type { SelectionPort, SelectionSnapshot } from '../../../core/ports';

export class BrowserSelectionAdapter implements SelectionPort {
  getSelectionSnapshot(): SelectionSnapshot | null {
    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return null;
      }

      const text = selection.toString().trim();
      if (!text) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      return {
        text,
        rect: {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
      };
    } catch (_) {
      return null;
    }
  }
}
