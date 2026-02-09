import { AuthConfig } from './config';
import { authManager } from './AuthManager';
import {
  hmacSHA256,
  sha256Hex,
  generateNonce,
  sortQueryParams,
} from './crypto';
import { createModuleLogger } from '../shared/utils/Report';

const logger = createModuleLogger('RequestInterceptor');
const API_BASE_ORIGIN =
  import.meta.env.VITE_AUTH_SERVER_URL ||
  new URL(AuthConfig.authEndpoint).origin;

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: String(error) };
}

function shouldTraceRequest(url: string): boolean {
  return url.includes('/translate_tts') || url.includes('/translate_a/single');
}

class RequestInterceptor {
  private tempId: string | null = null;
  private extensionId: string;
  private extensionVersion: string;

  constructor() {
    this.extensionId = chrome.runtime.id;
    this.extensionVersion = chrome.runtime
      .getManifest()
      .version.replace(/\./g, '');
  }

  async init(): Promise<void> {
    if (this.tempId) return;

    const stored = await chrome.storage.local.get('tempId');
    this.tempId = stored.tempId;
  }

  async fetch(
    url: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<Response> {
    await this.init();
    await authManager.init();
    if (!this.tempId) {
      const stored = await chrome.storage.local.get('tempId');
      this.tempId = stored.tempId || null;
    }

    const method = options.method || 'GET';
    let resolvedUrl = url;
    try {
      resolvedUrl = this.resolveUrl(url);
    } catch (error) {
      logger.error('Failed to resolve request URL', {
        url,
        method,
        retryCount,
        error: serializeError(error),
      });
      throw error;
    }

    let token = '';
    try {
      token = await authManager.getValidToken();
    } catch (error) {
      logger.error('Failed to get valid token', {
        url: resolvedUrl,
        method,
        retryCount,
        error: serializeError(error),
      });
      throw error;
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce(16);

    let sign = '';
    try {
      sign = await this.calculateSign(
        method,
        resolvedUrl,
        options.body,
        timestamp,
        token,
      );
    } catch (error) {
      logger.error('Failed to calculate request signature', {
        url: resolvedUrl,
        method,
        retryCount,
        error: serializeError(error),
      });
      throw error;
    }

    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${token}`,
      'x-user-id': (await chrome.storage.local.get('userId')).userId || '',
      'x-temp-id': this.tempId || '',
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-extension-id': this.extensionId,
      'x-extension-version': this.extensionVersion,
      'x-sign': sign,
    };

    if (!this.tempId) {
      logger.warn('Missing tempId in request headers', {
        url: resolvedUrl,
        method,
        retryCount,
      });
    }

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const traceRequest = shouldTraceRequest(resolvedUrl);
    if (traceRequest) {
      logger.log('Request start', {
        url: resolvedUrl,
        rawUrl: url,
        method,
        retryCount,
        hasUserId: !!headers['x-user-id'],
        hasTempId: !!headers['x-temp-id'],
      });
    }

    try {
      const response = await fetch(resolvedUrl, { ...options, headers });

      if (traceRequest && !response.ok) {
        const bodySnippet = await response
          .clone()
          .text()
          .then((text) => text.slice(0, 500))
          .catch(() => '');
        logger.warn('Request returned non-OK status', {
          url: resolvedUrl,
          method,
          retryCount,
          status: response.status,
          statusText: response.statusText,
          bodySnippet,
        });
      }

      if (response.status === 401 && retryCount < AuthConfig.maxRetryCount) {
        const errorData = await response
          .clone()
          .json()
          .catch(() => ({}));
        logger.warn('Received 401 response', {
          url: resolvedUrl,
          method,
          retryCount,
          action: errorData.action || '',
        });

        if (errorData.action === 'refresh_token') {
          await authManager.refreshToken();
          return this.fetch(url, options, retryCount + 1);
        }
      }

      return response;
    } catch (error) {
      logger.error('Request failed', {
        url: resolvedUrl,
        method,
        retryCount,
        error: serializeError(error),
      });
      if (retryCount < AuthConfig.maxRetryCount) {
        await this.delay(AuthConfig.retryDelay * (retryCount + 1));
        return this.fetch(url, options, retryCount + 1);
      }
      throw error;
    }
  }

  private async calculateSign(
    method: string,
    url: string,
    body: any,
    timestamp: string,
    token: string,
  ): Promise<string> {
    let payload: string;
    const tempId = this.tempId || '';

    if (method === 'GET') {
      const urlObj = new URL(url);
      const sortedParams = sortQueryParams(urlObj.searchParams);
      payload = `${sortedParams}|${timestamp}|${tempId}`;
    } else {
      const bodyStr =
        typeof body === 'string' ? body : JSON.stringify(body || {});
      const bodyHash = await sha256Hex(bodyStr);
      payload = `${bodyHash}|${timestamp}|${tempId}`;
    }

    return hmacSHA256(payload, token);
  }

  private resolveUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    if (!API_BASE_ORIGIN) {
      throw new Error('Missing API base origin for relative request URL');
    }
    return new URL(url, API_BASE_ORIGIN).toString();
  }

  async get(url: string, options: RequestInit = {}): Promise<Response> {
    return this.fetch(url, { ...options, method: 'GET' });
  }

  async post(
    url: string,
    body: any,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.fetch(url, { ...options, method: 'POST', body });
  }

  async put(
    url: string,
    body: any,
    options: RequestInit = {},
  ): Promise<Response> {
    return this.fetch(url, { ...options, method: 'PUT', body });
  }

  async delete(url: string, options: RequestInit = {}): Promise<Response> {
    return this.fetch(url, { ...options, method: 'DELETE' });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const httpClient = new RequestInterceptor();
