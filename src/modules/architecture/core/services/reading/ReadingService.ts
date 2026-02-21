import type { PageLanguagePort } from '../../ports';
import type { SelectionPort, RectLike } from '../../ports/reading';

export interface ReadingSelectionInfo {
  text: string;
  rect: RectLike | null;
  isSingleWord: boolean;
  isEnglishWord: boolean;
  isQueryableTerm: boolean;
  isWord: boolean;
  queryLanguage: string;
}

export class ReadingService {
  private static readonly LATIN_SCRIPT_LANGUAGES = new Set([
    'en',
    'es',
    'fr',
    'de',
    'it',
    'pt',
    'nl',
    'sv',
    'no',
    'da',
    'fi',
    'pl',
    'cs',
    'hu',
    'ro',
    'hr',
    'sk',
    'sl',
    'et',
    'lv',
    'lt',
    'tr',
    'id',
    'ms',
    'tl',
    'vi',
    'sw',
    'af',
    'is',
    'mt',
  ]);

  private static readonly LANGUAGE_CODE_NORMALIZATION: Record<string, string> =
    {
      'zh-cn': 'zh',
      'zh-tw': 'zh',
      'zh-hk': 'zh',
      'zh-sg': 'zh',
      'en-us': 'en',
      'en-gb': 'en',
      'en-au': 'en',
      'en-ca': 'en',
      'pt-br': 'pt',
      'pt-pt': 'pt',
      'es-es': 'es',
      'es-mx': 'es',
      'es-ar': 'es',
      'fr-fr': 'fr',
      'fr-ca': 'fr',
      'de-de': 'de',
      'de-at': 'de',
      'de-ch': 'de',
      nb: 'no',
      nn: 'no',
      fil: 'tl',
      in: 'id',
      iw: 'he',
    };

  constructor(
    private readonly selectionPort: SelectionPort,
    private readonly pageLanguagePort?: PageLanguagePort,
  ) {}

  isEnglishWord(text: string): boolean {
    if (!text || text.length === 0) return false;
    return /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(text.trim());
  }

  isSingleWord(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    return trimmed.length > 0 && !/\s/.test(trimmed);
  }

  isQueryableTerm(text: string): boolean {
    if (!this.isSingleWord(text)) {
      return false;
    }
    return this.containsLetter(text);
  }

  private containsLetter(text: string): boolean {
    if (/[A-Za-z\u00C0-\u024F]/u.test(text)) {
      return true;
    }
    return this.detectLanguageFromScript(text) !== null;
  }

  private normalizeLanguageCode(
    code: string | null | undefined,
  ): string | null {
    if (!code) {
      return null;
    }
    const lowerCode = code.trim().toLowerCase();
    if (!lowerCode) {
      return null;
    }

    const mapped =
      ReadingService.LANGUAGE_CODE_NORMALIZATION[lowerCode] || lowerCode;
    return mapped.split('-')[0];
  }

  private detectCurrentPageLanguage(): string | null {
    if (!this.pageLanguagePort) {
      return null;
    }

    const snapshot = this.pageLanguagePort.getSnapshot(300);
    const candidates = [snapshot.htmlLang, snapshot.metaContentLanguage];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const raw = candidate.split(',')[0]?.trim();
      const normalized = this.normalizeLanguageCode(raw);
      if (normalized) {
        return normalized;
      }
    }

    return this.detectLanguageFromScript(snapshot.textSample);
  }

  private detectLanguageFromScript(text: string): string | null {
    const sample = text.trim();
    if (!sample) {
      return null;
    }

    const hasKana = /[\u3040-\u30FF]/u.test(sample);
    const hasHangul = /[\uAC00-\uD7AF]/u.test(sample);
    const hasHan = /[\u3400-\u9FFF]/u.test(sample);
    if (hasKana) {
      return 'ja';
    }
    if (hasHangul) {
      return 'ko';
    }
    if (hasHan) {
      return 'zh';
    }
    if (/[\u0400-\u04FF]/u.test(sample)) {
      return 'ru';
    }
    if (/[\u0600-\u06FF]/u.test(sample)) {
      return 'ar';
    }
    if (/[\u0590-\u05FF]/u.test(sample)) {
      return 'he';
    }
    if (/[\u0900-\u097F]/u.test(sample)) {
      return 'hi';
    }
    if (/[\u0370-\u03FF]/u.test(sample)) {
      return 'el';
    }
    if (/[\u0E00-\u0E7F]/u.test(sample)) {
      return 'th';
    }

    return null;
  }

  resolveQueryLanguage(text: string): string {
    const sample = text.trim();
    if (!sample) {
      return 'en';
    }

    const pageLanguage = this.detectCurrentPageLanguage();
    const hasKana = /[\u3040-\u30FF]/u.test(sample);
    const hasHangul = /[\uAC00-\uD7AF]/u.test(sample);
    const hasHan = /[\u3400-\u9FFF]/u.test(sample);

    if (hasKana) {
      return 'ja';
    }
    if (hasHangul) {
      return 'ko';
    }
    if (hasHan) {
      if (pageLanguage === 'ja' || pageLanguage === 'zh') {
        return pageLanguage;
      }
      return 'zh';
    }

    const scriptLanguage = this.detectLanguageFromScript(sample);
    if (scriptLanguage) {
      return scriptLanguage;
    }

    const hasLatin = /[A-Za-z\u00C0-\u024F]/u.test(sample);
    if (
      hasLatin &&
      pageLanguage &&
      ReadingService.LATIN_SCRIPT_LANGUAGES.has(pageLanguage)
    ) {
      return pageLanguage;
    }

    if (pageLanguage) {
      return pageLanguage;
    }

    return 'en';
  }

  getSelectionInfo(): ReadingSelectionInfo | null {
    const snapshot = this.selectionPort.getSelectionSnapshot();
    if (!snapshot || !snapshot.text.trim()) {
      return null;
    }

    const text = snapshot.text.trim();
    const isSingleWord = this.isSingleWord(text);
    const isEnglishWord = this.isEnglishWord(text);
    const isQueryableTerm = this.isQueryableTerm(text);

    return {
      text,
      rect: snapshot.rect,
      isSingleWord,
      isEnglishWord,
      isQueryableTerm,
      isWord: isQueryableTerm,
      queryLanguage: this.resolveQueryLanguage(text),
    };
  }
}
