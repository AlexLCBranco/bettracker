import { describe, expect, it } from 'vitest';
import { cumulativeProfit, formatPercent, summarize } from '@/lib/stats';
import { bet } from './helpers';

describe('summarize', () => {
  it('zero bets: no NaN, win rate and ROI are null and show "-"', () => {
    const s = summarize([]);
    expect(s.winRate).toBeNull();
    expect(s.roi).toBeNull();
    expect(formatPercent(s.winRate)).toBe('-');
    expect(formatPercent(s.roi)).toBe('-');
    expect(s.netProfit).toBe(0);
    expect(s.betCount).toBe(0);
  });

  it('only pending and void bets: win rate "-", ROI 0% on the void stake', () => {
    const s = summarize([bet({ result: 'pending' }), bet({ result: 'void' })]);
    expect(formatPercent(s.winRate)).toBe('-');
    expect(s.roi).toBe(0);
    expect(s.pendingCount).toBe(1);
    expect(s.pendingAmount).toBe(100);
  });

  it('win rate = won / (won + lost), voids and pending excluded', () => {
    const s = summarize([
      bet({ result: 'won' }),
      bet({ result: 'won' }),
      bet({ result: 'lost' }),
      bet({ result: 'void' }),
      bet({ result: 'pending' }),
    ]);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(formatPercent(s.winRate)).toBe('66.7%');
  });

  it('ROI = net profit / total settled stake', () => {
    // won 100@2.5 = +150, lost 100 = -100, void 100 = 0, pending 100 excluded → 50 / 300
    const s = summarize([bet({ result: 'won', odds: 2.5 }), bet({ result: 'lost' }), bet({ result: 'void' }), bet({ result: 'pending' })]);
    expect(s.netProfit).toBe(50);
    expect(s.settledStake).toBe(300);
    expect(s.roi).toBeCloseTo(50 / 300);
    expect(formatPercent(s.roi, true)).toBe('+16.7%');
    expect(s.totalWagered).toBe(400);
    expect(s.betCount).toBe(4);
  });

  it('formatPercent never shows NaN or Infinity', () => {
    expect(formatPercent(NaN)).toBe('-');
    expect(formatPercent(Infinity)).toBe('-');
  });
});

describe('cumulativeProfit', () => {
  it('one point per game date, oldest first, running total; pending skipped', () => {
    const pts = cumulativeProfit([
      bet({ gameDate: '2026-11-21', result: 'lost' }),
      bet({ gameDate: '2026-11-19', result: 'won' }),
      bet({ gameDate: '2026-11-19', result: 'won' }),
      bet({ gameDate: '2026-11-22', result: 'pending' }),
    ]);
    expect(pts).toEqual([
      { date: '2026-11-19', profit: 200, cumulative: 200 },
      { date: '2026-11-21', profit: -100, cumulative: 100 },
    ]);
  });
});
