'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { HitBadge } from '@/components/HitBadge';
import { isTyping } from '@/components/Shell';
import { formatDate, todayISO } from '@/lib/dates';
import { betLabel, dutchSummary } from '@/lib/dutch';
import { formatMoney, formatOdds, parseNumber, potentialReturn } from '@/lib/money';
import { moveCursor, settleAt, settleDutchAt, settleQueue, settleSharedLostAt, SETTLE_KEYS, sharedLegOf, undoLast, type QueueItem, type SettleState, type SettleStep } from '@/lib/settle';
import { RESULT_LABEL, type Bet } from '@/lib/types';

const HELP: [string, string][] = [
  ['W', 'Won'],
  ['L', 'Lost'],
  ['V', 'Void'],
  ['C', 'Cash-out'],
  ['H', 'Half-won'],
  ['J', 'Half-lost'],
  ['1-9', 'Dutch: toggle a winner'],
  ['Enter', 'Dutch: confirm (toggled won, rest lost)'],
  ['0', 'Dutch: none won'],
  ['S', 'Dutch: shared leg lost'],
  ['↑ ↓', 'Move'],
  ['Z', 'Undo'],
];

const DUTCH_KEYS_HELP = 'A dutch settles with 1-9 to toggle the splits that won, then Enter; 0 (none won), V (void all) or S (shared leg lost). Anything else: settle its bets in History.';

const selectionOf = betLabel;
const itemLabel = (it: QueueItem) => (it.kind === 'bet' ? it.bet.betText || 'bet' : `dutch (${it.bets.length} bets)`);

export default function SettlePage() {
  const { bets, loaded, update, form, dutchForm, notify } = useApp();
  const queue = useMemo(() => settleQueue(bets, todayISO()), [bets]);
  const [state, setState] = useState<SettleState>({ cursor: 0, undo: [] });
  const [cashoutFor, setCashoutFor] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  // the splits toggled as won on the dutch under the cursor (forgotten once another item is settled)
  const [picked, setPicked] = useState<{ key: string; winners: number[] }>({
    key: '',
    winners: [],
  });
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const cursor = Math.min(state.cursor, Math.max(0, queue.length - 1));
  const current = queue[cursor];
  const winnersFor = (key: string) => (picked.key === key ? picked.winners : []);
  const toggleWinner = (key: string, n: number) =>
    setPicked((p) => {
      const w = p.key === key ? p.winners : [];
      return {
        key,
        winners: w.includes(n) ? w.filter((x) => x !== n) : [...w, n].sort((a, b) => a - b),
      };
    });

  const apply = (r: SettleStep | null, label: string) => {
    if (!r) return;
    setState(r.state);
    for (const c of r.changes)
      void update(c.id, {
        result: c.result,
        cashout: c.cashout,
        ...(c.legs ? { legs: c.legs } : {}),
      }).catch(() => undefined);
    notify(label);
  };

  const settleBet = (at: number, key: string, cashout: number | null = null) => {
    const result = SETTLE_KEYS[key];
    const item = queue[at];
    if (!result || !item) return;
    apply(settleAt(queue, { ...state, cursor: at }, result, cashout), `${RESULT_LABEL[result]}: ${itemLabel(item)}`);
  };

  const settleDutch = (at: number, winners: number[] | 'none' | 'void') => {
    const item = queue[at];
    if (item?.kind !== 'dutch') return;
    const none = winners === 'none' || (Array.isArray(winners) && !winners.length);
    const label = winners === 'void' ? 'Void' : none ? 'None won' : `Won: ${(winners as number[]).map((w) => selectionOf(item.pending[w]!)).join(', ')}`;
    setPicked({ key: '', winners: [] });
    apply(settleDutchAt(queue, { ...state, cursor: at }, none ? 'none' : winners), `${label} · ${itemLabel(item)}`);
  };

  const settleShared = (at: number) => {
    const item = queue[at];
    const shared = sharedLegOf(item);
    if ('error' in shared) {
      notify(shared.error, 'error');
      return;
    }
    setPicked({ key: '', winners: [] });
    apply(settleSharedLostAt(queue, { ...state, cursor: at }), `Shared leg lost (${shared.name}) · ${itemLabel(item!)}`);
  };

  const undo = () => apply(undoLast(state), 'Undone');

  // Keyboard: whole page, except while typing (quick-add, cash-out amount) or with a form open.
  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    handler.current = (e: KeyboardEvent) => {
      if (form || dutchForm || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowdown' || k === 'arrowup') {
        e.preventDefault();
        setState((s) => moveCursor(queue, { ...s, cursor }, k === 'arrowdown' ? 1 : -1));
      } else if (k === 'z') {
        e.preventDefault();
        undo();
      } else if (current?.kind === 'dutch') {
        if (/^[1-9]$/.test(k)) {
          e.preventDefault();
          if (Number(k) <= current.pending.length) toggleWinner(current.key, Number(k) - 1);
        } else if (k === 'enter') {
          e.preventDefault();
          settleDutch(cursor, winnersFor(current.key));
        } else if (k === 's') {
          e.preventDefault();
          settleShared(cursor);
        } else if (k === '0') {
          e.preventDefault();
          settleDutch(cursor, 'none');
        } else if (k === 'v') {
          e.preventDefault();
          settleDutch(cursor, 'void');
        } else if (k in SETTLE_KEYS) {
          e.preventDefault();
          notify(DUTCH_KEYS_HELP, 'error');
        }
      } else if (k === 'c' && current) {
        e.preventDefault();
        setAmount('');
        setCashoutFor(current.key);
      } else if (k in SETTLE_KEYS && current) {
        e.preventDefault();
        settleBet(cursor, k);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (current) rowRefs.current.get(current.key)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const btn = 'rounded px-1.5 py-0.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800';

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
          {queue.map((it, i) => {
            const active = i === cursor;
            const select = () => setState((s) => ({ ...s, cursor: i }));
            return (
              <li
                key={it.key}
                ref={(el) => {
                  if (el) rowRefs.current.set(it.key, el);
                  else rowRefs.current.delete(it.key);
                }}
                data-testid="queue-row"
                data-active={active || undefined}
                aria-current={active || undefined}
                onClick={select}
                className={`cursor-pointer px-4 py-3 text-sm ${active ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-600' : 'hover:bg-zinc-900'}`}
              >
                {it.kind === 'bet' ? (
                  <BetLine
                    b={it.bet}
                    cashout={cashoutFor === it.key}
                    amount={amount}
                    setAmount={setAmount}
                    onCashout={(a) => {
                      setCashoutFor(null);
                      settleBet(i, 'c', a);
                    }}
                    closeCashout={() => setCashoutFor(null)}
                    onKey={(k) => {
                      select();
                      if (k === 'c') {
                        setAmount('');
                        setCashoutFor(it.key);
                      } else settleBet(i, k);
                    }}
                    btn={btn}
                  />
                ) : (
                  <DutchLine
                    it={it}
                    btn={btn}
                    winners={winnersFor(it.key)}
                    onToggle={(n) => {
                      select();
                      toggleWinner(it.key, n);
                    }}
                    onPick={(w) => settleDutch(i, w)}
                    onShared={() => settleShared(i)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {queue.length > 0 && (
        <p className="text-xs text-zinc-500">
          {queue.length} to settle
          {state.undo.length ? ` · ${state.undo.length} settled here (Z undoes the last)` : ''}
        </p>
      )}
    </div>
  );
}

const GRID = 'grid grid-cols-[6rem_1fr_8rem_6rem_5rem_8rem_auto] items-center gap-3';

function BetLine(props: {
  b: Bet;
  cashout: boolean;
  amount: string;
  setAmount(v: string): void;
  onCashout(a: number): void;
  closeCashout(): void;
  onKey(k: string): void;
  btn: string;
}) {
  const { b } = props;
  const leg = b.legs[0];
  return (
    <div className={GRID}>
      <span className="text-zinc-400">{formatDate(b.gameDate)}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-zinc-100">{b.betText || leg?.selection || '(no text)'}</span>
        <span className="block truncate text-xs text-zinc-500">
          {b.type === 'combination' ? `Combination${b.legs.length ? ` · ${b.legs.length} legs` : ''}` : [leg?.sport, leg?.game, leg?.market].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="truncate text-zinc-400">{b.book}</span>
      <span className="text-right tabular-nums">{formatMoney(b.stake, b.money)}</span>
      <span className="text-right tabular-nums">@{formatOdds(b.odds)}</span>
      <span className="text-right tabular-nums text-zinc-400" title="Potential return">
        {formatMoney(potentialReturn(b.stake, b.odds), b.money)}
      </span>
      <span className="flex gap-1">
        {props.cashout ? (
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const a = parseNumber(props.amount);
              if (a != null) props.onCashout(a);
            }}
          >
            <input
              autoFocus
              className="field w-28 py-0.5"
              placeholder="Cash-out R$"
              aria-label="Cash-out amount"
              value={props.amount}
              onChange={(e) => props.setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && props.closeCashout()}
              onBlur={props.closeCashout}
            />
          </form>
        ) : (
          Object.entries(SETTLE_KEYS).map(([k, r]) => (
            <button
              key={k}
              className={props.btn}
              title={RESULT_LABEL[r]}
              aria-label={`Settle ${RESULT_LABEL[r]}`}
              onClick={(e) => {
                e.stopPropagation();
                props.onKey(k);
              }}
            >
              {k.toUpperCase()}
            </button>
          ))
        )}
      </span>
    </div>
  );
}

function DutchLine(props: { it: Extract<QueueItem, { kind: 'dutch' }>; btn: string; winners: number[]; onToggle(n: number): void; onPick(w: number[] | 'none' | 'void'): void; onShared(): void }) {
  const { it, btn, winners, onPick } = props;
  const s = dutchSummary(it.bets);
  const shared = sharedLegOf(it);
  const first = it.bets[0]!;
  const leg = first.legs[0];
  const settled = it.bets.filter((b) => b.result !== 'pending');
  const click = (w: number[] | 'none' | 'void') => (e: React.MouseEvent) => {
    e.stopPropagation();
    onPick(w);
  };
  return (
    <div className="space-y-2" data-testid="queue-dutch">
      <div className={GRID}>
        <span className="text-zinc-400">{formatDate(it.pending.map((b) => b.gameDate || b.placedDate).sort()[0]!)}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-zinc-100">
            <span className="mr-1.5 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-semibold text-indigo-300">Dutch</span>
            {it.bets.map(selectionOf).join(' / ')}
          </span>
          <span className="block truncate text-xs text-zinc-500">{[leg?.sport, leg?.game, leg?.market].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="truncate text-zinc-400">{[...new Set(it.bets.map((b) => b.book).filter(Boolean))].join(', ')}</span>
        <span className="text-right tabular-nums">{formatMoney(s.stake, it.bets[0]!.money)}</span>
        <span className="text-right tabular-nums" title="Combined odds">
          @{formatOdds(s.combinedOdds)}
        </span>
        <span className="text-right">{settled.length > 0 && <HitBadge bets={it.bets} />}</span>
        <span className="flex gap-1">
          <button className={`${btn} border border-emerald-700`} title="Confirm: toggled splits won, the rest lost (Enter)" aria-label="Settle dutch: confirm winners" onClick={click(winners)}>
            ↵ {winners.length ? `${winners.length} won` : 'none won'}
          </button>
          {!('error' in shared) && (
            <button
              className={btn}
              title={`Shared leg lost (${shared.name}): every split lost`}
              aria-label="Settle dutch: shared leg lost"
              onClick={(e) => {
                e.stopPropagation();
                props.onShared();
              }}
            >
              S
            </button>
          )}
          <button className={btn} title="None won: all lost" aria-label="Settle dutch: none won" onClick={click('none')}>
            0
          </button>
          <button className={btn} title="Void all" aria-label="Settle dutch: void" onClick={click('void')}>
            V
          </button>
        </span>
      </div>
      <ul className="ml-[6.75rem] space-y-1 text-xs">
        {it.pending.map((b, n) => {
          const on = winners.includes(n);
          return (
            <li key={b.id} className="flex items-center gap-3" data-testid="queue-dutch-bet" data-won={on || undefined}>
              <button
                className={`${btn} w-6 border ${on ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-zinc-700'}`}
                aria-label={`Toggle won: ${selectionOf(b)}`}
                aria-pressed={on}
                title="Toggle: this one won (Enter confirms)"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onToggle(n);
                }}
              >
                {n + 1}
              </button>
              <span className={`w-72 truncate ${on ? 'text-emerald-300' : 'text-zinc-200'}`} title={selectionOf(b)}>
                {selectionOf(b)}
              </span>
              <span className="w-24 truncate text-zinc-500">{b.book}</span>
              <span className="w-20 text-right tabular-nums">{formatMoney(b.stake, b.money)}</span>
              <span className="w-14 text-right tabular-nums">@{formatOdds(b.odds)}</span>
              <span className="w-24 text-right tabular-nums text-zinc-500" title="Returns if it wins">
                {formatMoney(potentialReturn(b.stake, b.odds), b.money)}
              </span>
            </li>
          );
        })}
        {settled.map((b) => (
          <li key={b.id} className="flex items-center gap-3 text-zinc-500">
            <span className="w-6 text-center">·</span>
            <span className="w-48 truncate">{selectionOf(b)}</span>
            <span>already {RESULT_LABEL[b.result].toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
