import { AuthConfig } from './config';
import { authManager } from './AuthManager';
import {
  hmacSHA256,
  sha256Hex,
  generateNonce,
  sortQueryParams,
} from './crypto';

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

    const token = await authManager.getValidToken();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = generateNonce(16);
    const method = options.method || 'GET';

    const sign = await this.calculateSign(
      method,
      url,
      options.body,
      timestamp,
      token,
    );

    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
      Authorization: `Bearer ${token}`,
      'x-user-id': (await chrome.storage.local.get('userId')).userId || '',
      'x-temp-id': this.tempId!,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-extension-id': this.extensionId,
      'x-extension-version': this.extensionVersion,
      'x-sign': sign,
    };

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 401 && retryCount < AuthConfig.maxRetryCount) {
        const errorData = await response.json().catch(() => ({}));

        if (errorData.action === 'refresh_token') {
          await authManager.refreshToken();
          return this.fetch(url, options, retryCount + 1);
        }
      }

      return response;
    } catch (error) {
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

    if (method === 'GET') {
      const urlObj = new URL(url);
      const sortedParams = sortQueryParams(urlObj.searchParams);
      payload = `${sortedParams}|${timestamp}|${this.tempId}`;
    } else {
      const bodyStr =
        typeof body === 'string' ? body : JSON.stringify(body || {});
      const bodyHash = await sha256Hex(bodyStr);
      payload = `${bodyHash}|${timestamp}|${this.tempId}`;
    }

    return hmacSHA256(payload, token);
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
