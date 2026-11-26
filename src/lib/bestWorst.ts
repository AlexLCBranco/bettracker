// BT-62: Analytics' "Best" and "Worst" tiles: the row with the highest and the lowest profit across the sport, market,
// book, type and situation breakdowns. Small samples (BT-65) and the "Not set" / "Mixed" rows never qualify.

import { breakdown, DIMENSION_LABEL, isSmallSample, MIXED, NOT_SET, type Dimension, type Row } from './analytics';
import type { Bet } from './types';

export const BEST_WORST_DIMENSIONS: Dimension[] = ['sport', 'market', 'book', 'type', 'situation'];

export interface Segment {
  dimension: Dimension;
  label: string;
  profit: number;
}

/** "<breakdown>: <label>", e.g. "Sport: Basketball". */
export const segmentText = (s: Segment) => `${DIMENSION_LABEL[s.dimension]}: ${s.label}`;

/** The best and worst segment; both null when fewer than two rows qualify. Ties: more settled bets first. */
export function bestWorst(bets: Bet[]): { best: Segment | null; worst: Segment | null } {
  const rows: { d: Dimension; r: Row }[] = [];
  for (const d of BEST_WORST_DIMENSIONS)
    for (const r of breakdown(bets, d)) if (r.label !== NOT_SET && r.label !== MIXED && !isSmallSample(r)) rows.push({ d, r });
  if (rows.length < 2) return { best: null, worst: null };
  const settled = (x: { r: Row }) => x.r.wins + x.r.losses;
  const byProfit = [...rows].sort((a, b) => b.r.profit - a.r.profit || settled(b) - settled(a));
  const pick = (x: { d: Dimension; r: Row }): Segment => ({ dimension: x.d, label: x.r.label, profit: x.r.profit });
  const best = byProfit[0]!;
  const worst = [...rows].sort((a, b) => a.r.profit - b.r.profit || settled(b) - settled(a))[0]!;
  return { best: pick(best), worst: pick(worst) };
}
