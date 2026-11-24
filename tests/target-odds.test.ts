import { describe, expect, it } from 'vitest';
import { combinedOdds, dutch, formatAmerican, solveTarget } from '@/lib/dutching';
import { parseOdds } from '@/lib/money';

const dec = (t: string) => parseOdds(t, 'auto')!.decimal;

describe('solveTarget (BT-40)', () => {
  it('the owner example: +280 known, target 1.6 → 2.76 (+176); 100 splits 42.11 / 57.89, both return 160', () => {
    const r = solveTarget([dec('+280')], 1.6);
    if (!r.ok) throw new Error(r.error);
    expect(r.needed.toFixed(2)).toBe('2.76');
    expect(formatAmerican(r.needed)).toBe('+176');
    const d = dutch(100, [3.8, r.needed]);
    if ('error' in d) throw new Error(d.error);
    expect(d.stakes).toEqual([42.11, 57.89]);
    expect(d.minReturn).toBeCloseTo(160, 0);
    expect(d.maxReturn).toBeCloseTo(160, 0);
    expect(combinedOdds([3.8, r.needed])).toBeCloseTo(1.6, 10);
  });

  it('three splits with one missing', () => {
    const r = solveTarget([4, 5], 1.5);
    if (!r.ok) throw new Error(r.error);
    // 1/1.5 − 1/4 − 1/5 = 0.21667 → 4.615
    expect(r.needed).toBeCloseTo(1 / (1 / 1.5 - 0.25 - 0.2), 10);
    expect(combinedOdds([4, 5, r.needed])).toBeCloseTo(1.5, 10);
  });

  it('American and decimal known odds mixed', () => {
    const r = solveTarget([dec('+150'), dec('3.0')], 1.1);
    if (!r.ok) throw new Error(r.error);
    expect(r.needed).toBeCloseTo(1 / (1 / 1.1 - 1 / 2.5 - 1 / 3), 10);
  });

  it('impossible target: at or above the known splits alone → too-high with the limit, never NaN or Infinity', () => {
    for (const target of [3.8, 5]) {
      const r = solveTarget([3.8], target);
      expect(r).toMatchObject({ ok: false, error: 'too-high' });
      expect((r as { limit: number }).limit).toBeCloseTo(3.8, 10);
    }
    const two = solveTarget([4, 4], 2);
    expect(two).toMatchObject({ ok: false, error: 'too-high' });
    expect((two as { limit: number }).limit).toBeCloseTo(2);
  });

  it('any target above 1 below the limit is solvable, even one just above 1', () => {
    const r = solveTarget([2], 1.01);
    expect(r.ok && r.needed > 1 && Number.isFinite(r.needed)).toBe(true);
  });

  it('bad input: no known splits or no target', () => {
    expect(solveTarget([], 1.6)).toEqual({ ok: false, error: 'known' });
    expect(solveTarget([2], NaN)).toEqual({ ok: false, error: 'target' });
    expect(solveTarget([2], 1)).toEqual({ ok: false, error: 'target' });
  });
});

describe('formatAmerican', () => {
  it('converts both sides of evens', () => {
    expect(formatAmerican(3.8)).toBe('+280');
    expect(formatAmerican(2)).toBe('+100');
    expect(formatAmerican(1.5)).toBe('-200');
    expect(formatAmerican(1)).toBe('');
  });
});
