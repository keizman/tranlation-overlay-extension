/**
 * Google Translate Utility
 * Handles fetching translations from the private Google Translate API.
 */

const GOOGLE_TRANSLATE_API_BASE =
  'https://translate.planktonfly.com/translate_a/single';
const GOOGLE_API_AUTH = 'Basic bXl1c2VyOjEyMzQ1NjY=';

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
  // Construct URL parameters
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: targetLang,
    dt: 't',
    q: text,
  });

  const url = `${GOOGLE_TRANSLATE_API_BASE}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: GOOGLE_API_AUTH,
        'X-Proxy-Target': 'google', // If needed by the proxy, though the user said it uses the same auth method as TTS
      },
    });

    if (!response.ok) {
      throw new Error(
        `Google Translate API Error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Parse response
    // Typical structure: [[["Translated", "Original", ...], ...], ...]
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
        // data[2] usually contains the detected language code string like 'en'
        detectedLanguage: data[2],
      };
    }

    throw new Error('Invalid response format from Google Translate API');
  } catch (error) {
    console.error('[GoogleTranslateUtils] Translation failed:', error);
    throw error;
  }
}
