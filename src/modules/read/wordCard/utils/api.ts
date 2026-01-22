/**
 * 词典 API 调用
 */

import type { DictionaryResponse } from '../types';

/**
 * 查询单词
 */
export async function queryWord(
  word: string,
  apiEndpoint: string,
  language: string = 'en',
): Promise<DictionaryResponse> {
  const url = `${apiEndpoint}/api/v2/entries/${language}/${encodeURIComponent(word.toLowerCase())}`;

  console.log(`[WordCard API] Querying: ${url}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Word not found: ${word}`);
    }
    throw new Error(`API error: ${response.status}`);
  }

  const data: DictionaryResponse = await response.json();
  console.log(`[WordCard API] Response:`, data);

  return data;
}

/**
 * 检查 API 是否可用
 */
export async function checkApiHealth(apiEndpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiEndpoint}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
