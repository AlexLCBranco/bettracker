// Checks and normalizes a bet coming from a client (create, update, import). Shared by server and form.

import { isValidISODate } from './dates';
import { BET_TYPES, MONEY, RESULTS, SITUATIONS, type BetInput, type Leg, type Money, type Result } from './types';

export type Validated = { ok: true; value: BetInput } | { ok: false; error: string };

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function validateBet(raw: unknown): Validated {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Bet must be an object' };
  const r = raw as Record<string, unknown>;
  const stake = num(r.stake);
  if (stake == null || stake <= 0) return { ok: false, error: 'Stake must be a number above 0' };
  const odds = num(r.odds);
  if (odds == null || odds <= 1) return { ok: false, error: 'Odds must be a decimal above 1' };
  const result = r.result as Result;
  if (!RESULTS.includes(result)) return { ok: false, error: `Result must be one of ${RESULTS.join(', ')}` };
  const type = (r.type ?? 'solo') as BetInput['type'];
  if (!BET_TYPES.includes(type)) return { ok: false, error: 'Type must be solo or combination' };
  const situation = (r.situation ?? 'pregame') as BetInput['situation'];
  if (!SITUATIONS.includes(situation)) return { ok: false, error: 'Situation must be pregame or live' };
  const money = (r.money ?? 'real') as Money;
  if (!MONEY.includes(money)) return { ok: false, error: 'Money must be real or hypothetical' };
  const placedDate = str(r.placedDate);
  const gameDate = str(r.gameDate) || placedDate;
  if (!isValidISODate(placedDate)) return { ok: false, error: 'Placed date must be a valid date' };
  if (!isValidISODate(gameDate)) return { ok: false, error: 'Game date must be a valid date' };
  let dutchId: string | null = null;
  if (r.dutchId != null && r.dutchId !== '') {
    if (typeof r.dutchId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.dutchId)) return { ok: false, error: 'Dutch id is not valid' };
    dutchId = r.dutchId;
  }
  let cashout: number | null = null;
  if (result === 'cash-out') {
    cashout = num(r.cashout);
    if (cashout == null || cashout < 0) return { ok: false, error: 'Cash-out needs the amount returned' };
  }

  const rawLegs = Array.isArray(r.legs) ? r.legs : [];
  let legs: Omit<Leg, 'id'>[] = [];
  for (const l of rawLegs) {
    if (!l || typeof l !== 'object') return { ok: false, error: 'Each leg must be an object' };
    const lr = l as Record<string, unknown>;
    const legResult = (lr.result ?? 'pending') as Result;
    if (!RESULTS.includes(legResult)) return { ok: false, error: 'Leg result is not valid' };
    const legOdds = lr.odds == null || lr.odds === '' ? null : num(lr.odds);
    if (lr.odds != null && lr.odds !== '' && (legOdds == null || legOdds <= 1)) return { ok: false, error: 'Leg odds must be above 1' };
    legs.push({ sport: str(lr.sport), game: str(lr.game), market: str(lr.market), selection: str(lr.selection), odds: legOdds, result: legResult });
  }

  if (type === 'solo') {
    // A solo bet is one leg that mirrors the bet's odds and result.
    const l = legs[0] ?? { sport: '', game: '', market: '', selection: '', odds: null, result };
    legs = [{ ...l, odds, result }];
  } else {
    legs = legs.filter((l) => l.sport || l.game || l.market || l.selection || l.odds != null);
    if (legs.length === 1) return { ok: false, error: 'A combination needs 2 or more legs (or none)' };
  }

  return {
    ok: true,
    value: {
      book: str(r.book),
      placedDate,
      gameDate,
      type,
      situation,
      stake,
      odds,
      result,
      cashout,
      preAnalysis: str(r.preAnalysis),
      postAnalysis: str(r.postAnalysis),
      betText: str(r.betText),
      legs,
      dutchId,
      money,
    },
  };
}
