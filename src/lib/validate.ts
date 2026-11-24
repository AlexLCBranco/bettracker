// Checks and normalizes a bet coming from a client (create, update, import). Shared by server and form.

import { isValidISODate } from './dates';
import { isReallySolo } from './quickadd';
import { tidyBet } from './tidy';
import { BET_TYPES, MONEY, RESULTS, SITUATIONS, WOULD_HAVE, type BetInput, type Leg, type Money, type Result, type WouldHave } from './types';

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
  let type = (r.type ?? 'solo') as BetInput['type'];
  if (!BET_TYPES.includes(type)) return { ok: false, error: 'Type must be solo or combination' };
  const situation = (r.situation ?? 'pregame') as BetInput['situation'];
  if (!SITUATIONS.includes(situation)) return { ok: false, error: 'Situation must be pregame or live' };
  const money = (r.money ?? 'real') as Money;
  if (!MONEY.includes(money)) return { ok: false, error: 'Money must be real, bonus or hypothetical' };
  const placedDate = str(r.placedDate);
  const gameDate = str(r.gameDate) || placedDate;
  if (!isValidISODate(placedDate)) return { ok: false, error: 'Placed date must be a valid date' };
  if (!isValidISODate(gameDate)) return { ok: false, error: 'Game date must be a valid date' };
  let dutchId: string | null = null;
  if (r.dutchId != null && r.dutchId !== '') {
    if (typeof r.dutchId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(r.dutchId)) return { ok: false, error: 'Dutch id is not valid' };
    dutchId = r.dutchId;
  }
  // BT-29: a rollover chain id, and whether this bet is banked (kept open); banked only means something in a chain
  let rolloverId: string | null = null;
  if (r.rolloverId != null && r.rolloverId !== "") {
    if (typeof r.rolloverId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(r.rolloverId)) return { ok: false, error: "Rollover id is not valid" };
    rolloverId = r.rolloverId;
  }
  const banked = rolloverId != null && r.banked === true;
  // BT-35: a ladder is a rollover chain: its rungs share the chain id
  let ladder: BetInput['ladder'] = null;
  if (r.ladder != null) {
    if (typeof r.ladder !== 'object') return { ok: false, error: 'Ladder must be an object' };
    if (!rolloverId) return { ok: false, error: 'A ladder rung needs its ladder (rollover) id' };
    if (dutchId) return { ok: false, error: 'A bet in a dutch cannot be a ladder rung' };
    const l = r.ladder as Record<string, unknown>;
    const goalRungs = l.goalRungs == null || l.goalRungs === '' ? null : num(l.goalRungs);
    if (l.goalRungs != null && l.goalRungs !== '' && (goalRungs == null || !Number.isInteger(goalRungs) || goalRungs < 1 || goalRungs > 100)) return { ok: false, error: 'A ladder goal in rungs must be 1 to 100' };
    const goalAmount = l.goalAmount == null || l.goalAmount === '' ? null : num(l.goalAmount);
    if (l.goalAmount != null && l.goalAmount !== '' && (goalAmount == null || goalAmount <= 0)) return { ok: false, error: 'A ladder goal amount must be above 0' };
    ladder = { goalRungs, goalAmount, taken: l.taken === true };
  }
  // BT-37: what a cash-out would have done; dropped once the result is anything else
  if (r.wouldHave != null && r.wouldHave !== '' && !WOULD_HAVE.includes(r.wouldHave as WouldHave)) return { ok: false, error: 'Would-have must be won or lost' };
  const wouldHave = result === 'cash-out' && r.wouldHave ? (r.wouldHave as WouldHave) : null;
  // BT-38: the unit size in force when the bet was placed
  const unitSize = r.unitSize == null || r.unitSize === '' ? null : num(r.unitSize);
  if (r.unitSize != null && r.unitSize !== '' && (unitSize == null || unitSize <= 0)) return { ok: false, error: 'Unit size must be above 0' };
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
    legs.push({ sport: str(lr.sport), game: str(lr.game), market: str(lr.market), selection: str(lr.selection), odds: legOdds, result: legResult, actual: str(lr.actual).slice(0, 200) });
  }

  if (type === 'combination') {
    legs = legs.filter((l) => l.sport || l.game || l.market || l.selection || l.odds != null || l.actual);
    // BT-17: a combination with one leg is really a solo bet; BT-25: so is one with no legs, unless its text is "a + b"
    if (isReallySolo(type, legs, str(r.betText))) type = 'solo';
  }
  if (type === 'solo') {
    // A solo bet is one leg that mirrors the bet's odds and result.
    const l = legs[0] ?? { sport: '', game: '', market: '', selection: '', odds: null, result, actual: '' };
    legs = [{ ...l, odds, result }];
  }

  // BT-20: one game format, stat units in one form (name casing is applied by the client, which knows the names)
  const tidy = tidyBet({ betText: str(r.betText), legs });
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
      betText: tidy.betText,
      legs: tidy.legs,
      dutchId,
      rolloverId,
      banked,
      ladder,
      wouldHave,
      unitSize,
      money,
      // BT-27: one label per bet, kept as typed (shown uppercase)
      label: str(r.label).replace(/\s+/g, ' ').slice(0, 60),
      // BT-44: a missing mark (older files and clients) is off
      noBrainer: r.noBrainer === true || r.noBrainer === 1,
    },
  };
}
