// BT-30: the PP system. A batch is a pool of legs (each entered once, in a tier) plus the tickets ("PPs") made from
// them. A leg is settled once; every ticket's result follows from its legs, never typed. PPs live only on the PP page:
// they never count in the Bets or Analytics totals.
//
// Ticket odds = its legs' odds multiplied ("estimated"), unless the book's real price was typed over it. That is the
// second stated exception to "never multiply legs" (CLAUDE.md).

import { isValidISODate } from './dates';
import { bonusSpentOf, profit, winReturn } from './money';
import { MONEY, type Money } from './types';

export const PP_LEG_RESULTS = ['pending', 'won', 'lost', 'void'] as const;
export type PPLegResult = (typeof PP_LEG_RESULTS)[number];

export interface PPTier {
  id: string;
  name: string;
}

/**
 * Owner, 2026-11-27: any leg can be a combo: one pool leg made of several selections at the book's combo price. Its
 * parts can be from different sports, played on different days.
 */
export interface PPLegPart {
  sport: string;
  /** The day it is played, "YYYY-MM-DD"; "" not typed. */
  date: string;
  game: string;
  market: string;
  selection: string;
  odds: number;
}

export interface PPLeg {
  id: string;
  sport: string;
  game: string;
  market: string;
  selection: string;
  odds: number;
  /** A tier id of the batch. */
  tier: string;
  result: PPLegResult;
  /** What actually happened ("11", "111-112"), as BT-27. */
  actual: string;
  /** His confidence or theory on it. */
  note: string;
  /** A combo's selections (empty: a single selection). Its odds are the book's combo price; it settles as one leg. */
  parts: PPLegPart[];
}

/** A combo's parts multiplied: the estimate its price starts from (never forced: the book's price is typed over it). */
export const partsOdds = (parts: Pick<PPLegPart, 'odds'>[]) => Math.round(parts.reduce((p, x) => p * x.odds, 1) * 100) / 100;

export interface PPTicket {
  id: string;
  /** PP 1, PP 2, ... */
  number: number;
  legIds: string[];
  placed: boolean;
  /** The book's real price, typed over the estimate; null = estimated from the legs. */
  oddsOverride: number | null;
  /** This PP's own stake (owner, 2026-11-27: same payout on every PP); null = the batch's stake (batches from before). */
  stake: number | null;
}

export interface PPBatch {
  id: string;
  name: string;
  placedDate: string;
  book: string;
  /** The minimum stake per PP: the longest PP gets it, shorter ones more (equalPayoutStakes). Old batches: every PP's stake. */
  stake: number;
  targetOdds: number;
  money: Money;
  /** The scheme used to build it (BT-31); null for batches made by hand. */
  scheme: Record<string, unknown> | null;
  notes: string;
  /** Ordered: the first is the most confident ("Major-major"). */
  tiers: PPTier[];
  legs: PPLeg[];
  tickets: PPTicket[];
  createdAt: string;
  updatedAt: string;
}

export type BatchInput = Omit<PPBatch, 'id' | 'createdAt' | 'updatedAt'>;

export const DEFAULT_TIERS: PPTier[] = [
  { id: 'mm', name: 'Major-major' },
  { id: 'major', name: 'Major' },
  { id: 'shot', name: 'PP shot' },
];

export const DEFAULT_TARGET = 20;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "Batch 23/11". */
export const defaultBatchName = (iso: string) => `Batch ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export type TicketResult = 'pending' | 'won' | 'lost' | 'void';
export type TicketStatus = 'alive' | 'one-away' | 'won' | 'dead' | 'void';

export const STATUS_LABEL: Record<TicketStatus, string> = { alive: 'Alive', 'one-away': 'One leg away', won: 'Won', dead: 'Dead', void: 'Void' };

/** A ticket's legs, in the ticket's order (unknown ids dropped). */
export function ticketLegs(t: PPTicket, legs: PPLeg[]): PPLeg[] {
  const byId = new Map(legs.map((l) => [l.id, l]));
  return t.legIds.map((id) => byId.get(id)).filter((l): l is PPLeg => !!l);
}

/** Derived, never typed: lost as soon as a leg is lost; won when every leg is won or void and one is won; void when all are void. */
export function ticketResult(legs: Pick<PPLeg, 'result'>[]): TicketResult {
  if (legs.some((l) => l.result === 'lost')) return 'lost';
  if (legs.some((l) => l.result === 'pending')) return 'pending';
  if (legs.some((l) => l.result === 'won')) return 'won';
  return 'void';
}

/** For reading: Alive (no lost leg, legs pending), One leg away (alive with exactly one pending), Won, Dead, Void. */
export function ticketStatus(legs: Pick<PPLeg, 'result'>[]): TicketStatus {
  const r = ticketResult(legs);
  if (r === 'lost') return 'dead';
  if (r === 'won') return 'won';
  if (r === 'void') return 'void';
  return legs.filter((l) => l.result === 'pending').length === 1 ? 'one-away' : 'alive';
}

export const isAlive = (s: TicketStatus) => s === 'alive' || s === 'one-away';

/**
 * The odds a ticket is at. Estimated: the non-void legs' odds multiplied (a void leg drops out). Typed over: the book's
 * price, divided by the odds of legs that went void since (the book recalculates the same way).
 */
export function ticketOdds(t: PPTicket, legs: PPLeg[]): { odds: number; estimated: boolean } {
  const mine = ticketLegs(t, legs);
  const live = mine.filter((l) => l.result !== 'void').reduce((p, l) => p * l.odds, 1);
  if (t.oddsOverride != null) {
    const voided = mine.filter((l) => l.result === 'void').reduce((p, l) => p * l.odds, 1);
    return { odds: t.oddsOverride / voided, estimated: false };
  }
  return { odds: live, estimated: true };
}

/** A PP's stake: its own, else the batch's. */
export const ticketStake = (t: Pick<PPTicket, 'stake'>, batch: Pick<PPBatch, 'stake'>) => t.stake ?? batch.stake;

/**
 * Owner, 2026-11-27: he types only the minimum per PP; each PP's stake follows so every PP pays about the same if it
 * wins. The longest PP gets the minimum; the others minimum × longest odds ÷ their odds, rounded to the cent, never under
 * the minimum.
 */
export function equalPayoutStakes(odds: number[], min: number): number[] {
  if (!odds.length) return [];
  const top = Math.max(...odds);
  return odds.map((o) => Math.max(min, round2((min * top) / o)));
}

/** The stake a new PP at these odds gets to pay what the batch's PPs pay (the largest payout among them), never under the minimum. */
export function suggestStake(odds: number, batch: Pick<PPBatch, 'stake' | 'legs' | 'tickets'>): number {
  const payouts = batch.tickets.map((t) => ticketStake(t, batch) * ticketOdds(t, batch.legs).odds);
  const payout = payouts.length ? Math.max(...payouts) : 0;
  return odds > 1 && payout > 0 ? Math.max(batch.stake, round2(payout / odds)) : batch.stake;
}

export interface TicketView {
  ticket: PPTicket;
  legs: PPLeg[];
  result: TicketResult;
  status: TicketStatus;
  odds: number;
  estimated: boolean;
  /** Pending legs left. */
  left: number;
  /** What it pays if it wins (bonus money: the winnings only). */
  potential: number;
  /** Settled: profit in the batch's profit money (bonus: real money won). 0 while pending. */
  profit: number;
}

export function ticketView(t: PPTicket, batch: Pick<PPBatch, 'legs' | 'stake' | 'money'>): TicketView {
  const legs = ticketLegs(t, batch.legs);
  const result = ticketResult(legs);
  const { odds, estimated } = ticketOdds(t, batch.legs);
  const asBet = { stake: ticketStake(t, batch), odds, result, cashout: null, money: batch.money };
  return {
    ticket: t,
    legs,
    result,
    status: ticketStatus(legs),
    odds,
    estimated,
    left: legs.filter((l) => l.result === 'pending').length,
    potential: winReturn(asBet),
    profit: result === 'pending' ? 0 : profit(asBet),
  };
}

export interface LegUse {
  /** Tickets containing the leg. */
  on: number;
  /** Of those, still alive. */
  alive: number;
  /** Alive tickets where this is the last pending leg: settling it decides them. */
  decides: number;
}

export function legUse(batch: Pick<PPBatch, 'legs' | 'tickets'>): Map<string, LegUse> {
  const m = new Map<string, LegUse>(batch.legs.map((l) => [l.id, { on: 0, alive: 0, decides: 0 }]));
  for (const t of batch.tickets) {
    const legs = ticketLegs(t, batch.legs);
    const status = ticketStatus(legs);
    const pending = legs.filter((l) => l.result === 'pending');
    for (const l of legs) {
      const u = m.get(l.id)!;
      u.on++;
      if (isAlive(status)) u.alive++;
    }
    if (isAlive(status) && pending.length === 1) m.get(pending[0]!.id)!.decides++;
  }
  return m;
}

/**
 * Owner, 2026-11-27: the system the batch was built with, read from its PPs: per tier (in tier order), how many of
 * its legs each PP carries (min–max when PPs differ) and how many legs the tier has in the pool. Tiers no PP uses are
 * left out; legs of an unknown tier count as "No tier". Short names by the tier's place, as the builder's roles
 * (owner): the first "mjmj", the last of 3+ "shot", the ones between "mj" (a second Major level "mj2", ...).
 */
export function batchSystem(batch: Pick<PPBatch, 'tiers' | 'legs' | 'tickets'>): { tier: PPTier; short: string; min: number; max: number; pool: number }[] {
  const known = new Set(batch.tiers.map((t) => t.id));
  const tierOf = new Map(batch.legs.map((l) => [l.id, known.has(l.tier) ? l.tier : '']));
  const n = batch.tiers.length;
  const short = (i: number) => (i === 0 ? 'mjmj' : i === n - 1 && n >= 3 ? 'shot' : i === 1 ? 'mj' : `mj${i}`);
  const tiers = [...batch.tiers.map((tier, i) => ({ tier, short: short(i) })), { tier: { id: '', name: 'No tier' }, short: 'no tier' }];
  const out: { tier: PPTier; short: string; min: number; max: number; pool: number }[] = [];
  if (!batch.tickets.length) return out;
  for (const { tier, short } of tiers) {
    const counts = batch.tickets.map((t) => t.legIds.filter((id) => tierOf.get(id) === tier.id).length);
    const max = Math.max(...counts);
    if (max > 0) out.push({ tier, short, min: Math.min(...counts), max, pool: batch.legs.filter((l) => tierOf.get(l.id) === tier.id).length });
  }
  return out;
}

/** The legs of each tier, in tier order; within a tier the legs that decide tickets first, then as entered. */
export function legsByTier(batch: Pick<PPBatch, 'tiers' | 'legs' | 'tickets'>): { tier: PPTier; legs: PPLeg[] }[] {
  const use = legUse(batch);
  const known = new Set(batch.tiers.map((t) => t.id));
  const groups = batch.tiers.map((tier) => ({ tier, legs: batch.legs.filter((l) => l.tier === tier.id) }));
  const orphans = batch.legs.filter((l) => !known.has(l.tier));
  if (orphans.length) groups.push({ tier: { id: '', name: 'No tier' }, legs: orphans });
  for (const g of groups) {
    const pos = new Map(g.legs.map((l, i) => [l.id, i]));
    g.legs.sort((a, b) => Number(use.get(b.id)!.decides > 0) - Number(use.get(a.id)!.decides > 0) || pos.get(a.id)! - pos.get(b.id)!);
  }
  return groups.filter((g) => g.legs.length || g.tier.id);
}

export interface BatchSummary {
  tickets: number;
  won: number;
  alive: number;
  oneAway: number;
  dead: number;
  void: number;
  /** Placed tickets only. */
  staked: number;
  /** What the settled placed tickets paid back (bonus: real winnings; void: the stake back). */
  returned: number;
  profit: number;
  /** Bonus batches: real money won / bonus spent (BT-33). */
  converted: number | null;
}

export function batchSummary(batch: PPBatch): BatchSummary {
  const s: BatchSummary = { tickets: batch.tickets.length, won: 0, alive: 0, oneAway: 0, dead: 0, void: 0, staked: 0, returned: 0, profit: 0, converted: null };
  let bonusSpent = 0;
  for (const t of batch.tickets) {
    const v = ticketView(t, batch);
    if (v.status === 'won') s.won++;
    else if (v.status === 'dead') s.dead++;
    else if (v.status === 'void') s.void++;
    else {
      s.alive++;
      if (v.status === 'one-away') s.oneAway++;
    }
    if (!t.placed) continue;
    const stake = ticketStake(t, batch);
    s.staked += stake;
    if (v.result === 'pending') continue;
    s.profit += v.profit;
    // bonus money: the stake was never real money, so what came back is the winnings (and nothing on a void)
    s.returned += batch.money === 'bonus' ? v.profit : stake + v.profit;
    if (batch.money === 'bonus') bonusSpent += bonusSpentOf({ stake, result: v.result });
  }
  s.staked = round2(s.staked);
  s.returned = round2(s.returned);
  s.profit = round2(s.profit);
  if (batch.money === 'bonus') s.converted = bonusSpent > 0 ? s.profit / bonusSpent : null;
  return s;
}

/** Placed tickets as money items for the bankroll (BT-33). */
export function ticketMoney(batches: PPBatch[]) {
  return batches.flatMap((b) =>
    b.tickets
      .filter((t) => t.placed)
      .map((t) => {
        const v = ticketView(t, b);
        return { money: b.money, book: b.book, placedDate: b.placedDate, stake: ticketStake(t, b), odds: v.odds, result: v.result, cashout: null };
      }),
  );
}

// Validation (server and import)

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export type ValidatedBatch = { ok: true; value: BatchInput } | { ok: false; error: string };

export function validateBatch(raw: unknown): ValidatedBatch {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Batch must be an object' };
  const r = raw as Record<string, unknown>;
  const placedDate = str(r.placedDate);
  if (!isValidISODate(placedDate)) return { ok: false, error: 'Placed date must be a valid date' };
  const name = str(r.name, 80) || defaultBatchName(placedDate);
  const stake = num(r.stake);
  if (stake == null || stake <= 0) return { ok: false, error: 'Minimum stake per PP must be a number above 0' };
  const targetOdds = num(r.targetOdds) ?? DEFAULT_TARGET;
  if (!(targetOdds > 1)) return { ok: false, error: 'Target odds must be above 1' };
  const money = (r.money ?? 'real') as Money;
  if (!MONEY.includes(money)) return { ok: false, error: 'Money must be real, bonus or hypothetical' };
  const scheme = r.scheme && typeof r.scheme === 'object' && !Array.isArray(r.scheme) ? (r.scheme as Record<string, unknown>) : null;

  const rawTiers = Array.isArray(r.tiers) && r.tiers.length ? r.tiers : DEFAULT_TIERS;
  const tiers: PPTier[] = [];
  for (const t of rawTiers) {
    const tr = (t ?? {}) as Record<string, unknown>;
    const id = typeof tr.id === 'string' && ID.test(tr.id) ? tr.id : '';
    const tname = str(tr.name, 40);
    if (!id || !tname) return { ok: false, error: 'Each tier needs an id and a name' };
    if (tiers.some((x) => x.id === id)) return { ok: false, error: `Tier ${id} appears twice` };
    tiers.push({ id, name: tname });
  }
  const tierIds = new Set(tiers.map((t) => t.id));

  const legs: PPLeg[] = [];
  for (const [i, l] of (Array.isArray(r.legs) ? r.legs : []).entries()) {
    const lr = (l ?? {}) as Record<string, unknown>;
    const id = typeof lr.id === 'string' && ID.test(lr.id) ? lr.id : '';
    if (!id) return { ok: false, error: `Leg ${i + 1} has no valid id` };
    if (legs.some((x) => x.id === id)) return { ok: false, error: `Leg ${i + 1}: the id appears twice` };
    const odds = num(lr.odds);
    if (odds == null || odds <= 1) return { ok: false, error: `Leg ${i + 1}: odds must be above 1` };
    const tier = str(lr.tier, 100);
    if (!tierIds.has(tier)) return { ok: false, error: `Leg ${i + 1}: unknown tier` };
    const result = (lr.result ?? 'pending') as PPLegResult;
    if (!PP_LEG_RESULTS.includes(result)) return { ok: false, error: `Leg ${i + 1}: result must be pending, won, lost or void` };
    const parts: PPLegPart[] = [];
    for (const [j, x] of (Array.isArray(lr.parts) ? lr.parts : []).slice(0, 20).entries()) {
      const xr = (x ?? {}) as Record<string, unknown>;
      const po = num(xr.odds);
      if (po == null || po <= 1) return { ok: false, error: `Leg ${i + 1}, part ${j + 1}: odds must be above 1` };
      const date = str(xr.date);
      if (date && !isValidISODate(date)) return { ok: false, error: `Leg ${i + 1}, part ${j + 1}: the date must be a valid date` };
      parts.push({ sport: str(xr.sport), date, game: str(xr.game), market: str(xr.market), selection: str(xr.selection), odds: po });
    }
    if (parts.length === 1) return { ok: false, error: `Leg ${i + 1}: a combo needs two parts or more` };
    legs.push({ id, sport: str(lr.sport), game: str(lr.game), market: str(lr.market), selection: str(lr.selection), odds, tier, result, actual: str(lr.actual), note: str(lr.note, 300), parts });
  }
  const legIds = new Set(legs.map((l) => l.id));

  const tickets: PPTicket[] = [];
  for (const [i, t] of (Array.isArray(r.tickets) ? r.tickets : []).entries()) {
    const tr = (t ?? {}) as Record<string, unknown>;
    const id = typeof tr.id === 'string' && ID.test(tr.id) ? tr.id : '';
    if (!id) return { ok: false, error: `Ticket ${i + 1} has no valid id` };
    if (tickets.some((x) => x.id === id)) return { ok: false, error: `Ticket ${i + 1}: the id appears twice` };
    const number = num(tr.number);
    if (number == null || !Number.isInteger(number) || number < 1) return { ok: false, error: `Ticket ${i + 1}: number must be 1 or more` };
    if (tickets.some((x) => x.number === number)) return { ok: false, error: `PP ${number} appears twice` };
    const ids = Array.isArray(tr.legIds) ? tr.legIds.filter((x): x is string => typeof x === 'string') : [];
    if (!ids.length) return { ok: false, error: `PP ${number} has no legs` };
    if (ids.some((x) => !legIds.has(x))) return { ok: false, error: `PP ${number} has a leg that is not in the pool` };
    if (new Set(ids).size !== ids.length) return { ok: false, error: `PP ${number} has the same leg twice` };
    const ov = tr.oddsOverride == null || tr.oddsOverride === '' ? null : num(tr.oddsOverride);
    if (tr.oddsOverride != null && tr.oddsOverride !== '' && (ov == null || ov <= 1)) return { ok: false, error: `PP ${number}: odds must be above 1` };
    const tstake = tr.stake == null || tr.stake === '' ? null : num(tr.stake);
    if (tr.stake != null && tr.stake !== '' && (tstake == null || tstake <= 0)) return { ok: false, error: `PP ${number}: stake must be above 0` };
    tickets.push({ id, number, legIds: ids, placed: tr.placed !== false, oddsOverride: ov, stake: tstake });
  }
  tickets.sort((a, b) => a.number - b.number);
  return { ok: true, value: { name, placedDate, book: str(r.book), stake, targetOdds, money, scheme, notes: str(r.notes, 2000), tiers, legs, tickets } };
}

/** A short random id for legs, tickets and tiers made in the browser. */
export const ppId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

/** The lowest PP number not used yet. */
export const nextNumber = (tickets: PPTicket[]) => {
  const used = new Set(tickets.map((t) => t.number));
  let n = 1;
  while (used.has(n)) n++;
  return n;
};
