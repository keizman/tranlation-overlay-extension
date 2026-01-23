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

export function sortQueryParams(params: URLSearchParams): string {
  const sorted = [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]));
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
