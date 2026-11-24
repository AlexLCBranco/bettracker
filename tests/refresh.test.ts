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

describe('writes go one after another (the live server may apply overlapping requests in any order)', () => {
  it('a second write is not sent until the first has answered, even when the first fails', async () => {
    const g = refreshGate();
    const d = deferred();
    const order: string[] = [];
    const a = g.write(async () => {
      order.push('a sent');
      await d.p;
      order.push('a answered');
      throw new Error('refused');
    });
    const b = g.write(async () => {
      order.push('b sent');
      return 'b';
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['a sent']);
    expect(g.begin()).toBeNull();
    d.resolve();
    await expect(a).rejects.toThrow('refused');
    await expect(b).resolves.toBe('b');
    expect(order).toEqual(['a sent', 'a answered', 'b sent']);
  });
});
