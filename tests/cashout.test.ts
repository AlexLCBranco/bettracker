// BT-34: the cash-out box reads an amount or a percentage of the full payout (stake × odds).
import { describe, expect, it } from 'vitest';
import { cashoutLabel, cashoutLine, cashoutPercent, formatPct, readCashout } from '@/lib/cashout';

describe('readCashout: amounts', () => {
  it('a plain amount is the money returned', () => expect(readCashout('140', 'amount', 100, 2)).toEqual({ amount: 140, percent: 70, fullPayout: 200, profit: 40 }));
  it('comma decimals', () => expect(readCashout('140,50', 'amount', 100, 2)?.amount).toBe(140.5));
  it('dot decimals and an R$ prefix', () => expect(readCashout('R$ 60.25', 'amount', 100, 2)).toMatchObject({ amount: 60.25, profit: -39.75 }));
  it('empty or unreadable text reads nothing', () => {
    expect(readCashout('', 'amount', 100, 2)).toBeNull();
    expect(readCashout('  ', 'percent', 100, 2)).toBeNull();
    expect(readCashout('abc', 'amount', 100, 2)).toBeNull();
    expect(readCashout('-5', 'amount', 100, 2)).toBeNull();
    expect(readCashout('%', 'amount', 100, 2)).toBeNull();
  });
});

describe('readCashout: percentages of the full payout', () => {
  it('"70%" is 70% of stake × odds', () => expect(readCashout('70%', 'amount', 100, 2)).toEqual({ amount: 140, percent: 70, fullPayout: 200, profit: 40 }));
  it('the % sign wins over the R$ toggle', () => expect(readCashout('50%', 'amount', 10, 3)?.amount).toBe(15));
  it('the % toggle reads a bare number as a percentage', () => expect(readCashout('70', 'percent', 100, 2)?.amount).toBe(140));
  it('comma decimals and spaces in a percentage', () => expect(readCashout('70,5 %', 'amount', 100, 2)).toMatchObject({ amount: 141, percent: 70.5 }));
  it('rounds the amount to cents', () => expect(readCashout('33%', 'amount', 10, 1.85)?.amount).toBe(6.11));
});

describe('both conversions', () => {
  it('amount → percentage of the full payout', () => {
    expect(cashoutPercent(140, 100, 2)).toBe(70);
    expect(cashoutPercent(50, 0, 2)).toBeNull();
  });
  it('percentage → amount → the same percentage', () => {
    const r = readCashout('42%', 'amount', 37, 2.4)!;
    expect(cashoutPercent(r.amount, 37, 2.4)).toBeCloseTo(42, 1);
  });
  it('formats percentages with at most 2 decimals', () => {
    expect(formatPct(70)).toBe('70%');
    expect(formatPct(70.5)).toBe('70.5%');
    expect(formatPct(100 / 3)).toBe('33.33%');
  });
});

describe('shown text', () => {
  it('the line under the box shows both values', () =>
    expect(cashoutLine(readCashout('70%', 'amount', 100, 2)!, 'real')).toBe('R$ 140,00 returned · 70% of full payout (R$ 200,00)'));
  it('in the bet’s own money', () => expect(cashoutLine(readCashout('140', 'amount', 100, 2)!, 'hypothetical')).toBe('H$ 140,00 returned · 70% of full payout (H$ 200,00)'));
  it('the result label of a cashed-out bet', () => expect(cashoutLabel(140, 100, 2, 'real')).toBe('Cash-out · R$ 140,00 (70%)'));
});
