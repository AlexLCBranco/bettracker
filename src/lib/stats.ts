import { countBets } from './dutch';
import { profit } from './money';
import { collapseRollovers } from './rollover';
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
  pendingAmount: number;
  settledStake: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(bets: Bet[]): Summary {
  let netProfit = 0;
  let settledStake = 0;
  let totalWagered = 0;
  let pendingAmount = 0;
  // BT-29: a rollover shot is one money item (first stake in, final payout out)
  for (const b of collapseRollovers(bets)) {
    totalWagered += b.stake;
    if (b.result === 'pending') {
      pendingAmount += b.stake;
      continue;
    }
    settledStake += b.stake;
    netProfit += profit(b);
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
    pendingAmount: round2(pendingAmount),
    settledStake: round2(settledStake),
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
