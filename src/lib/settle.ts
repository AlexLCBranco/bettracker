// Settle queue: pending bets whose game date is today or earlier, oldest first, settled by key with undo.
// A dutch is one item: a number key picks the selection that won (the others lose), 0 = none won, V = void all.

import { groupRows } from './dutch';
import type { Bet, Result } from './types';

export type QueueItem =
  | { kind: 'bet'; key: string; bet: Bet }
  /** `bets`: every bet of the dutch; `pending`: those still to settle (what the number keys pick from). */
  | { kind: 'dutch'; key: string; dutchId: string; bets: Bet[]; pending: Bet[] };

const due = (b: Bet) => b.gameDate || b.placedDate;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const min = (xs: string[]) => xs.reduce((a, b) => (b < a ? b : a));

export function settleQueue(bets: Bet[], today: string): QueueItem[] {
  const items: { item: QueueItem; due: string; placed: string; created: string }[] = [];
  for (const r of groupRows(bets)) {
    if (r.kind === 'bet') {
      const b = r.bet;
      if (b.result === 'pending' && due(b) <= today) items.push({ item: { kind: 'bet', key: b.id, bet: b }, due: due(b), placed: b.placedDate, created: b.createdAt });
      continue;
    }
    const pending = r.bets.filter((b) => b.result === 'pending');
    if (!pending.some((b) => due(b) <= today)) continue;
    items.push({
      item: { kind: 'dutch', key: r.dutchId, dutchId: r.dutchId, bets: r.bets, pending },
      due: min(pending.map(due)),
      placed: min(pending.map((b) => b.placedDate)),
      created: min(pending.map((b) => b.createdAt)),
    });
  }
  return items.sort((a, b) => cmp(a.due, b.due) || cmp(a.placed, b.placed) || cmp(a.created, b.created)).map((x) => x.item);
}

/** Keys of the settle queue → result. C (cash-out) asks for the amount first. Plain bets only. */
export const SETTLE_KEYS: Record<string, Result> = {
  w: 'won',
  l: 'lost',
  v: 'void',
  c: 'cash-out',
  h: 'half-won',
  j: 'half-lost',
};

export interface SettleChange {
  id: string;
  result: Result;
  cashout: number | null;
}

export interface UndoEntry {
  /** What the bets were before, to restore (one bet, or every bet a dutch settle changed). */
  before: SettleChange[];
  /** Queue position the item was at, to put the cursor back. */
  index: number;
}

export interface SettleState {
  cursor: number;
  undo: UndoEntry[];
}

export interface SettleStep {
  changes: SettleChange[];
  state: SettleState;
}

/** The cursor stays on the same position, which now shows the next item (the settled one leaves the queue). */
function step(queue: QueueItem[], state: SettleState, settled: Bet[], changes: SettleChange[]): SettleStep {
  const nextLen = queue.length - 1;
  return {
    changes,
    state: {
      cursor: Math.max(0, Math.min(state.cursor, nextLen - 1)),
      undo: [...state.undo, { before: settled.map((b) => ({ id: b.id, result: b.result, cashout: b.cashout })), index: state.cursor }],
    },
  };
}

/** Settles the plain bet under the cursor. A dutch is settled with settleDutchAt instead. */
export function settleAt(queue: QueueItem[], state: SettleState, result: Result, cashout: number | null = null): SettleStep | null {
  const item = queue[state.cursor];
  if (!item || item.kind !== 'bet' || result === 'pending') return null;
  if (result === 'cash-out' && (cashout == null || !(cashout >= 0))) return null;
  const bet = item.bet;
  return step(queue, state, [bet], [{ id: bet.id, result, cashout: result === 'cash-out' ? cashout : null }]);
}

/**
 * Settles the dutch under the cursor: `winner` is the index (0-based) of the pending bet that won, which becomes
 * won and the other pending bets lost; 'none' = all lost; 'void' = all void. Bets already settled stay as they are.
 */
export function settleDutchAt(queue: QueueItem[], state: SettleState, winner: number | 'none' | 'void'): SettleStep | null {
  const item = queue[state.cursor];
  if (!item || item.kind !== 'dutch') return null;
  if (typeof winner === 'number' && !item.pending[winner]) return null;
  const changes = item.pending.map((b, i): SettleChange => ({ id: b.id, result: winner === 'void' ? 'void' : i === winner ? 'won' : 'lost', cashout: null }));
  return step(queue, state, item.pending, changes);
}

/** Undoes the last settle (a whole dutch in one step): the changes that restore it, and the cursor back on it. */
export function undoLast(state: SettleState): SettleStep | null {
  const last = state.undo[state.undo.length - 1];
  if (!last) return null;
  return { changes: last.before, state: { cursor: last.index, undo: state.undo.slice(0, -1) } };
}

export function moveCursor(queue: QueueItem[], state: SettleState, delta: number): SettleState {
  if (!queue.length) return { ...state, cursor: 0 };
  return { ...state, cursor: Math.max(0, Math.min(queue.length - 1, state.cursor + delta)) };
}
