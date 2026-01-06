/**
 * 请求处理工具函数
 */

import { ApiConfig } from '../../shared/types/api';
import { BackgroundProxyResponse } from '../types';

/**
 * 发送API请求（支持后台代理）
 */
export async function sendApiRequest(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number = 0,
): Promise<Response> {
  if (apiConfig.useBackgroundProxy) {
    return sendViaBackground(requestBody, apiConfig, timeout);
  } else {
    return sendDirectRequest(requestBody, apiConfig, timeout);
  }
}

/**
 * 直接发送API请求
 */
async function sendDirectRequest(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number,
): Promise<Response> {
  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiConfig.apiKey}`,
  };

  // 从 customParams 提取 site_auth 和 site_api 并添加到 headers
  if (apiConfig.customParams) {
    try {
      const customParams = JSON.parse(apiConfig.customParams);
      if (customParams.site_auth) {
        headers['site_auth'] = customParams.site_auth;
      }
      if (customParams.site_api) {
        headers['site_api'] = customParams.site_api;
      }
    } catch (e) {
      console.warn('[API] Failed to parse customParams:', e);
    }
  }

  const fetchOptions: RequestInit = {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  };

  if (timeout !== undefined && timeout > 0) {
    fetchOptions.signal = AbortSignal.timeout(timeout);
  }

  return fetch(apiConfig.apiEndpoint, fetchOptions);
}

/**
 * 通过后台代理发送请求
 */
async function sendViaBackground(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number,
): Promise<Response> {
  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiConfig.apiKey}`,
  };

  // 从 customParams 提取 site_auth 和 site_api 并添加到 headers
  if (apiConfig.customParams) {
    try {
      const customParams = JSON.parse(apiConfig.customParams);
      if (customParams.site_auth) {
        headers['site_auth'] = customParams.site_auth;
      }
      if (customParams.site_api) {
        headers['site_api'] = customParams.site_api;
      }
    } catch (e) {
      console.warn('[API] Failed to parse customParams:', e);
    }
  }

  return new Promise((resolve) => {
    browser.runtime.sendMessage(
      {
        type: 'api-request',
        data: {
          url: apiConfig.apiEndpoint,
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          timeout: timeout,
        },
      },
      (response: BackgroundProxyResponse) => {
        if (response.success) {
          const mockResponse = {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => response.data,
          } as Response;
          resolve(mockResponse);
        } else {
          const mockResponse = {
            ok: false,
            status: response.error?.status || 500,
            statusText: response.error?.statusText || 'Internal Server Error',
            json: async () => ({ error: response.error }),
          } as Response;
          resolve(mockResponse);
        }
      },
    );
  });
}
