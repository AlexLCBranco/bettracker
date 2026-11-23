// BT-30: ticket result and status are derived from the legs (void legs, undo), odds estimated or typed over.
import { describe, expect, it } from 'vitest';
import { batchSummary, DEFAULT_TIERS, defaultBatchName, legsByTier, legUse, nextNumber, ticketMoney, ticketOdds, ticketResult, ticketStatus, ticketView, validateBatch, type PPBatch, type PPLeg, type PPTicket } from '@/lib/pp';

const leg = (id: string, over: Partial<PPLeg> = {}): PPLeg => ({ id, sport: 'NBA', game: 'A vs B', market: 'ML', selection: id, odds: 2, tier: 'major', result: 'pending', actual: '', note: '', ...over });
const ticket = (number: number, legIds: string[], over: Partial<PPTicket> = {}): PPTicket => ({ id: `t${number}`, number, legIds, placed: true, oddsOverride: null, ...over });
const batch = (legs: PPLeg[], tickets: PPTicket[], over: Partial<PPBatch> = {}): PPBatch => ({
  id: 'b1',
  name: 'Batch 23/11',
  placedDate: '2026-11-23',
  book: 'Bet365',
  stake: 10,
  targetOdds: 20,
  money: 'real',
  scheme: null,
  notes: '',
  tiers: DEFAULT_TIERS,
  legs,
  tickets,
  createdAt: '2026-11-23T00:00:00Z',
  updatedAt: '2026-11-23T00:00:00Z',
  ...over,
});
const r = (...rs: PPLeg['result'][]) => rs.map((result) => ({ result }));

describe('ticket result (derived, never typed)', () => {
  it('lost as soon as one leg is lost, even with legs pending', () => expect(ticketResult(r('lost', 'pending', 'won'))).toBe('lost'));
  it('won when every leg is won or void and one is won', () => {
    expect(ticketResult(r('won', 'won'))).toBe('won');
    expect(ticketResult(r('won', 'void'))).toBe('won');
  });
  it('void when all legs are void', () => expect(ticketResult(r('void', 'void'))).toBe('void'));
  it('pending otherwise', () => {
    expect(ticketResult(r('won', 'pending'))).toBe('pending');
    expect(ticketResult(r('void', 'pending'))).toBe('pending');
  });
});

describe('ticket status', () => {
  it('Alive with 2+ legs pending, One leg away with exactly one', () => {
    expect(ticketStatus(r('won', 'pending', 'pending'))).toBe('alive');
    expect(ticketStatus(r('won', 'won', 'pending'))).toBe('one-away');
    expect(ticketStatus(r('void', 'pending'))).toBe('one-away');
  });
  it('Won, Dead, Void', () => {
    expect(ticketStatus(r('won', 'won'))).toBe('won');
    expect(ticketStatus(r('lost', 'pending'))).toBe('dead');
    expect(ticketStatus(r('void'))).toBe('void');
  });
  it('undo: putting a leg back to pending brings the ticket back to life', () => {
    expect(ticketStatus(r('lost', 'pending'))).toBe('dead');
    expect(ticketStatus(r('pending', 'pending'))).toBe('alive');
  });
});

describe('ticket odds', () => {
  const legs = [leg('a', { odds: 2 }), leg('b', { odds: 2.5 }), leg('c', { odds: 4 })];
  it('estimated: the legs multiplied', () => expect(ticketOdds(ticket(1, ['a', 'b', 'c']), legs)).toEqual({ odds: 20, estimated: true }));
  it('a void leg drops out of the estimate', () => {
    const v = legs.map((l) => (l.id === 'b' ? { ...l, result: 'void' as const } : l));
    expect(ticketOdds(ticket(1, ['a', 'b', 'c']), v)).toEqual({ odds: 8, estimated: true });
  });
  it('the book’s price typed over it wins; a void leg divides it out', () => {
    expect(ticketOdds(ticket(1, ['a', 'b', 'c'], { oddsOverride: 21 }), legs)).toEqual({ odds: 21, estimated: false });
    const v = legs.map((l) => (l.id === 'c' ? { ...l, result: 'void' as const } : l));
    expect(ticketOdds(ticket(1, ['a', 'b', 'c'], { oddsOverride: 21 }), v).odds).toBeCloseTo(5.25);
  });
});

describe('ticket money', () => {
  const legs = [leg('a', { odds: 4, result: 'won' }), leg('b', { odds: 5, result: 'won' })];
  it('real: won pays stake × odds − stake', () => expect(ticketView(ticket(1, ['a', 'b']), batch(legs, [])).profit).toBe(190));
  it('bonus: won pays the winnings only, as real money; lost costs nothing real', () => {
    expect(ticketView(ticket(1, ['a', 'b']), batch(legs, [], { money: 'bonus' }))).toMatchObject({ profit: 190, potential: 190 });
    const lost = [leg('a', { result: 'lost' }), leg('b')];
    expect(ticketView(ticket(1, ['a', 'b']), batch(lost, [], { money: 'bonus' })).profit).toBe(0);
  });
});

describe('legs: use, decides, tier order', () => {
  const legs = [leg('mm', { tier: 'mm', result: 'won' }), leg('m1'), leg('m2'), leg('s1', { tier: 'shot' })];
  const tickets = [ticket(1, ['mm', 'm1']), ticket(2, ['mm', 'm1', 'm2']), ticket(3, ['mm', 's1']), ticket(4, ['mm', 'm2', 's1'])];
  const b = batch(legs, tickets);
  it('"on N PPs · M alive" and "decides N PPs"', () => {
    const u = legUse(b);
    expect(u.get('mm')).toEqual({ on: 4, alive: 4, decides: 0 });
    expect(u.get('m1')).toEqual({ on: 2, alive: 2, decides: 1 });
    expect(u.get('s1')).toEqual({ on: 2, alive: 2, decides: 1 });
    expect(u.get('m2')).toEqual({ on: 2, alive: 2, decides: 0 });
  });
  it('a dead ticket is decided by nobody', () => {
    const dead = batch(legs.map((l) => (l.id === 'm2' ? { ...l, result: 'lost' as const } : l)), tickets);
    expect(legUse(dead).get('s1')).toEqual({ on: 2, alive: 1, decides: 1 });
    expect(legUse(dead).get('m1')).toEqual({ on: 2, alive: 1, decides: 1 });
  });
  it('legs grouped by tier in tier order; a leg that decides PPs goes first in its tier', () => {
    const g = legsByTier(b);
    expect(g.map((x) => [x.tier.name, x.legs.map((l) => l.id)])).toEqual([
      ['Major-major', ['mm']],
      ['Major', ['m1', 'm2']],
      ['PP shot', ['s1']],
    ]);
    const g2 = legsByTier(batch([leg('m2'), leg('m1')], [ticket(1, ['m1']), ticket(2, ['m2', 'm1'])]));
    expect(g2[1]!.legs.map((l) => l.id)).toEqual(['m1', 'm2']);
  });
});

describe('batch summary', () => {
  it('counts tickets and money (placed tickets only); all-void and empty batches give 0, never NaN', () => {
    const legs = [leg('a', { result: 'won', odds: 2 }), leg('b', { result: 'lost' }), leg('c'), leg('d', { result: 'void' })];
    const b = batch(legs, [ticket(1, ['a']), ticket(2, ['a', 'b']), ticket(3, ['a', 'c']), ticket(4, ['d']), ticket(5, ['c'], { placed: false })]);
    expect(batchSummary(b)).toMatchObject({ tickets: 5, won: 1, dead: 1, alive: 2, oneAway: 2, void: 1, staked: 40, returned: 30, profit: 0, converted: null });
    expect(batchSummary(batch([], []))).toMatchObject({ tickets: 0, staked: 0, returned: 0, profit: 0 });
  });
  it('bonus: returned is the real winnings; converted = won / bonus spent', () => {
    const legs = [leg('a', { result: 'won', odds: 20 }), leg('b', { result: 'lost' })];
    const s = batchSummary(batch(legs, [ticket(1, ['a']), ticket(2, ['b'])], { money: 'bonus' }));
    expect(s).toMatchObject({ staked: 20, returned: 190, profit: 190 });
    expect(s.converted).toBeCloseTo(9.5);
  });
  it('placed tickets feed the bankroll', () => {
    const b = batch([leg('a', { result: 'won' })], [ticket(1, ['a']), ticket(2, ['a'], { placed: false })], { money: 'bonus' });
    expect(ticketMoney([b])).toEqual([{ money: 'bonus', book: 'Bet365', placedDate: '2026-11-23', stake: 10, odds: 2, result: 'won', cashout: null }]);
  });
});

describe('validateBatch', () => {
  const ok = { placedDate: '2026-11-23', stake: 5, money: 'bonus', legs: [leg('a'), leg('b', { tier: 'mm' })], tickets: [ticket(2, ['a', 'b']), ticket(1, ['a'])] };
  it('fills the defaults and sorts tickets by number', () => {
    const v = validateBatch(ok);
    expect(v).toMatchObject({ ok: true, value: { name: 'Batch 23/11', targetOdds: 20, tiers: DEFAULT_TIERS } });
    if (v.ok) expect(v.value.tickets.map((t) => t.number)).toEqual([1, 2]);
  });
  it('refuses bad legs and tickets', () => {
    expect(validateBatch({ ...ok, legs: [leg('a', { odds: 1 })], tickets: [] }).ok).toBe(false);
    expect(validateBatch({ ...ok, legs: [leg('a', { tier: 'nope' })], tickets: [] }).ok).toBe(false);
    expect(validateBatch({ ...ok, tickets: [ticket(1, ['a', 'x'])] }).ok).toBe(false);
    expect(validateBatch({ ...ok, tickets: [ticket(1, ['a', 'a'])] }).ok).toBe(false);
    expect(validateBatch({ ...ok, tickets: [ticket(1, ['a']), ticket(1, ['b'], { id: 't9' })] }).ok).toBe(false);
    expect(validateBatch({ ...ok, tickets: [ticket(1, [])] }).ok).toBe(false);
    expect(validateBatch({ ...ok, stake: 0 }).ok).toBe(false);
  });
  it('names and numbers', () => {
    expect(defaultBatchName('2026-01-05')).toBe('Batch 05/01');
    expect(nextNumber([ticket(1, []), ticket(3, [])])).toBe(2);
  });
});
