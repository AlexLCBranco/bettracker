import { describe, expect, it } from 'vitest';
import { bestWorst, segmentText } from '@/lib/bestWorst';
import { leg, bet } from './helpers';
import type { Bet } from '@/lib/types';

/** n settled bets on a book, each won at 2.0 (profit = stake) or lost, in one sport and market. */
const many = (book: string, n: number, result: 'won' | 'lost', over: Partial<Bet> = {}) =>
  Array.from({ length: n }, () => bet({ book, result, stake: 10, odds: 2, legs: [leg({ sport: '', market: '' })], ...over }));

describe('BT-62 best / worst', () => {
  it('fewer than two qualifying rows: none', () => {
    // one book of 10 settled; sport / market not set; type and situation are one row each over the same bets
    const r = bestWorst(many('A', 9, 'won'));
    expect(r).toEqual({ best: null, worst: null });
  });

  it('rows under 10 settled bets never qualify (9 does not, 10 does)', () => {
    const bets = [...many('A', 10, 'won'), ...many('B', 9, 'lost'), ...many('C', 10, 'lost')];
    const r = bestWorst(bets);
    expect(r.best && segmentText(r.best)).toBe('Book: A');
    expect(r.best!.profit).toBe(100);
    expect(r.worst && segmentText(r.worst)).toBe('Book: C');
  });

  it('Not set and Mixed rows never qualify', () => {
    const bets = [...many('', 10, 'won'), ...many('A', 10, 'lost'), ...many('B', 10, 'won', { situation: 'live' })];
    const r = bestWorst(bets);
    expect(segmentText(r.worst!)).toBe('Book: A');
    expect([r.best, r.worst].some((s) => s!.label === 'Not set')).toBe(false);
  });

  it('ties: the row with more settled bets wins', () => {
    // Book A +100 on 10 settled, Book B +100 on 12; Type Solo and Situation Pregame hold all 32 bets, also +100
    const a = many('A', 10, 'won');
    const b = [...many('B', 11, 'won'), ...many('B', 1, 'lost', { stake: 10 })]; // +110 - 10 = +100 on 12 settled
    const r = bestWorst([...a, ...b, ...many('C', 10, 'lost')]);
    expect(segmentText(r.best!)).toMatch(/^(Type: Solo|Situation: Pregame)$/);
    expect(bestWorst([...a, ...b]).best!.label).not.toBe('A');
  });
});
