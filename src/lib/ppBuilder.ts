// BT-31: the PP builder. Plain rules and arithmetic, no AI.
//
// Tier roles come from the batch's tier order: the first tier (Major-major) is on EVERY PP; the last (PP shot, when
// there are 3+ tiers) is the shots; the tiers between are Major levels. Owner, 2026-11-27: one Major per PP ("Majors per
// PP", per level, 1 by default), the Majors taking turns evenly.
//
// PP shots (owner, 2026-11-27, "VERY IMPORTANT"): every shot has the same weight: each is on EXACTLY the same number of
// PPs. Shots per PP is worked out from the target (or typed), and the shots split evenly only when
// PPs × shots per PP = shots × PPs each, in whole numbers. He plans how many shots he will send; when they do not split
// evenly the planner suggests the nearest numbers of shots (fewer or more) or of PPs that do, and Generate waits until
// the pool's shots split evenly.
//
// Generator: every PP gets its Major-majors, then its shots (the shots with the most places left first, so every shot
// ends on exactly its PPs), then its Majors (the most places left first, then the one bringing the PP closest to the
// target). Owner, 2026-11-27: the target (about 20) is flexible a little, the MINIMUM is not: no PP may end under
// bandMin. The Majors are picked so each PP reaches it, and Generate waits while any PP would still be under it.
// bandMax is only reported.
//
// Hard rule (owner, 2026-11-27): two legs from the same game are never on the same PP, whatever their tiers (a combo:
// any of its parts' games). Major-majors from one game take turns: each PP gets exactly one of them, spread evenly.

import { normalize } from './autocomplete';
import { equalPayoutStakes, type PPBatch, type PPLeg, type PPTicket, type PPTier } from './pp';

export interface PPScheme {
  /** Number of PPs. */
  count: number;
  target: number;
  /** The minimum odds of a PP: hard, no PP under it (owner, 2026-11-27). */
  bandMin: number;
  /** Up to: flexible, only reported. */
  bandMax: number;
  /** Majors on each PP, for each Major level, highest level first (owner: 1). */
  majorsPerPP: number[];
  /** PP shots on each PP: typed, or (shotsPerPPAuto) worked out from the target. */
  shotsPerPP: number;
  shotsPerPPAuto: boolean;
  /** The PP shots he plans to send; null = the planner's suggestion. */
  plannedShots: number | null;
  /** PPs each PP shot is on: worked out by effectiveScheme (PPs × shots per PP ÷ the pool's shots), never typed. */
  shotCount: number;
  /** Toggle, off by default until the owner says otherwise. (Same-game legs are never together: always on.) */
  avoidPairs: boolean;
  /** Keeps a generation reproducible. */
  seed: number;
}

export type Role = 'every' | 'share' | 'fixed';

export const MAJORS_PER_PP = 1;
/** The PPs each shot is on that the planner's suggested number of shots aims at. */
export const PLANNING_EACH = 2;

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
  const base: PPScheme = { count: 20, target: batch.targetOdds, bandMin: 15, bandMax: 30, majorsPerPP: Array.from({ length: levels }, () => MAJORS_PER_PP), shotsPerPP: 1, shotsPerPPAuto: true, plannedShots: null, shotCount: 0, avoidPairs: false, seed: 1 };
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
    shotsPerPP: Math.max(0, Math.round(num(from.shotsPerPP, base.shotsPerPP))),
    shotsPerPPAuto: from.shotsPerPPAuto !== false,
    plannedShots: null,
    shotCount: 0,
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

/**
 * The Major-majors grouped by game, in pool order: the legs of one group take turns. A combo Major-major is grouped
 * with every Major-major sharing any of its parts' games (they can never share a PP), so groups chain through combos.
 */
export function mmGroups(legs: PPLeg[], tiers: PPTier[]): PPLeg[][] {
  const r = roles(tiers);
  let groups: { keys: Set<string>; legs: PPLeg[] }[] = [];
  for (const l of legs) {
    if (r.get(l.tier)?.role !== 'every') continue;
    const ks = gameKeys(l);
    const hit = groups.filter((g) => ks.some((k) => g.keys.has(k)));
    const merged = { keys: new Set([...ks, ...hit.flatMap((g) => [...g.keys])]), legs: [...hit.flatMap((g) => g.legs), l] };
    // the merged group keeps the place of its first group, its legs in pool order
    merged.legs.sort((a, b) => legs.indexOf(a) - legs.indexOf(b));
    const at = hit.length ? groups.indexOf(hit[0]!) : groups.length;
    groups = groups.filter((g) => !hit.includes(g));
    groups.splice(Math.min(at, groups.length), 0, merged);
  }
  return groups.map((g) => g.legs);
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
    else if (role.role === 'fixed') m.set(l.id, s.shotCount);
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

/** What the average PP comes to with the scheme (the PPs stay as typed). */
export function propose(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme): Proposal {
  const r = roles(batch.tiers);
  const of = (role: Role) => batch.legs.filter((l) => r.get(l.tier)?.role === role);
  const shots = of('fixed');
  if (!batch.legs.length) return { scheme: s, average: 1, message: 'Add legs to the pool first.', short: true };
  // Major-majors of one game take turns: each game adds its legs' average (log) odds
  const L0 = mmGroups(batch.legs, batch.tiers).reduce((a, g) => a + g.reduce((x, l) => x + ln(l.odds), 0) / g.length, 0);
  const shotTerm = shots.length ? (s.shotsPerPP * shots.reduce((a, l) => a + ln(l.odds), 0)) / shots.length : 0;
  const average = Math.exp(L0 + majorsLn(of('share'), r, s) + shotTerm);
  const levels = s.majorsPerPP.map((_, k) => perLevel(s, k));
  const what = `${s.count} PPs${levels.length ? `, ${levels.join(' / ')} Major${levels.length === 1 && levels[0] === 1 ? '' : 's'} per PP` : ''}${shots.length ? `, ${s.shotsPerPP} PP shot${s.shotsPerPP === 1 ? '' : 's'} per PP` : ''}`;
  if (average < s.bandMin) return { scheme: s, average, message: `${what}: the average PP is ${average.toFixed(2)}, under the band from ${s.bandMin}. Add a PP shot per PP or longer-priced legs.`, short: true };
  if (average > s.bandMax) return { scheme: s, average, message: `${what}: the average PP is ${average.toFixed(2)}, over the band to ${s.bandMax}. Take legs out or raise the band.`, short: true };
  return { scheme: s, average, message: `${what}: the average PP is ${average.toFixed(2)}.`, short: false };
}

/** A typical PP shot price when the pool has none yet. */
export const DEFAULT_SHOT_ODDS = 3;

/** The pool's PP shots at their average price (geometric), else DEFAULT_SHOT_ODDS. */
export function typicalShotOdds(batch: Pick<PPBatch, 'legs' | 'tiers'>): number {
  const r = roles(batch.tiers);
  const shots = batch.legs.filter((l) => r.get(l.tier)?.role === 'fixed');
  return shots.length ? Math.round(Math.exp(shots.reduce((a, l) => a + ln(l.odds), 0) / shots.length) * 100) / 100 : DEFAULT_SHOT_ODDS;
}

/** How shots split over the PPs: every shot on the same number of PPs. */
export interface Split {
  /** Shot places: PPs × shots per PP. */
  places: number;
  shots: number;
  /** PPs each shot is on; null when they do not split evenly. */
  each: number | null;
  /** The nearest numbers of shots that split evenly (fewer / more), and of PPs (keeping the shots). */
  fewer: { shots: number; each: number } | null;
  more: { shots: number; each: number } | null;
  fewerPPs: { count: number; each: number } | null;
  morePPs: { count: number; each: number } | null;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Owner, 2026-11-27: the shots split evenly when PPs × shots per PP = shots × PPs each, all whole numbers. */
export function split(count: number, perPP: number, shots: number): Split {
  const places = count * perPP;
  const each = shots > 0 && places > 0 && places % shots === 0 ? places / shots : null;
  let fewer: Split['fewer'] = null;
  let more: Split['more'] = null;
  let fewerPPs: Split['fewerPPs'] = null;
  let morePPs: Split['morePPs'] = null;
  if (places > 0 && shots > 0) {
    for (let d = Math.min(shots - 1, places); d >= 1; d--) if (places % d === 0) { fewer = { shots: d, each: places / d }; break; }
    for (let d = shots + 1; d <= places; d++) if (places % d === 0) { more = { shots: d, each: places / d }; break; }
    // PPs that make it split with these shots: multiples of shots ÷ gcd(shots, shots per PP)
    const step = shots / gcd(shots, perPP);
    const below = Math.floor((count - 1) / step) * step;
    if (below >= step) fewerPPs = { count: below, each: (below * perPP) / shots };
    const above = (Math.floor(count / step) + 1) * step;
    morePPs = { count: above, each: (above * perPP) / shots };
  }
  return { places, shots, each, fewer, more, fewerPPs, morePPs };
}

/** The shots the planner suggests sending: the number that splits evenly with each shot nearest PLANNING_EACH PPs. */
export function suggestedShots(count: number, perPP: number): number {
  const places = count * perPP;
  if (places <= 0) return 0;
  // ties: fewer shots to find
  let best = 0;
  for (let d = 1; d <= places; d++) if (places % d === 0 && (!best || Math.abs(places / d - PLANNING_EACH) < Math.abs(places / best - PLANNING_EACH))) best = d;
  return best;
}

export interface ShotPlan {
  /** The batch has a PP-shot tier (3+ tiers). */
  hasShotTier: boolean;
  mm: number;
  majors: number;
  /** The average PP's odds before any shot (geometric): Major-majors (same-game ones at their average) and its Majors per PP. */
  base: number;
  /** PP shots a PP needs on average to land on the target (a fraction); 0 when the base already reaches it. */
  need: number;
  /** Shots per PP worked out from the target: need rounded (up when rounding down leaves the average PP under the minimum), at least 1 when any is needed. */
  autoPerPP: number;
  /** Shots per PP used: worked out, or typed. */
  perPP: number;
  /** The average PP with perPP shots at the shot price. */
  average: number;
  /** The shots he plans to send (typed, else suggested) and how they split. */
  planned: number;
  plannedSplit: Split;
  /** The pool's shots and how they split (what Generate uses). */
  have: number;
  poolSplit: Split;
}

/**
 * Owner, 2026-11-27: "how many PP shots do I need?", then "I should plan the number of PP shots I'll send and it should
 * suggest more or less if there isn't a round system". Plain arithmetic on log odds, as the proposal.
 */
export function shotPlan(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme, shotOdds: number): ShotPlan {
  const r = roles(batch.tiers);
  const of = (role: Role) => batch.legs.filter((l) => r.get(l.tier)?.role === role);
  const majors = of('share');
  const L0 = mmGroups(batch.legs, batch.tiers).reduce((a, g) => a + g.reduce((x, l) => x + ln(l.odds), 0) / g.length, 0);
  const majorLn = majorsLn(majors, r, s);
  const base = Math.exp(L0 + majorLn);
  const gap = ln(s.target) - L0 - majorLn;
  const need = gap > 1e-9 && shotOdds > 1 ? gap / ln(shotOdds) : 0;
  // the nearer to the target of the whole numbers around need, never leaving the average PP under the minimum
  let autoPerPP = 0;
  if (need > 0) {
    const avgWith = (m: number) => base * Math.pow(shotOdds, m);
    const options = [...new Set([Math.max(1, Math.floor(need)), Math.max(1, Math.ceil(need))])].filter((m) => avgWith(m) >= s.bandMin - 1e-9);
    if (options.length) autoPerPP = options.sort((a, b) => Math.abs(ln(avgWith(a)) - ln(s.target)) - Math.abs(ln(avgWith(b)) - ln(s.target)))[0]!;
    else for (autoPerPP = Math.max(1, Math.ceil(need)); autoPerPP < 10 && avgWith(autoPerPP) < s.bandMin - 1e-9; autoPerPP++);
  }
  const perPP = s.shotsPerPPAuto ? autoPerPP : Math.max(0, Math.round(s.shotsPerPP));
  const planned = s.plannedShots ?? suggestedShots(s.count, perPP);
  const have = of('fixed').length;
  return {
    hasShotTier: batch.tiers.length >= 3,
    mm: of('every').length,
    majors: majors.length,
    base,
    need,
    autoPerPP,
    perPP,
    average: base * Math.pow(shotOdds, perPP),
    planned,
    plannedSplit: split(s.count, perPP, planned),
    have,
    poolSplit: split(s.count, perPP, have),
  };
}

/** The scheme the generator and preview use: shots per PP worked out (or typed), and PPs each from the pool's shots (0 when they do not split evenly). */
export function effectiveScheme(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme): PPScheme {
  const p = shotPlan(batch, s, typicalShotOdds(batch));
  return { ...s, shotsPerPP: p.perPP, shotCount: p.poolSplit.each ?? 0 };
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
  /** PPs the same as an earlier one (too few legs to make them all different). */
  dropped: number;
  /** The pool's shots do not split evenly over the PPs: nothing is generated (every shot must have the same weight). */
  notEven: boolean;
  /** PPs under the minimum odds (hard: Generate waits while any is). */
  underMin: number;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Generates the PPs (reproducible by seed). Tickets are numbered 1..n, not placed yet. Every shot ends on exactly s.shotCount PPs. */
export function generate(batch: Pick<PPBatch, 'legs' | 'tiers'>, s: PPScheme, makeId: (i: number) => string = (i) => `pp-${s.seed}-${i + 1}`): Generated {
  const r = roles(batch.tiers);
  const order = new Map(batch.legs.map((l, i) => [l.id, i]));
  const tierPos = new Map(batch.tiers.map((t, i) => [t.id, i]));
  const byId = new Map(batch.legs.map((l) => [l.id, l]));
  const sortLegs = (ids: string[]) => [...ids].sort((a, b) => tierPos.get(byId.get(a)!.tier)! - tierPos.get(byId.get(b)!.tier)! || order.get(a)! - order.get(b)!);
  const want = appearances(batch.legs, batch.tiers, s);
  const shots = batch.legs.filter((l) => r.get(l.tier)?.role === 'fixed');
  const mmIds = new Set(batch.legs.filter((l) => r.get(l.tier)?.role === 'every').map((l) => l.id));
  const majorLevelsLegs: PPLeg[][] = [];
  for (const l of batch.legs) {
    const role = r.get(l.tier);
    if (role?.role === 'share') (majorLevelsLegs[role.level] ??= []).push(l);
  }
  const perPP = shots.length ? s.shotsPerPP : 0;
  // every shot the same weight: nothing until the shots split evenly
  if (perPP > 0 && (s.shotCount <= 0 || s.count * perPP !== shots.length * s.shotCount)) return { tickets: [], shortfalls: [], dropped: 0, notEven: true, underMin: 0 };
  const groups = mmGroups(batch.legs, batch.tiers);
  const T = ln(s.target);

  const attempt = (seed: number) => {
    const rand = rng(seed);
    const rem = new Map(want);
    const pairs = new Map<string, number>();
    const seen = new Set<string>();
    let repeats = 0;
    let underMin = 0;
    const made: string[][] = [];
    // a random order for ties, fixed per attempt
    const tie = new Map(batch.legs.map((l) => [l.id, rand()]));
    for (let n = 0; n < s.count; n++) {
      const mine = mmFor(groups, n);
      const ids = mine.map((l) => l.id);
      let odds = mine.reduce((p, l) => p * l.odds, 1);
      const games = new Set(mine.flatMap(gameKeys));
      const free = (l: PPLeg) => !ids.includes(l.id) && !gameKeys(l).some((k) => games.has(k));
      const repeatsOf = (l: PPLeg) => (s.avoidPairs ? ids.filter((id) => !mmIds.has(id)).reduce((a, id) => a + (pairs.get(pairKey(id, l.id)) ?? 0), 0) : 0);
      const add = (l: PPLeg) => {
        ids.push(l.id);
        odds *= l.odds;
        for (const k of gameKeys(l)) games.add(k);
      };
      // shots: the most places left first (so each ends on exactly its PPs), fewer repeated pairs, then the tie order
      for (let j = 0; j < perPP; j++) {
        const cands = shots.filter((l) => free(l) && (rem.get(l.id) ?? 0) > 0);
        if (!cands.length) break;
        cands.sort((a, b) => rem.get(b.id)! - rem.get(a.id)! || repeatsOf(a) - repeatsOf(b) || tie.get(a.id)! - tie.get(b.id)!);
        add(cands[0]!);
      }
      // Majors: the most places left first, then the one bringing the PP closest to the target, and a PP unlike the others
      majorLevelsLegs.forEach((ls, k) => {
        for (let j = 0; j < perLevel(s, k); j++) {
          const cands = ls.filter(free);
          if (!cands.length) break;
          const last = j === perLevel(s, k) - 1 && k === majorLevelsLegs.length - 1;
          const key = (l: PPLeg) => [...ids, l.id].sort().join(',');
          // the last Major: one that lifts the PP to the minimum first (the minimum is hard)
          const under = (l: PPLeg) => Number(last && odds * l.odds < s.bandMin - 1e-9);
          cands.sort(
            (a, b) =>
              under(a) - under(b) ||
              (last ? Number(seen.has(key(a))) - Number(seen.has(key(b))) : 0) ||
              Math.max(0, rem.get(b.id) ?? 0) - Math.max(0, rem.get(a.id) ?? 0) ||
              repeatsOf(a) - repeatsOf(b) ||
              Math.abs(ln(odds * a.odds) - T) - Math.abs(ln(odds * b.odds) - T) ||
              tie.get(a.id)! - tie.get(b.id)!,
          );
          add(cands[0]!);
        }
      });
      if (odds < s.bandMin - 1e-9) underMin++;
      const key = [...ids].sort().join(',');
      if (seen.has(key)) repeats++;
      seen.add(key);
      for (const id of ids) if (rem.has(id)) rem.set(id, rem.get(id)! - 1);
      for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) pairs.set(pairKey(ids[a]!, ids[b]!), (pairs.get(pairKey(ids[a]!, ids[b]!)) ?? 0) + 1);
      made.push(sortLegs(ids));
    }
    const short = shots.reduce((a, l) => a + Math.max(0, rem.get(l.id) ?? 0), 0);
    return { made, repeats, short, underMin };
  };
  // a few tie orders: the first where every shot is on exactly its PPs (the same-game rule can get in the way)
  let best = attempt(s.seed);
  const worse = (a: typeof best, b: typeof best) => a.short - b.short || a.underMin - b.underMin || a.repeats - b.repeats;
  for (let i = 1; i < 40 && (best.short > 0 || best.underMin > 0 || best.repeats > 0); i++) {
    const a = attempt(s.seed * 7919 + i);
    if (worse(a, best) < 0) best = a;
  }
  const got = new Map<string, number>();
  for (const ids of best.made) for (const id of ids) got.set(id, (got.get(id) ?? 0) + 1);
  const shortfalls = batch.legs.filter((l) => want.has(l.id) && (got.get(l.id) ?? 0) < want.get(l.id)!).map((l) => ({ legId: l.id, wanted: want.get(l.id)!, got: got.get(l.id) ?? 0 }));
  return { tickets: best.made.map((legIds, i) => ({ id: makeId(i), number: i + 1, legIds, placed: false, oddsOverride: null, stake: null })), shortfalls, dropped: best.repeats, notEven: false, underMin: best.underMin };
}

export interface Preview {
  legs: { min: number; avg: number; max: number };
  odds: { min: number; avg: number; max: number };
  outside: number;
  /** Under the minimum (hard). */
  under: number;
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
    under: odds.filter((o) => o < s.bandMin - 1e-9).length,
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
