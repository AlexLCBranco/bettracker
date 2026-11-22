// Settle queue: pending bets whose game date is today or earlier, oldest first, settled by key with undo.

import type { Bet, Result } from './types';

export function settleQueue(bets: Bet[], today: string): Bet[] {
  return bets
    .filter((b) => b.result === 'pending' && (b.gameDate || b.placedDate) <= today)
    .sort(
      (a, b) =>
        cmp(a.gameDate || a.placedDate, b.gameDate || b.placedDate) || cmp(a.placedDate, b.placedDate) || cmp(a.createdAt, b.createdAt),
    );
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Keys of the settle queue → result. C (cash-out) asks for the amount first. */
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
  /** What the bet was before, to restore. */
  before: SettleChange;
  /** Queue position the bet was at, to put the cursor back. */
  index: number;
}

export interface SettleState {
  cursor: number;
  undo: UndoEntry[];
}

/**
 * Settles the bet under the cursor. Returns the change to save and the new state; the cursor stays on the same
 * position, which now shows the next bet (the settled one leaves the queue).
 */
export function settleAt(
  queue: Bet[],
  state: SettleState,
  result: Result,
  cashout: number | null = null,
): { change: SettleChange; state: SettleState } | null {
  const bet = queue[state.cursor];
  if (!bet || result === 'pending') return null;
  if (result === 'cash-out' && (cashout == null || !(cashout >= 0))) return null;
  const change: SettleChange = { id: bet.id, result, cashout: result === 'cash-out' ? cashout : null };
  const nextLen = queue.length - 1;
  return {
    change,
    state: {
      cursor: Math.max(0, Math.min(state.cursor, nextLen - 1)),
      undo: [...state.undo, { before: { id: bet.id, result: bet.result, cashout: bet.cashout }, index: state.cursor }],
    },
  };
}

/** Undoes the last settle: the change that restores the bet, and the cursor back on it. */
export function undoLast(state: SettleState): { change: SettleChange; state: SettleState } | null {
  const last = state.undo[state.undo.length - 1];
  if (!last) return null;
  return { change: last.before, state: { cursor: last.index, undo: state.undo.slice(0, -1) } };
}

export function moveCursor(queue: Bet[], state: SettleState, delta: number): SettleState {
  if (!queue.length) return { ...state, cursor: 0 };
  return { ...state, cursor: Math.max(0, Math.min(queue.length - 1, state.cursor + delta)) };
}
