'use client';

import { useEffect, useState } from 'react';
import { betLabel } from '@/lib/dutch';
import { beforeOf, betResultChanges, legResultChanges, settleDutchRow, type DutchRowAction, type SettleChange, type SettleStep } from '@/lib/settle';
import { RESULT_LABEL, type Bet, type Result } from '@/lib/types';
import { useApp } from './AppProvider';

/** One undo step: what the bets were, and the row to select again. */
interface Undo {
  before: SettleChange[];
  key: string;
  dutchId?: string;
}

export interface Settler {
  /** Settles a plain bet (or one split of a dutch); cash-out without an amount opens the amount box. */
  settleBet(b: Bet, r: Result, cashout?: number | null, group?: Bet[]): void;
  /** BT-28: a leg's result; the same leg on the other splits and every touched bet follow, in one undo step. */
  settleLeg(group: Bet[], b: Bet, index: number, r: Result): void;
  settleDutch(dutchId: string, bets: Bet[], action: DutchRowAction): void;
  undo(): void;
  canUndo: boolean;
  /** The dutch whose "Undo" button shows (8 s after it was settled). */
  undoShown: string | null;
  /** The bet whose cash-out amount box is open. */
  cashoutFor: string | null;
  startCashout(betId: string): void;
  cancelCashout(): void;
  /** The splits toggled as won (1-9) on a dutch, before Enter. */
  winners(dutchId: string): number[];
  toggleWinner(dutchId: string, n: number): void;
}

const ACTION_LABEL = (a: DutchRowAction, bets: Bet[]) =>
  a === 'none' ? 'None won' : a === 'all' ? 'All won' : a === 'void' ? 'Void' : a === 'shared' ? 'Shared leg lost' : a.length ? `Won: ${a.map((i) => betLabel(bets.filter((b) => b.result === 'pending')[i]!)).join(', ')}` : 'None won';

/**
 * BT-26: settling on the Bets page, by key or button: the old Settle queue's functions with one undo history for the
 * page (Z undoes the last, several steps back). `settled(key)` runs after a settle (to move the selection on),
 * `restored(key)` after an undo (to select that row again).
 */
export function useSettle({ settled, restored }: { settled(key: string): void; restored(key: string): void }): Settler {
  const { update, notify } = useApp();
  const [stack, setStack] = useState<Undo[]>([]);
  const [undoShown, setUndoShown] = useState<string | null>(null);
  const [cashoutFor, setCashoutFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ dutchId: string; winners: number[] }>({ dutchId: '', winners: [] });

  useEffect(() => {
    if (!undoShown) return;
    const t = setTimeout(() => setUndoShown(null), 8000);
    return () => clearTimeout(t);
  }, [undoShown, stack]);

  const apply = (changes: SettleChange[]) => {
    for (const c of changes) void update(c.id, { result: c.result, cashout: c.cashout, ...(c.legs ? { legs: c.legs } : {}) }).catch(() => undefined);
  };
  const push = (step: SettleStep, key: string, label: string, dutchId?: string) => {
    apply(step.changes);
    setStack((s) => [...s, { before: step.state.undo.at(-1)!.before, key, dutchId }]);
    notify(label);
    settled(key);
  };

  /** Saves changes made outside the settle queue functions, with their undo. */
  const pushChanges = (bets: Bet[], changes: SettleChange[], key: string, label: string) => {
    const before = beforeOf(bets, changes);
    apply(changes);
    setStack((st) => [...st, { before, key }]);
    notify(label);
    settled(key);
  };

  return {
    settleBet(b, r, cashout = null, group = [b]) {
      if (r === 'cash-out' && cashout == null) return setCashoutFor(b.id);
      setCashoutFor(null);
      const changes = betResultChanges(group, b, r, cashout);
      if (changes.length) pushChanges(group, changes, `bet:${b.id}`, `${RESULT_LABEL[r]}: ${b.betText || betLabel(b) || 'bet'}`);
    },
    settleLeg(group, b, index, r) {
      const changes = legResultChanges(group, b.id, index, r);
      const leg = b.legs[index];
      const moved = changes.filter((c) => c.id !== b.id || c.result !== b.result).length;
      if (changes.length) pushChanges(group, changes, `bet:${b.id}`, `Leg ${RESULT_LABEL[r]}: ${leg?.selection || 'leg'}${moved > 1 ? ` · ${changes.length} bets` : ''}`);
    },
    settleDutch(dutchId, bets, action) {
      const step = settleDutchRow(dutchId, bets, action);
      if (!step) return;
      setPicked({ dutchId: '', winners: [] });
      setUndoShown(dutchId);
      push(step, `dutch:${dutchId}`, `${ACTION_LABEL(action, bets)} · dutch (${bets.length} bets)`, dutchId);
    },
    undo() {
      const last = stack.at(-1);
      if (!last) return;
      apply(last.before);
      setStack((s) => s.slice(0, -1));
      setUndoShown(null);
      notify('Undone');
      restored(last.key);
    },
    canUndo: stack.length > 0,
    undoShown,
    cashoutFor,
    startCashout: setCashoutFor,
    cancelCashout: () => setCashoutFor(null),
    winners: (dutchId) => (picked.dutchId === dutchId ? picked.winners : []),
    toggleWinner(dutchId, n) {
      setPicked((p) => {
        const w = p.dutchId === dutchId ? p.winners : [];
        return { dutchId, winners: w.includes(n) ? w.filter((x) => x !== n) : [...w, n].sort((a, b) => a - b) };
      });
    },
  };
}
