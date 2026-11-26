import { describe, expect, it } from 'vitest';
import { headline, moneyGroups, sparkPath } from '@/lib/headline';
import { filterBets, NO_FILTERS } from '@/lib/filters';
import { tabBets, tabDays } from '@/lib/view';
import { byMoney } from '@/lib/scope';
import { bet } from './helpers';

const real = () => byMoney(bets, 'real');
const today = '2026-11-25';
const bets = [
  bet({ result: 'won', stake: 100, odds: 2, gameDate: '2026-11-20' }),
  bet({ result: 'lost', stake: 50, gameDate: '2026-11-21' }),
  bet({ result: 'pending', stake: 30, gameDate: '2026-11-24' }), // to settle
  bet({ result: 'pending', stake: 20, gameDate: '2026-12-01' }), // upcoming
  bet({ result: 'won', stake: 10, odds: 3, money: 'hypothetical' }),
];

describe('BT-55 headline', () => {
  it('counts the filtered bets, the same whichever tab the table shows', () => {
    const filtered = filterBets(real(), { ...NO_FILTERS });
    const [g] = headline(filtered, 'real', false);
    expect(g!.summary.netProfit).toBe(50);
    expect(g!.summary.pendingCount).toBe(2);
    expect(g!.summary.pendingAmount).toBe(50);
    // a tab's bets would give different figures: the headline never takes them
    const settleTab = headline(tabBets(tabDays(filtered, 'settle', today)), 'real', false)[0]!;
    expect(settleTab.summary.netProfit).not.toBe(g!.summary.netProfit);
  });

  it('follows the filters', () => {
    const [g] = headline(filterBets(real(), { ...NO_FILTERS, result: 'lost' }), 'real', false);
    expect(g!.summary.netProfit).toBe(-50);
  });

  it('scope All: real and hypothetical side by side, never summed', () => {
    const groups = headline(bets, 'both', false);
    expect(groups.map((g) => [g.money, g.summary.netProfit])).toEqual([
      ['real', 50],
      ['hypothetical', 20],
    ]);
  });

  it('scope All without hypothetical bets: the real group alone; bonus bets count with real', () => {
    const groups = moneyGroups([bet({ money: 'bonus' }), bet()], 'both');
    expect(groups.map((g) => [g.money, g.bets.length])).toEqual([['real', 2]]);
  });

  it('units view: units when every bet has a unit size, money otherwise', () => {
    const withUnits = [bet({ result: 'won', stake: 100, odds: 2, unitSize: 50 })];
    expect(headline(withUnits, 'real', true)[0]).toMatchObject({ units: true, summary: { netProfit: 2 } });
    expect(headline([...withUnits, bet({ result: 'lost' })], 'real', true)[0]).toMatchObject({ units: false });
  });

  it('the sparkline follows cumulative profit', () => {
    expect(headline(real(), 'real', false)[0]!.curve).toEqual([100, 50]);
    expect(sparkPath([], 10, 10)).toBe('');
    expect(sparkPath([10, -10], 20, 20)).toBe('M0.0,10.0 L10.0,0.0 L20.0,20.0');
  });
});
