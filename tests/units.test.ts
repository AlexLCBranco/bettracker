// BT-38: units. Parsing "1u" stakes, converting with the unit size per money type, and counting in units.
import { describe, expect, it } from 'vitest';
import { bet } from './helpers';
import { readCashout } from '@/lib/cashout';
import { formToBet, newForm } from '@/lib/form';
import { parseQuickAdd } from '@/lib/quickadd';
import { summarize } from '@/lib/stats';
import { dayGroups } from '@/lib/table';
import { groupRows } from '@/lib/dutch';
import { asUnitBets, formatUnits, parseStakeText, readStake, readUnitSizes, toUnits, unitsToMoney, type UnitSizes } from '@/lib/units';
import { validateBet } from '@/lib/validate';
import { wouldaFigure } from '@/lib/woulda';

const sizes: UnitSizes = { real: 100, bonus: null, hypothetical: 50 };

describe('parsing a stake', () => {
  it('units: 1u, 0,5u, 2.5U, H$2u', () => {
    expect(parseStakeText('1u')).toEqual({ value: 1, units: true });
    expect(parseStakeText('0,5u')).toEqual({ value: 0.5, units: true });
    expect(parseStakeText('2.5U')).toEqual({ value: 2.5, units: true });
    expect(parseStakeText('H$2u')).toEqual({ value: 2, units: true, money: 'hypothetical' });
  });

  it('plain numbers stay money, as before', () => {
    expect(parseStakeText('150')).toEqual({ value: 150, units: false });
    expect(parseStakeText('150,50')).toEqual({ value: 150.5, units: false });
    expect(parseStakeText('R$ 150')).toEqual({ value: 150, units: false, money: 'real' });
  });

  it('anything else is no stake ("25 pts", "u", "1uu")', () => {
    for (const t of ['25 pts', 'u', '1uu', '', '1 u x']) expect(parseStakeText(t)).toBeNull();
  });

  it('converts with the unit size of the money type; none set → a clear message', () => {
    expect(readStake('1,5u', 'real', sizes)).toEqual({ ok: true, amount: 150, money: 'real', units: 1.5 });
    expect(readStake('H$2u', 'real', sizes)).toEqual({ ok: true, amount: 100, money: 'hypothetical', units: 2 });
    expect(readStake('100', 'real', sizes)).toEqual({ ok: true, amount: 100, money: 'real', units: null });
    expect(readStake('B$1u', 'real', sizes)).toEqual({ ok: false, error: 'No unit size for B$: set it on the Bankroll page', money: 'bonus' });
    expect(unitsToMoney(1, 'bonus', sizes).ok).toBe(false);
  });
});

describe('the quick-add line', () => {
  it('"1,5u @2 lakers" is a stake of 1,5 units; "25 pts" in the text is untouched', () => {
    expect(parseQuickAdd('1,5u @2 lakers ml')).toMatchObject({ ok: true, stake: 1.5, units: true, betText: 'lakers ml' });
    expect(parseQuickAdd('H$2u @1.9 over 25 pts')).toMatchObject({ ok: true, stake: 2, units: true, money: 'hypothetical', betText: 'over 25 pts' });
    const plain = parseQuickAdd('150 @2 lakers');
    expect(plain).toMatchObject({ ok: true, stake: 150 });
    expect(plain).not.toHaveProperty('units');
  });
});

describe('the bet form', () => {
  const f = { ...newForm({ book: '', sport: '', type: 'solo', situation: 'pregame', money: 'real' } as never), odds: '2', selection: 'x' };
  it('a stake in units is saved as money; no unit size → the error, nothing saved', () => {
    expect(formToBet({ ...f, stake: '1,5u' }, '2026-11-24', sizes)).toMatchObject({ ok: true, value: { stake: 150, money: 'real' } });
    expect(formToBet({ ...f, stake: 'H$2u' }, '2026-11-24', sizes)).toMatchObject({ ok: true, value: { stake: 100, money: 'hypothetical' } });
    expect(formToBet({ ...f, stake: '1u', money: 'bonus' }, '2026-11-24', sizes)).toEqual({ ok: false, error: 'No unit size for B$: set it on the Bankroll page' });
    expect(formToBet({ ...f, stake: '100' }, '2026-11-24')).toMatchObject({ ok: true, value: { stake: 100 } });
  });
});

describe('the cash-out box', () => {
  it('"1,45u" is units of the bet\'s unit size', () => {
    expect(readCashout('1,45u', 'amount', 100, 1.88, 100)).toMatchObject({ amount: 145, profit: 45, units: 1.45 });
    expect(readCashout('1,45u', 'amount', 100, 1.88, null)).toBeNull();
  });
});

describe('showing units', () => {
  it('up to 2 decimals, trailing zeros dropped, comma decimals', () => {
    expect(formatUnits(1)).toBe('1u');
    expect(formatUnits(0.45, true)).toBe('+0,45u');
    expect(formatUnits(1.45)).toBe('1,45u');
    expect(formatUnits(12.3, true)).toBe('+12,3u');
    expect(formatUnits(-1, true)).toBe('-1u');
    expect(formatUnits(1 / 3)).toBe('0,33u');
  });

  it('a bet keeps the unit size it was placed with: old and new bets after a unit-size change', () => {
    const old = bet({ stake: 100, odds: 1.45, result: 'won', unitSize: 100 });
    const placedAfter = bet({ stake: 100, odds: 1.45, result: 'won', unitSize: 200 });
    const before = bet({ stake: 100, odds: 1.45, result: 'won', unitSize: null });
    expect(toUnits(old.stake, old.unitSize)).toBe(1);
    expect(toUnits(placedAfter.stake, placedAfter.unitSize)).toBe(0.5);
    // older bets (no unit size) stay money
    expect(toUnits(before.stake, before.unitSize)).toBeNull();
  });

  it('stake 100 @ 1.88 cashed out at 145 with 1u = 100: 1u, +0,45u, 1,45u, left 0,43u', () => {
    const b = bet({ stake: 100, odds: 1.88, result: 'cash-out', cashout: 145, unitSize: 100, wouldHave: 'won' });
    const [u] = asUnitBets([b])!;
    expect(u).toMatchObject({ stake: 1, cashout: 1.45 });
    expect(wouldaFigure(u!)).toEqual({ kind: 'won', amount: 0.43 });
  });

  it('Analytics / stats in units; ROI and win rate unchanged; null when a bet has no unit size or types mix', () => {
    const bets = [bet({ stake: 100, odds: 2, result: 'won', unitSize: 100 }), bet({ stake: 50, odds: 3, result: 'lost', unitSize: 100 }), bet({ stake: 200, odds: 1.5, result: 'pending', unitSize: 100 })];
    const money = summarize(bets);
    const units = summarize(asUnitBets(bets)!);
    expect(units).toMatchObject({ netProfit: 0.5, totalWagered: 3.5, pendingAmount: 2, roi: money.roi, winRate: money.winRate, betCount: 3 });
    expect(asUnitBets([...bets, bet({ unitSize: null })])).toBeNull();
    expect(asUnitBets([bets[0]!, bet({ unitSize: 50, money: 'hypothetical' })])).toBeNull();
    expect(asUnitBets([])).toBeNull();
  });

  it('day totals carry the units net when every bet of that money has a unit size', () => {
    const days = dayGroups(groupRows([bet({ stake: 100, odds: 2, result: 'won', unitSize: 100 }), bet({ stake: 50, odds: 2, result: 'lost', unitSize: 100 })]));
    expect(days[0]!.nets).toEqual([{ money: 'real', value: 50, units: 0.5 }]);
  });
});

describe('storing', () => {
  it('validation keeps a unit size above 0', () => {
    const base = { book: 'b', placedDate: '2026-11-24', type: 'solo', situation: 'pregame', stake: 100, odds: 2, result: 'pending', legs: [] };
    expect(validateBet({ ...base, unitSize: 100 })).toMatchObject({ ok: true, value: { unitSize: 100 } });
    expect(validateBet(base)).toMatchObject({ ok: true, value: { unitSize: null } });
    expect(validateBet({ ...base, unitSize: 0 }).ok).toBe(false);
  });

  it('stored unit sizes: only amounts above 0', () => {
    expect(readUnitSizes({ real: 100, bonus: -1, hypothetical: 'x' })).toEqual({ real: 100, bonus: null, hypothetical: null });
    expect(readUnitSizes(null)).toEqual({ real: null, bonus: null, hypothetical: null });
  });
});
