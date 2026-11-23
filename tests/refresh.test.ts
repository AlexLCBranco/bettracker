// Reload on focus: a reload's result never overwrites a write the page made meanwhile.
import { describe, expect, it } from 'vitest';
import { refreshGate } from '@/lib/refresh';

const deferred = () => {
  let resolve!: () => void;
  const p = new Promise<void>((r) => (resolve = r));
  return { p, resolve };
};

describe('refreshGate', () => {
  it('no writes: the reload applies', () => {
    const g = refreshGate();
    expect(g.canApply(g.begin())).toBe(true);
  });

  it('a write in flight when the reload starts: skipped', async () => {
    const g = refreshGate();
    const d = deferred();
    const w = g.write(() => d.p);
    expect(g.begin()).toBeNull();
    d.resolve();
    await w;
    expect(g.canApply(g.begin())).toBe(true);
  });

  it('a write that starts while the reload runs: the reload is dropped, even after the write ends', async () => {
    const g = refreshGate();
    const t = g.begin();
    await g.write(async () => 'ok');
    expect(g.canApply(t)).toBe(false);
  });

  it('a failed write still ends (later reloads apply) and its error is passed on', async () => {
    const g = refreshGate();
    await expect(g.write(() => Promise.reject(new Error('500')))).rejects.toThrow('500');
    expect(g.canApply(g.begin())).toBe(true);
  });
});
