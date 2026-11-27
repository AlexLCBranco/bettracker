// BT-31: the PP builder. Plain rules and arithmetic, no AI.
//
// Tier roles come from the batch's tier order: the first tier (Major-major) is on EVERY PP; the last (PP shot, when
// there are 3+ tiers) is on a fixed number of PPs per leg; the tiers between are Major levels. Owner, 2026-11-27: one
// Major per PP ("Majors per PP", per level, 1 by default), the Majors taking turns evenly. PP shots on 2 PPs each is a
// placeholder he will tune; the last batch's scheme is the start of the next one.
//
// Proposal (Claude's rules, not the owner's): about one PP shot per PP, so PPs = shot count × shot legs (without shot
// legs: the scheme's count), and what the AVERAGE PP (geometric: mean of log odds) comes to. Generator: every PP starts
// with the Major-majors, then exactly its Majors per level (weighted by their remaining appearances), then PP shots
// until the PP is inside the odds band, as close to the target as the next leg allows.
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
  /** Majors on each PP, for each Major level, highest level first (owner: 1). */
  majorsPerPP: number[];
  /** PPs each PP-shot leg is on: typed, or (shotAuto) the planning number until the pool has shots. */
  shotCount: number;
  /** Owner, 2026-11-27: PPs each worked out from the pool's shots (effectiveScheme); typing a number turns it off. */
  shotAuto: boolean;
  /** Toggle, off by default until the owner says otherwise. (Same-game legs are never together: always on.) */
  avoidPairs: boolean;
  /** Keeps a generation reproducible. */
  seed: number;
}

export type Role = 'every' | 'share' | 'fixed';

export const MAJORS_PER_PP = 1;
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


/** The scheme a batch starts from: its own, else the last batch's (fitted to this batch's levels), else the defaults. */
export function startingScheme(batch: Pick<PPBatch, 'tiers' | 'targetOdds' | 'scheme'>, previous: Record<string, unknown> | null): PPScheme {
  const levels = majorLevels(batch.tiers);
  const base: PPScheme = { count: 20, target: batch.targetOdds, bandMin: 15, bandMax: 30, majorsPerPP: Array.from({ length: levels }, () => MAJORS_PER_PP), shotCount: PLACEHOLDER_SHOTS, shotAuto: true, avoidPairs: false, seed: 1 };
  const from = (batch.scheme ?? previous) as Partial<PPScheme> | null;
  if (!from) return base;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  // schemes from before (a share of PPs per Major level) start again at one Major per PP
  const per = Array.isArray(from.majorsPerPP) ? from.majorsPerPP.filter((x): x is number => typeof x === 'number' && x >= 0).map(Math.round) : [];
  return {
    count: Math.max(1, Math.round(num(from.count, base.count))),
    target: batch.scheme ? num(from.target, base.target) : batch.targetOdds,
    bandMin: num(from.bandMin, base.bandMin),
    bandMax: num(from.bandMax, base.bandMax),
    majorsPerPP: Array.from({ length: levels }, (_, i) => per[i] ?? per.at(-1) ?? MAJORS_PER_PP),
    shotCount: Math.max(0, Math.round(num(from.shotCount, base.shotCount))),
    shotAuto: from.shotAuto !== false,
    avoidPairs: from.avoidPairs === true,
    seed: Math.round(num(from.seed, 1)),
  };
}

/** The game a leg is from; a leg with no game typed is a game of its own. */
export const gameKey = (l: Pick<PPLeg, 'id' | 'game'>) => (l.game.trim() ? `g:${normalize(l.game).replace(/\s+/g, ' ')}` : `id:${l.id}`);

/** Every game a leg is from: a combo's parts' games (a part with no game typed is a game of its own), else its game. */
export function gameKeys(l: Pick<PPLeg, 'id' | 'game'> & { parts?: PPLeg['parts'] }): string[] {
  if (!l.parts?.length) return [gameKey(l)];
  return [...new Set(l.parts.map((x, i) => gameKey({ id: `${l.id}#${i}`, game: x.game })))];
}

/** Two different legs sharing a game (a combo: any of its parts' games): they can never share a PP. */
export const sameGame = (a: Pick<PPLeg, 'id' | 'game'> & { parts?: PPLeg['parts'] }, b: Pick<PPLeg, 'id' | 'game'> & { parts?: PPLeg['parts'] }) => {
  if (a.id === b.id) return false;
  const ka = new Set(gameKeys(a));
  return gameKeys(b).some((k) => ka.has(k));
};

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

/** Majors per PP on a level (never negative). */
export const perLevel = (s: Pick<PPScheme, 'majorsPerPP'>, level: number) => Math.max(0, Math.round(s.majorsPerPP[level] ?? MAJORS_PER_PP));

/** The average (log) odds Majors add to a PP: per level, its Majors per PP × the level's average log odds. */
function majorsLn(majors: PPLeg[], r: Map<string, { role: Role; level: number }>, s: PPScheme): number {
  const levels = new Map<number, PPLeg[]>();
  for (const l of majors) levels.set(r.get(l.tier)!.level, [...(levels.get(r.get(l.tier)!.level) ?? []), l]);
  let total = 0;
  for (const [k, ls] of levels) total += (Math.min(perLevel(s, k), ls.length) * ls.reduce((a, l) => a + Math.log(l.odds), 0)) / ls.length;
  return total;
}

/** How many PPs each leg should be on. */
export function appearances(legs: PPLeg[], tiers: PPTier[], s: PPScheme): Map<string, number> {
  const r = roles(tiers);
  const m = new Map<string, number>();
  const mmTurns = new Map<string, number>();
  const groups = mmGroups(legs, tiers);
  for (let n = 0; n < s.count; n++) for (const l of mmFor(groups, n)) mmTurns.set(l.id, (mmTurns.get(l.id) ?? 0) + 1);
  // a Major level's places (PPs × Majors per PP) shared out evenly over its legs, in pool order
  const levelLegs = new Map<number, PPLeg[]>();
  for (const l of legs) {
    const role = r.get(l.tier);
    if (role?.role === 'share') levelLegs.set(role.level, [...(levelLegs.get(role.level) ?? []), l]);
  }
  for (const [k, ls] of levelLegs) {
    const places = s.count * Math.min(perLevel(s, k), ls.length);
    ls.forEach((l, i) => m.set(l.id, Math.floor(places / ls.length) + (i < places % ls.length ? 1 : 0)));
  }
  for (const l of legs) {
    const role = r.get(l.tier);
    if (!role) continue;
    if (role.role === 'every') m.set(l.id, mmTurns.get(l.id) ?? 0);
    else if (role.role === 'fixed') m.set(l.id, Math.min(s.count, s.shotCount));
  }
  return m;
}

const ln = Math.log;

export interface Proposal {
  scheme: PPScheme;
  /** The average PP's odds with the proposal (geometric). */
  average: number;
  /** Plain words: what was proposed, or what is missing. */
  message: string;
  /** The pool cannot reach the target. */
  short: boolean;
}

/** Proposes the number of PPs from the pool and says what the average PP comes to (see the top of this file). */
export function propose(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme): Proposal {
  const r = roles(batch.tiers);
  const of = (role: Role) => batch.legs.filter((l) => r.get(l.tier)?.role === role);
  const shots = of('fixed');
  if (!batch.legs.length) return { scheme: s, average: 1, message: 'Add legs to the pool first.', short: true };
  // Major-majors of one game take turns: each game adds its legs' average (log) odds
  const L0 = mmGroups(batch.legs, batch.tiers).reduce((a, g) => a + g.reduce((x, l) => x + ln(l.odds), 0) / g.length, 0);
  // PPs each worked out from the PPs: the PPs stay as typed (otherwise each would follow the other)
  const count = !s.shotAuto && shots.length && s.shotCount > 0 ? s.shotCount * shots.length : s.count;
  const shotsPerPP = count > 0 ? (Math.min(count, s.shotCount) * shots.length) / count : 0;
  const shotTerm = count > 0 ? (Math.min(count, s.shotCount) * shots.reduce((a, l) => a + ln(l.odds), 0)) / count : 0;
  const average = Math.exp(L0 + majorsLn(of('share'), r, s) + shotTerm);
  const levels = s.majorsPerPP.map((_, k) => perLevel(s, k));
  const what = `${count} PPs${shots.length ? ` (PP shots on ${s.shotCount} each: about ${shotsPerPP.toFixed(1)} per PP)` : ''}${levels.length ? `, ${levels.join(' / ')} Major${levels.length === 1 && levels[0] === 1 ? '' : 's'} per PP` : ''}`;
  if (average < s.bandMin)
    return { scheme: { ...s, count }, average, message: `${what}: the average PP is ${average.toFixed(2)}, under the band from ${s.bandMin}. Add PP shots (the line above says how many) or longer-priced legs.`, short: true };
  if (average > s.bandMax)
    return { scheme: { ...s, count }, average, message: `${what}: the average PP is ${average.toFixed(2)}, over the band to ${s.bandMax}. Take legs out or raise the band.`, short: true };
  return { scheme: { ...s, count }, average, message: `${what}: the average PP is ${average.toFixed(2)}.`, short: false };
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
  /** The average PP's odds before any shot (geometric): Major-majors (same-game ones at their average) and its Majors per PP. */
  base: number;
  /** PP shots each PP needs on average to land on the target; 0 when the base already reaches it. */
  perPP: number;
  /** Shot places to fill: PPs × shots per PP. */
  places: number;
  /** PP-shot legs the pool needs: PPs × shots per PP ÷ PPs each shot is on (the typed or planning number; rounded up). */
  needed: number;
  /** PPs each of the pool's shots goes on: worked out (places ÷ shots, rounded up, at most the PPs) when automatic and the pool has shots, else the typed number. */
  each: number;
  /** each was worked out from the pool. */
  auto: boolean;
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
  const majorLn = majorsLn(majors, r, s);
  const base = Math.exp(L0 + majorLn);
  const gap = ln(s.target) - L0 - majorLn;
  const perPP = gap > 1e-9 && shotOdds > 1 ? gap / ln(shotOdds) : 0;
  const places = s.count * perPP;
  const needed = perPP > 0 && s.shotCount > 0 ? Math.ceil(places / s.shotCount - 1e-9) : 0;
  const have = of('fixed').length;
  const auto = s.shotAuto && have > 0;
  const each = auto ? (perPP > 0 ? Math.min(s.count, Math.ceil(places / have - 1e-9)) : 0) : s.shotCount;
  return { hasShotTier: batch.tiers.length >= 3, mm: of('every').length, majors: majors.length, base, perPP, places, needed, each, auto, have, missing: Math.max(0, needed - have) };
}

/** The scheme the generator, proposal and preview use: PPs each worked out from the pool's shots at their average price when automatic. */
export function effectiveScheme(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme): PPScheme {
  if (!s.shotAuto) return s;
  const p = shotPlan(batch, s, typicalShotOdds(batch));
  return p.auto ? { ...s, shotCount: p.each } : s;
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
  const shotPool = batch.legs.filter((l) => r.get(l.tier)?.role === 'fixed');
  const majorLevelsLegs: PPLeg[][] = [];
  for (const l of batch.legs) {
    const role = r.get(l.tier);
    if (role?.role === 'share') (majorLevelsLegs[role.level] ??= []).push(l);
  }
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
    const games = new Set(mine.flatMap(gameKeys));
    const free = (l: PPLeg) => !ids.includes(l.id) && !gameKeys(l).some((k) => games.has(k));
    // weighted by remaining appearances (no weight left: any of them evenly); repeated pairs made much less likely when
    // asked (the major-majors are on every PP: their pairs cannot be avoided and do not count)
    const draw = (cands: PPLeg[], fallback: boolean): PPLeg | null => {
      const repeats = (l: PPLeg) => ids.filter((id) => !mmIds.has(id)).reduce((a, id) => a + (pairs.get(pairKey(id, l.id)) ?? 0), 0);
      const left = (l: PPLeg) => Math.max(0, rem.get(l.id) ?? 0);
      const base = fallback && cands.every((l) => left(l) === 0) ? () => 1 : left;
      const fresh = s.avoidPairs && cands.some((l) => base(l) > 0 && repeats(l) === 0);
      const w = cands.map((l) => {
        const x = base(l);
        if (!s.avoidPairs) return x;
        // a leg making no repeated pair is always preferred while one is left
        return fresh ? (repeats(l) === 0 ? x : 0) : x / (1 + 20 * repeats(l));
      });
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) return null;
      let pick = rand() * total;
      let i = 0;
      while (i < w.length - 1 && pick >= w[i]!) pick -= w[i++]!;
      return cands[i]!;
    };
    const add = (l: PPLeg) => {
      ids.push(l.id);
      odds *= l.odds;
      for (const k of gameKeys(l)) games.add(k);
    };
    // Majors: exactly the level's Majors per PP (ones keeping the PP under the band top first)
    majorLevelsLegs.forEach((ls, k) => {
      for (let j = 0; j < perLevel(s, k); j++) {
        const cands = ls.filter(free);
        const fits = cands.filter((l) => odds * l.odds <= s.bandMax + 1e-9);
        const l = draw(fits.length ? fits : cands, true);
        if (!l) break;
        add(l);
      }
    });
    // PP shots until the PP is inside the band
    let cands = shotPool.filter((l) => (rem.get(l.id) ?? 0) > 0);
    while (cands.length) {
      cands = cands.filter((l) => free(l) && odds * l.odds <= s.bandMax + 1e-9);
      if (!cands.length) break;
      const l = draw(cands, false);
      if (!l) break;
      const next = odds * l.odds;
      // inside the band: only a leg that brings it closer to the target is still added
      if (odds >= s.bandMin && Math.abs(ln(next) - T) >= Math.abs(ln(odds) - T)) break;
      add(l);
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
