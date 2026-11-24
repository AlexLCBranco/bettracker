// BT-41: dutch split stats on Analytics.
import { describe, expect, it } from 'vitest';
import { dutchCombinedOdds, dutchStats, splitPositions } from '@/lib/dutchStats';
import { bet, dutchBets } from './helpers';

describe('dutchCombinedOdds', () => {
  it('is 1 / Σ(1/odds), a combination split by its total odds', () => {
    expect(dutchCombinedOdds([{ odds: 3.8 }, { odds: 1 / (1 / 1.6 - 1 / 3.8) }])).toBeCloseTo(1.6, 10);
    expect(dutchCombinedOdds([{ odds: 2 }, { odds: 2 }])).toBeCloseTo(1);
  });
});

describe('splitPositions', () => {
  it('lowest, middle, highest by odds', () => {
    expect(splitPositions([3, 1.5, 6, 4])).toEqual(['middle', 'lowest', 'highest', 'middle']);
  });
  it('a two-split dutch has no middle', () => {
    expect(splitPositions([2.5, 1.8])).toEqual(['highest', 'lowest']);
  });
  it('ties share the lower position', () => {
    expect(splitPositions([2, 2])).toEqual(['lowest', 'lowest']);
    expect(splitPositions([2, 3, 3])).toEqual(['lowest', 'middle', 'middle']);
    expect(splitPositions([2, 2, 3])).toEqual(['lowest', 'lowest', 'highest']);
  });
});

describe('dutchStats', () => {
  it('empty: nothing settled, ratios null (shown "-"), never NaN', () => {
    const s = dutchStats([bet({ result: 'won' })]);
    expect(s).toMatchObject({ settled: 0, roi: null, winRate: null, averageOdds: null, splitHitRate: null, positions: [], bySplits: [], byOdds: [] });
    expect(JSON.stringify(s)).not.toContain('NaN');
  });

  it('money tiles count settled dutches only, a dutch as one bet; split record and which split hits', () => {
    const won = dutchBets('a', [
      { odds: 2, stake: 60, result: 'won' }, // +60
      { odds: 4, stake: 40, result: 'lost' }, // −40 → net +20, a win
    ]);
    const lost = dutchBets('b', [
      { odds: 3, stake: 50, result: 'lost' },
      { odds: 3, stake: 50, result: 'lost' },
      { odds: 5, stake: 20, result: 'void' },
    ]);
    const open = dutchBets('c', [
      { odds: 2, stake: 10, result: 'pending' },
      { odds: 2, stake: 10, result: 'won' },
    ]);
    const s = dutchStats([...won, ...lost, ...open, bet({ result: 'won' })]);
    expect(s).toMatchObject({ settled: 2, pending: 1, wins: 1, losses: 1, winRate: 0.5, wagered: 220, profit: -80 });
    expect(s.roi).toBeCloseTo(-80 / 220);
    expect(s.averageOdds).toBeCloseTo((1 / (1 / 2 + 1 / 4) + 1 / (1 / 3 + 1 / 3 + 1 / 5)) / 2);
    expect(s).toMatchObject({ splitHits: 1, splitMisses: 3, splitHitRate: 0.25 });
    // dutch a: 2 lowest (hit), 4 highest (miss); dutch b: the 3s tie at lowest (miss, miss), 5 void (left out)
    expect(s.positions).toEqual([
      { key: 'lowest', label: 'Lowest-odds split', splits: 3, hit: 1, hitRate: 1 / 3, averageOdds: (2 + 3 + 3) / 3, profitWhenHit: 20 },
      { key: 'highest', label: 'Highest-odds split', splits: 1, hit: 0, hitRate: 0, averageOdds: 4, profitWhenHit: 0 },
    ]);
    // by number of splits: the pending dutch counts in bets and wagered
    expect(s.bySplits.map((r) => [r.label, r.bets, r.pending, r.wagered, r.profit, r.wins, r.losses])).toEqual([
      ['2 splits', 2, 1, 120, 20, 1, 0],
      ['3 splits', 1, 0, 120, -100, 0, 1],
    ]);
    // combined odds 1.33, 1.15 and 1.00: one range
    expect(s.byOdds.map((r) => [r.label, r.bets])).toEqual([['1.01–1.49', 3]]);
  });
});
