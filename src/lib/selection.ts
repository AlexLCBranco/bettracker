// BT-45: several rows of the Bets table selected at once (marquee drag, Ctrl+click, Shift+click, Ctrl+A), their
// totals and which of them a bulk settle can take. A dutch, a rollover chain and a ladder are ONE row: they are
// selected as a whole, never half of one.

import { rowBets, rowKey, type BetRow } from './dutch';
import { profit, winReturn } from './money';
import type { Bet } from './types';

/** The row a table line belongs to: a dutch split's or a chain bet's line selects its whole group. */
export function topKey(keys: string[], lineKey: string, betOf: (id: string) => Pick<Bet, 'dutchId' | 'rolloverId'> | undefined): string | null {
  if (keys.includes(lineKey)) return lineKey;
  if (!lineKey.startsWith('bet:')) return null;
  const b = betOf(lineKey.slice(4));
  if (!b) return null;
  for (const k of [b.rolloverId && `rollover:${b.rolloverId}`, b.dutchId && `dutch:${b.dutchId}`]) if (k && keys.includes(k)) return k;
  return null;
}

/** Ctrl+click: adds or removes one row. */
export function toggleKey(set: ReadonlySet<string>, key: string): Set<string> {
  const n = new Set(set);
  if (n.has(key)) n.delete(key);
  else n.add(key);
  return n;
}

/** Shift+click: every row from `from` to `to` (either order) in table order; just `to` when `from` is gone. */
export function rangeKeys(keys: string[], from: string | null, to: string): string[] {
  const j = keys.indexOf(to);
  if (j < 0) return [];
  const i = from ? keys.indexOf(from) : -1;
  if (i < 0) return [to];
  return keys.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** The rows selected, in table order. */
export function selectedRows(rows: BetRow[], keys: ReadonlySet<string>): BetRow[] {
  return rows.filter((r) => keys.has(rowKey(r)));
}

export interface SelectionTotals {
  rows: number;
  stake: number;
  /** Profit of the settled bets. */
  settledProfit: number;
  settled: number;
  /** What the pending bets return if they win. */
  pendingPays: number;
  pending: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function selectionTotals(rows: BetRow[]): SelectionTotals {
  const bets = rows.flatMap(rowBets);
  const settled = bets.filter((b) => b.result !== 'pending');
  const pending = bets.filter((b) => b.result === 'pending');
  return {
    rows: rows.length,
    stake: r2(bets.reduce((s, b) => s + b.stake, 0)),
    settledProfit: r2(settled.reduce((s, b) => s + profit(b), 0)),
    settled: settled.length,
    pendingPays: r2(pending.reduce((s, b) => s + winReturn(b), 0)),
    pending: pending.length,
  };
}

/**
 * Bulk Won / Lost / Void: pending plain bets only. Dutches, combinations with their legs entered, rollovers and
 * ladders settle part by part, so they are skipped (counted for the bar's note), as are rows already settled.
 */
export function bulkSettleable(rows: BetRow[]): { bets: Bet[]; skipped: number } {
  const bets: Bet[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (r.kind === 'bet' && r.bet.result === 'pending' && !(r.bet.type === 'combination' && r.bet.legs.length >= 2)) bets.push(r.bet);
    else skipped++;
  }
  return { bets, skipped };
}
