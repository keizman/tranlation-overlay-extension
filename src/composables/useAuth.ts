import { ref, computed } from 'vue';
import { AuthConfig } from '@/src/modules/auth/config';
import { authManager } from '@/src/modules/auth/AuthManager';
import { createModuleLogger } from '@/src/modules/shared/utils/Report';

const logger = createModuleLogger('useAuth');

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function getDefaultAuthBase(): string {
  try {
    return new URL(AuthConfig.authEndpoint).origin;
  } catch {
    return 'http://localhost:8080';
  }
}

const API_BASE = normalizeBaseUrl(
  import.meta.env.VITE_AUTH_SERVER_URL || getDefaultAuthBase(),
);

interface User {
  id?: string;
  username: string;
  email: string;
  displayName?: string;
  avatar?: string;
}

interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
}

const authState = ref<AuthState>({
  isLoggedIn: false,
  user: null,
});
let hasInitializedAuthState = false;
let checkAuthStatePromise: Promise<void> | null = null;

type StorageMap = Record<string, unknown>;
type RuntimeMessage = Record<string, unknown>;
type RuntimeResponse = Record<string, unknown> | null | undefined;

function getBrowserApi() {
  return (globalThis as { browser?: typeof browser }).browser;
}

function getChromeApi() {
  return (globalThis as { chrome?: typeof chrome }).chrome;
}

async function storageGet<T = StorageMap>(
  keys: string | string[],
): Promise<T | null> {
  const browserApi = getBrowserApi();
  if (browserApi?.storage?.local?.get) {
    const value = await browserApi.storage.local.get(keys);
    return (value as T) || null;
  }

  const chromeApi = getChromeApi();
  if (!chromeApi?.storage?.local?.get) {
    throw new Error('Storage API unavailable');
  }

  return await new Promise<T>((resolve, reject) => {
    chromeApi.storage.local.get(keys, (items) => {
      const runtimeError = chromeApi.runtime?.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve((items as T) || ({} as T));
    });
  });
}

async function storageSet(items: StorageMap): Promise<void> {
  const browserApi = getBrowserApi();
  if (browserApi?.storage?.local?.set) {
    await browserApi.storage.local.set(items);
    return;
  }

  const chromeApi = getChromeApi();
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

async function storageRemove(keys: string | string[]): Promise<void> {
  const browserApi = getBrowserApi();
  if (browserApi?.storage?.local?.remove) {
    await browserApi.storage.local.remove(keys);
    return;
  }

  const chromeApi = getChromeApi();
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

async function runtimeSendMessage(
  message: RuntimeMessage,
): Promise<RuntimeResponse> {
  const browserApi = getBrowserApi();
  if (browserApi?.runtime?.sendMessage) {
    return (await browserApi.runtime.sendMessage(message)) as RuntimeResponse;
  }

  const chromeApi = getChromeApi();
  if (!chromeApi?.runtime?.sendMessage) {
    throw new Error('Runtime API unavailable');
  }

  return await new Promise<RuntimeResponse>((resolve, reject) => {
    chromeApi.runtime.sendMessage(message, (response) => {
      const runtimeError = chromeApi.runtime?.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve((response as RuntimeResponse) || null);
    });
  });
}

async function getResponseErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return data.error || data.message || fallback;
    }
    const text = (await response.text()).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

function deriveUserIdFromStoredUser(user: User | null | undefined): string {
  if (!user) return '';
  const candidates = [user.id, user.email, user.username, user.displayName];
  for (const candidate of candidates) {
    const normalized = typeof candidate === 'string' ? candidate.trim() : '';
    if (normalized) return normalized;
  }
  return '';
}

export function useAuth() {
  const isLoggedIn = computed(() => authState.value.isLoggedIn);
  const user = computed(() => authState.value.user);

  const checkAuthState = async () => {
    if (checkAuthStatePromise) {
      return checkAuthStatePromise;
    }

    checkAuthStatePromise = (async () => {
      try {
        const stored =
          (await storageGet<{ authUser?: User | null; userId?: string }>([
            'authUser',
            'userId',
          ])) || {};
        if (stored.authUser) {
          authState.value.isLoggedIn = true;
          authState.value.user = stored.authUser;
          const existingUserId =
            typeof stored.userId === 'string' ? stored.userId.trim() : '';
          if (!existingUserId) {
            const derivedUserId = deriveUserIdFromStoredUser(stored.authUser);
            if (derivedUserId) {
              await storageSet({ userId: derivedUserId });
            }
          }
          return;
        }

        authState.value.isLoggedIn = false;
        authState.value.user = null;
      } catch (error) {
        logger.error('Failed to check auth state', error);
      } finally {
        checkAuthStatePromise = null;
      }
    })();

    await checkAuthStatePromise;
  };

  const register = async (
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ) => {
    const registerUrl = `${API_BASE}/api/register`;
    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim();

    try {
      logger.log('Register request start', {
        url: registerUrl,
        username: trimmedUsername,
        email: trimmedEmail,
      });

      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: trimmedUsername,
          email: trimmedEmail,
          password,
          confirm_password: confirmPassword,
        }),
      });

      if (!response.ok) {
        const message = await getResponseErrorMessage(
          response,
          'Registration failed',
        );
        logger.warn('Register request failed', {
          url: registerUrl,
          status: response.status,
          statusText: response.statusText,
          message,
        });
        throw new Error(message);
      }

      const data = await response.json();
      logger.log('Register request success', {
        url: registerUrl,
        status: response.status,
      });
      return { success: true, data };
    } catch (error) {
      logger.error('Registration error', {
        url: registerUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const login = async (usernameOrEmail: string, password: string) => {
    const loginUrl = `${API_BASE}/auth/local/login`;
    const identity = usernameOrEmail.trim();

    try {
      logger.log('Login request start', {
        url: loginUrl,
        user: identity,
        payloadType: 'application/x-www-form-urlencoded',
      });

      const formData = new URLSearchParams();
      formData.append('user', identity);
      formData.append('passwd', password);

      const response = await fetch(loginUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        const message = await getResponseErrorMessage(response, 'Login failed');
        logger.warn('Login request failed', {
          url: loginUrl,
          status: response.status,
          statusText: response.statusText,
          message,
        });
        throw new Error(message);
      }

      const loginData = await response
        .clone()
        .json()
        .catch(() => ({}));
      const resolvedUserId = String(loginData.id || identity).trim();
      const userData: User = {
        id: resolvedUserId,
        username: loginData.name || identity,
        email: identity.includes('@') ? identity : '',
        displayName: loginData.name || identity,
        avatar: loginData.picture,
      };

      await storageSet({ authUser: userData, userId: resolvedUserId });

      authState.value.isLoggedIn = true;
      authState.value.user = userData;

      let syncedByMessage = false;
      try {
        const syncResult = await runtimeSendMessage({
          type: 'LOGIN_SUCCESS',
          userId: resolvedUserId,
        });
        syncedByMessage = !!syncResult?.success;
        if (syncResult?.success === false) {
          logger.warn('Login sync message returned failure', {
            user: identity,
            response: syncResult,
          });
        }
      } catch (syncError) {
        logger.warn('Login sync message failed', {
          error:
            syncError instanceof Error ? syncError.message : String(syncError),
        });
      }

      if (!syncedByMessage) {
        try {
          await authManager.onLoginSuccess(resolvedUserId);
          logger.log('Login sync fallback succeeded in options context', {
            userId: resolvedUserId,
          });
        } catch (fallbackError) {
          logger.warn('Login sync fallback failed in options context', {
            userId: resolvedUserId,
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
        }
      }

      logger.log('Login request success', {
        url: loginUrl,
        status: response.status,
        user: identity,
      });

      return { success: true };
    } catch (error) {
      logger.error('Login error', {
        url: loginUrl,
        user: identity,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const logout = async () => {
    try {
      await storageRemove(['authUser', 'userId']);

      authState.value.isLoggedIn = false;
      authState.value.user = null;

      let syncedByMessage = false;
      try {
        const syncResult = await runtimeSendMessage({
          type: 'LOGOUT',
        });
        syncedByMessage = !!syncResult?.success;
        if (syncResult?.success === false) {
          logger.warn('Logout sync message returned failure', {
            response: syncResult,
          });
        }
      } catch (syncError) {
        logger.warn('Logout sync message failed', {
          error:
            syncError instanceof Error ? syncError.message : String(syncError),
        });
      }

      if (!syncedByMessage) {
        try {
          await authManager.onLogout();
          logger.log('Logout sync fallback succeeded in options context');
        } catch (fallbackError) {
          logger.warn('Logout sync fallback failed in options context', {
            error:
              fallbackError instanceof Error
                ? fallbackError.message
                : String(fallbackError),
          });
        }
      }

      return { success: true };
    } catch (error) {
      logger.error('Logout error', error);
      throw error;
    }
  };

  if (!hasInitializedAuthState) {
    hasInitializedAuthState = true;
    void checkAuthState();
  }

  return {
    isLoggedIn,
    user,
    login,
    register,
    logout,
    checkAuthState,
  };
}
