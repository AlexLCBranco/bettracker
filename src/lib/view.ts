// BT-26: the Bets page's tabs (All / Pending / To settle), the order its rows are in, and where the selection goes.

import { groupRows, rowKey, type BetRow } from './dutch';
import { chainSummary, chainPending } from './rollover';
import { settleQueue } from './settle';
import { dayGroups, type DayGroup } from './table';
import type { Bet } from './types';

export const TABS = ['all', 'pending', 'banked', 'settle'] as const;
export type Tab = (typeof TABS)[number];
export const TAB_LABEL: Record<Tab, string> = { all: 'All', pending: 'Pending', banked: 'Banked', settle: 'To settle' };
export const isTab = (v: unknown): v is Tab => TABS.includes(v as Tab);

/** A row's selection key (see dutch.ts). A dutch's split lines and a rollover's bets are selected as "bet:<id>". */
export { rowKey };

/** Shown on the Pending tab: a bet still pending, or a rollover shot that is still open (BT-29). */
const isPendingRow = (r: BetRow) => (r.kind === 'rollover' ? chainPending(chainSummary(r.bets).outcome) : (r.kind === 'bet' ? [r.bet] : r.bets).some((b) => b.result === 'pending'));

/** Shown on the Banked tab: an open shot or ladder (money won and banked, waiting for its next bet). */
export const isBankedRow = (r: BetRow) => r.kind === 'rollover' && chainSummary(r.bets).outcome === 'open';

const due = (b: Bet) => b.gameDate || b.placedDate;

/**
 * The table's days for a tab. All: every bet, newest first, under its bet date. Pending: the bets (and dutches with a
 * bet) still pending, same order. To settle: the old Settle queue (pending, game date today or earlier), oldest first,
 * under its game date.
 */
export function tabDays(bets: Bet[], tab: Tab, today: string): DayGroup[] {
  if (tab === 'all') return dayGroups(groupRows(bets));
  if (tab === 'pending') return dayGroups(groupRows(bets).filter(isPendingRow));
  if (tab === 'banked') return dayGroups(groupRows(bets).filter(isBankedRow));
  // a rollover's pending bet is queued on its own; the tab shows its whole shot
  const chain = (id: string) => bets.filter((b) => b.rolloverId === id);
  const rows: BetRow[] = settleQueue(bets, today).map((it) =>
    it.kind === 'dutch' ? { kind: 'dutch', dutchId: it.dutchId, bets: it.bets } : it.bet.rolloverId ? { kind: 'rollover', rolloverId: it.bet.rolloverId, bets: chain(it.bet.rolloverId) } : { kind: 'bet', bet: it.bet },
  );
  return dayGroups(rows, (r) => (r.kind === 'bet' ? due(r.bet) : r.bets.filter((b) => b.result === 'pending').map(due).sort()[0]!));
}

/** The bets a tab shows (for the stats strip), each once (a banked dutch split is in two rows). */
export const tabBets = (days: DayGroup[]): Bet[] => [...new Map(days.flatMap((d) => d.rows.flatMap((r) => (r.kind === 'bet' ? [r.bet] : r.bets))).map((b) => [b.id, b])).values()];

/** The rows' keys in the order shown: what ↑ ↓ move through. */
export const rowKeys = (days: DayGroup[]): string[] => days.flatMap((d) => d.rows.map(rowKey));

/** ↑ ↓: the key `delta` rows away (the first row when nothing is selected), kept inside the list. */
export function moveKey(keys: string[], key: string | null, delta: number): string | null {
  if (!keys.length) return null;
  const i = key ? keys.indexOf(key) : -1;
  if (i < 0) return keys[0]!;
  return keys[Math.max(0, Math.min(keys.length - 1, i + delta))]!;
}

/** After settling `key`: the row below it (the one above when it was last), so settling is one key per row. */
export function nextKey(keys: string[], key: string): string | null {
  const i = keys.indexOf(key);
  if (i < 0) return null;
  return keys[i + 1] ?? keys[i - 1] ?? null;
}
