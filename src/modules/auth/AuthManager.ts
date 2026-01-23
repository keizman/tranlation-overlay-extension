import { AuthConfig } from './config';
import { generateInitSalt } from './crypto';

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
        console.warn('Background token refresh failed:', err);
      });
    }

    return this.state!.token;
  }

  async refreshToken(forceNew = false): Promise<TokenPayload> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefresh(forceNew);

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
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

    const response = await fetch(AuthConfig.authEndpoint, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Auth failed: ${response.status}`);
    }

    const data: AuthTokenResponse = await response.json();

    this.state = {
      token: data.token,
      expiryTime: Date.now() + data.expires_in * 1000,
      checkInterval: data.check_interval || AuthConfig.tokenCheckInterval,
      userId: userId,
    };

    await chrome.storage.local.set({ authState: this.state });

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
        console.log('Token refreshed by alarm');
      } catch (err) {
        console.error('Alarm token refresh failed:', err);
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

export const authManager = new AuthManager();
