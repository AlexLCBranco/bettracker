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

import { normalize } from './autocomplete';
import type { PPBatch, PPLeg, PPTicket, PPTier } from './pp';

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
  /** Toggles, off by default until the owner says otherwise. */
  noSameGame: boolean;
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
  const base: PPScheme = { count: 20, target: batch.targetOdds, bandMin: 15, bandMax: 30, majorShares: placeholderShares(levels), shotCount: PLACEHOLDER_SHOTS, noSameGame: false, avoidPairs: false, seed: 1 };
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
    noSameGame: from.noSameGame === true,
    avoidPairs: from.avoidPairs === true,
    seed: Math.round(num(from.seed, 1)),
  };
}

/** How many PPs each leg should be on. */
export function appearances(legs: PPLeg[], tiers: PPTier[], s: PPScheme): Map<string, number> {
  const r = roles(tiers);
  const m = new Map<string, number>();
  for (const l of legs) {
    const role = r.get(l.tier);
    if (!role) continue;
    if (role.role === 'every') m.set(l.id, s.count);
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
  const mm = of('every');
  const majors = of('share');
  const shots = of('fixed');
  const L0 = mm.reduce((a, l) => a + ln(l.odds), 0);
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

  const build = (): string[] => {
    const ids = mm.map((l) => l.id);
    let odds = mm.reduce((p, l) => p * l.odds, 1);
    const games = new Set(mm.map((l) => normalize(l.game)).filter(Boolean));
    let cands = pool.filter((l) => (rem.get(l.id) ?? 0) > 0);
    while (cands.length) {
      cands = cands.filter((l) => !ids.includes(l.id) && odds * l.odds <= s.bandMax + 1e-9 && !(s.noSameGame && l.game && games.has(normalize(l.game))));
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
      if (l.game) games.add(normalize(l.game));
    }
    return ids;
  };

  for (let n = 0; n < s.count; n++) {
    let ids: string[] = [];
    let ok = false;
    for (let attempt = 0; attempt < 25 && !ok; attempt++) {
      ids = build();
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
  return { tickets: made.map((legIds, i) => ({ id: makeId(i), number: i + 1, legIds, placed: false, oddsOverride: null })), shortfalls, dropped };
}

export interface Preview {
  legs: { min: number; avg: number; max: number };
  odds: { min: number; avg: number; max: number };
  outside: number;
  appearances: { leg: PPLeg; wanted: number; got: number }[];
  totalStake: number;
  totalPotential: number;
}

/** The live preview of a generation. */
export function preview(batch: Pick<PPBatch, 'legs' | 'tiers' | 'stake'>, s: PPScheme, g: Generated): Preview {
  const byId = new Map(batch.legs.map((l) => [l.id, l]));
  const odds = g.tickets.map((t) => t.legIds.reduce((p, id) => p * (byId.get(id)?.odds ?? 1), 1));
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
    totalStake: Math.round(g.tickets.length * batch.stake * 100) / 100,
    totalPotential: Math.round(odds.reduce((a, o) => a + o * batch.stake, 0) * 100) / 100,
  };
}

/** The copy-friendly line of a PP: "PP 3 · Jokic 12+ ast + Celtics ML + Curry 5+ threes · 18.40". */
export function placeLine(t: PPTicket, legs: PPLeg[], odds: number): string {
  const byId = new Map(legs.map((l) => [l.id, l]));
  return `PP ${t.number} · ${t.legIds.map((id) => byId.get(id)?.selection ?? '?').join(' + ')} · ${odds.toFixed(2)}`;
}
