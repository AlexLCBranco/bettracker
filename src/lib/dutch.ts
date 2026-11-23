// Dutch bets: several ordinary solo bets that share a `dutchId`. Money figures stay bet by bet everywhere; counts
// (bets, pending, wins, losses, win rate) treat a whole dutch as ONE bet.

import { formatDate, parseDateInput, todayISO } from './dates';
import { profit } from './money';
import type { Bet, BetInput, Result, Situation } from './types';
import { validateBet } from './validate';

export type BetRow = { kind: 'bet'; bet: Bet } | { kind: 'dutch'; dutchId: string; bets: Bet[] };

const byCreated = (a: Bet, b: Bet) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Table rows: a dutch becomes one row at the position of its first bet in `bets` (which keeps its order otherwise),
 * holding its bets in the order they were logged.
 */
export function groupRows(bets: Bet[]): BetRow[] {
  const rows: BetRow[] = [];
  const groups = new Map<string, Bet[]>();
  for (const b of bets) {
    if (!b.dutchId) {
      rows.push({ kind: 'bet', bet: b });
      continue;
    }
    let g = groups.get(b.dutchId);
    if (!g) {
      g = [];
      groups.set(b.dutchId, g);
      rows.push({ kind: 'dutch', dutchId: b.dutchId, bets: g });
    }
    g.push(b);
  }
  for (const g of groups.values()) g.sort(byCreated);
  return rows;
}

/** The bets of a row, flattened back. */
export const rowBets = (r: BetRow): Bet[] => (r.kind === 'bet' ? [r.bet] : r.bets);

export type GroupOutcome = 'pending' | 'won' | 'lost' | 'even';

/** A dutch (or any set of bets counted as one): pending while any is pending; else by net profit's sign. */
export function groupOutcome(bets: Bet[]): GroupOutcome {
  if (bets.some((b) => b.result === 'pending')) return 'pending';
  const net = bets.reduce((s, b) => s + profit(b), 0);
  const cents = Math.round(net * 100);
  return cents > 0 ? 'won' : cents < 0 ? 'lost' : 'even';
}

export interface DutchSummary {
  stake: number;
  /** 1 / Σ(1/odds): the single odds the dutch behaves like. */
  combinedOdds: number;
  /** Net profit of its settled bets. */
  profit: number;
  outcome: GroupOutcome;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function dutchSummary(bets: Bet[]): DutchSummary {
  return {
    stake: round2(bets.reduce((s, b) => s + b.stake, 0)),
    combinedOdds: 1 / bets.reduce((s, b) => s + 1 / b.odds, 0),
    profit: round2(bets.reduce((s, b) => s + (b.result === 'pending' ? 0 : profit(b)), 0)),
    outcome: groupOutcome(bets),
  };
}

export interface Counts {
  /** Bets, a dutch counted once. */
  count: number;
  pending: number;
  wins: number;
  losses: number;
}

/**
 * Counts with a dutch as one bet. A plain bet is a win only when its result is won, a loss only when lost (half
 * results, void and cash-out are neither), as before. A dutch is a win when its net profit is above 0, a loss when
 * below 0, neither at exactly 0, and pending while any of its bets is pending.
 */
export function countBets(bets: Bet[]): Counts {
  const c: Counts = { count: 0, pending: 0, wins: 0, losses: 0 };
  for (const r of groupRows(bets)) {
    c.count++;
    if (r.kind === 'bet') {
      if (r.bet.result === 'pending') c.pending++;
      else if (r.bet.result === 'won') c.wins++;
      else if (r.bet.result === 'lost') c.losses++;
      continue;
    }
    const o = groupOutcome(r.bets);
    if (o === 'pending') c.pending++;
    else if (o === 'won') c.wins++;
    else if (o === 'lost') c.losses++;
  }
  return c;
}

/** Every bet of any dutch that has at least one bet in `matched` is added (a group matches when any of its bets does). */
export function withWholeGroups(all: Bet[], matched: Bet[]): Bet[] {
  const ids = new Set(matched.map((b) => b.dutchId).filter((d): d is string => !!d));
  if (!ids.size) return matched;
  const keep = new Set(matched.map((b) => b.id));
  return all.filter((b) => keep.has(b.id) || (b.dutchId != null && ids.has(b.dutchId)));
}

// ---- The "log as bets" form ----

export interface DutchDraftRow {
  selection: string;
  /** Unrounded decimal odds. */
  odds: number;
  stake: number;
  /** null = same book as the row above (the first row: the last-used book). */
  book: string | null;
}

export interface DutchDraft {
  rows: DutchDraftRow[];
  sport: string;
  game: string;
  market: string;
  situation: Situation;
  /** dd/mm/yyyy as typed */
  placedDate: string;
  gameDate: string;
}

export function newDutchDraft(rows: { selection: string; odds: number; stake: number }[], defaults: { sport: string; situation: Situation }, today = todayISO()): DutchDraft {
  return {
    rows: rows.map((r) => ({ ...r, book: null })),
    sport: defaults.sport,
    game: '',
    market: '',
    situation: defaults.situation,
    placedDate: formatDate(today),
    gameDate: formatDate(today),
  };
}

/** Duplicate a dutch: the same selections, odds, stakes and books, dated today, to log as a new dutch. */
export function duplicateDutchDraft(bets: Bet[], today = todayISO()): DutchDraft {
  const first = bets[0]!.legs[0];
  return {
    rows: bets.map((b) => ({ selection: b.legs[0]?.selection || b.betText, odds: b.odds, stake: b.stake, book: b.book })),
    sport: first?.sport ?? '',
    game: first?.game ?? '',
    market: first?.market ?? '',
    situation: bets[0]!.situation,
    placedDate: formatDate(today),
    gameDate: formatDate(today),
  };
}

/** The book each row really gets: its own, or the one above it, or (first row) the last-used book. */
export function resolvedBooks(rows: DutchDraftRow[], lastBook: string): string[] {
  const out: string[] = [];
  for (const [i, r] of rows.entries()) out.push(r.book ?? (i === 0 ? lastBook : out[i - 1]!));
  return out;
}

/** One solo bet per row, pending, all with the same new dutch id. */
export function draftToBets(d: DutchDraft, lastBook: string, dutchId: string, today = todayISO()): { ok: true; value: BetInput[] } | { ok: false; error: string } {
  if (d.rows.length < 2) return { ok: false, error: 'A dutch needs at least two selections' };
  const placedDate = d.placedDate.trim() ? parseDateInput(d.placedDate, today) : today;
  if (!placedDate) return { ok: false, error: 'Placed date: use dd/mm/yyyy' };
  const gameDate = d.gameDate.trim() ? parseDateInput(d.gameDate, today) : placedDate;
  if (!gameDate) return { ok: false, error: 'Game date: use dd/mm/yyyy' };
  const books = resolvedBooks(d.rows, lastBook);
  const out: BetInput[] = [];
  for (const [i, r] of d.rows.entries()) {
    const result: Result = 'pending';
    const v = validateBet({
      book: books[i],
      placedDate,
      gameDate,
      type: 'solo',
      situation: d.situation,
      stake: r.stake,
      odds: r.odds,
      result,
      cashout: null,
      preAnalysis: '',
      postAnalysis: '',
      betText: '',
      dutchId,
      legs: [{ sport: d.sport, game: d.game, market: d.market, selection: r.selection, odds: r.odds, result }],
    });
    if (!v.ok) return { ok: false, error: `${r.selection || `Selection ${i + 1}`}: ${v.error}` };
    out.push(v.value);
  }
  return { ok: true, value: out };
}
