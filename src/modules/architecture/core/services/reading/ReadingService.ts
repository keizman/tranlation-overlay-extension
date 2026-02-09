import type { SelectionPort, RectLike } from '../../ports/reading';

export interface ReadingSelectionInfo {
  text: string;
  rect: RectLike | null;
  isSingleWord: boolean;
  isEnglishWord: boolean;
  isWord: boolean;
}

export class ReadingService {
  constructor(private readonly selectionPort: SelectionPort) {}

  isEnglishWord(text: string): boolean {
    if (!text || text.length === 0) return false;
    return /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(text.trim());
  }

  isSingleWord(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.length > 0 && !trimmed.includes(' ');
  }

  getSelectionInfo(): ReadingSelectionInfo | null {
    const snapshot = this.selectionPort.getSelectionSnapshot();
    if (!snapshot || !snapshot.text.trim()) {
      return null;
    }

    const text = snapshot.text.trim();
    const isSingleWord = this.isSingleWord(text);
    const isEnglishWord = this.isEnglishWord(text);

    return {
      text,
      rect: snapshot.rect,
      isSingleWord,
      isEnglishWord,
      isWord: isSingleWord && isEnglishWord,
    };
  }
}
