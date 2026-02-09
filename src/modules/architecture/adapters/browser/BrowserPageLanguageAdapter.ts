import type { PageLanguagePort, PageLanguageSnapshot } from '../../core/ports';

export class BrowserPageLanguageAdapter implements PageLanguagePort {
  getSnapshot(sampleLength: number): PageLanguageSnapshot {
    try {
      const htmlLang = document.documentElement.lang || null;
      const metaTag = document.querySelector(
        'meta[http-equiv="Content-Language"]',
      );
      const metaContentLanguage = metaTag?.getAttribute('content') || null;
      const textSample =
        document.body?.innerText?.substring(0, sampleLength) || '';

      return {
        htmlLang,
        metaContentLanguage,
        textSample,
      };
    } catch (_) {
      return {
        htmlLang: null,
        metaContentLanguage: null,
        textSample: '',
      };
    }
  }
}
