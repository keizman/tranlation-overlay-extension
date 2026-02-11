import { browser } from 'wxt/browser';

export interface NativeControlResult {
  ok: boolean;
  supported: boolean;
  disabled?: boolean;
  error?: string;
}

export class AndroidAppNativeControlAdapter {
  private static readonly HOST_NAME = 'linguasurfAppBridge';
  private static readonly TYPE_SET = 'SET_SELECTION_BANNER_DISABLED';
  private static readonly TYPE_GET = 'GET_SELECTION_BANNER_DISABLED';
  private static readonly NATIVE_CALL_TIMEOUT_MS = 3000;

  async setSystemSelectionBannerDisabled(
    disabled: boolean,
  ): Promise<NativeControlResult> {
    if (!this.isNativeMessagingAvailable()) {
      return {
        ok: false,
        supported: false,
        disabled,
        error: 'native_messaging_unavailable',
      };
    }

    try {
      const response = await this.sendNativeMessage({
        type: AndroidAppNativeControlAdapter.TYPE_SET,
        disabled,
      });

      const ok = response?.ok === true;
      return {
        ok,
        supported: true,
        disabled:
          typeof response?.disabled === 'boolean'
            ? (response.disabled as boolean)
            : disabled,
        error:
          ok || typeof response?.error !== 'string'
            ? undefined
            : (response.error as string),
      };
    } catch (error) {
      return {
        ok: false,
        supported: false,
        disabled,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async getSystemSelectionBannerDisabled(): Promise<NativeControlResult> {
    if (!this.isNativeMessagingAvailable()) {
      return {
        ok: false,
        supported: false,
        error: 'native_messaging_unavailable',
      };
    }

    try {
      const response = await this.sendNativeMessage({
        type: AndroidAppNativeControlAdapter.TYPE_GET,
      });

      const ok = response?.ok === true;
      return {
        ok,
        supported: true,
        disabled:
          typeof response?.disabled === 'boolean'
            ? (response.disabled as boolean)
            : undefined,
        error:
          ok || typeof response?.error !== 'string'
            ? undefined
            : (response.error as string),
      };
    } catch (error) {
      return {
        ok: false,
        supported: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private isNativeMessagingAvailable(): boolean {
    return (
      typeof browser.runtime.connectNative === 'function' ||
      typeof browser.runtime.sendNativeMessage === 'function'
    );
  }

  private async sendNativeMessage(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    const connectNative = browser.runtime.connectNative;
    if (typeof connectNative === 'function') {
      try {
        return await this.sendViaConnectNative(payload);
      } catch {
        // Fallback to sendNativeMessage below.
      }
    }

    const sendNativeMessage = browser.runtime.sendNativeMessage;
    if (typeof sendNativeMessage !== 'function') {
      throw new Error('native_messaging_unavailable');
    }

    return (await sendNativeMessage(
      AndroidAppNativeControlAdapter.HOST_NAME,
      payload,
    )) as Record<string, unknown> | undefined;
  }

  private async sendViaConnectNative(
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    const port = browser.runtime.connectNative(
      AndroidAppNativeControlAdapter.HOST_NAME,
    );

    return await new Promise<Record<string, unknown> | undefined>(
      (resolve, reject) => {
        let settled = false;

        const cleanup = () => {
          port.onMessage.removeListener(onMessage);
          port.onDisconnect.removeListener(onDisconnect);
        };

        const finishResolve = (value: Record<string, unknown> | undefined) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          try {
            port.disconnect();
          } catch {
            // no-op
          }
          resolve(value);
        };

        const finishReject = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          try {
            port.disconnect();
          } catch {
            // no-op
          }
          reject(error);
        };

        const timer = setTimeout(() => {
          finishReject(new Error('native_messaging_timeout'));
        }, AndroidAppNativeControlAdapter.NATIVE_CALL_TIMEOUT_MS);

        const onMessage = (message: unknown) => {
          clearTimeout(timer);
          if (message && typeof message === 'object') {
            finishResolve(message as Record<string, unknown>);
            return;
          }
          finishResolve(undefined);
        };

        const onDisconnect = () => {
          if (settled) {
            return;
          }
          clearTimeout(timer);
          const runtimeErrorMessage =
            typeof browser.runtime.lastError?.message === 'string'
              ? browser.runtime.lastError.message
              : 'native_messaging_disconnected';
          finishReject(new Error(runtimeErrorMessage));
        };

        port.onMessage.addListener(onMessage);
        port.onDisconnect.addListener(onDisconnect);

        try {
          port.postMessage(payload);
        } catch (error) {
          clearTimeout(timer);
          finishReject(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      },
    );
  }
}
