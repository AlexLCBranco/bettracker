// Dutch bets: several ordinary solo bets that share a `dutchId`. Money figures stay bet by bet everywhere; counts
// (bets, pending, wins, losses, win rate) treat a whole dutch as ONE bet.

import { formatDate, parseDateInput, todayISO } from './dates';
import { profit } from './money';
import type { Bet, BetInput, Leg, Result, Situation } from './types';
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

/** What a bet is called in a dutch: a combination's bet text (its legs joined), else its selection. */
export function betLabel(b: Bet): string {
  if (b.type === 'combination')
    return (
      b.betText ||
      b.legs
        .map((l) => l.selection)
        .filter(Boolean)
        .join(' + ') ||
      'combination'
    );
  return b.legs[0]?.selection || b.betText || 'selection';
}

const legKey = (selection: string) => selection.trim().toLowerCase();

/**
 * The legs every bet of a dutch has in common (same selection, ignoring case): its shared legs. Only when every bet
 * is a combination with legs; in the order they appear on the first bet.
 */
export function sharedLegNames(bets: Bet[]): string[] {
  if (bets.length < 2 || !bets.every((b) => b.type === 'combination' && b.legs.length >= 2)) return [];
  const sets = bets.map((b) => new Set(b.legs.map((l) => legKey(l.selection)).filter(Boolean)));
  return bets[0]!.legs.map((l) => l.selection.trim()).filter((s, i, a) => s && a.indexOf(s) === i && sets.every((set) => set.has(legKey(s))));
}

export const isLeg = (selection: string, name: string) => legKey(selection) === legKey(name);

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
// Game and market are chips (BT-8): the dutch lists every game and market it uses, and each leg picks its own.

export interface DraftLeg {
  selection: string;
  /** Unrounded decimal odds; null = not entered. */
  odds: number | null;
  /** Picked game / market; '' or missing = nothing picked (see resolvedPicks). */
  game?: string;
  market?: string;
}

export interface DutchDraftRow {
  /** For a combination split: its leg names joined with " + ". */
  selection: string;
  /** The split's own legs (a solo split: one, its selection). The draft's shared legs are added to every row. */
  legs: DraftLeg[];
  /** Unrounded decimal odds (a combination's total odds). */
  odds: number;
  stake: number;
  /** null = same book as the row above (the first row: the last-used book). */
  book: string | null;
  /** Editing a logged dutch (BT-12): the bet this row saves over; none = a split added in the edit. */
  betId?: string;
}

export interface DutchDraft {
  rows: DutchDraftRow[];
  /** Legs that are part of every split, set once and copied to every bet. */
  shared: DraftLeg[];
  sport: string;
  /** The chips: every game / market this dutch uses. */
  games: string[];
  markets: string[];
  situation: Situation;
  /** dd/mm/yyyy as typed */
  placedDate: string;
  gameDate: string;
}

type DraftRowIn = { selection: string; odds: number; stake: number; legs?: DraftLeg[] };

export function newDutchDraft(rows: DraftRowIn[], defaults: { sport: string; situation: Situation }, today = todayISO(), shared: DraftLeg[] = []): DutchDraft {
  return {
    rows: rows.map((r) => ({ ...r, legs: r.legs?.length ? r.legs : [{ selection: r.selection, odds: r.odds }], book: null })),
    shared,
    sport: defaults.sport,
    games: [],
    markets: [],
    situation: defaults.situation,
    placedDate: formatDate(today),
    gameDate: formatDate(today),
  };
}

const distinct = (xs: string[]) => xs.map((x) => x.trim()).filter((x, i, a) => x && a.indexOf(x) === i);

/** Duplicate a dutch: the same selections, odds, stakes, books, games and markets, dated today, to log as a new dutch. */
export function duplicateDutchDraft(bets: Bet[], today = todayISO()): DutchDraft {
  return { ...draftOf(bets), placedDate: formatDate(today), gameDate: formatDate(today) };
}

/** Edit a logged dutch (BT-12): its draft as saved (dates included), each row tied to its bet. */
export function editDutchDraft(bets: Bet[]): DutchDraft {
  const d = draftOf(bets);
  return {
    ...d,
    rows: d.rows.map((r, i) => ({ ...r, betId: bets[i]!.id })),
    placedDate: formatDate(bets.map((b) => b.placedDate).sort()[0]!),
    gameDate: formatDate(bets.map((b) => b.gameDate).sort()[0]!),
  };
}

function draftOf(bets: Bet[]): Omit<DutchDraft, 'placedDate' | 'gameDate'> {
  const sharedNames = sharedLegNames(bets);
  const isShared = (sel: string) => sharedNames.some((n) => isLeg(sel, n));
  const pick = (l: Leg): DraftLeg => ({ selection: l.selection, odds: l.odds, game: l.game, market: l.market });
  const allLegs = bets.flatMap((b) => b.legs);
  return {
    rows: bets.map((b) => ({
      selection: betLabel(b),
      odds: b.odds,
      stake: b.stake,
      book: b.book,
      legs: b.legs.length ? b.legs.filter((l) => !isShared(l.selection)).map(pick) : [{ selection: betLabel(b), odds: b.odds }],
    })),
    shared: sharedNames.map((n) => pick(bets[0]!.legs.find((l) => isLeg(l.selection, n))!)),
    sport: bets[0]!.legs[0]?.sport ?? '',
    games: distinct(allLegs.map((l) => l.game)),
    markets: distinct(allLegs.map((l) => l.market)),
    situation: bets[0]!.situation,
  };
}

/** The book each row really gets: its own, or the one above it, or (first row) the last-used book. */
export function resolvedBooks(rows: DutchDraftRow[], lastBook: string): string[] {
  const out: string[] = [];
  for (const [i, r] of rows.entries()) out.push(r.book ?? (i === 0 ? lastBook : out[i - 1]!));
  return out;
}

export type PickField = 'game' | 'market';

export interface ResolvedPick {
  /** The value the leg gets; null = nothing picked while there are several chips (the form is invalid). */
  value: string | null;
  /** Not picked on this leg: the only chip, or copied from the leg above. */
  inherited: boolean;
}

/**
 * The game or market each leg really gets. Own legs, row by row: the leg's own pick, else the one picked above it
 * (quick fill, like books), else the only chip, else '' when there are no chips. Shared legs: their own pick, else the
 * only chip. With several chips and nothing to go on: null.
 */
export function resolvedPicks(d: DutchDraft, field: PickField): { rows: ResolvedPick[][]; shared: ResolvedPick[] } {
  const chips = field === 'game' ? d.games : d.markets;
  const fallback = chips.length === 0 ? '' : chips.length === 1 ? chips[0]! : null;
  let above: string | null = null;
  const rows = d.rows.map((r) =>
    r.legs.map((l): ResolvedPick => {
      const own = (l[field] ?? '').trim();
      if (own) {
        above = own;
        return { value: own, inherited: false };
      }
      return { value: above ?? fallback, inherited: true };
    }),
  );
  const shared = d.shared.map((l): ResolvedPick => {
    const own = (l[field] ?? '').trim();
    return own ? { value: own, inherited: false } : { value: fallback, inherited: true };
  });
  return { rows, shared };
}

/** One pending bet per row (a combination when it has 2+ legs with the shared ones), all with the same new dutch id. */
export function draftToBets(d: DutchDraft, lastBook: string, dutchId: string, today = todayISO()): { ok: true; value: BetInput[] } | { ok: false; error: string } {
  if (d.rows.length < 2) return { ok: false, error: 'A dutch needs at least two selections' };
  const placedDate = d.placedDate.trim() ? parseDateInput(d.placedDate, today) : today;
  if (!placedDate) return { ok: false, error: 'Placed date: use dd/mm/yyyy' };
  const gameDate = d.gameDate.trim() ? parseDateInput(d.gameDate, today) : placedDate;
  if (!gameDate) return { ok: false, error: 'Game date: use dd/mm/yyyy' };
  const games = resolvedPicks(d, 'game');
  const markets = resolvedPicks(d, 'market');
  const missing = (p: { rows: ResolvedPick[][]; shared: ResolvedPick[] }) => [...p.rows.flat(), ...p.shared].some((x) => x.value == null);
  if (missing(games)) return { ok: false, error: 'Pick the game for each leg' };
  if (missing(markets)) return { ok: false, error: 'Pick the market for each leg' };
  const books = resolvedBooks(d.rows, lastBook);
  const out: BetInput[] = [];
  for (const [i, r] of d.rows.entries()) {
    const result: Result = 'pending';
    const legs = [
      ...r.legs.map((l, k) => ({ l, game: games.rows[i]![k]!.value!, market: markets.rows[i]![k]!.value! })),
      ...d.shared.map((l, k) => ({ l, game: games.shared[k]!.value!, market: markets.shared[k]!.value! })),
    ];
    const combo = legs.length >= 2;
    const leg = (x: (typeof legs)[number], selection: string, odds: number | null) => ({ sport: d.sport, game: x.game, market: x.market, selection, odds, result });
    const v = validateBet({
      book: books[i],
      placedDate,
      gameDate,
      type: combo ? 'combination' : 'solo',
      situation: d.situation,
      stake: r.stake,
      odds: r.odds,
      result,
      cashout: null,
      preAnalysis: '',
      postAnalysis: '',
      betText: combo ? legs.map((x) => x.l.selection.trim()).join(' + ') : '',
      dutchId,
      legs: combo ? legs.map((x) => leg(x, x.l.selection, x.l.odds)) : [leg(legs[0]!, legs[0]!.l.selection || r.selection, r.odds)],
    });
    if (!v.ok)
      return {
        ok: false,
        error: `${r.selection || `Selection ${i + 1}`}: ${v.error}`,
      };
    out.push(v.value);
  }
  return { ok: true, value: out };
}

/**
 * Validates and saves a draft. `onSaved` (the Betting Tool clearing itself, BT-9) runs only after the save succeeded;
 * a refused draft or a failed save leaves everything as it was and returns the error to show.
 */
export async function logDraft(
  d: DutchDraft,
  lastBook: string,
  dutchId: string,
  create: (inputs: BetInput[]) => Promise<Bet[]>,
  onSaved?: (bets: Bet[]) => void,
): Promise<{ ok: true; bets: Bet[] } | { ok: false; error: string }> {
  const v = draftToBets(d, lastBook, dutchId);
  if (!v.ok) return v;
  let bets: Bet[];
  try {
    bets = await create(v.value);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  onSaved?.(bets);
  return { ok: true, bets };
}

export interface DutchEditPlan {
  /** Splits that still exist: saved over their bet, result, cash-out, analysis and leg results kept. */
  updates: { id: string; patch: BetInput }[];
  /** Splits added in the edit: new pending bets in the same dutch. */
  creates: BetInput[];
  /** Bets whose split was removed. */
  deletes: string[];
}

/**
 * What saving an edited dutch does (BT-12): each row with a bet updates that bet in place (same dutch id; its result,
 * cash-out, analysis and the results of legs that are still there are kept), a new row adds a pending bet, a removed
 * row deletes its bet.
 */
export function planDutchEdit(d: DutchDraft, original: Bet[], lastBook: string, dutchId: string, today = todayISO()): { ok: true; plan: DutchEditPlan } | { ok: false; error: string } {
  const v = draftToBets(d, lastBook, dutchId, today);
  if (!v.ok) return v;
  const byId = new Map(original.map((b) => [b.id, b]));
  const plan: DutchEditPlan = { updates: [], creates: [], deletes: [] };
  for (const [i, input] of v.value.entries()) {
    const old = d.rows[i]!.betId ? byId.get(d.rows[i]!.betId!) : undefined;
    if (!old) {
      plan.creates.push(input);
      continue;
    }
    const legs = input.legs.map((l, k) => {
      if (input.type === 'solo') return { ...l, result: old.result };
      const same = old.legs.find((o) => isLeg(o.selection, l.selection)) ?? (old.legs.length === input.legs.length ? old.legs[k] : undefined);
      return { ...l, result: same?.result ?? 'pending' };
    });
    plan.updates.push({ id: old.id, patch: { ...input, result: old.result, cashout: old.cashout, preAnalysis: old.preAnalysis, postAnalysis: old.postAnalysis, legs } });
  }
  const kept = new Set(d.rows.map((r) => r.betId).filter(Boolean));
  plan.deletes = original.filter((b) => !kept.has(b.id)).map((b) => b.id);
  return { ok: true, plan };
}
