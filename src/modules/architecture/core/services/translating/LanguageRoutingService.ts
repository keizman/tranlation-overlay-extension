import type { UserSettings } from '@/src/modules/shared/types/storage';
import type { PageLanguagePort } from '../../ports';

const LANGUAGE_CODE_MAPPING: Record<string, string> = {
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-tw': 'zh',
  'zh-hk': 'zh',
  chinese: 'zh',
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  english: 'en',
};

export class LanguageRoutingService {
  constructor(private readonly pageLanguagePort: PageLanguagePort) {}

  determineOptimalTargetLanguage(settings: UserSettings): string {
    const detectedPageLanguage = this.detectCurrentPageLanguage();
    if (!detectedPageLanguage) {
      return settings.multilingualConfig.targetLanguage;
    }

    const config = settings.multilingualConfig;
    const normalizedPageLang = this.normalizeLanguageCode(detectedPageLanguage);
    const normalizedTargetLang = this.normalizeLanguageCode(
      config.targetLanguage,
    );
    const normalizedNativeLang = this.normalizeLanguageCode(
      config.nativeLanguage,
    );

    if (normalizedPageLang === normalizedTargetLang) {
      return config.nativeLanguage;
    }

    if (normalizedPageLang === normalizedNativeLang) {
      return config.targetLanguage;
    }

    return config.targetLanguage;
  }

  detectCurrentPageLanguage(): string | null {
    const snapshot = this.pageLanguagePort.getSnapshot(100);
    if (snapshot.htmlLang) return snapshot.htmlLang;
    if (snapshot.metaContentLanguage) return snapshot.metaContentLanguage;

    const textSample = snapshot.textSample;
    if (/[\u4e00-\u9fff]/.test(textSample)) {
      return 'zh';
    }

    if (/^[a-zA-Z\s\d\.,!?;:'"()-]*$/.test(textSample)) {
      return 'en';
    }

    return null;
  }

  normalizeLanguageCode(langCode: string): string {
    if (!langCode) return '';
    const mainLang = langCode.toLowerCase().split('-')[0];
    return LANGUAGE_CODE_MAPPING[mainLang] || mainLang;
  }
}
