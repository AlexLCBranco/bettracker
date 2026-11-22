// Single-password access. The password lives in the APP_PASSWORD env var; logging in sets a cookie holding a
// SHA-256 of it (so the cookie never contains the password and changing the password logs every browser out).
// Without APP_PASSWORD the app is open in development and closed in production.

export const SESSION_COOKIE = 'bt_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

export async function sessionToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`bettracker-session:v1:${password}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type AccessMode = 'open' | 'password' | 'closed';

export function accessMode(env: { APP_PASSWORD?: string; NODE_ENV?: string }): AccessMode {
  if (env.APP_PASSWORD) return 'password';
  return env.NODE_ENV === 'production' ? 'closed' : 'open';
}
