// BT-31: the PP builder. Plain rules and arithmetic, no AI.
//
// Tier roles come from the batch's tier order: the first tier (Major-major) is on EVERY PP; the last (PP shot, when
// there are 3+ tiers) is on a fixed number of PPs per leg; the tiers between are Major levels, each on a share of the
// PPs (higher level, higher share). The owner gave no default numbers: Majors 50% (lower levels 10 points less each)
// and PP shots on 2 PPs each are placeholders he will tune; the last batch's scheme is the start of the next one.
//
// Proposal (Claude's rules, not the owner's): about one PP shot per PP, so PPs = shot count × shot legs (without shot
// legs: the scheme's count); the Major share is then solved so the AVERAGE PP (geometric: mean of log odds) lands on
// the target. Generator: every PP starts with the Major-majors, then legs are drawn from Majors and PP shots weighted
// by their remaining appearances until the PP is inside the odds band, as close to the target as the next leg allows.
//
// Hard rule (owner, 2026-11-27): two legs from the same game are never on the same PP, whatever their tiers.
// Major-majors from one game take turns: each PP gets exactly one of them, spread evenly.

import { normalize } from './autocomplete';
import { equalPayoutStakes, type PPBatch, type PPLeg, type PPTicket, type PPTier } from './pp';

export interface PPScheme {
  /** Number of PPs. */
  count: number;
  target: number;
  bandMin: number;
  bandMax: number;
  /** Share of PPs (0-100) for each Major level, highest level first. */
  majorShares: number[];
  /** PPs each PP-shot leg is on. */
  shotCount: number;
  /** Toggle, off by default until the owner says otherwise. (Same-game legs are never together: always on.) */
  avoidPairs: boolean;
  /** Keeps a generation reproducible. */
  seed: number;
}

export type Role = 'every' | 'share' | 'fixed';

export const PLACEHOLDER_SHARE = 50;
export const PLACEHOLDER_SHOTS = 2;

/** Each tier's role by its place in the order. */
export function roles(tiers: PPTier[]): Map<string, { role: Role; level: number }> {
  const m = new Map<string, { role: Role; level: number }>();
  tiers.forEach((t, i) => {
    if (i === 0) m.set(t.id, { role: 'every', level: 0 });
    else if (i === tiers.length - 1 && tiers.length >= 3) m.set(t.id, { role: 'fixed', level: 0 });
    else m.set(t.id, { role: 'share', level: i - 1 });
  });
  return m;
}

export const majorLevels = (tiers: PPTier[]) => [...roles(tiers).values()].filter((r) => r.role === 'share').length;

/** Placeholder shares: 50%, 40%, 30% ... (never under 5%). */
export const placeholderShares = (levels: number) => Array.from({ length: levels }, (_, i) => Math.max(5, PLACEHOLDER_SHARE - 10 * i));

/** The scheme a batch starts from: its own, else the last batch's (fitted to this batch's levels), else placeholders. */
export function startingScheme(batch: Pick<PPBatch, 'tiers' | 'targetOdds' | 'scheme'>, previous: Record<string, unknown> | null): PPScheme {
  const levels = majorLevels(batch.tiers);
  const base: PPScheme = { count: 20, target: batch.targetOdds, bandMin: 15, bandMax: 30, majorShares: placeholderShares(levels), shotCount: PLACEHOLDER_SHOTS, avoidPairs: false, seed: 1 };
  const from = (batch.scheme ?? previous) as Partial<PPScheme> | null;
  if (!from) return base;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const shares = Array.isArray(from.majorShares) ? from.majorShares.filter((x): x is number => typeof x === 'number') : [];
  return {
    count: Math.max(1, Math.round(num(from.count, base.count))),
    target: batch.scheme ? num(from.target, base.target) : batch.targetOdds,
    bandMin: num(from.bandMin, base.bandMin),
    bandMax: num(from.bandMax, base.bandMax),
    majorShares: Array.from({ length: levels }, (_, i) => shares[i] ?? shares.at(-1) ?? base.majorShares[i]!),
    shotCount: Math.max(0, Math.round(num(from.shotCount, base.shotCount))),
    avoidPairs: from.avoidPairs === true,
    seed: Math.round(num(from.seed, 1)),
  };
}

/** The game a leg is from; a leg with no game typed is a game of its own. */
export const gameKey = (l: Pick<PPLeg, 'id' | 'game'>) => (l.game.trim() ? `g:${normalize(l.game).replace(/\s+/g, ' ')}` : `id:${l.id}`);

/** Two different legs from the same game: they can never share a PP. */
export const sameGame = (a: Pick<PPLeg, 'id' | 'game'>, b: Pick<PPLeg, 'id' | 'game'>) => a.id !== b.id && gameKey(a) === gameKey(b);

/** The Major-majors grouped by game, in pool order: the legs of one group take turns. */
export function mmGroups(legs: PPLeg[], tiers: PPTier[]): PPLeg[][] {
  const r = roles(tiers);
  const groups = new Map<string, PPLeg[]>();
  for (const l of legs) if (r.get(l.tier)?.role === 'every') groups.set(gameKey(l), [...(groups.get(gameKey(l)) ?? []), l]);
  return [...groups.values()];
}

/** The Major-majors on PP n (0-based): one per game, counting through the groups so every combination comes up. */
export function mmFor(groups: PPLeg[][], n: number): PPLeg[] {
  let k = n;
  return groups.map((g) => {
    const l = g[k % g.length]!;
    k = Math.floor(k / g.length);
    return l;
  });
}

/** How many PPs each leg should be on. */
export function appearances(legs: PPLeg[], tiers: PPTier[], s: PPScheme): Map<string, number> {
  const r = roles(tiers);
  const m = new Map<string, number>();
  const mmTurns = new Map<string, number>();
  const groups = mmGroups(legs, tiers);
  for (let n = 0; n < s.count; n++) for (const l of mmFor(groups, n)) mmTurns.set(l.id, (mmTurns.get(l.id) ?? 0) + 1);
  for (const l of legs) {
    const role = r.get(l.tier);
    if (!role) continue;
    if (role.role === 'every') m.set(l.id, mmTurns.get(l.id) ?? 0);
    else if (role.role === 'fixed') m.set(l.id, Math.min(s.count, s.shotCount));
    else m.set(l.id, Math.min(s.count, Math.round(((s.majorShares[role.level] ?? 0) / 100) * s.count)));
  }
  return m;
}

const ln = Math.log;
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Proposal {
  scheme: PPScheme;
  /** The average PP's odds with the proposal (geometric). */
  average: number;
  /** Plain words: what was proposed, or what is missing. */
  message: string;
  /** The pool cannot reach the target. */
  short: boolean;
}

/** Proposes the number of PPs and the Major shares from the pool (see the top of this file). */
export function propose(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme): Proposal {
  const r = roles(batch.tiers);
  const of = (role: Role) => batch.legs.filter((l) => r.get(l.tier)?.role === role);
  const majors = of('share');
  const shots = of('fixed');
  // Major-majors of one game take turns: each game adds its legs' average (log) odds
  const L0 = mmGroups(batch.legs, batch.tiers).reduce((a, g) => a + g.reduce((x, l) => x + ln(l.odds), 0) / g.length, 0);
  const count = shots.length && s.shotCount > 0 ? s.shotCount * shots.length : s.count;
  const shotTerm = count > 0 ? (Math.min(count, s.shotCount) * shots.reduce((a, l) => a + ln(l.odds), 0)) / count : 0;
  // the Major levels keep the ratio between their current shares (placeholder 50 : 40 : 30)
  const levels = s.majorShares.length;
  const first = s.majorShares[0] ?? 0;
  const ratio = first > 0 ? s.majorShares.map((x) => x / first) : placeholderShares(levels).map((x) => x / PLACEHOLDER_SHARE);
  const majorLn = Array.from({ length: levels }, (_, k) => majors.filter((l) => r.get(l.tier)!.level === k).reduce((a, l) => a + ln(l.odds), 0));
  const perShare = majorLn.reduce((a, x, k) => a + ratio[k]! * x, 0);
  const need = ln(s.target) - L0 - shotTerm;
  const avgWith = (share: number) => Math.exp(L0 + shotTerm + share * perShare);
  if (!batch.legs.length) return { scheme: s, average: 1, message: 'Add legs to the pool first.', short: true };
  if (need <= 0) {
    const avg = avgWith(0);
    return {
      scheme: { ...s, count, majorShares: s.majorShares.map(() => 0) },
      average: avg,
      message: `The Major-majors${shots.length ? ' and PP shots' : ''} alone already average ${avg.toFixed(2)}, at or over the target ${s.target.toFixed(2)}: no Majors are needed. Raise the target or take a Major-major out.`,
      short: false,
    };
  }
  const top = perShare > 0 ? need / perShare : Infinity;
  if (!(top <= 1)) {
    const best = avgWith(1);
    const missing = Math.exp(need - Math.max(0, perShare));
    return {
      scheme: { ...s, count, majorShares: ratio.map((x) => Math.min(100, round1(100 * x))) },
      average: best,
      message: `The pool cannot reach ${s.target.toFixed(2)}: with every Major on every PP the average PP is ${best.toFixed(2)}. It is missing about ×${missing.toFixed(2)} of odds: add more Majors or longer-priced legs${shots.length ? ', or more PP shots' : ''}.`,
      short: true,
    };
  }
  const shares = ratio.map((x) => Math.min(100, Math.max(0, round1(100 * top * x))));
  const scheme = { ...s, count, majorShares: shares };
  const average = avgWith(top);
  return {
    scheme,
    average,
    message: `${count} PPs${shots.length ? ` (PP shots on ${s.shotCount} each: about one per PP)` : ''}, Majors ${shares.map((x) => `${x}%`).join(' / ')}: the average PP is ${average.toFixed(2)}.`,
    short: false,
  };
}

/** A typical PP shot price when the pool has none yet. */
export const DEFAULT_SHOT_ODDS = 3;

/** The pool's PP shots at their average price (geometric), else DEFAULT_SHOT_ODDS. */
export function typicalShotOdds(batch: Pick<PPBatch, 'legs' | 'tiers'>): number {
  const r = roles(batch.tiers);
  const shots = batch.legs.filter((l) => r.get(l.tier)?.role === 'fixed');
  return shots.length ? Math.round(Math.exp(shots.reduce((a, l) => a + ln(l.odds), 0) / shots.length) * 100) / 100 : DEFAULT_SHOT_ODDS;
}

export interface ShotPlan {
  /** The batch has a PP-shot tier (3+ tiers). */
  hasShotTier: boolean;
  mm: number;
  majors: number;
  /** The average PP's odds before any shot (geometric): Major-majors (same-game ones at their average) and Majors at their shares. */
  base: number;
  /** PP shots each PP needs on average to land on the target; 0 when the base already reaches it. */
  perPP: number;
  /** PP-shot legs the pool needs: PPs × shots per PP ÷ PPs each shot is on (rounded up). */
  needed: number;
  have: number;
  /** Still to find (0 when there are enough). */
  missing: number;
}

/**
 * Owner, 2026-11-27: "with 1 Major-major and 4 Majors, how many PP shots do I need?" From the target, the number of PPs
 * and the PPs each shot is on, at a typical shot price. Plain arithmetic on log odds, as the proposal.
 */
export function shotPlan(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme, shotOdds: number): ShotPlan {
  const r = roles(batch.tiers);
  const of = (role: Role) => batch.legs.filter((l) => r.get(l.tier)?.role === role);
  const majors = of('share');
  const L0 = mmGroups(batch.legs, batch.tiers).reduce((a, g) => a + g.reduce((x, l) => x + ln(l.odds), 0) / g.length, 0);
  const majorLn = majors.reduce((a, l) => a + (Math.min(100, Math.max(0, s.majorShares[r.get(l.tier)!.level] ?? 0)) / 100) * ln(l.odds), 0);
  const base = Math.exp(L0 + majorLn);
  const gap = ln(s.target) - L0 - majorLn;
  const perPP = gap > 1e-9 && shotOdds > 1 ? gap / ln(shotOdds) : 0;
  const needed = perPP > 0 && s.shotCount > 0 ? Math.ceil((s.count * perPP) / s.shotCount - 1e-9) : 0;
  const have = of('fixed').length;
  return { hasShotTier: batch.tiers.length >= 3, mm: of('every').length, majors: majors.length, base, perPP, needed, have, missing: Math.max(0, needed - have) };
}

/** A small seeded random generator (mulberry32): the same seed gives the same PPs. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Shortfall {
  legId: string;
  wanted: number;
  got: number;
}

export interface Generated {
  tickets: PPTicket[];
  shortfalls: Shortfall[];
  /** PPs that could not be made different from the others (no two identical PPs). */
  dropped: number;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Generates the PPs (semi-random, reproducible by seed). Tickets are numbered 1..n, not placed yet. */
export function generate(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme, makeId: (i: number) => string = (i) => `pp-${s.seed}-${i + 1}`): Generated {
  const r = roles(batch.tiers);
  const order = new Map(batch.legs.map((l, i) => [l.id, i]));
  const tierPos = new Map(batch.tiers.map((t, i) => [t.id, i]));
  const sortLegs = (ids: string[]) => [...ids].sort((a, b) => tierPos.get(byId.get(a)!.tier)! - tierPos.get(byId.get(b)!.tier)! || order.get(a)! - order.get(b)!);
  const byId = new Map(batch.legs.map((l) => [l.id, l]));
  const want = appearances(batch.legs, batch.tiers, s);
  const rem = new Map(want);
  const mm = batch.legs.filter((l) => r.get(l.tier)?.role === 'every');
  const mmIds = new Set(mm.map((l) => l.id));
  const pool = batch.legs.filter((l) => r.get(l.tier)?.role === 'share' || r.get(l.tier)?.role === 'fixed');
  const rand = rng(s.seed);
  const made: string[][] = [];
  const seen = new Set<string>();
  const pairs = new Map<string, number>();
  let dropped = 0;
  const T = ln(s.target);

  const groups = mmGroups(batch.legs, batch.tiers);
  const build = (n: number): string[] => {
    const mine = mmFor(groups, n);
    const ids = mine.map((l) => l.id);
    let odds = mine.reduce((p, l) => p * l.odds, 1);
    const games = new Set(mine.map(gameKey));
    let cands = pool.filter((l) => (rem.get(l.id) ?? 0) > 0);
    while (cands.length) {
      cands = cands.filter((l) => !ids.includes(l.id) && odds * l.odds <= s.bandMax + 1e-9 && !games.has(gameKey(l)));
      if (!cands.length) break;
      // weighted by remaining appearances; repeated pairs made much less likely when asked
      // (the major-majors are on every PP: their pairs cannot be avoided and do not count)
      const repeats = (l: PPLeg) => ids.filter((id) => !mmIds.has(id)).reduce((a, id) => a + (pairs.get(pairKey(id, l.id)) ?? 0), 0);
      const fresh = s.avoidPairs && cands.some((l) => (rem.get(l.id) ?? 0) > 0 && repeats(l) === 0);
      const w = cands.map((l) => {
        const x = rem.get(l.id) ?? 0;
        if (!s.avoidPairs) return x;
        // a leg making no repeated pair is always preferred while one is left
        return fresh ? (repeats(l) === 0 ? x : 0) : x / (1 + 20 * repeats(l));
      });
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) break;
      let pick = rand() * total;
      let i = 0;
      while (i < w.length - 1 && pick >= w[i]!) pick -= w[i++]!;
      const l = cands[i]!;
      const next = odds * l.odds;
      // inside the band: only a leg that brings it closer to the target is still added
      if (odds >= s.bandMin && Math.abs(ln(next) - T) >= Math.abs(ln(odds) - T)) break;
      ids.push(l.id);
      odds = next;
      games.add(gameKey(l));
    }
    return ids;
  };

  for (let n = 0; n < s.count; n++) {
    let ids: string[] = [];
    let ok = false;
    for (let attempt = 0; attempt < 25 && !ok; attempt++) {
      ids = build(made.length); // turns go by PPs made, so a dropped one takes no turn
      const key = [...ids].sort().join(',');
      if (ids.length && !seen.has(key)) {
        seen.add(key);
        ok = true;
      }
    }
    if (!ok) {
      dropped++;
      continue;
    }
    for (const id of ids) if (rem.has(id)) rem.set(id, rem.get(id)! - 1);
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) pairs.set(pairKey(ids[a]!, ids[b]!), (pairs.get(pairKey(ids[a]!, ids[b]!)) ?? 0) + 1);
    made.push(sortLegs(ids));
  }
  const got = new Map<string, number>();
  for (const ids of made) for (const id of ids) got.set(id, (got.get(id) ?? 0) + 1);
  const shortfalls = batch.legs.filter((l) => want.has(l.id) && (got.get(l.id) ?? 0) < want.get(l.id)!).map((l) => ({ legId: l.id, wanted: want.get(l.id)!, got: got.get(l.id) ?? 0 }));
  return { tickets: made.map((legIds, i) => ({ id: makeId(i), number: i + 1, legIds, placed: false, oddsOverride: null, stake: null })), shortfalls, dropped };
}

export interface Preview {
  legs: { min: number; avg: number; max: number };
  odds: { min: number; avg: number; max: number };
  outside: number;
  appearances: { leg: PPLeg; wanted: number; got: number }[];
  /** Each PP's stake, same payout on every PP (equalPayoutStakes). */
  stakes: number[];
  totalStake: number;
  totalPotential: number;
}

/** The live preview of a generation. */
export function preview(batch: Pick<PPBatch, 'legs' | 'tiers' | 'stake'>, s: PPScheme, g: Generated): Preview {
  const byId = new Map(batch.legs.map((l) => [l.id, l]));
  const odds = g.tickets.map((t) => t.legIds.reduce((p, id) => p * (byId.get(id)?.odds ?? 1), 1));
  const stakes = equalPayoutStakes(odds, batch.stake);
  const counts = g.tickets.map((t) => t.legIds.length);
  const stat = (xs: number[]) => (xs.length ? { min: Math.min(...xs), avg: xs.reduce((a, b) => a + b, 0) / xs.length, max: Math.max(...xs) } : { min: 0, avg: 0, max: 0 });
  const want = appearances(batch.legs, batch.tiers, s);
  const got = new Map<string, number>();
  for (const t of g.tickets) for (const id of t.legIds) got.set(id, (got.get(id) ?? 0) + 1);
  return {
    legs: stat(counts),
    odds: stat(odds),
    outside: odds.filter((o) => o < s.bandMin - 1e-9 || o > s.bandMax + 1e-9).length,
    appearances: batch.legs.map((leg) => ({ leg, wanted: want.get(leg.id) ?? 0, got: got.get(leg.id) ?? 0 })),
    stakes,
    totalStake: Math.round(stakes.reduce((a, x) => a + x, 0) * 100) / 100,
    totalPotential: Math.round(odds.reduce((a, o, i) => a + o * stakes[i]!, 0) * 100) / 100,
  };
}

/** The copy-friendly line of a PP: "PP 3 · Jokic 12+ ast + Celtics ML + Curry 5+ threes · 18.40". */
export function placeLine(t: PPTicket, legs: PPLeg[], odds: number): string {
  const byId = new Map(legs.map((l) => [l.id, l]));
  return `PP ${t.number} · ${t.legIds.map((id) => byId.get(id)?.selection ?? '?').join(' + ')} · ${odds.toFixed(2)}`;
}
