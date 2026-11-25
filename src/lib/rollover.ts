// BT-29: rollover shots. A won bet can be "banked" (kept open) so a later bet placed with its whole payout joins it:
// ordinary bets sharing a `rolloverId`, each next stake being the previous payout. The chain is ONE bet in counts
// (like a dutch) and one money item: wagered = the first stake (the rolled stakes are the same money), net profit =
// final payout − first stake. It is open while its last bet is banked, and an open shot counts as pending.

import { profit } from './money';
import type { Bet, Ladder } from './types';

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

/**
 * BT-39: the stake a chain really started from. A shot banked from a dutch split started from the whole dutch: every
 * split's stake (the losing ones too), found in `all`. Any other chain: its first bet's stake.
 */
export function baseStakeOf(first: Bet, all: Bet[]): number {
  if (!first.dutchId) return first.stake;
  let total = 0;
  let seen = false;
  for (const b of all) {
    if (b.dutchId !== first.dutchId) continue;
    total += b.stake;
    if (b.id === first.id) seen = true;
  }
  if (!seen) total += first.stake;
  return round2(total);
}

/** BT-39: what a chain's first bet multiplies it by: its own factor, or for a dutch split what it returned ÷ the dutch's whole stake. */
export function firstFactor(first: Bet, all: Bet[]): number {
  if (!first.dutchId) return factor(first);
  const base = baseStakeOf(first, all);
  return base > 0 ? returned(first) / base : factor(first);
}

const byCreated = (a: Bet, b: Bet) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** A chain's bets in the order they were placed. */
export const chainOrder = (bets: Bet[]) => [...bets].sort(byCreated);

export type ChainOutcome = 'pending' | 'open' | 'won' | 'lost' | 'even';

export interface ChainSummary {
  /** The first bet's stake: the only money put in. */
  stake: number;
  /** BT-39: the stake the chain really started from: the whole dutch's for a shot banked from a dutch split, else `stake`. */
  baseStake: number;
  /**
   * Product of the bets' odds (a void counts 1.00, a cash-out what it returned). Exact arithmetic on separate bets. A
   * shot banked from a dutch split counts that split as what it returned ÷ the whole dutch's stake (BT-39).
   */
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

/** `all`: the bets to find a dutch split's sibling splits in (BT-39); defaults to the chain itself. */
export function chainSummary(raw: Bet[], all: Bet[] = raw): ChainSummary {
  const bets = chainOrder(raw);
  const first = bets[0]!;
  const last = bets.at(-1)!;
  const stake = first.stake;
  const baseStake = baseStakeOf(first, all);
  const f = (b: Bet, i: number) => (i === 0 ? firstFactor(b, all) : factor(b));
  // BT-35: a ladder goes on until a rung loses or the money is taken; a void or cash-out rung keeps it alive with
  // what it returned as the next stake
  if (isLadder(bets)) {
    const odds = bets.reduce((p, b, i) => p * f(b, i), 1);
    const base = { stake, baseStake, odds, profit: 0, banked: 0, needs: null, bets };
    if (bets.some((b) => b.result === 'lost')) return { ...base, outcome: 'lost', profit: round2(-stake) };
    if (bets.some((b) => b.result === 'pending')) return { ...base, outcome: 'pending' };
    const amount = round2(returned(last));
    if (!bets.some((b) => b.ladder?.taken)) return { ...base, outcome: 'open', banked: amount };
    const net = round2(amount - stake);
    const c = Math.round(net * 100);
    return { ...base, outcome: c > 0 ? 'won' : c < 0 ? 'lost' : 'even', profit: net };
  }
  // a cash-out ends the chain (the bets after it, there should be none, do not multiply it further), unless it was
  // banked: a positive cash-out banked rolls its amount on like a win
  const upto = bets.findIndex((b) => b.result === 'cash-out' && !b.banked);
  const counted = upto >= 0 ? bets.slice(0, upto + 1) : bets;
  const odds = counted.reduce((p, b, i) => p * f(b, i), 1);
  const base = { stake, baseStake, odds, profit: 0, banked: 0, needs: null as number | null, bets };
  if (bets.some((b) => b.result === 'lost')) return { ...base, outcome: 'lost', profit: round2(-stake) };
  if (bets.some((b) => b.result === 'pending')) return { ...base, outcome: 'pending' };
  const end = counted.at(-1)!;
  if (last.banked && bankableResult(last) && upto < 0) {
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
    out.push(chainAsBet(chains.get(b.rolloverId)!, bets));
  }
  return out;
}

/**
 * One chain as one bet (see collapseRollovers). Money stays bet by bet: its stake is the first bet's (a dutch's other
 * splits count on their own), so a shot from a dutch split, shown at the dutch's real odds (BT-39), closes as the
 * amount it returned.
 */
export function chainAsBet(raw: Bet[], all: Bet[] = raw): Bet {
  const s = chainSummary(raw, all);
  if (raw.length === 1 && !chainPending(s.outcome)) return { ...raw[0]!, banked: false };
  const first = s.bets[0]!;
  const last = s.bets.at(-1)!;
  const shown = { ...first, id: `rollover:${first.rolloverId}`, odds: s.odds, legs: s.bets.flatMap((b) => b.legs), placedDate: last.placedDate, gameDate: last.gameDate, banked: false, cashout: null };
  if (chainPending(s.outcome)) return { ...shown, result: 'pending' };
  if (s.outcome === 'lost' && s.bets.some((b) => b.result === 'lost')) return { ...shown, result: 'lost' };
  // won at exactly its odds: a plain win; anything else (void, cash-out, half results inside) as the amount returned
  const payout = round2(s.stake + s.profit);
  if (s.outcome === 'won' && s.baseStake === s.stake && round2(s.stake * s.odds) === payout) return { ...shown, result: 'won' };
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

/** A result whose payout can roll on: a win, or a cash-out that returned more than the stake. */
export const bankableResult = (b: Pick<Bet, 'result' | 'stake' | 'cashout'>) =>
  b.result === 'won' || (b.result === 'cash-out' && Math.round(((b.cashout ?? 0) - b.stake) * 100) > 0);

/** What a bet pays back in total (stake + profit). */
export const payoutOf = (b: Bet) => round2(returned(b));

/** Can this bet be banked: a won or positive cash-out bet (a dutch split too), or such a last bet of a closed chain. */
export function canBank(b: Bet, chain: Bet[] = []): boolean {
  // BT-33: a bonus bet's payout is its winnings only, in real money: it cannot roll on as the same money
  // BT-35: a ladder's rungs are never banked (a won rung rides on by itself)
  // a won dutch split starts a shot with its payout; the dutch and its shot are then one bet (see countBets)
  if (!bankableResult(b) || b.banked || b.money === 'bonus' || b.ladder) return false;
  if (!b.rolloverId) return true;
  const ordered = chainOrder(chain);
  return ordered.at(-1)?.id === b.id && chainSummary(ordered).outcome === 'won';
}

/**
 * BT-53: what a shot's next bet needs to reach 1.80, as the tier those odds fall in and the minimum: "needs a Mini ·
 * 1.13+"; under the Mini range just "needs 1.06+" (that range has no name); "already 1.80+ (Shot)" once there.
 */
export function needsText(s: Pick<ChainSummary, 'needs'>): string {
  if (s.needs == null) return `already ${SHOT_TARGET.toFixed(2)}+ (${TARGET_TIER})`;
  const t = tierOf(s.needs);
  return t ? `needs a ${t} · ${s.needs.toFixed(2)}+` : `needs ${s.needs.toFixed(2)}+`;
}

/**
 * BT-53: a finished shot under 1.80 that can be banked again: what its next bet would need ("needs a Mini · 1.06+").
 * Null for a ladder, a chain that cannot be banked, or one already at 1.80+.
 */
export function bankAgainNeeds(chain: Bet[], all: Bet[] = chain): number | null {
  const ordered = chainOrder(chain);
  const last = ordered.at(-1);
  if (!last || isLadder(ordered) || !canBank(last, ordered)) return null;
  return neededOdds(chainSummary(ordered, all).odds);
}

// BT-35: ladders. A ladder is a rollover chain whose rungs carry `ladder` (its goal and whether it was taken): planned
// from its first bet, no odds target, the whole payout of each rung on the next, until a rung loses or he takes the
// money. Same money model as a shot (first stake in, final payout out, one bet in counts).

/** Is this chain a ladder (not a shot)? */
export const isLadder = (bets: Pick<Bet, 'ladder'>[]) => bets.some((b) => b.ladder != null);

/** A ladder's goal, as its rungs carry it. */
export const ladderOf = (bets: Bet[]): Ladder => {
  const l = chainOrder(bets).find((b) => b.ladder)?.ladder;
  return { goalRungs: l?.goalRungs ?? null, goalAmount: l?.goalAmount ?? null, taken: bets.some((b) => b.ladder?.taken) };
};

/** A won plain bet (not in a dutch or a chain, not bonus money) can become rung 1 of a new ladder. */
export const canStartLadder = (b: Bet) => b.result === 'won' && !b.dutchId && !b.rolloverId && b.money !== 'bonus';

export interface LadderProgress {
  /** The rung being played (pending), the next one to place (open), or the last one (closed). */
  rung: number;
  /** Rungs that did not lose (won, void, cash-out). */
  climbed: number;
  /** What is secured now: the stake riding on the pending rung, the payout banked, or the final payout (0 once lost). */
  amount: number;
  goal: Ladder;
  reached: boolean;
}

export function ladderProgress(raw: Bet[]): LadderProgress {
  const s = chainSummary(raw);
  const goal = ladderOf(raw);
  const pending = s.bets.find((b) => b.result === 'pending');
  const climbed = s.bets.filter((b) => b.result !== 'pending' && b.result !== 'lost').length;
  const rung = s.outcome === 'open' ? s.bets.length + 1 : s.bets.length;
  // what is secured so far: the stake riding on the pending rung, the payout banked, or the final payout
  const amount = s.outcome === 'lost' ? 0 : pending ? round2(pending.stake) : s.outcome === 'open' ? s.banked : round2(s.stake + s.profit);
  const reached = (goal.goalRungs != null && climbed >= goal.goalRungs) || (goal.goalAmount != null && amount >= goal.goalAmount);
  return { rung, climbed, amount, goal, reached };
}

/** "rung 3 of 5", "R$ 400,00 of R$ 1.600,00", or "rung 3". */
export function goalText(p: LadderProgress, money: (n: number) => string): string {
  if (p.goal.goalRungs != null) return `rung ${p.rung} of ${p.goal.goalRungs}`;
  if (p.goal.goalAmount != null) return `${money(p.amount)} of ${money(p.goal.goalAmount)}`;
  return `rung ${p.rung}`;
}

/** The rung strip: "100 → 200 → 400 → next: 800 @ 2.00" (amounts as `money` writes them). */
export function ladderStrip(raw: Bet[], money: (n: number) => string): string {
  const s = chainSummary(raw);
  const parts = [money(s.stake)];
  for (const b of s.bets) {
    if (b.result === 'pending') {
      parts.push(`next: ${money(round2(b.stake * b.odds))} @ ${b.odds.toFixed(2)}`);
      break;
    }
    parts.push(b.result === 'lost' ? '✕' : money(round2(returned(b))));
  }
  if (s.outcome === 'open') parts.push(`next rung: ${money(s.banked)}`);
  return parts.join(' → ');
}

export interface LadderReport {
  started: number;
  /** Average rungs climbed (rungs that did not lose); null with no ladders. */
  avgRungs: number | null;
  /** The closed ladder with the best profit. */
  best: { rolloverId: string; profit: number; rungs: number } | null;
  /** Ladders with a goal, and how many reached it. */
  withGoal: number;
  reachedGoal: number;
  /** Closed ladders' net profit. */
  netProfit: number;
}

/** Analytics: the Ladder group (BT-35). */
export function ladderReport(bets: Bet[]): LadderReport {
  const ladders = [...chainsOf(bets).entries()].filter(([, b]) => isLadder(b));
  let rungs = 0;
  let net = 0;
  let best: LadderReport['best'] = null;
  let withGoal = 0;
  let reached = 0;
  for (const [id, b] of ladders) {
    const s = chainSummary(b);
    const p = ladderProgress(b);
    rungs += p.climbed;
    if (p.goal.goalRungs != null || p.goal.goalAmount != null) {
      withGoal++;
      if (p.reached) reached++;
    }
    if (chainPending(s.outcome)) continue;
    net += s.profit;
    if (!best || s.profit > best.profit) best = { rolloverId: id, profit: s.profit, rungs: p.climbed };
  }
  return { started: ladders.length, avgRungs: ladders.length ? rungs / ladders.length : null, best, withGoal, reachedGoal: reached, netProfit: round2(net) };
}

/**
 * Taking a bet out of its ladder or rollover (added there by mistake): the bet stays, as a plain bet with its own stake,
 * odds, money and result; the chain closes up behind it. A ladder's "taken" mark moves to the rung now last.
 */
export function detachPlan(chain: Bet[], b: Bet): { id: string; patch: Partial<Bet> }[] {
  if (!b.rolloverId) return [];
  const out: { id: string; patch: Partial<Bet> }[] = [{ id: b.id, patch: { rolloverId: null, banked: false, ladder: null } }];
  const rest = chainOrder(chain.filter((x) => x.id !== b.id && x.rolloverId === b.rolloverId));
  const last = rest.at(-1);
  if (b.ladder?.taken && last && !rest.some((x) => x.ladder?.taken)) out.push({ id: last.id, patch: { ladder: { ...(last.ladder ?? ladderOf(chain)), taken: true } } });
  return out;
}

/** An open shot or ladder: money won and banked, waiting for its next bet. */
export interface BankedItem {
  rolloverId: string;
  /** The payout banked: the next bet's stake. */
  amount: number;
  money: Bet['money'];
  /** The odds so far (product of its bets). */
  odds: number;
  /** BT-49: the first bet's stake (profit is counted against it) and unit size. */
  stake: number;
  unitSize: number | null;
  /** Shot: the odds the next bet needs to reach the target (null when there); ladder: null. */
  needs: number | null;
  /** Shot: how far its odds are toward the target, 0–1 (1 once there); ladder: null. */
  progress: number | null;
  ladder: boolean;
  /** Its bets so far. */
  legs: number;
  /** The date of its last bet (game date, else bet date): banked since. */
  since: string;
}

/** Every open shot and ladder, oldest first (the money banked longest comes first). */
export function bankedItems(bets: Bet[]): BankedItem[] {
  const out: BankedItem[] = [];
  for (const [id, chain] of chainsOf(bets)) {
    const s = chainSummary(chain, bets);
    if (s.outcome !== 'open') continue;
    const last = s.bets.at(-1)!;
    const ladder = isLadder(s.bets);
    out.push({
      rolloverId: id,
      amount: s.banked,
      money: s.bets[0]!.money,
      odds: s.odds,
      stake: s.stake,
      unitSize: s.bets[0]!.unitSize ?? null,
      needs: ladder ? null : s.needs,
      // on a log scale (odds multiply), judged at 2 decimals like neededOdds
      progress: ladder ? null : s.needs == null ? 1 : Math.min(1, Math.log(Math.max(1, s.odds)) / Math.log(SHOT_TARGET)),
      ladder,
      legs: s.bets.length,
      since: last.gameDate || last.placedDate,
    });
  }
  return out.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : a.rolloverId < b.rolloverId ? -1 : 1));
}

/** The banked amounts added up per money type, only the types that have any. */
export function bankedTotals(items: BankedItem[]): { money: Bet['money']; amount: number }[] {
  const m = new Map<Bet['money'], number>();
  for (const it of items) m.set(it.money, round2((m.get(it.money) ?? 0) + it.amount));
  return (['real', 'bonus', 'hypothetical'] as const).filter((k) => m.has(k)).map((k) => ({ money: k, amount: m.get(k)! }));
}

// BT-49: "what if" on a banked shot: a possible next-leg odd and the shot it would make. Nothing is saved.

/** What a banked shot is now: its odds so far, the payout banked (the next stake) and the first stake. */
export interface ShotNow {
  odds: number;
  banked: number;
  stake: number;
}

export interface WhatIf {
  /** The next leg's odds, as decimal. */
  next: number;
  /** The shot's odds with that leg won: banked odds × next. */
  odds: number;
  tier: TierName | null;
  /** What the shot pays back: banked amount × next. */
  payout: number;
  /** Payout − the first stake. */
  profit: number;
}

export function whatIf(shot: ShotNow, next: number): WhatIf {
  const payout = round2(shot.banked * next);
  const odds = shot.odds * next;
  return { next, odds, tier: tierOf(odds), payout, profit: round2(payout - shot.stake) };
}

/**
 * The odds typed in the "what if" box, one per entry: entries are split by ";" or new lines, and by commas that are
 * not decimal commas (a comma followed by a space, or between dot-decimals: "1.15,1.2"). "1,15; 1,2" is two odds.
 */
export function splitOddsList(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[;\n\r]+/)) {
    for (const p of part.split(/,\s+/)) {
      const t = p.trim();
      if (!t) continue;
      if (t.includes('.') && t.includes(',')) out.push(...t.split(',').map((x) => x.trim()).filter(Boolean));
      else out.push(t);
    }
  }
  return out;
}

/** One line per entry typed: its "what if", or null when the entry cannot be read as odds. */
export function whatIfLines(text: string, shot: ShotNow, read: (t: string) => number | null): { text: string; result: WhatIf | null }[] {
  return splitOddsList(text).map((t) => {
    const next = read(t);
    return { text: t, result: next == null ? null : whatIf(shot, next) };
  });
}
