// BT-7: "If this many win" outcome table.
import { describe, expect, it } from 'vitest';
import { dutch, outcomeTable, type DutchResult } from '@/lib/dutching';

const ok = (r: ReturnType<typeof dutch>): DutchResult => {
  if ('error' in r) throw new Error(r.error);
  return r;
};

describe('outcomeTable', () => {
  it('2 equal splits: one number per row, 0 to 2 wins', () => {
    const rows = outcomeTable(100, [50, 50], [2, 2]);
    expect(rows.map((r) => [r.wins, r.minReturn, r.maxReturn, r.minProfit, r.maxProfit, r.minRoi, r.maxRoi])).toEqual([
      [0, 0, 0, -100, -100, -1, -1],
      [1, 100, 100, 0, 0, 0, 0],
      [2, 200, 200, 100, 100, 1, 1],
    ]);
  });

  it('3 splits with different returns: k lowest to k highest as a range', () => {
    // returns 120, 120, 105
    const rows = outcomeTable(100, [40, 30, 30], [3, 4, 3.5]);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toMatchObject({ wins: 1, minReturn: 105, maxReturn: 120, minProfit: 5, maxProfit: 20 });
    expect(rows[1]!.minRoi).toBeCloseTo(0.05, 10);
    expect(rows[1]!.maxRoi).toBeCloseTo(0.2, 10);
    expect(rows[2]).toMatchObject({ wins: 2, minReturn: 225, maxReturn: 240, minProfit: 125, maxProfit: 140 });
    expect(rows[3]).toMatchObject({ wins: 3, minReturn: 345, maxReturn: 345, minProfit: 245, maxProfit: 245 });
  });

  it('rounding to R$ 1: 1 win matches the dutch min / max return, all wins the sum of every return', () => {
    const d = ok(dutch(100, [2.9, 3.1, 3.7], 1));
    expect(d.stakes.every((s) => Number.isInteger(s))).toBe(true);
    const rows = outcomeTable(100, d.stakes, [2.9, 3.1, 3.7]);
    expect(rows[1]).toMatchObject({ minReturn: d.minReturn, maxReturn: d.maxReturn, minProfit: d.minProfit, maxProfit: d.maxProfit });
    const all = Math.round(d.returns.reduce((a, b) => a + b, 0) * 100) / 100;
    expect(rows[3]).toMatchObject({ minReturn: all, maxReturn: all });
  });

  it('a "Shared leg loses" row on top only when there are shared legs, same numbers as 0 wins', () => {
    expect(outcomeTable(100, [50, 50], [2, 2]).some((r) => r.wins === 'shared')).toBe(false);
    const rows = outcomeTable(100, [50, 50], [2, 2], true);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ wins: 'shared', minReturn: 0, maxReturn: 0, minProfit: -100, maxProfit: -100, minRoi: -1 });
    expect(rows[1]!.wins).toBe(0);
  });

  it('break-even: only the first row whose profit is above 0 whichever selections win', () => {
    // returns 120, 120, 105: 1 win is already a profit
    expect(outcomeTable(100, [40, 30, 30], [3, 4, 3.5]).map((r) => r.breakEven)).toEqual([false, true, false, false]);
    // exactly 0 at 1 win is not a profit: break-even from 2
    expect(outcomeTable(100, [50, 50], [2, 2], true).map((r) => r.breakEven)).toEqual([false, false, false, true]);
    // 3 splits at 1.6 (returns 48): 1 win loses, 2 wins profit
    expect(outcomeTable(90, [30, 30, 30], [1.6, 1.6, 1.6]).find((r) => r.breakEven)!.wins).toBe(2);
    // a range that is only partly positive is not break-even yet (returns 50 – 150 at 1 win)
    expect(outcomeTable(100, [25, 75], [2, 2]).find((r) => r.breakEven)!.wins).toBe(2);
  });
});
