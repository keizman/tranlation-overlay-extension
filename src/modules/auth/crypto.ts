import { AuthConfig } from './config';

const CLIENT_SECRET = AuthConfig.clientSecret;

export function generateInitSalt(
  extensionId: string,
  timestamp: number,
): Promise<string> {
  const truncatedTs = timestamp.toString().slice(0, -2);
  const payload = `${extensionId}|${truncatedTs}`;
  return hmacSHA256(payload, CLIENT_SECRET).then((hash) =>
    hash.substring(0, 32),
  );
}

export function generateNonce(length: number = 16): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

type QueryParamsLike =
  | URLSearchParams
  | string
  | Record<string, unknown>
  | Iterable<[string, unknown]>;

function toQueryEntries(params: QueryParamsLike): Array<[string, string]> {
  if (params instanceof URLSearchParams) {
    const entries: Array<[string, string]> = [];
    params.forEach((value, key) => {
      entries.push([key, value]);
    });
    return entries;
  }

  if (typeof params === 'string') {
    return toQueryEntries(new URLSearchParams(params));
  }

  if (params && typeof params === 'object') {
    const maybeForEach = (
      params as {
        forEach?: (callback: (value: unknown, key: string) => void) => void;
      }
    ).forEach;
    if (typeof maybeForEach === 'function') {
      const entries: Array<[string, string]> = [];
      maybeForEach.call(params, (value: unknown, key: string) => {
        entries.push([String(key), String(value ?? '')]);
      });
      if (entries.length > 0) {
        return entries;
      }
    }

    const maybeEntries = (params as { entries?: () => unknown }).entries;
    if (typeof maybeEntries === 'function') {
      const entryResult = maybeEntries.call(params);
      if (entryResult && Symbol.iterator in Object(entryResult)) {
        return Array.from(entryResult as Iterable<[string, unknown]>).map(
          ([key, value]) => [String(key), String(value ?? '')],
        );
      }
    }
    return Object.entries(params).map(([key, value]) => [
      key,
      String(value ?? ''),
    ]);
  }

  return [];
}

export function sortQueryParams(params: QueryParamsLike): string {
  const sorted = toQueryEntries(params).sort((a, b) => {
    const keyCompare = a[0].localeCompare(b[0]);
    if (keyCompare !== 0) return keyCompare;
    return a[1].localeCompare(b[1]);
  });

  return sorted.map(([k, v]) => `${k}=${v}`).join('&');
}

export async function sha256Hex(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return bufferToHex(hashBuffer);
}

export async function hmacSHA256(
  message: string,
  key: string,
): Promise<string> {
  const keyData = new TextEncoder().encode(key);
  const msgData = new TextEncoder().encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return bufferToHex(signature);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
