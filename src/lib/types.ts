// The data model. Dates are local calendar dates as "YYYY-MM-DD" strings: never Date objects, never UTC.

export const RESULTS = ['pending', 'won', 'lost', 'void', 'cash-out', 'half-won', 'half-lost'] as const;
export type Result = (typeof RESULTS)[number];

export const BET_TYPES = ['solo', 'combination'] as const;
export type BetType = (typeof BET_TYPES)[number];

export const SITUATIONS = ['pregame', 'live'] as const;

/**
 * BT-14: real money (R$) or hypothetical money (H$, "hypothetical dollars"): picks tracked but not placed.
 * BT-33: bonus money (B$), a book's bonus: a lost bonus bet costs no real money, a won one pays its winnings (never the
 * stake) as REAL money (src/lib/money.ts).
 */
export const MONEY = ['real', 'bonus', 'hypothetical'] as const;
export type Money = (typeof MONEY)[number];

export type Situation = (typeof SITUATIONS)[number];

export interface Leg {
  id: string;
  sport: string;
  game: string;
  market: string;
  selection: string;
  /** Leg odds; for a solo bet always equal to the bet's odds. */
  odds: number | null;
  result: Result;
  /** BT-27: what actually happened on this leg (a stat line "11", a score "111-112"); empty = not entered. */
  actual: string;
}

export interface Bet {
  id: string;
  book: string;
  placedDate: string;
  gameDate: string;
  type: BetType;
  situation: Situation;
  stake: number;
  /** Total decimal odds, entered by the user (never computed from legs; the Betting Tool only prefills an editable estimate). */
  odds: number;
  result: Result;
  /** Amount returned by a cash-out; null unless result is cash-out. */
  cashout: number | null;
  preAnalysis: string;
  postAnalysis: string;
  betText: string;
  /** Solo: exactly 1. Combination: 0 (not entered) or 2+. */
  legs: Leg[];
  /** Real (R$), bonus (B$, BT-33) or hypothetical (H$) money; hypothetical bets never mix into real totals (BT-14). */
  money: Money;
  /** Bets logged together as one dutch share this id (see src/lib/dutch.ts); null = not part of a dutch. */
  dutchId: string | null;
  /** BT-29: bets of one rollover shot share this id (see src/lib/rollover.ts); null = not part of one. */
  rolloverId: string | null;
  /** BT-29: a won bet kept open so a later bet can roll its payout on (only the last bet of a chain counts). */
  banked: boolean;
  /** BT-27: one short free-text label ("lost by one"), shown uppercase as a chip; empty = none. */
  label: string;
  /** ISO timestamps, used for "most recent" ordering. */
  createdAt: string;
  updatedAt: string;
}

/** What a client sends to create a bet. */
export type BetInput = Omit<Bet, 'id' | 'createdAt' | 'updatedAt' | 'legs'> & { legs: Omit<Leg, 'id'>[] };

export const RESULT_LABEL: Record<Result, string> = {
  pending: 'Pending',
  won: 'Won',
  lost: 'Lost',
  void: 'Void',
  'cash-out': 'Cash-out',
  'half-won': 'Half-won',
  'half-lost': 'Half-lost',
};
