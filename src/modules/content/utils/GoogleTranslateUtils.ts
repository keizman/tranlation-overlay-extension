/**
 * Google Translate Utility
 * Handles fetching translations from the private Google Translate API.
 */

import { httpClient } from '../../auth/RequestInterceptor';

const GOOGLE_TRANSLATE_ENDPOINT = '/translate_a/single';

interface GoogleTranslateResult {
  originalText: string;
  translatedText: string;
  detectedLanguage?: string;
}

/**
 * Fetch translation from Google Translate Private API.
 *
 * @param text Text to translate
 * @param targetLang Target language code (default: 'zh-CN')
 * @returns Promise with translation result
 */
export async function fetchGoogleTranslation(
  text: string,
  targetLang: string = 'zh-CN',
): Promise<GoogleTranslateResult> {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: targetLang,
    dt: 't',
    q: text,
  });

  const url = `${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`;

  try {
    const response = await httpClient.get(url);

    if (!response) {
      throw new Error('Google Translate API Error: httpClient returned null');
    }

    const data = await response.json();

    if (Array.isArray(data) && Array.isArray(data[0])) {
      const segments = data[0];
      let translatedText = '';

      for (const segment of segments) {
        if (Array.isArray(segment) && segment[0]) {
          translatedText += segment[0];
        }
      }

      return {
        originalText: text,
        translatedText: translatedText,
        detectedLanguage: data[2],
      };
    }

    throw new Error('Invalid response format from Google Translate API');
  } catch (error) {
    console.error('[GoogleTranslateUtils] Translation failed:', error);
    throw error;
  }
}
