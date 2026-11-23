// BT-29: rollover shots. A won bet can be "banked" (kept open) so a later bet placed with its whole payout joins it:
// ordinary bets sharing a `rolloverId`, each next stake being the previous payout. The chain is ONE bet in counts
// (like a dutch) and one money item: wagered = the first stake (the rolled stakes are the same money), net profit =
// final payout − first stake. It is open while its last bet is banked, and an open shot counts as pending.

import { profit } from './money';
import type { Bet } from './types';

/** The odds every shot aims at. */
export const SHOT_TARGET = 1.8;

/**
 * Odds tiers, lowest first; a tier runs from its `min` up to the next tier's. "Pepsi" is a placeholder name the owner
 * expects to rename; "Major" is reserved for something else (do not use it).
 */
export const TIERS = [
  { name: 'Mini', min: 1.1 },
  { name: 'Semi', min: 1.33 },
  { name: 'Pepsi', min: 1.51 },
  { name: 'Shot', min: 1.8 },
] as const;
export type TierName = (typeof TIERS)[number]['name'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The tier odds fall in (judged at 2 decimals, as shown); null under 1.10. */
export function tierOf(odds: number): TierName | null {
  const o = round2(odds);
  let t: TierName | null = null;
  for (const x of TIERS) if (o >= x.min) t = x.name;
  return t;
}

/** The tier the target belongs to ("Shot"). */
export const TARGET_TIER = tierOf(SHOT_TARGET)!;

/** The odds a next bet needs for the shot to reach the target, rounded UP to 2 decimals; null once it is there. */
export function neededOdds(shotOdds: number, target = SHOT_TARGET): number | null {
  if (!(shotOdds > 0) || round2(shotOdds) >= target) return null;
  return Math.ceil(Math.round((target / shotOdds) * 1e6) / 1e4) / 100;
}

/** What a settled bet paid back in total (stake + profit); a pending one: what it pays if it wins. */
const returned = (b: Bet) => (b.result === 'pending' ? b.stake * b.odds : b.stake + profit(b));

/** What a bet multiplies a chain by: its odds, void 1, a cash-out or half result what it really returned per unit staked. */
function factor(b: Bet): number {
  switch (b.result) {
    case 'won':
    case 'pending':
    case 'lost':
      return b.odds;
    case 'void':
      return 1;
    default:
      return returned(b) / b.stake;
  }
}

const byCreated = (a: Bet, b: Bet) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A chain's bets in the order they were placed. */
export const chainOrder = (bets: Bet[]) => [...bets].sort(byCreated);

export type ChainOutcome = 'pending' | 'open' | 'won' | 'lost' | 'even';

export interface ChainSummary {
  /** The first bet's stake: the only money put in. */
  stake: number;
  /** Product of the bets' odds (a void counts 1.00, a cash-out what it returned). Exact arithmetic on separate bets. */
  odds: number;
  outcome: ChainOutcome;
  /** Net profit once closed (final payout − first stake, or −first stake when a bet lost); 0 while pending or open. */
  profit: number;
  /** Open: the payout banked so far (what the next bet's stake must be). */
  banked: number;
  /** Open: the odds the next bet needs to reach the target; null when it is already there. */
  needs: number | null;
  /** Every bet in the order placed. */
  bets: Bet[];
}

export function chainSummary(raw: Bet[]): ChainSummary {
  const bets = chainOrder(raw);
  const first = bets[0]!;
  const last = bets.at(-1)!;
  const stake = first.stake;
  // a cash-out ends the chain: the bets after it (there should be none) do not multiply it further
  const upto = bets.findIndex((b) => b.result === 'cash-out');
  const counted = upto >= 0 ? bets.slice(0, upto + 1) : bets;
  const odds = counted.reduce((p, b) => p * factor(b), 1);
  const base = { stake, odds, profit: 0, banked: 0, needs: null as number | null, bets };
  if (bets.some((b) => b.result === 'lost')) return { ...base, outcome: 'lost', profit: round2(-stake) };
  if (bets.some((b) => b.result === 'pending')) return { ...base, outcome: 'pending' };
  const end = counted.at(-1)!;
  if (last.banked && last.result === 'won' && upto < 0) {
    return { ...base, outcome: 'open', banked: round2(returned(last)), needs: neededOdds(odds) };
  }
  const net = round2(returned(end) - stake);
  const cents = Math.round(net * 100);
  return { ...base, outcome: cents > 0 ? 'won' : cents < 0 ? 'lost' : 'even', profit: net };
}

/** Pending for counts: a bet still to settle, or an open shot. */
export const chainPending = (o: ChainOutcome) => o === 'pending' || o === 'open';

/**
 * The bets as money sees them: each rollover chain replaced by ONE bet with the first bet's stake, the chain's odds and
 * a result whose profit is the chain's (won / lost / pending, a cash-out when it closed at another amount). Other bets
 * are returned as they are. Applying it twice changes nothing.
 */
export function collapseRollovers(bets: Bet[]): Bet[] {
  const chains = new Map<string, Bet[]>();
  for (const b of bets) if (b.rolloverId) chains.set(b.rolloverId, [...(chains.get(b.rolloverId) ?? []), b]);
  if (!chains.size) return bets;
  const done = new Set<string>();
  const out: Bet[] = [];
  for (const b of bets) {
    if (!b.rolloverId) {
      out.push(b);
      continue;
    }
    if (done.has(b.rolloverId)) continue;
    done.add(b.rolloverId);
    out.push(chainAsBet(chains.get(b.rolloverId)!));
  }
  return out;
}

/** One chain as one bet (see collapseRollovers). */
export function chainAsBet(raw: Bet[]): Bet {
  const s = chainSummary(raw);
  if (raw.length === 1 && !chainPending(s.outcome)) return { ...raw[0]!, banked: false };
  const first = s.bets[0]!;
  const last = s.bets.at(-1)!;
  const shown = { ...first, id: `rollover:${first.rolloverId}`, odds: s.odds, legs: s.bets.flatMap((b) => b.legs), placedDate: last.placedDate, gameDate: last.gameDate, banked: false, cashout: null };
  if (chainPending(s.outcome)) return { ...shown, result: 'pending' };
  if (s.outcome === 'lost' && s.bets.some((b) => b.result === 'lost')) return { ...shown, result: 'lost' };
  // won at exactly its odds: a plain win; anything else (void, cash-out, half results inside) as the amount returned
  const payout = round2(s.stake + s.profit);
  if (s.outcome === 'won' && round2(s.stake * s.odds) === payout) return { ...shown, result: 'won' };
  return { ...shown, result: 'cash-out', cashout: payout };
}

/** A fresh chain id. */
export const newRolloverId = () => `ro-${crypto.randomUUID()}`;

/** Every bet of each chain, from `all`, keyed by chain id. */
export function chainsOf(all: Bet[]): Map<string, Bet[]> {
  const m = new Map<string, Bet[]>();
  for (const b of all) if (b.rolloverId) m.set(b.rolloverId, [...(m.get(b.rolloverId) ?? []), b]);
  return m;
}

/** Can this bet be banked: a won plain bet (not in a dutch), or the won last bet of a closed chain. */
export function canBank(b: Bet, chain: Bet[] = []): boolean {
  // BT-33: a bonus bet's payout is its winnings only, in real money: it cannot roll on as the same money
  if (b.result !== 'won' || b.dutchId || b.banked || b.money === 'bonus') return false;
  if (!b.rolloverId) return true;
  const ordered = chainOrder(chain);
  return ordered.at(-1)?.id === b.id && chainSummary(ordered).outcome === 'won';
}

/** The open shot's tail: "needs 1.13+ to reach 1.80 (Shot)", or "already 1.80+ (Shot)". */
export function needsText(s: Pick<ChainSummary, 'needs'>): string {
  const target = `${SHOT_TARGET.toFixed(2)}`;
  return s.needs == null ? `already ${target}+ (${TARGET_TIER})` : `needs ${s.needs.toFixed(2)}+ to reach ${target} (${TARGET_TIER})`;
}
