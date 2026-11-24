'use client';

import { useState, type ReactNode } from 'react';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { parseDateInput } from '@/lib/dates';
import { rowBets, type BetRow } from '@/lib/dutch';
import { betResultChanges } from '@/lib/settle';
import { bulkSettleable, selectionTotals } from '@/lib/selection';
import { RESULT_LABEL, type Bet, type BetInput, type Result } from '@/lib/types';

const SKIP_NOTE = 'dutches, combinations with leg results, rollovers and ladders settle part by part';

/**
 * BT-45: shown while 2 or more rows are selected: their count, total stake, the profit of the settled ones and what the
 * pending ones would pay (following the Real / Hypothetical / Both switch like the stats strip), and the bulk actions.
 * Every action is ONE undo step (Ctrl+Z, or Undo in the note shown after it).
 */
export function BulkBar({ rows, clear, fmt }: { rows: BetRow[]; clear(): void; fmt(n: number, signed?: boolean): string }) {
  const { update, remove, undoGroup, notify, suggestFor } = useApp();
  const [mode, setMode] = useState<null | 'label' | 'date' | 'book'>(null);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const t = selectionTotals(rows);
  const bets = rows.flatMap(rowBets);
  const settleable = bulkSettleable(rows);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    await undoGroup(label, undefined, fn);
    notify(label);
  };
  const patchAll = (label: string, patch: (b: Bet) => Partial<BetInput> | null) =>
    run(label, () =>
      Promise.all(
        bets.map((b) => {
          const p = patch(b);
          return p ? update(b.id, p, {}).catch(() => undefined) : undefined;
        }),
      ),
    );

  const settleAll = async (r: Result) => {
    const { bets: ok, skipped } = settleable;
    const skip = skipped ? ` · ${skipped} skipped: ${SKIP_NOTE}` : '';
    setNote(skipped ? `${skipped} skipped: ${SKIP_NOTE}` : '');
    if (!ok.length) return notify(`Nothing to settle in bulk${skip}`, 'error');
    await run(`${RESULT_LABEL[r]}: ${ok.length} ${ok.length === 1 ? 'bet' : 'bets'}${skip}`, () =>
      Promise.all(
        ok.flatMap((b) =>
          betResultChanges([b], b, r).map((c) => update(c.id, { result: c.result, cashout: c.cashout, ...(c.legs ? { legs: c.legs } : {}) }, {}).catch(() => undefined)),
        ),
      ),
    );
  };

  const apply = async () => {
    const v = text.trim();
    if (mode === 'label') await patchAll(v ? `Label "${v}" on ${bets.length} bets` : `Label cleared on ${bets.length} bets`, (b) => (b.label === v ? null : { label: v }));
    if (mode === 'book') {
      if (!v) return notify('Type a book', 'error');
      await patchAll(`Book ${v} on ${bets.length} bets`, (b) => (b.book === v ? null : { book: v }));
    }
    if (mode === 'date') {
      const d = parseDateInput(v);
      if (!d) return notify('Game date: use dd/mm/yyyy', 'error');
      await patchAll(`Game date set on ${bets.length} bets`, (b) => (b.gameDate === d ? null : { gameDate: d }));
    }
    setMode(null);
    setText('');
  };

  const del = async () => {
    if (!window.confirm(`Delete ${t.rows} selected ${t.rows === 1 ? 'row' : 'rows'} (${bets.length} ${bets.length === 1 ? 'bet' : 'bets'})? Ctrl+Z undoes it.`)) return;
    clear();
    await run(`Deleted ${t.rows} rows (${bets.length} bets)`, () => Promise.all(bets.map((b) => remove(b.id, {}))));
  };

  const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-300');
  return (
    <div
      role="region"
      aria-label="Selected bets"
      className="fixed bottom-4 left-1/2 z-30 flex max-w-[calc(100vw-10rem)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-sky-700/60 bg-zinc-900/95 px-3 py-2 text-xs shadow-2xl"
      data-testid="bulk-bar"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="font-semibold text-sky-200" data-testid="bulk-count">
        {t.rows} selected
      </span>
      <Fig label="stake" testId="bulk-stake">
        {fmt(t.stake)}
      </Fig>
      {t.settled > 0 && (
        <Fig label="settled" testId="bulk-profit">
          <span className={tone(t.settledProfit)}>{fmt(t.settledProfit, true)}</span>
        </Fig>
      )}
      {t.pending > 0 && (
        <Fig label="pending pays" testId="bulk-pays">
          {fmt(t.pendingPays)}
        </Fig>
      )}
      <span className="h-4 border-l border-zinc-700" aria-hidden />
      {mode ? (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            e.stopPropagation();
            setMode(null);
          }}
        >
          {mode === 'book' ? (
            <Autocomplete autoFocus className="field w-40 py-0.5 text-xs" value={text} onChange={setText} getSuggestions={(q) => suggestFor('book', q)} aria-label="Bulk book" />
          ) : (
            <input
              autoFocus
              className="field w-40 py-0.5 text-xs"
              value={text}
              placeholder={mode === 'date' ? 'dd/mm/yyyy' : 'empty clears it'}
              onChange={(e) => setText(e.target.value)}
              aria-label={mode === 'date' ? 'Bulk game date' : 'Bulk label'}
            />
          )}
          <button type="submit" className="whitespace-nowrap rounded px-1.5 py-0.5 font-semibold text-sky-200 hover:bg-sky-700/40">
            Apply
          </button>
          <Btn onClick={() => setMode(null)}>Cancel</Btn>
        </form>
      ) : (
        <span className="flex flex-wrap items-center gap-1">
          <Btn onClick={() => void settleAll('won')} cls="text-emerald-300 hover:bg-emerald-600/30" title={`Settle the ${settleable.bets.length} pending plain bets as won`}>
            Won
          </Btn>
          <Btn onClick={() => void settleAll('lost')} cls="text-red-300 hover:bg-red-600/30" title={`Settle the ${settleable.bets.length} pending plain bets as lost`}>
            Lost
          </Btn>
          <Btn onClick={() => void settleAll('void')} title={`Settle the ${settleable.bets.length} pending plain bets as void`}>
            Void
          </Btn>
          <span className="h-4 border-l border-zinc-700" aria-hidden />
          <Btn onClick={() => setMode('label')}>Label…</Btn>
          <Btn onClick={() => setMode('date')}>Game date…</Btn>
          <Btn onClick={() => setMode('book')}>Book…</Btn>
          <Btn onClick={() => void patchAll(`No brainer on ${bets.length} bets`, (b) => (b.noBrainer ? null : { noBrainer: true }))} cls="text-violet-300 hover:bg-violet-600/30">
            NB on
          </Btn>
          <Btn onClick={() => void patchAll(`No brainer off on ${bets.length} bets`, (b) => (b.noBrainer ? { noBrainer: false } : null))}>NB off</Btn>
          <Btn onClick={() => void del()} cls="text-red-300 hover:bg-red-600/30">
            Delete
          </Btn>
        </span>
      )}
      <button className="ml-1 rounded px-1 text-zinc-500 hover:text-white" onClick={clear} aria-label="Clear selection" title="Clear selection (Esc)">
        ✕
      </button>
      {note && (
        <span className="basis-full text-[11px] text-amber-300" data-testid="bulk-note">
          {note}
        </span>
      )}
    </div>
  );
}

function Fig({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <span className="whitespace-nowrap text-zinc-400" data-testid={testId}>
      <span className="font-semibold tabular-nums text-zinc-100">{children}</span> {label}
    </span>
  );
}

function Btn({ onClick, cls = 'text-zinc-300 hover:bg-zinc-700', title, children }: { onClick(): void; cls?: string; title?: string; children: ReactNode }) {
  return (
    <button type="button" className={`whitespace-nowrap rounded px-1.5 py-0.5 font-semibold ${cls}`} onClick={onClick} title={title}>
      {children}
    </button>
  );
}
