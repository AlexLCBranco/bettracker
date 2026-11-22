'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { isTyping } from '@/components/Shell';
import { formatDate, todayISO } from '@/lib/dates';
import { formatBRL, formatOdds, parseNumber, potentialReturn } from '@/lib/money';
import { moveCursor, settleAt, settleQueue, SETTLE_KEYS, undoLast, type SettleChange, type SettleState } from '@/lib/settle';
import { RESULT_LABEL } from '@/lib/types';

const HELP: [string, string][] = [
  ['W', 'Won'],
  ['L', 'Lost'],
  ['V', 'Void'],
  ['C', 'Cash-out'],
  ['H', 'Half-won'],
  ['J', 'Half-lost'],
  ['↑ ↓', 'Move'],
  ['Z', 'Undo'],
];

export default function SettlePage() {
  const { bets, loaded, update, form, notify } = useApp();
  const queue = useMemo(() => settleQueue(bets, todayISO()), [bets]);
  const [state, setState] = useState<SettleState>({ cursor: 0, undo: [] });
  const [cashoutFor, setCashoutFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const cursor = Math.min(state.cursor, Math.max(0, queue.length - 1));
  const current = queue[cursor];

  const apply = (change: SettleChange, label: string) => {
    void update(change.id, { result: change.result, cashout: change.cashout }).catch(() => undefined);
    notify(label);
  };

  const settle = (key: string, cashout: number | null = null) => {
    const result = SETTLE_KEYS[key];
    if (!result) return;
    const r = settleAt(queue, { ...state, cursor }, result, cashout);
    if (!r) return;
    setState(r.state);
    apply(r.change, `${RESULT_LABEL[result]}: ${queue[cursor]?.betText || 'bet'}`);
  };

  const undo = () => {
    const r = undoLast(state);
    if (!r) return;
    setState(r.state);
    apply(r.change, 'Undone');
  };

  // Keyboard: whole page, except while typing (quick-add, cash-out amount) or with the bet form open.
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
  handler.current = (e: KeyboardEvent) => {
    if (form || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowdown' || k === 'arrowup') {
      e.preventDefault();
      setState((s) => moveCursor(queue, { ...s, cursor }, k === 'arrowdown' ? 1 : -1));
    } else if (k === 'z') {
      e.preventDefault();
      undo();
    } else if (k === 'c' && current) {
      e.preventDefault();
      setAmount('');
      setCashoutFor(current.id);
    } else if (k in SETTLE_KEYS && current) {
      e.preventDefault();
      settle(k);
    }
  };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (current) rowRefs.current.get(current.id)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Settle queue</h1>
          <p className="text-sm text-zinc-400">Pending bets with a game date of today or earlier, oldest first.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
          {HELP.map(([k, l]) => (
            <span key={k}>
              <kbd>{k}</kbd> {l}
            </span>
          ))}
        </div>
      </div>

      {!loaded ? (
        <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>
      ) : queue.length === 0 ? (
        <div className="card py-12 text-center text-sm text-zinc-400" data-testid="queue-empty">
          Nothing to settle. {state.undo.length > 0 && <span>Press <kbd>Z</kbd> to undo the last one.</span>}
        </div>
      ) : (
        <ol className="card divide-y divide-zinc-900" data-testid="settle-queue">
          {queue.map((b, i) => {
            const leg = b.legs[0];
            const active = i === cursor;
            return (
              <li
                key={b.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(b.id, el);
                  else rowRefs.current.delete(b.id);
                }}
                data-testid="queue-row"
                data-active={active || undefined}
                aria-current={active || undefined}
                onClick={() => setState((s) => ({ ...s, cursor: i }))}
                className={`grid cursor-pointer grid-cols-[6rem_1fr_8rem_6rem_5rem_8rem_auto] items-center gap-3 px-4 py-3 text-sm ${active ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-600' : 'hover:bg-zinc-900'}`}
              >
                <span className="text-zinc-400">{formatDate(b.gameDate)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-zinc-100">{b.betText || leg?.selection || '(no text)'}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {b.type === 'combination' ? `Combination${b.legs.length ? ` · ${b.legs.length} legs` : ''}` : [leg?.sport, leg?.game, leg?.market].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="truncate text-zinc-400">{b.book}</span>
                <span className="text-right tabular-nums">{formatBRL(b.stake)}</span>
                <span className="text-right tabular-nums">@{formatOdds(b.odds)}</span>
                <span className="text-right tabular-nums text-zinc-400" title="Potential return">
                  {formatBRL(potentialReturn(b.stake, b.odds))}
                </span>
                <span className="flex gap-1">
                  {cashoutFor === b.id ? (
                    <form
                      className="flex gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const a = parseNumber(amount);
                        if (a == null) return;
                        setCashoutFor(null);
                        settle('c', a);
                      }}
                    >
                      <input
                        autoFocus
                        className="field w-28 py-0.5"
                        placeholder="Cash-out R$"
                        aria-label="Cash-out amount"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setCashoutFor(null)}
                        onBlur={() => setCashoutFor(null)}
                      />
                    </form>
                  ) : (
                    Object.entries(SETTLE_KEYS).map(([k, r]) => (
                      <button
                        key={k}
                        className="rounded px-1.5 py-0.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800"
                        title={RESULT_LABEL[r]}
                        aria-label={`Settle ${RESULT_LABEL[r]}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setState((s) => ({ ...s, cursor: i }));
                          if (k === 'c') {
                            setAmount('');
                            setCashoutFor(b.id);
                          } else {
                            const res = settleAt(queue, { ...state, cursor: i }, r);
                            if (res) {
                              setState(res.state);
                              apply(res.change, `${RESULT_LABEL[r]}: ${b.betText || 'bet'}`);
                            }
                          }
                        }}
                      >
                        {k.toUpperCase()}
                      </button>
                    ))
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {queue.length > 0 && (
        <p className="text-xs text-zinc-500">
          {queue.length} to settle{state.undo.length ? ` · ${state.undo.length} settled here (Z undoes the last)` : ''}
        </p>
      )}
    </div>
  );
}
