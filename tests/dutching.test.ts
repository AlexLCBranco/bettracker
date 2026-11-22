import { describe, expect, it } from 'vitest';
import { dutch, type DutchResult } from '@/lib/dutching';

const ok = (r: ReturnType<typeof dutch>): DutchResult => {
  if ('error' in r) throw new Error(r.error);
  return r;
};
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

describe('dutch', () => {
  it('equal odds split equally; every selection returns the same', () => {
    const r = ok(dutch(90, [6, 6, 6]));
    expect(r.stakes).toEqual([30, 30, 30]);
    expect(r.returns).toEqual([180, 180, 180]);
    expect(r).toMatchObject({ minProfit: 90, maxProfit: 90 });
    expect(r.combinedOdds).toBeCloseTo(2);
  });

  it('lower odds get more stake; stakes add up to the total exactly', () => {
    // book = 1/2 + 1/4 = 0.75 → return 133.33; stakes 66.67 and 33.33
    const r = ok(dutch(100, [2, 4]));
    expect(r.stakes).toEqual([66.67, 33.33]);
    expect(sum(r.stakes)).toBe(100);
    expect(r.returns).toEqual([133.34, 133.32]);
    expect(r.minProfit).toBe(33.32);
    expect(r.book).toBeCloseTo(0.75);
  });

  it('awkward odds: rounding never loses or adds a centavo, and returns stay within one rounding step', () => {
    for (const odds of [[2.1, 3.4, 4.75], [1.85, 1.95], [3.3, 3.3, 3.3, 7.5, 12]]) {
      const r = ok(dutch(137.5, odds));
      expect(sum(r.stakes)).toBe(137.5);
      expect(r.maxReturn - r.minReturn).toBeLessThanOrEqual(Math.max(...odds) * 0.01 + 1e-9);
    }
  });

  it('whole-real rounding keeps the total and favours the selection returning least', () => {
    const r = ok(dutch(100, [2, 4], 1));
    expect(r.stakes).toEqual([67, 33]); // 66.67/33.33 → 66+33=99, the extra real goes to 2.00 (132 < 133)
    expect(sum(r.stakes)).toBe(100);
    expect(r.returns).toEqual([134, 132]);
  });

  it('odds adding up to over 100% lose whichever wins', () => {
    const r = ok(dutch(100, [1.8, 1.8]));
    expect(r.book).toBeGreaterThan(1);
    expect(r.minProfit).toBe(-10);
  });

  it('refuses a missing stake, fewer than two selections, or odds of 1.00 or less', () => {
    expect(dutch(0, [2, 3])).toEqual({ error: 'stake' });
    expect(dutch(NaN, [2, 3])).toEqual({ error: 'stake' });
    expect(dutch(100, [2])).toEqual({ error: 'too-few' });
    expect(dutch(100, [2, 1])).toEqual({ error: 'odds' });
    expect(dutch(100, [2, NaN])).toEqual({ error: 'odds' });
  });
});
