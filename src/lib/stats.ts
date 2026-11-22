import { profit } from './money';
import type { Bet } from './types';

export interface Summary {
  netProfit: number;
  /** Net profit / settled stake, as a fraction; null with no settled stake. */
  roi: number | null;
  totalWagered: number;
  betCount: number;
  /** won / (won + lost); null when there are none. */
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
  let wins = 0;
  let losses = 0;
  let pendingCount = 0;
  let pendingAmount = 0;
  for (const b of bets) {
    totalWagered += b.stake;
    if (b.result === 'pending') {
      pendingCount++;
      pendingAmount += b.stake;
      continue;
    }
    settledStake += b.stake;
    netProfit += profit(b);
    if (b.result === 'won') wins++;
    if (b.result === 'lost') losses++;
  }
  return {
    netProfit: round2(netProfit),
    roi: settledStake > 0 ? netProfit / settledStake : null,
    totalWagered: round2(totalWagered),
    betCount: bets.length,
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
  for (const b of bets) {
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
