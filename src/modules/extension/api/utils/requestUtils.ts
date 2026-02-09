/**
 * 请求处理工具函数
 */

import { ApiConfig } from '../../../shared/types/api';
import { BackgroundProxyResponse } from '../types';
import { createModuleLogger } from '../../../shared/utils/Report';
import {
  networkPolicyService,
  runtimeMessagingPort,
} from '../../../architecture/bootstrap/defaultAdapters';

const logger = createModuleLogger('ChatApiRequest');

function shouldTraceChatRequest(apiEndpoint: string): boolean {
  return apiEndpoint.includes('/v1/chat/completions');
}

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
  const traceChat = shouldTraceChatRequest(apiConfig.apiEndpoint);

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

  if (traceChat) {
    logger.log('Chat request start', {
      endpoint: apiConfig.apiEndpoint,
      timeout,
      hasBusinessAuthorization: !!headers.Authorization,
      hasSiteAuth: !!headers.site_auth,
      hasSiteApi: !!headers.site_api,
    });
  }

  const response = await networkPolicyService.request({
    url: apiConfig.apiEndpoint,
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
    timeoutMs: timeout,
    retries: 1,
  });

  if (traceChat) {
    if (response.ok) {
      logger.log('Chat request success', {
        endpoint: apiConfig.apiEndpoint,
        status: response.status,
        statusText: response.statusText,
      });
    } else {
      const bodySnippet = await response
        .clone()
        .text()
        .then((text) => text.slice(0, 500))
        .catch(() => '');
      logger.error('Chat request failed', {
        endpoint: apiConfig.apiEndpoint,
        status: response.status,
        statusText: response.statusText,
        bodySnippet,
      });
    }
  }

  return response;
}

/**
 * 通过后台代理发送请求
 */
async function sendViaBackground(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number,
): Promise<Response> {
  const traceChat = shouldTraceChatRequest(apiConfig.apiEndpoint);

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

  if (traceChat) {
    logger.log('Chat request start (background)', {
      endpoint: apiConfig.apiEndpoint,
      timeout,
      hasBusinessAuthorization: !!headers.Authorization,
      hasSiteAuth: !!headers.site_auth,
      hasSiteApi: !!headers.site_api,
    });
  }

  const response = (await runtimeMessagingPort.sendToRuntime({
    type: 'api-request',
    data: {
      url: apiConfig.apiEndpoint,
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      timeout: timeout,
    },
  })) as BackgroundProxyResponse;

  if (response.success) {
    if (traceChat) {
      logger.log('Chat request success (background)', {
        endpoint: apiConfig.apiEndpoint,
      });
    }
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => response.data,
    } as Response;
  }

  if (traceChat) {
    logger.error('Chat request failed (background)', {
      endpoint: apiConfig.apiEndpoint,
      status: response.error?.status || 500,
      statusText: response.error?.statusText || 'Internal Server Error',
      error: response.error || null,
    });
  }

  return {
    ok: false,
    status: response.error?.status || 500,
    statusText: response.error?.statusText || 'Internal Server Error',
    json: async () => ({ error: response.error }),
  } as Response;
}
