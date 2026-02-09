/**
 * 词典 API 调用
 */

import type { DictionaryResponse } from '../types';
import { createModuleLogger } from '../../../shared/utils/Report';
import { httpClient } from '../../../auth/RequestInterceptor';

const logger = createModuleLogger('WordCardAPI');
const IN_FLIGHT_REQUESTS = new Map<string, Promise<DictionaryResponse>>();
const RECENT_RESULTS = new Map<
  string,
  { data: DictionaryResponse; ts: number }
>();
const RECENT_RESULT_TTL_MS = 2000;

/**
 * 查询单词
 */
export async function queryWord(
  word: string,
  apiEndpoint: string,
  language: string = 'en',
): Promise<DictionaryResponse> {
  const normalizedWord = word.toLowerCase();
  const url = `${apiEndpoint}/api/v2/entries/${language}/${encodeURIComponent(normalizedWord)}`;
  const queryKey = `${apiEndpoint}|${language}|${normalizedWord}`;
  const now = Date.now();
  const cachedResult = RECENT_RESULTS.get(queryKey);
  if (cachedResult && now - cachedResult.ts <= RECENT_RESULT_TTL_MS) {
    logger.log('Query deduplicated by recent cache', {
      word,
      normalizedWord,
      language,
      apiEndpoint,
      requestUrl: url,
      ttlMs: RECENT_RESULT_TTL_MS,
      ageMs: now - cachedResult.ts,
    });
    return cachedResult.data;
  }

  const inFlightRequest = IN_FLIGHT_REQUESTS.get(queryKey);
  if (inFlightRequest) {
    logger.log('Query deduplicated by in-flight request', {
      word,
      normalizedWord,
      language,
      apiEndpoint,
      requestUrl: url,
    });
    return inFlightRequest;
  }

  const requestPromise = (async (): Promise<DictionaryResponse> => {
    const startedAt = performance.now();
    logger.log('Query start', {
      word,
      normalizedWord,
      language,
      apiEndpoint,
      requestUrl: url,
    });

    const response = await httpClient.get(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const durationMs = Math.round(performance.now() - startedAt);
    const cacheHeaders = {
      etag: response.headers.get('etag') || '',
      cacheControl: response.headers.get('cache-control') || '',
      age: response.headers.get('age') || '',
    };

    if (response.status === 304) {
      logger.warn('Query got 304 Not Modified', {
        requestUrl: url,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        ...cacheHeaders,
      });
      throw new Error(`API cache not modified: ${response.status}`);
    }

    if (!response.ok) {
      const bodySnippet = await response
        .clone()
        .text()
        .then((text) => text.slice(0, 300))
        .catch(() => '');
      logger.error('Query failed', {
        requestUrl: url,
        status: response.status,
        statusText: response.statusText,
        durationMs,
        ...cacheHeaders,
        bodySnippet,
      });

      if (response.status === 404) {
        throw new Error(`Word not found: ${word}`);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data: DictionaryResponse = await response.json();
    RECENT_RESULTS.set(queryKey, { data, ts: Date.now() });
    logger.log('Query success', {
      requestUrl: url,
      status: response.status,
      durationMs,
      source: data.source,
      cached: data.cached,
      ...cacheHeaders,
    });

    return data;
  })();

  IN_FLIGHT_REQUESTS.set(queryKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    IN_FLIGHT_REQUESTS.delete(queryKey);
  }
}

/**
 * 检查 API 是否可用
 */
export async function checkApiHealth(apiEndpoint: string): Promise<boolean> {
  try {
    const response = await httpClient.get(`${apiEndpoint}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    logger.log('Health check result', {
      apiEndpoint,
      requestUrl: `${apiEndpoint}/health`,
      status: response.status,
      ok: response.ok,
    });
    return response.ok;
  } catch (error) {
    logger.warn('Health check failed', {
      apiEndpoint,
      requestUrl: `${apiEndpoint}/health`,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
