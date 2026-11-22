import { describe, expect, it } from 'vitest';
import { latestGate } from '@/lib/latest';

describe('latestGate', () => {
  it('only the newest request per key counts, so a late older response is ignored', () => {
    const g = latestGate();
    const first = g.begin('bet-1');
    const second = g.begin('bet-1');
    const other = g.begin('bet-2');
    expect(g.isLatest('bet-1', first)).toBe(false);
    expect(g.isLatest('bet-1', second)).toBe(true);
    expect(g.isLatest('bet-2', other)).toBe(true);
  });
});
