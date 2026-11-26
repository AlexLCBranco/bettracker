// The bet form's state (strings, as typed) and its conversion to and from a bet.

import { formatDate, parseDateInput, todayISO } from './dates';
import { formatOdds, oddsFromText, parseNumber } from './money';
import type { Bet, BetInput, BetType, Money, Result, Situation } from './types';
import { validateBet, type Validated } from './validate';
import { NO_UNITS, readStake, type UnitSizes } from './units';

export interface LegForm {
  sport: string;
  game: string;
  market: string;
  selection: string;
  odds: string;
  result: Result;
  /** BT-27: what actually happened on the leg. */
  actual: string;
}

export interface BetForm {
  stake: string;
  odds: string;
  result: Result;
  cashout: string;
  book: string;
  type: BetType;
  situation: Situation;
  /** dd/mm/yyyy as typed */
  placedDate: string;
  gameDate: string;
  /** Solo bets: the single leg's fields. */
  sport: string;
  game: string;
  market: string;
  selection: string;
  betText: string;
  preAnalysis: string;
  liveAnalysis: string;
  postAnalysis: string;
  /** Combination legs. */
  legs: LegForm[];
  /** Real (R$) or hypothetical (H$) money (BT-14). */
  money: Money;
  /** BT-27: the bet's label and (solo) the actual result of its leg. */
  label: string;
  actual: string;
  /** BT-44: the no brainer mark. */
  noBrainer: boolean;
}

export const emptyLeg = (sport = ''): LegForm => ({ sport, game: '', market: '', selection: '', odds: '', result: 'pending', actual: '' });

/**
 * A combination's total odds estimated from its legs: every leg's odds multiplied, to 2 decimals like a book shows.
 * Null unless there are 2+ legs and every one has odds that read. The form prefills the total with it, marked
 * "estimated", until the user types the book's real price over it (the price the bet is saved with).
 */
export function legsOdds(legs: Pick<LegForm, 'odds'>[]): number | null {
  if (legs.length < 2) return null;
  let p = 1;
  for (const l of legs) {
    const o = l.odds.trim() ? oddsFromText(l.odds) : null;
    if (o == null) return null;
    p *= o;
  }
  return Math.round(p * 100) / 100;
}

/**
 * Whether a total odds value overrides the legs: the book's price, typed while every leg has odds and differing from
 * their product. A total typed before the legs are complete (e.g. the first leg's odds) is not one: it follows the legs.
 */
export function overridesLegs(odds: string, legs: Pick<LegForm, 'odds'>[]): boolean {
  const est = legsOdds(legs);
  const o = odds.trim() ? oddsFromText(odds) : null;
  return est != null && o != null && o !== est;
}

/**
 * The form with new legs. Unless the total is the book's price (`override`), it becomes the legs' estimate; while
 * there is none it stays, except a total that was the previous estimate, which blanks.
 */
export function withLegs(f: BetForm, legs: LegForm[], override: boolean): BetForm {
  if (override || f.type !== 'combination') return { ...f, legs };
  const est = legsOdds(legs);
  if (est != null) return { ...f, legs, odds: String(est) };
  const prev = legsOdds(f.legs);
  return { ...f, legs, odds: prev != null && oddsFromText(f.odds) === prev ? '' : f.odds };
}

export interface Defaults {
  book: string;
  sport: string;
  situation: Situation;
  type: BetType;
  money?: Money;
}

export function newForm(defaults: Defaults, today = todayISO()): BetForm {
  return {
    stake: '',
    odds: '',
    result: 'pending',
    cashout: '',
    book: defaults.book,
    type: defaults.type,
    situation: defaults.situation,
    placedDate: formatDate(today),
    gameDate: formatDate(today),
    sport: defaults.sport,
    game: '',
    market: '',
    selection: '',
    betText: '',
    preAnalysis: '',
    liveAnalysis: '',
    postAnalysis: '',
    legs: [],
    money: defaults.money ?? 'real',
    label: '',
    actual: '',
    noBrainer: false,
  };
}

export function formFromBet(b: Bet): BetForm {
  const solo = b.type === 'solo' ? b.legs[0] : undefined;
  return {
    stake: String(b.stake),
    odds: formatOdds(b.odds),
    result: b.result,
    cashout: b.cashout == null ? '' : String(b.cashout),
    book: b.book,
    type: b.type,
    situation: b.situation,
    placedDate: formatDate(b.placedDate),
    gameDate: formatDate(b.gameDate),
    sport: solo?.sport ?? '',
    game: solo?.game ?? '',
    market: solo?.market ?? '',
    selection: solo?.selection ?? '',
    betText: b.betText,
    preAnalysis: b.preAnalysis,
    liveAnalysis: b.liveAnalysis,
    postAnalysis: b.postAnalysis,
    legs: b.type === 'combination' ? b.legs.map((l) => ({ sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: formatOdds(l.odds), result: l.result, actual: l.actual })) : [],
    money: b.money,
    label: b.label,
    actual: solo?.actual ?? '',
    noBrainer: b.noBrainer,
  };
}

/** A new bet prefilled from an existing one: same bet, pending, dated today, no post-bet analysis. */
export function duplicateForm(b: Bet, today = todayISO()): BetForm {
  return {
    ...formFromBet(b),
    result: 'pending',
    cashout: '',
    placedDate: formatDate(today),
    gameDate: formatDate(today),
    liveAnalysis: '',
    postAnalysis: '',
    label: '',
    actual: '',
    legs: b.type === 'combination' ? formFromBet(b).legs.map((l) => ({ ...l, result: 'pending' as Result, actual: '' })) : [],
  };
}

/** After "Save and add another": keep book, sport, dates, type and situation; clear the rest. */
export function nextForm(f: BetForm): BetForm {
  return {
    ...f,
    stake: '',
    odds: '',
    result: 'pending',
    cashout: '',
    game: '',
    market: '',
    selection: '',
    betText: '',
    preAnalysis: '',
    liveAnalysis: '',
    postAnalysis: '',
    label: '',
    actual: '',
    noBrainer: false,
    legs: f.type === 'combination' ? [] : [],
  };
}

/** `sizes`: the unit sizes, so a stake typed in units ("1,5u", BT-38) becomes money; a prefix ("H$2u") picks the money. */
export function formToBet(f: BetForm, today = todayISO(), sizes: UnitSizes = NO_UNITS): Validated {
  const st = readStake(f.stake, f.money, sizes);
  if (!st) return { ok: false, error: 'Stake is required' };
  if (!st.ok) return { ok: false, error: st.error };
  const stake = st.amount;
  if (!f.odds.trim()) return { ok: false, error: 'Odds are required' };
  const odds = oddsFromText(f.odds);
  if (odds == null) return { ok: false, error: 'Odds: cannot read "' + f.odds.trim() + '" (decimal, American, fractional…)' };
  const placedDate = f.placedDate.trim() ? parseDateInput(f.placedDate, today) : today;
  if (!placedDate) return { ok: false, error: 'Placed date: use dd/mm/yyyy' };
  const gameDate = f.gameDate.trim() ? parseDateInput(f.gameDate, today) : placedDate;
  if (!gameDate) return { ok: false, error: 'Game date: use dd/mm/yyyy' };
  let cashout: number | null = null;
  if (f.result === 'cash-out') {
    cashout = parseNumber(f.cashout);
    if (cashout == null) return { ok: false, error: 'Cash-out amount is required' };
  }
  const legs =
    f.type === 'solo'
      ? [{ sport: f.sport, game: f.game, market: f.market, selection: f.selection, odds, result: f.result, actual: f.actual }]
      : f.legs.map((l) => {
          const lo = l.odds.trim() ? oddsFromText(l.odds) : null;
          return { sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: l.odds.trim() && lo == null ? NaN : lo, result: l.result, actual: l.actual };
        });
  return validateBet({
    book: f.book,
    placedDate,
    gameDate,
    type: f.type,
    situation: f.situation,
    stake,
    odds,
    result: f.result,
    cashout,
    preAnalysis: f.preAnalysis,
    liveAnalysis: f.liveAnalysis,
    postAnalysis: f.postAnalysis,
    betText: f.betText,
    legs,
    money: st.money,
    label: f.label,
    noBrainer: f.noBrainer,
  });
}

/**
 * What saving the edit form sends. The form has no dutch, rollover, banked, ladder or would-have field: the edited bet
 * keeps them (a ladder rung stays a rung). A bet in a rollover keeps its money; the unit size stays the bet's own
 * unless the money type changed (then the current one of the new type, BT-38).
 */
export function editPatch(editing: Bet, value: BetInput, sizes: UnitSizes = NO_UNITS): BetInput {
  const money = editing.rolloverId ? editing.money : value.money;
  return {
    ...value,
    dutchId: editing.dutchId,
    rolloverId: editing.rolloverId,
    banked: editing.banked,
    ladder: editing.ladder,
    wouldHave: editing.wouldHave,
    unitSize: money === editing.money ? editing.unitSize : sizes[money],
    money,
  };
}
