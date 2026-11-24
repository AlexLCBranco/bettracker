// BT-36: the ladder simulator. Plan a ladder rung by rung: start stake, odds per rung (one for all, any rung typed
// over), what the money becomes, the total odds, and the chance of getting there if every bet is fair at its odds.

import { chainOrder } from './rollover';
import type { Bet, Result } from './types';

export interface SimPlan {
  start: number;
  /** The odds every rung follows unless typed over. */
  odds: number;
  rungs: number;
  /** Rung number (1..) → its own odds. Changing `odds` never wipes these. */
  overrides: Record<number, number>;
  /** Rung number (0 = the start) → a one-line note. */
  notes: Record<number, string>;
  target: number | null;
  money: 'real' | 'hypothetical';
  /** Loaded from a real ladder ("Open in sim"): its placed rungs, not editable. */
  locked: { rung: number; odds: number; result: Result }[];
  fromLadder: string | null;
}

export const MIN_RUNGS = 1;
export const MAX_RUNGS = 30;

export const DEFAULT_PLAN: SimPlan = { start: 100, odds: 2, rungs: 10, overrides: {}, notes: {}, target: null, money: 'real', locked: [], fromLadder: null };

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SimRow {
  /** 0 = the start. */
  rung: number;
  odds: number;
  /** Typed over the top odds. */
  override: boolean;
  /** A placed rung of a real ladder. */
  locked: Result | null;
  stakeIn: number;
  pays: number;
  /** Pays − start. */
  profit: number;
  /** Product of the odds so far ("×6.86"). */
  totalOdds: number;
  /** Chance of reaching this rung's payout if every bet is fair: product of 1 / odds (a won locked rung is certain). */
  chance: number;
  /** After the rung that first reaches the target (shown dimmed). */
  afterTarget: boolean;
}

export interface Sim {
  rows: SimRow[];
  /** The first rung whose payout reaches the target; null without a target or when no rung does. */
  targetRung: number | null;
  /** Odds per rung needed to reach the target in `rungs` rungs (Nth root); null without a target. */
  needed: number | null;
  end: number;
  totalOdds: number;
  chance: number;
}

/** The odds a rung plays at: a locked rung's real odds (a void counts 1), an override, or the top odds. */
export function rungOdds(plan: SimPlan, rung: number): { odds: number; override: boolean; locked: Result | null } {
  const l = plan.locked.find((x) => x.rung === rung);
  if (l) return { odds: l.result === 'void' ? 1 : l.odds, override: false, locked: l.result };
  const o = plan.overrides[rung];
  return o != null ? { odds: o, override: true, locked: null } : { odds: plan.odds, override: false, locked: null };
}

export function simulate(plan: SimPlan): Sim {
  const n = Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, Math.round(plan.rungs)));
  const rows: SimRow[] = [{ rung: 0, odds: 1, override: false, locked: null, stakeIn: round2(plan.start), pays: round2(plan.start), profit: 0, totalOdds: 1, chance: 1, afterTarget: false }];
  let amount = plan.start;
  let total = 1;
  let chance = 1;
  let targetRung: number | null = plan.target != null && plan.start >= plan.target ? 0 : null;
  for (let r = 1; r <= n; r++) {
    const { odds, override, locked } = rungOdds(plan, r);
    const stakeIn = amount;
    amount = stakeIn * odds;
    total *= odds;
    if (locked !== 'won' && locked !== 'void') chance *= odds > 0 ? 1 / odds : 0;
    if (locked === 'lost') chance = 0;
    rows.push({ rung: r, odds, override, locked, stakeIn: round2(stakeIn), pays: round2(amount), profit: round2(amount - plan.start), totalOdds: total, chance, afterTarget: targetRung != null });
    if (targetRung == null && plan.target != null && round2(amount) >= plan.target) targetRung = r;
  }
  const needed = plan.target != null && plan.start > 0 && plan.target > plan.start ? Math.pow(plan.target / plan.start, 1 / n) : null;
  return { rows, targetRung, needed, end: round2(amount), totalOdds: total, chance };
}

/** "14.6%"; under 1%, 2 decimals ("0.10%"); tiny: "<0.01%". */
export function formatChance(p: number): string {
  const pct = p * 100;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return pct > 0 ? '<0.01%' : '0%';
}

/** "1 in 613" (under 1% only, else null). */
export const oneIn = (p: number) => (p > 0 && p < 0.01 ? `1 in ${Math.round(1 / p).toLocaleString('en-US')}` : null);

/** "×6.86", "×1024". */
export function formatTotal(x: number): string {
  const s = x.toFixed(2);
  return `×${s.endsWith('.00') ? s.slice(0, -3) : s}`;
}

export interface Play {
  /** Rungs won in a row (0 = the first lost). */
  won: number;
  /** The rung that lost; null when every rung won. */
  lostAt: number | null;
}

/** "Try it": one play with random results at the fair chances (W until the first L). Locked rungs keep their result. */
export function playOnce(sim: Sim, rand: () => number = Math.random): Play {
  let won = 0;
  for (const r of sim.rows.slice(1)) {
    const win = r.locked === 'won' || r.locked === 'void' ? true : r.locked === 'lost' ? false : rand() < 1 / r.odds;
    if (!win) return { won, lostAt: r.rung };
    won++;
  }
  return { won, lostAt: null };
}

export interface Tally {
  tries: number;
  best: number;
  reachedGoal: number;
}

/** Adds a play to the running tally; the goal is the target's rung, or every rung without a target. */
export function addPlay(t: Tally, p: Play, sim: Sim): Tally {
  const goal = sim.targetRung ?? sim.rows.length - 1;
  return { tries: t.tries + 1, best: Math.max(t.best, p.won), reachedGoal: t.reachedGoal + (p.won >= goal ? 1 : 0) };
}

/** Reads a saved plan; anything broken falls back to the defaults. */
export function readPlan(raw: unknown): SimPlan {
  if (!raw || typeof raw !== 'object') return DEFAULT_PLAN;
  const r = raw as Partial<SimPlan>;
  const pos = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
  const rec = <T,>(v: unknown, ok: (x: unknown) => x is T): Record<number, T> =>
    v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k, x]) => /^\d+$/.test(k) && ok(x)).map(([k, x]) => [Number(k), x as T])) : {};
  return {
    start: pos(r.start, DEFAULT_PLAN.start),
    odds: pos(r.odds, DEFAULT_PLAN.odds) > 1 ? pos(r.odds, 2) : DEFAULT_PLAN.odds,
    rungs: Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, Math.round(pos(r.rungs, DEFAULT_PLAN.rungs)))),
    overrides: rec(r.overrides, (x): x is number => typeof x === 'number' && x > 1),
    notes: rec(r.notes, (x): x is string => typeof x === 'string'),
    target: typeof r.target === 'number' && r.target > 0 ? r.target : null,
    money: r.money === 'hypothetical' ? 'hypothetical' : 'real',
    locked: Array.isArray(r.locked) ? r.locked.filter((x) => x && typeof x.rung === 'number' && typeof x.odds === 'number') : [],
    fromLadder: typeof r.fromLadder === 'string' ? r.fromLadder : null,
  };
}

/** "Open in sim": a real ladder's rungs, placed ones locked, the plan's rung count / target from its goal. */
export function planFromLadder(chain: Bet[], current: SimPlan): SimPlan {
  const bets = chainOrder(chain);
  const first = bets[0]!;
  const goal = bets.find((b) => b.ladder)?.ladder;
  const placed = bets.length;
  const rungs = Math.max(MIN_RUNGS, Math.min(MAX_RUNGS, goal?.goalRungs ?? Math.max(current.rungs, placed + 1)));
  const lastOdds = bets.at(-1)!.odds;
  return {
    ...current,
    start: first.stake,
    odds: current.odds > 1 ? current.odds : lastOdds,
    rungs: Math.max(rungs, placed),
    overrides: {},
    notes: Object.fromEntries(bets.map((b, i) => [i + 1, b.betText])),
    target: goal?.goalAmount ?? current.target,
    money: first.money === 'hypothetical' ? 'hypothetical' : 'real',
    locked: bets.map((b, i) => ({ rung: i + 1, odds: b.result === 'cash-out' && b.cashout != null && b.stake > 0 ? b.cashout / b.stake : b.odds, result: b.result })),
    fromLadder: first.rolloverId,
  };
}
