import { describe, expect, it } from 'vitest';
import { breakdown, comboReport, MIXED, NOT_SET, oddsRange } from '@/lib/analytics';
import { bet, leg } from './helpers';

describe('breakdown', () => {
  it('groups by sport case- and accent-insensitively, labelled with the most recent spelling', () => {
    const rows = breakdown(
      [
        bet({ legs: [leg({ sport: 'Fútbol' })], stake: 100, odds: 2, result: 'won' }),
        bet({ legs: [leg({ sport: 'futbol' })], stake: 50, odds: 3, result: 'lost' }),
        bet({ legs: [leg({ sport: 'Tennis' })], stake: 20, result: 'pending' }),
      ],
      'sport',
    );
    expect(rows.map((r) => r.label)).toEqual(['Fútbol', 'Tennis']);
    expect(rows[0]).toMatchObject({ bets: 2, wagered: 150, settledStake: 150, profit: 50, wins: 1, losses: 1, winRate: 0.5 });
    expect(rows[0]!.roi).toBeCloseTo(50 / 150);
  });

  it('pending-only groups have no ROI or win rate (shown as "-", never NaN)', () => {
    const [r] = breakdown([bet({ book: 'Betano', stake: 30, result: 'pending' })], 'book');
    expect(r).toMatchObject({ label: 'Betano', bets: 1, pending: 1, wagered: 30, profit: 0, roi: null, winRate: null });
  });

  it('combinations with legs of different sports are "Mixed"; no legs or blank is "Not set"', () => {
    const rows = breakdown(
      [
        bet({ type: 'combination', legs: [leg({ sport: 'Basketball' }), leg({ sport: 'Football' })] }),
        bet({ type: 'combination', legs: [] }),
        bet({ legs: [leg({ sport: '  ' })] }),
        bet({ type: 'combination', legs: [leg({ sport: 'Basketball' }), leg({ sport: 'basketball' })] }),
      ],
      'sport',
    );
    expect(rows.map((r) => [r.label, r.bets])).toEqual([[NOT_SET, 2], ['Basketball', 1], [MIXED, 1]]);
  });

  it('odds ranges use the total odds, edges go up, and keep their natural order', () => {
    expect([1.01, 1.49, 1.5, 1.99, 2, 2.99, 3, 4.99, 5, 30].map(oddsRange)).toEqual([
      '1.01–1.49', '1.01–1.49', '1.50–1.99', '1.50–1.99', '2.00–2.99', '2.00–2.99', '3.00–4.99', '3.00–4.99', '5.00+', '5.00+',
    ]);
    const rows = breakdown([bet({ odds: 6 }), bet({ odds: 6 }), bet({ odds: 1.3 })], 'odds');
    expect(rows.map((r) => r.label)).toEqual(['1.01–1.49', '5.00+']);
  });

  it('half results, voids and cash-outs count in profit but not in W/L', () => {
    const [r] = breakdown(
      [
        bet({ situation: 'live', stake: 100, odds: 2, result: 'half-won' }),
        bet({ situation: 'live', stake: 100, odds: 2, result: 'void' }),
        bet({ situation: 'live', stake: 100, odds: 2, result: 'cash-out', cashout: 80 }),
      ],
      'situation',
    );
    expect(r).toMatchObject({ label: 'Live', profit: 50 + 0 - 20, wins: 0, losses: 0, winRate: null, settledStake: 300 });
  });

  it('type and situation get readable labels; no bets gives no rows', () => {
    expect(breakdown([bet({ type: 'combination', legs: [] }), bet()], 'type').map((r) => r.label).sort()).toEqual(['Combination', 'Solo']);
    expect(breakdown([], 'market')).toEqual([]);
  });
});

describe('comboReport', () => {
  const combo = (result: 'won' | 'lost' | 'pending', legResults: string[], over = {}) =>
    bet({
      type: 'combination',
      result,
      stake: 10,
      odds: 5,
      legs: legResults.map((r, i) => leg({ market: i === 0 ? 'Moneyline' : 'Over/Under', result: r as never })),
      ...over,
    });

  it('counts combinations lost by exactly one leg and names that leg', () => {
    const one = combo('lost', ['won', 'lost']);
    const rep = comboReport([
      one,
      combo('lost', ['lost', 'lost']),
      combo('lost', ['pending', 'pending']), // leg results not entered
      combo('won', ['won', 'won']),
      combo('pending', ['won', 'lost']), // not settled: ignored
      bet({ type: 'combination', legs: [], result: 'lost' }), // no legs: ignored
      bet({ result: 'lost' }), // solo: ignored
    ]);
    expect(rep).toMatchObject({ settled: 4, won: 1, lost: 3, lostByOne: 1, lostByOneStake: 10, lostUnknown: 1 });
    expect(rep.oneLegAway).toHaveLength(1);
    expect(rep.oneLegAway[0]!.bet.id).toBe(one.id);
    expect(rep.oneLegAway[0]!.leg.market).toBe('Over/Under');
  });

  it('records leg results by market, most lost first; half results count, voids do not', () => {
    const rep = comboReport([combo('lost', ['won', 'lost']), combo('lost', ['half-won', 'half-lost']), combo('won', ['won', 'void'])]);
    expect(rep.legsByMarket.map((m) => [m.label, m.won, m.lost])).toEqual([
      ['Over/Under', 0, 2],
      ['Moneyline', 3, 0],
    ]);
    expect(rep.legsByMarket[1]!.winRate).toBe(1);
  });

  it('nothing settled: all zero, no rows', () => {
    expect(comboReport([])).toMatchObject({ settled: 0, lostByOne: 0, legsByMarket: [], oneLegAway: [] });
  });
});
