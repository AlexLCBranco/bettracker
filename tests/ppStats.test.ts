// BT-32: every PP stats figure, including empty and all-void batches.
import { describe, expect, it } from 'vitest';
import { batchSummary, DEFAULT_TIERS, type PPBatch, type PPLeg, type PPTicket } from '@/lib/pp';
import { batchesBetween, legBreakdown, lostByOne, tierHitOverTime, tierStats } from '@/lib/ppStats';
import { formatPercent } from '@/lib/stats';

const leg = (id: string, over: Partial<PPLeg> = {}): PPLeg => ({ id, sport: 'NBA', game: '', market: 'Points', selection: id, odds: 2, tier: 'major', result: 'pending', actual: '', note: '', ...over });
const ticket = (number: number, legIds: string[]): PPTicket => ({ id: `t${number}`, number, legIds, placed: true, oddsOverride: null });
let n = 0;
const batch = (legs: PPLeg[], tickets: PPTicket[] = [], over: Partial<PPBatch> = {}): PPBatch => ({
  id: `b${++n}`,
  name: `Batch ${n}`,
  placedDate: '2026-11-20',
  book: '',
  stake: 10,
  targetOdds: 20,
  money: 'real',
  scheme: null,
  notes: '',
  tiers: DEFAULT_TIERS,
  legs,
  tickets,
  createdAt: `2026-11-20T00:00:0${n % 10}Z`,
  updatedAt: '',
  ...over,
});

describe('per tier', () => {
  it('legs won-lost, hit rate, and the hit rate the odds implied (1 / odds)', () => {
    const b = batch([
      leg('a', { tier: 'mm', result: 'won', odds: 2 }),
      leg('b', { tier: 'mm', result: 'won', odds: 1.25 }),
      leg('c', { result: 'won', odds: 2 }),
      leg('d', { result: 'lost', odds: 4 }),
      leg('e', { result: 'void', odds: 3 }),
      leg('f', { result: 'pending' }),
    ]);
    const t = tierStats([b]);
    expect(t.map((r) => r.label)).toEqual(['Major-major', 'Major', 'PP shot']);
    expect(t[0]).toMatchObject({ won: 2, lost: 0, hitRate: 1 });
    expect(t[0]!.implied).toBeCloseTo((0.5 + 0.8) / 2);
    expect(t[1]).toMatchObject({ won: 1, lost: 1, void: 1, pending: 1, hitRate: 0.5 });
    expect(t[1]!.implied).toBeCloseTo((0.5 + 0.25) / 2);
    // no settled legs → null, shown "-", never NaN
    expect(t[2]).toMatchObject({ won: 0, lost: 0, hitRate: null, implied: null });
    expect(formatPercent(t[2]!.hitRate)).toBe('-');
  });
  it('across batches tiers are matched by name; a renamed or added level is its own row', () => {
    const b1 = batch([leg('a', { result: 'won' })]);
    const b2 = batch([leg('x', { tier: 'm2', result: 'lost' }), leg('y', { result: 'lost' })], [], { tiers: [...DEFAULT_TIERS.slice(0, 2), { id: 'm2', name: 'Major 2' }, DEFAULT_TIERS[2]!] });
    const t = tierStats([b1, b2]);
    expect(t.find((r) => r.label === 'Major')).toMatchObject({ won: 1, lost: 1, hitRate: 0.5 });
    expect(t.find((r) => r.label === 'Major 2')).toMatchObject({ won: 0, lost: 1, hitRate: 0 });
  });
  it('an empty batch and an all-void batch: nothing settled, no NaN', () => {
    for (const b of [batch([]), batch([leg('a', { result: 'void' }), leg('b', { result: 'void', tier: 'mm' })], [ticket(1, ['a', 'b'])])]) {
      for (const r of tierStats([b])) {
        expect(r.hitRate).toBeNull();
        expect(r.implied).toBeNull();
      }
      const s = batchSummary(b);
      expect(Number.isNaN(s.profit) || Number.isNaN(s.returned)).toBe(false);
    }
    const allVoid = batch([leg('a', { result: 'void' })], [ticket(1, ['a'])]);
    expect(batchSummary(allVoid)).toMatchObject({ void: 1, won: 0, dead: 0, staked: 10, returned: 10, profit: 0 });
    expect(lostByOne(allVoid)).toEqual([]);
  });
});

describe('lost by one', () => {
  it('groups the PPs whose only lost leg was X and every other leg won (or void)', () => {
    const legs = [leg('mm', { tier: 'mm', result: 'won' }), leg('jokic', { result: 'lost', actual: '11', note: 'sure thing' }), leg('m2', { result: 'won' }), leg('s', { tier: 'shot', result: 'lost' }), leg('v', { result: 'void' }), leg('p')];
    const b = batch(legs, [
      ticket(1, ['mm', 'jokic', 'm2']), // killed by jokic
      ticket(2, ['mm', 'jokic', 'v']), // killed by jokic (void ignored)
      ticket(3, ['mm', 'jokic', 's']), // two lost: not "by one"
      ticket(4, ['mm', 's', 'm2']), // killed by s
      ticket(5, ['mm', 'jokic', 'p']), // a leg still pending: not complete
      ticket(6, ['jokic']), // nothing else won
    ]);
    const l = lostByOne(b);
    expect(l.map((x) => [x.leg.id, x.count, x.numbers])).toEqual([
      ['jokic', 2, [1, 2]],
      ['s', 1, [4]],
    ]);
    expect(l[0]!.leg).toMatchObject({ actual: '11', note: 'sure thing' });
  });
});

describe('over time and breakdowns', () => {
  it('one point per batch, oldest first, per tier', () => {
    const b1 = batch([leg('a', { result: 'won' }), leg('b', { result: 'lost' })], [], { placedDate: '2026-11-10', name: 'Old' });
    const b2 = batch([leg('c', { result: 'won' })], [], { placedDate: '2026-11-15', name: 'New' });
    const t = tierHitOverTime([b2, b1]);
    expect(t.tiers).toEqual(['Major-major', 'Major', 'PP shot']);
    expect(t.points.map((p) => [p.name, p.rates['Major'], p.rates['Major-major']])).toEqual([
      ['Old', 0.5, null],
      ['New', 1, null],
    ]);
  });
  it('leg hit rate by sport and by market', () => {
    const b = batch([leg('a', { result: 'won', sport: 'NBA', market: 'Points' }), leg('b', { result: 'lost', sport: 'nba', market: 'Assists' }), leg('c', { result: 'won', sport: 'Soccer', market: '' }), leg('d', { sport: 'Soccer' })]);
    expect(legBreakdown([b], 'sport').map((r) => [r.label, r.won, r.lost, r.hitRate])).toEqual([
      ['NBA', 1, 1, 0.5],
      ['Soccer', 1, 0, 1],
    ]);
    expect(legBreakdown([b], 'market').map((r) => r.label)).toEqual(['Assists', 'Not set', 'Points']);
  });
  it('date range', () => {
    const a = batch([], [], { placedDate: '2026-11-01' });
    const b = batch([], [], { placedDate: '2026-11-20' });
    expect(batchesBetween([a, b], '2026-11-10', '').map((x) => x.id)).toEqual([b.id]);
    expect(batchesBetween([a, b], '', '2026-11-10').map((x) => x.id)).toEqual([a.id]);
    expect(batchesBetween([a, b], '', '')).toHaveLength(2);
  });
});
