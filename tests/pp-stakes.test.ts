// Owner, 2026-11-27: he types only the minimum per PP (usually 0,50); each PP's stake follows so every PP pays about the
// same if it wins. PPs from before keep the batch's stake.
import { describe, expect, it } from 'vitest';
import { batchSummary, DEFAULT_TIERS, equalPayoutStakes, suggestStake, ticketMoney, ticketStake, ticketView, validateBatch, type PPBatch, type PPLeg, type PPTicket } from '@/lib/pp';
import { generate, preview, type PPScheme } from '@/lib/ppBuilder';

const leg = (id: string, odds: number, tier = 'major', game = `${id} game`): PPLeg => ({ id, sport: '', game, market: '', selection: id, odds, tier, result: 'pending', actual: '', note: '' });
const ticket = (number: number, legIds: string[], stake: number | null): PPTicket => ({ id: `t${number}`, number, legIds, placed: true, oddsOverride: null, stake });
const batch = (legs: PPLeg[], tickets: PPTicket[], over: Partial<PPBatch> = {}): PPBatch => ({
  id: 'b',
  name: 'b',
  placedDate: '2026-11-27',
  book: '',
  stake: 0.5,
  targetOdds: 20,
  money: 'real',
  scheme: null,
  notes: '',
  tiers: DEFAULT_TIERS,
  legs,
  tickets,
  createdAt: '',
  updatedAt: '',
  ...over,
});

describe('equal payout stakes', () => {
  it('the longest PP gets the minimum; the others pay the same, rounded to the cent', () => {
    expect(equalPayoutStakes([30, 20, 15, 24], 0.5)).toEqual([0.5, 0.75, 1, 0.63]);
    // every PP pays about 15,00
    const odds = [30, 20, 15, 24];
    equalPayoutStakes(odds, 0.5).forEach((s, i) => expect(Math.abs(s * odds[i]! - 15)).toBeLessThan(0.15));
  });
  it('never under the minimum; nothing for no PPs', () => {
    expect(Math.min(...equalPayoutStakes([29.99, 30, 30.01], 0.5))).toBe(0.5);
    expect(equalPayoutStakes([], 0.5)).toEqual([]);
  });
});

describe('a PP’s own stake', () => {
  const legs = [leg('a', 4), leg('b', 5)];
  const b = batch(legs, [ticket(1, ['a', 'b'], 0.5), ticket(2, ['a'], 2.5), ticket(3, ['b'], null)], { stake: 0.5 });
  it('own stake, else the batch’s (PPs from before)', () => {
    expect(b.tickets.map((t) => ticketStake(t, b))).toEqual([0.5, 2.5, 0.5]);
  });
  it('potential, profit, staked, returned and the bankroll use it', () => {
    expect(ticketView(b.tickets[1]!, b).potential).toBe(10);
    const settled = { ...b, legs: [leg('a', 4), { ...leg('b', 5), result: 'lost' as const }].map((l, i) => (i === 0 ? { ...l, result: 'won' as const } : l)) };
    const s = batchSummary(settled);
    expect(s.staked).toBe(3.5);
    expect(s.returned).toBe(10); // PP 2 won 2,50 × 4; PPs 1 and 3 lost
    expect(s.profit).toBe(6.5);
    expect(ticketMoney([settled]).map((m) => m.stake)).toEqual([0.5, 2.5, 0.5]);
  });
  it('a PP made by hand: the stake that pays what the batch’s PPs pay, never under the minimum', () => {
    // payouts: 0,50 × 20 = 10 and 2,50 × 4 = 10 and 0,50 × 5 = 2,50 → 10
    expect(suggestStake(8, b)).toBe(1.25);
    expect(suggestStake(40, b)).toBe(0.5);
    expect(suggestStake(8, batch(legs, []))).toBe(0.5);
  });
});

describe('generation and validation', () => {
  const pool = [leg('mm', 2, 'mm'), ...[1.6, 1.7, 1.8, 1.9, 2.0, 2.1].map((o, i) => leg(`m${i}`, o)), ...[2.5, 3, 3.5, 4, 2.5, 3, 3.5, 4].map((o, i) => leg(`s${i}`, o, 'shot'))];
  const s: PPScheme = { count: 16, target: 20, bandMin: 15, bandMax: 30, majorsPerPP: [1], shotCount: 2, avoidPairs: false, seed: 3 };
  it('the preview gives each PP its stake: the longest the minimum, all paying the same', () => {
    const b = { legs: pool, tiers: DEFAULT_TIERS, stake: 0.5 };
    const g = generate(b, s);
    const pv = preview(b, s, g);
    expect(pv.stakes).toHaveLength(g.tickets.length);
    expect(Math.min(...pv.stakes)).toBe(0.5);
    const odds = g.tickets.map((t) => t.legIds.reduce((p, id) => p * pool.find((l) => l.id === id)!.odds, 1));
    const payout = 0.5 * Math.max(...odds);
    pv.stakes.forEach((x, i) => expect(Math.abs(x * odds[i]! - payout)).toBeLessThan(0.006 * odds[i]! + 1e-9));
    expect(pv.totalStake).toBeCloseTo(pv.stakes.reduce((a, x) => a + x, 0), 6);
  });
  it('a ticket stake is kept, optional, and above 0', () => {
    const raw = { placedDate: '2026-11-27', stake: 0.5, legs: [{ id: 'a', odds: 2, tier: 'mm' }], tickets: [{ id: 't1', number: 1, legIds: ['a'], stake: 1.25 }, { id: 't2', number: 2, legIds: ['a'] }] };
    const v = validateBatch(raw);
    expect(v.ok && v.value.tickets.map((t) => t.stake)).toEqual([1.25, null]);
    const bad = validateBatch({ ...raw, tickets: [{ id: 't1', number: 1, legIds: ['a'], stake: 0 }] });
    expect(bad).toEqual({ ok: false, error: 'PP 1: stake must be above 0' });
  });
});
