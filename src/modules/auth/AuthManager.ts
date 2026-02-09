import { AuthConfig } from './config';
import { generateInitSalt } from './crypto';
import { createModuleLogger } from '../shared/utils/Report';

interface TokenPayload {
  token: string;
  expiryTime: number;
  checkInterval: number;
  userId?: string;
}

interface AuthTokenResponse {
  token: string;
  expires_in: number;
  check_interval: number;
}

type AuthRefreshError = Error & {
  status?: number;
};

class AuthManager {
  private state: TokenPayload | null = null;
  private refreshPromise: Promise<TokenPayload> | null = null;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    const stored = await chrome.storage.local.get(['authState', 'tempId']);

    if (stored.authState) {
      this.state = stored.authState;
    }

    if (!stored.tempId) {
      const tempId = crypto.randomUUID();
      await chrome.storage.local.set({ tempId });
    }

    this.initialized = true;
    this.startCheckLoop();
  }

  async getValidToken(): Promise<string> {
    await this.init();

    const now = Date.now();

    if (!this.state || now >= this.state.expiryTime) {
      await this.refreshToken();
    } else if (
      now >=
      this.state.expiryTime - AuthConfig.tokenRefreshThreshold * 1000
    ) {
      this.refreshToken().catch((err) => {
        logger.warn('Background token refresh failed', err);
      });
    }

    return this.state!.token;
  }

  async refreshToken(forceNew = false): Promise<TokenPayload> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefreshWithFallback(forceNew);

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefreshWithFallback(
    forceNew: boolean,
  ): Promise<TokenPayload> {
    try {
      return await this._doRefresh(forceNew);
    } catch (error) {
      if (!this.shouldFallbackToForceNew(error, forceNew)) {
        throw error;
      }

      logger.warn('token_refresh_fallback_start', {
        reason: 'token_revoked_or_expired',
        strategy: 'retry_with_init_salt',
      });

      try {
        const result = await this._doRefresh(true);
        logger.log('token_refresh_fallback_success', {
          strategy: 'retry_with_init_salt',
        });
        return result;
      } catch (fallbackError) {
        logger.error('token_refresh_fallback_failed', {
          strategy: 'retry_with_init_salt',
          error:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
        });
        throw fallbackError;
      }
    }
  }

  private shouldFallbackToForceNew(error: unknown, forceNew: boolean): boolean {
    if (forceNew) return false;
    if (!this.state?.token) return false;
    if (!(error instanceof Error)) return false;

    const authError = error as AuthRefreshError;
    const isRevokedMessage = /token revoked or expired/i.test(error.message);
    return authError.status === 401 && isRevokedMessage;
  }

  private async _doRefresh(forceNew: boolean): Promise<TokenPayload> {
    const stored = await chrome.storage.local.get(['tempId', 'userId']);
    const tempId = stored.tempId;
    const userId = stored.userId || '';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const extensionId = chrome.runtime.id;
    const extensionVersion = chrome.runtime
      .getManifest()
      .version.replace(/\./g, '');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-temp-id': tempId,
      'x-extension-id': extensionId,
      'x-extension-version': extensionVersion,
      'x-timestamp': timestamp,
      'x-user-id': userId,
    };

    if (this.state?.token && !forceNew) {
      headers['Authorization'] = `Bearer ${this.state.token}`;
    } else {
      headers['x-init-salt'] = await generateInitSalt(
        extensionId,
        parseInt(timestamp),
      );
    }

    logger.log('Refreshing token', {
      endpoint: AuthConfig.authEndpoint,
      extensionId,
      extensionVersion,
      hasTempId: !!tempId,
      forceNew,
      hasOldToken: !!(this.state?.token && !forceNew),
      hasUserId: !!userId,
    });

    const response = await fetch(AuthConfig.authEndpoint, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const rawBody = await response.text().catch(() => '');
      let errorMessage = `Auth failed: ${response.status}`;
      try {
        const errorData = JSON.parse(rawBody);
        errorMessage = errorData.error || errorMessage;
      } catch {
        if (rawBody) {
          errorMessage = rawBody.slice(0, 200);
        }
      }
      logger.error('Token refresh failed', {
        endpoint: AuthConfig.authEndpoint,
        extensionId,
        extensionVersion,
        hasTempId: !!tempId,
        hasUserId: !!userId,
        status: response.status,
        statusText: response.statusText,
        message: errorMessage,
        bodySnippet: rawBody.slice(0, 500),
      });
      const authError: AuthRefreshError = new Error(errorMessage);
      authError.status = response.status;
      throw authError;
    }

    const data: AuthTokenResponse = await response.json();

    this.state = {
      token: data.token,
      expiryTime: Date.now() + data.expires_in * 1000,
      checkInterval: data.check_interval || AuthConfig.tokenCheckInterval,
      userId: userId,
    };

    await chrome.storage.local.set({ authState: this.state });
    logger.log('Token refresh succeeded', {
      expiresInSeconds: data.expires_in,
      checkInterval: data.check_interval,
      hasUserId: !!userId,
    });

    return this.state;
  }

  startCheckLoop(): void {
    chrome.alarms.create('tokenCheck', {
      periodInMinutes: AuthConfig.tokenCheckInterval / 60,
    });
  }

  async handleAlarm(): Promise<void> {
    await this.init();

    if (!this.state) return;

    const now = Date.now();
    const threshold = AuthConfig.tokenRefreshThreshold * 1000;

    if (now >= this.state.expiryTime - threshold) {
      try {
        await this.refreshToken();
        logger.log('Token refreshed by alarm');
      } catch (err) {
        logger.error('Alarm token refresh failed', err);
      }
    }
  }

  async onLoginSuccess(userId: string): Promise<void> {
    await chrome.storage.local.set({ userId });
    await this.refreshToken(true);
  }

  async onLogout(): Promise<void> {
    this.state = null;
    await chrome.storage.local.remove(['authState', 'userId']);
    await this.refreshToken(true);
  }

  async checkAndRefreshIfNeeded(): Promise<void> {
    await this.init();

    if (!this.state) {
      await this.refreshToken(true);
      return;
    }

    const now = Date.now();
    const threshold = AuthConfig.tokenRefreshThreshold * 1000;

    if (now >= this.state.expiryTime - threshold) {
      await this.refreshToken();
    }
  }
}

const logger = createModuleLogger('AuthManager');
export const authManager = new AuthManager();
