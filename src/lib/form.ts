// The bet form's state (strings, as typed) and its conversion to and from a bet.

import { formatDate, parseDateInput, todayISO } from './dates';
import { formatOdds, oddsFromText, parseNumber } from './money';
import type { Bet, BetType, Money, Result, Situation } from './types';
import { validateBet, type Validated } from './validate';

export interface LegForm {
  sport: string;
  game: string;
  market: string;
  selection: string;
  odds: string;
  result: Result;
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
  postAnalysis: string;
  /** Combination legs. */
  legs: LegForm[];
  /** Real (R$) or hypothetical (H$) money (BT-14). */
  money: Money;
}

export const emptyLeg = (sport = ''): LegForm => ({ sport, game: '', market: '', selection: '', odds: '', result: 'pending' });

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
    postAnalysis: '',
    legs: [],
    money: defaults.money ?? 'real',
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
    postAnalysis: b.postAnalysis,
    legs: b.type === 'combination' ? b.legs.map((l) => ({ sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: formatOdds(l.odds), result: l.result })) : [],
    money: b.money,
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
    postAnalysis: '',
    legs: b.type === 'combination' ? formFromBet(b).legs.map((l) => ({ ...l, result: 'pending' as Result })) : [],
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
    postAnalysis: '',
    legs: f.type === 'combination' ? [] : [],
  };
}

export function formToBet(f: BetForm, today = todayISO()): Validated {
  const stake = parseNumber(f.stake);
  if (stake == null) return { ok: false, error: 'Stake is required' };
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
      ? [{ sport: f.sport, game: f.game, market: f.market, selection: f.selection, odds, result: f.result }]
      : f.legs.map((l) => {
          const lo = l.odds.trim() ? oddsFromText(l.odds) : null;
          return { sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: l.odds.trim() && lo == null ? NaN : lo, result: l.result };
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
    postAnalysis: f.postAnalysis,
    betText: f.betText,
    legs,
    money: f.money,
  });
}
