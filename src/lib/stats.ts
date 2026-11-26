import { countBets } from './dutch';
import { bonusSpentOf, profit, realStake } from './money';
import { chainSummary, chainsOf, collapseRollovers } from './rollover';
import type { Bet } from './types';

export interface Summary {
  netProfit: number;
  /** Net profit / settled stake, as a fraction; null with no settled stake. */
  roi: number | null;
  totalWagered: number;
  /** Bets, a dutch counted once. */
  betCount: number;
  /** wins / (wins + losses), a dutch counted once (see countBets); null when there are none. */
  winRate: number | null;
  wins: number;
  losses: number;
  pendingCount: number;
  /** What is riding on pending bets now (see ridingAmount): a shot at what it has grown to. */
  pendingAmount: number;
  settledStake: number;
  /** BT-33: bonus put on settled bets (a void's stake went back), the real money they won, and won / spent. */
  bonusSpent: number;
  bonusWon: number;
  bonusConverted: number | null;
  /** BT-33: bonus stakes of pending bets. */
  bonusPending: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * What is riding on pending bets now (the Open tile): a plain bet its stake; a shot or ladder still playing the stakes
 * of its pending bets (the payouts its won legs rolled on), an open one the payout banked for its next bet. Unlike
 * wagered, a shot counts here at what it has grown to, not its first stake.
 */
export function ridingAmount(bets: Bet[]): number {
  let total = 0;
  for (const b of bets) if (!b.rolloverId && b.result === 'pending') total += realStake(b);
  for (const chain of chainsOf(bets).values()) {
    const s = chainSummary(chain, bets);
    if (s.outcome === 'pending') total += chain.filter((b) => b.result === 'pending').reduce((t, b) => t + realStake(b), 0);
    else if (s.outcome === 'open') total += realStake({ ...s.bets[0]!, stake: s.banked });
  }
  return round2(total);
}

export function summarize(bets: Bet[]): Summary {
  let netProfit = 0;
  let settledStake = 0;
  let totalWagered = 0;
  let bonusSpent = 0;
  let bonusWon = 0;
  let bonusPending = 0;
  // BT-29: a rollover shot is one money item (first stake in, final payout out)
  // BT-33: a bonus stake is not real money: never wagered, never in ROI; its winnings are real profit
  for (const b of collapseRollovers(bets)) {
    const stake = realStake(b);
    totalWagered += stake;
    if (b.result === 'pending') {
      if (b.money === 'bonus') bonusPending += b.stake;
      continue;
    }
    settledStake += stake;
    netProfit += profit(b);
    if (b.money === 'bonus') {
      bonusSpent += bonusSpentOf(b);
      bonusWon += profit(b);
    }
  }
  const { count, pending: pendingCount, wins, losses } = countBets(bets);
  return {
    netProfit: round2(netProfit),
    roi: settledStake > 0 ? netProfit / settledStake : null,
    totalWagered: round2(totalWagered),
    betCount: count,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    wins,
    losses,
    pendingCount,
    pendingAmount: ridingAmount(bets),
    settledStake: round2(settledStake),
    bonusSpent: round2(bonusSpent),
    bonusWon: round2(bonusWon),
    bonusConverted: bonusSpent > 0 ? bonusWon / bonusSpent : null,
    bonusPending: round2(bonusPending),
  };
}

/** "54.5%", or "-" when there is nothing to divide. Never NaN. */
export function formatPercent(fraction: number | null, signed = false): string {
  if (fraction == null || !Number.isFinite(fraction)) return '-';
  const pct = (fraction * 100).toFixed(1);
  return `${signed && fraction > 0 ? '+' : ''}${pct}%`;
}

/** Cumulative profit by game date (settled bets only), one point per date, oldest first. */
export function cumulativeProfit(bets: Bet[]): { date: string; profit: number; cumulative: number }[] {
  const byDate = new Map<string, number>();
  for (const b of collapseRollovers(bets)) {
    if (b.result === 'pending') continue;
    const d = b.gameDate || b.placedDate;
    byDate.set(d, (byDate.get(d) ?? 0) + profit(b));
  }
  let running = 0;
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, p]) => {
      running += p;
      return { date, profit: round2(p), cumulative: round2(running) };
    });
}
