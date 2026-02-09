import type { NetworkPolicyPort, NetworkRequest } from '../../../core/ports';

const DEFAULT_RETRY_DELAY_MS = 350;

function shouldRetryStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BrowserNetworkPolicyAdapter implements NetworkPolicyPort {
  async request(request: NetworkRequest): Promise<Response> {
    const retries = Math.max(0, request.retries ?? 0);

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      try {
        const controller =
          request.timeoutMs && request.timeoutMs > 0
            ? new AbortController()
            : null;

        if (controller && request.signal) {
          const forwardAbort = () => controller.abort();
          request.signal.addEventListener('abort', forwardAbort, {
            once: true,
          });
        }

        if (controller && request.timeoutMs) {
          timeoutId = setTimeout(() => controller.abort(), request.timeoutMs);
        }

        const response = await fetch(request.url, {
          method: request.method || 'GET',
          headers: request.headers,
          body: request.body,
          signal: controller?.signal || request.signal,
        });

        if (timeoutId) clearTimeout(timeoutId);

        const shouldRetry = shouldRetryStatus(response.status);
        if (!shouldRetry || attempt >= retries) {
          return response;
        }
      } catch (error) {
        if (timeoutId) clearTimeout(timeoutId);
        lastError = error;

        if (attempt >= retries) {
          throw error;
        }
      }

      const delay =
        (request.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS) * (attempt + 1);
      await sleep(delay);
    }

    throw (
      lastError || new Error('Network request failed without specific error')
    );
  }
}
