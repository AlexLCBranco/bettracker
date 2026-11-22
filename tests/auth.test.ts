import { describe, expect, it } from 'vitest';
import { accessMode, safeEqual, sessionToken } from '@/lib/auth';

describe('auth', () => {
  it('token is a stable hash that does not contain the password', async () => {
    const t = await sessionToken('hunter2');
    expect(t).toMatch(/^[0-9a-f]{64}$/);
    expect(t).toBe(await sessionToken('hunter2'));
    expect(t).not.toBe(await sessionToken('hunter3'));
    expect(t).not.toContain('hunter2');
  });
  it('safeEqual', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
  it('open in dev without a password, closed in production without one', () => {
    expect(accessMode({ NODE_ENV: 'development' })).toBe('open');
    expect(accessMode({ NODE_ENV: 'production' })).toBe('closed');
    expect(accessMode({ NODE_ENV: 'production', APP_PASSWORD: 'x' })).toBe('password');
  });
});
