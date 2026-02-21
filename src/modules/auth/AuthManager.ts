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
  private hasAlarmCapability = false;
  private tempIdCache: string | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;

    const stored = await this.safeStorageGet([
      'authState',
      'tempId',
      'userId',
      'authUser',
    ]);

    if (this.isTokenPayload(stored.authState)) {
      this.state = stored.authState;
    }

    const normalizedUserId = this.normalizeUserId(stored.userId);
    if (!normalizedUserId) {
      const migratedUserId = this.deriveUserIdFromAuthUser(stored.authUser);
      if (migratedUserId) {
        await chrome.storage.local.set({ userId: migratedUserId });
        logger.log('Migrated userId from authUser profile', {
          migratedUserId,
        });
      }
    }

    await this.resolveTempID();

    this.hasAlarmCapability = this.canUseAlarmApi();
    this.initialized = true;
    this.startCheckLoop();
  }

  async getValidToken(): Promise<string> {
    await this.init();

    const now = Date.now();
    const storedUserId = await this.resolveUserID();
    const tokenUserId = this.normalizeUserId(this.state?.userId);
    const identityChanged = !!this.state && storedUserId !== tokenUserId;

    if (identityChanged) {
      logger.log('Auth identity changed, forcing token refresh', {
        previousUserId: tokenUserId || null,
        currentUserId: storedUserId || null,
      });
      await this.refreshToken(true);
    } else if (!this.state || now >= this.state.expiryTime) {
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
    const tempId = await this.resolveTempID();
    const userId = await this.resolveUserID();
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
    if (!this.hasAlarmCapability) {
      logger.log('Alarm API unavailable in current context, skip tokenCheck');
      return;
    }

    try {
      chrome.alarms.create('tokenCheck', {
        periodInMinutes: AuthConfig.tokenCheckInterval / 60,
      });
    } catch (error) {
      logger.warn('Failed to create tokenCheck alarm', error);
    }
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
    const normalizedUserId = this.normalizeUserId(userId);
    await this.storageSet({ userId: normalizedUserId });
    if (this.state) {
      this.state.userId = normalizedUserId;
    }
    await this.refreshToken(true);
  }

  async onLogout(): Promise<void> {
    this.state = null;
    await this.storageRemove(['authState', 'userId']);
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

  private canUseAlarmApi(): boolean {
    try {
      return (
        typeof chrome !== 'undefined' &&
        !!chrome.alarms &&
        typeof chrome.alarms.create === 'function'
      );
    } catch {
      return false;
    }
  }

  private normalizeUserId(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private isLocalOnlyUserId(value: string): boolean {
    return value.startsWith('local_');
  }

  private async ensureTempId(value: unknown): Promise<string> {
    const existing = this.normalizeUserId(value);
    if (existing) {
      return existing;
    }

    const generated = crypto.randomUUID();
    try {
      await this.storageSet({ tempId: generated });
      logger.log('Generated missing tempId for auth flow');
    } catch (error) {
      logger.warn('Failed to persist generated tempId', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return generated;
  }

  private isTokenPayload(value: unknown): value is TokenPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const payload = value as Partial<TokenPayload>;
    return (
      typeof payload.token === 'string' &&
      typeof payload.expiryTime === 'number' &&
      typeof payload.checkInterval === 'number'
    );
  }

  private deriveUserIdFromAuthUser(authUser: unknown): string {
    if (!authUser || typeof authUser !== 'object') {
      return '';
    }

    const profile = authUser as Record<string, unknown>;
    const candidates = [
      profile.userId,
      profile.email,
      profile.username,
      profile.id,
      profile.displayName,
    ];

    for (const candidate of candidates) {
      const normalized = this.normalizeUserId(candidate);
      if (normalized) {
        return normalized;
      }
    }
    return '';
  }

  async resolveUserID(): Promise<string> {
    await this.init();

    const stored = await this.safeStorageGet(['userId', 'authUser']);
    const storedUserID = this.normalizeUserId(stored.userId);
    if (storedUserID && !this.isLocalOnlyUserId(storedUserID)) {
      return storedUserID;
    }

    const derivedUserID = this.deriveUserIdFromAuthUser(stored.authUser);
    if (derivedUserID) {
      try {
        await this.storageSet({ userId: derivedUserID });
      } catch (error) {
        logger.warn('Failed to persist derived userId', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return derivedUserID;
    }

    if (storedUserID) {
      logger.warn(
        'Stored userId is local-only and cannot be used for cloud sync',
        {
          storedUserID,
        },
      );
      return '';
    }

    return this.normalizeUserId(this.state?.userId);
  }

  async resolveTempID(): Promise<string> {
    if (this.tempIdCache) {
      return this.tempIdCache;
    }

    const stored = await this.safeStorageGet('tempId');
    const resolved = await this.ensureTempId(stored.tempId);
    this.tempIdCache = resolved;
    return resolved;
  }

  private async safeStorageGet(
    keys: string | string[],
  ): Promise<Record<string, unknown>> {
    try {
      const result = await this.storageGet(keys);
      if (result && typeof result === 'object') {
        return result as Record<string, unknown>;
      }
    } catch (error) {
      logger.warn('Storage read failed', {
        keys: Array.isArray(keys) ? keys.join(',') : keys,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {};
  }

  private getBrowserApi() {
    return (globalThis as { browser?: typeof browser }).browser;
  }

  private getChromeApi() {
    return (globalThis as { chrome?: typeof chrome }).chrome;
  }

  private async storageGet(keys: string | string[]): Promise<unknown> {
    const browserApi = this.getBrowserApi();
    if (browserApi?.storage?.local?.get) {
      return browserApi.storage.local.get(keys);
    }

    const chromeApi = this.getChromeApi();
    if (!chromeApi?.storage?.local?.get) {
      throw new Error('Storage API unavailable');
    }

    return new Promise((resolve, reject) => {
      chromeApi.storage.local.get(keys, (items) => {
        const runtimeError = chromeApi.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(items || {});
      });
    });
  }

  private async storageSet(items: Record<string, unknown>): Promise<void> {
    const browserApi = this.getBrowserApi();
    if (browserApi?.storage?.local?.set) {
      await browserApi.storage.local.set(items);
      return;
    }

    const chromeApi = this.getChromeApi();
    if (!chromeApi?.storage?.local?.set) {
      throw new Error('Storage API unavailable');
    }

    await new Promise<void>((resolve, reject) => {
      chromeApi.storage.local.set(items, () => {
        const runtimeError = chromeApi.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve();
      });
    });
  }

  private async storageRemove(keys: string | string[]): Promise<void> {
    const browserApi = this.getBrowserApi();
    if (browserApi?.storage?.local?.remove) {
      await browserApi.storage.local.remove(keys);
      return;
    }

    const chromeApi = this.getChromeApi();
    if (!chromeApi?.storage?.local?.remove) {
      throw new Error('Storage API unavailable');
    }

    await new Promise<void>((resolve, reject) => {
      chromeApi.storage.local.remove(keys, () => {
        const runtimeError = chromeApi.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve();
      });
    });
  }
}

const logger = createModuleLogger('AuthManager');
export const authManager = new AuthManager();
