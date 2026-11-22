'use client';

import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate, parseDateInput } from '@/lib/dates';
import { duplicateForm } from '@/lib/form';
import { formatBRL, formatOdds, parseNumber, profit } from '@/lib/money';
import { RESULT_LABEL, RESULTS, type Bet, type BetInput, type Leg, type Result } from '@/lib/types';
import type { Field } from '@/lib/autocomplete';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';

const QUICK_RESULTS: { r: Result; key: string; cls: string }[] = [
  { r: 'won', key: 'W', cls: 'hover:bg-emerald-600/40 text-emerald-400' },
  { r: 'lost', key: 'L', cls: 'hover:bg-red-600/40 text-red-400' },
  { r: 'void', key: 'V', cls: 'hover:bg-zinc-600/40 text-zinc-300' },
];

export function resultClass(r: Result) {
  if (r === 'won' || r === 'half-won') return 'bg-emerald-500/15 text-emerald-400';
  if (r === 'lost' || r === 'half-lost') return 'bg-red-500/15 text-red-400';
  if (r === 'cash-out') return 'bg-sky-500/15 text-sky-400';
  if (r === 'pending') return 'bg-amber-500/15 text-amber-400';
  return 'bg-zinc-500/15 text-zinc-300';
}

export function ProfitText({ value, pending }: { value: number; pending?: boolean }) {
  if (pending) return <span className="text-zinc-500">-</span>;
  return <span className={value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-400'}>{formatBRL(value, true)}</span>;
}

/** Sport / game shown for a bet: the solo leg's, or the combination's legs joined. */
function legSummary(b: Bet, k: 'sport' | 'game') {
  const vals = [...new Set(b.legs.map((l) => l[k]).filter(Boolean))];
  if (b.type === 'combination' && vals.length > 1) return k === 'sport' ? vals.join(', ') : `${b.legs.length} legs`;
  return vals[0] ?? '';
}

export function BetTable({ bets, empty = 'No bets yet. Type one in the quick-add line above.' }: { bets: Bet[]; empty?: string }) {
  const { update, remove, openEdit, openNew } = useApp();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const save = (b: Bet, patch: Partial<BetInput>) => update(b.id, patch).catch(() => undefined);
  const saveLeg = (b: Bet, i: number, patch: Partial<Leg>) => save(b, { legs: b.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const settle = (b: Bet, r: Result) => {
    if (r === 'cash-out') {
      const a = window.prompt('Cash-out amount returned (R$):');
      const amount = a == null ? null : parseNumber(a);
      if (amount == null) return;
      void save(b, { result: r, cashout: amount });
    } else void save(b, { result: r, cashout: null });
  };

  if (!bets.length) return <p className="py-10 text-center text-sm text-zinc-500">{empty}</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="bet-table">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="w-6" />
            <th className="px-2 py-2">Bet Date</th>
            <th className="px-2 py-2">Game Date</th>
            <th className="px-2 py-2">Sport</th>
            <th className="px-2 py-2">Game</th>
            <th className="px-2 py-2">Bet</th>
            <th className="px-2 py-2">Book</th>
            <th className="px-2 py-2 text-right">Stake</th>
            <th className="px-2 py-2 text-right">Odds</th>
            <th className="px-2 py-2">Type</th>
            <th className="px-2 py-2">Situation</th>
            <th className="px-2 py-2 text-right">Plus/Minus</th>
            <th className="px-2 py-2">Result</th>
            <th className="px-2 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((b) => {
            const solo = b.type === 'solo';
            const expanded = open.has(b.id);
            return (
              <Fragment key={b.id}>
                <tr className="border-b border-zinc-900 hover:bg-zinc-900/60" data-testid="bet-row" data-bet-id={b.id}>
                  <td className="px-1">
                    {!solo && b.legs.length > 0 && (
                      <button className="text-zinc-400 hover:text-white" aria-label={expanded ? 'Hide legs' : 'Show legs'} aria-expanded={expanded} onClick={() => toggle(b.id)}>
                        {expanded ? '▾' : '▸'}
                      </button>
                    )}
                  </td>
                  <Cell kind="date" value={formatDate(b.placedDate)} label="Bet date" onSave={(v) => save(b, { placedDate: parseDateInput(v) ?? b.placedDate })} />
                  <Cell kind="date" value={formatDate(b.gameDate)} label="Game date" onSave={(v) => save(b, { gameDate: parseDateInput(v) ?? b.gameDate })} />
                  {solo ? (
                    <>
                      <Cell kind="text" field="sport" value={b.legs[0]?.sport ?? ''} label="Sport" onSave={(v) => saveLeg(b, 0, { sport: v })} />
                      <Cell kind="text" field="game" sport={b.legs[0]?.sport} value={b.legs[0]?.game ?? ''} label="Game" onSave={(v) => saveLeg(b, 0, { game: v })} />
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-zinc-300">{legSummary(b, 'sport')}</td>
                      <td className="px-2 py-1.5 text-zinc-300">{legSummary(b, 'game') || <span className="text-zinc-600">Combination</span>}</td>
                    </>
                  )}
                  <Cell kind="text" field="betText" value={b.betText} label="Bet" onSave={(v) => save(b, { betText: v })} wide />
                  <Cell kind="text" field="book" value={b.book} label="Book" onSave={(v) => save(b, { book: v })} />
                  <Cell kind="number" value={String(b.stake)} display={formatBRL(b.stake)} label="Stake" onSave={(v) => save(b, { stake: parseNumber(v) ?? b.stake })} right />
                  <Cell kind="number" value={formatOdds(b.odds)} label="Odds" onSave={(v) => save(b, { odds: parseNumber(v) ?? b.odds })} right />
                  <Cell kind="select" options={['solo', 'combination']} value={b.type} label="Type" onSave={(v) => save(b, { type: v as Bet['type'] })} />
                  <Cell kind="select" options={['pregame', 'live']} value={b.situation} label="Situation" onSave={(v) => save(b, { situation: v as Bet['situation'] })} />
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" data-testid="profit">
                    <ProfitText value={profit(b)} pending={b.result === 'pending'} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <ResultCell bet={b} onPick={(r) => settle(b, r)} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <span className="inline-flex gap-0.5">
                      {QUICK_RESULTS.map(({ r, key, cls }) => (
                        <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls} ${b.result === r ? 'ring-1 ring-current' : ''}`} title={RESULT_LABEL[r]} aria-label={`Mark ${RESULT_LABEL[r]}`} onClick={() => settle(b, r)}>
                          {key}
                        </button>
                      ))}
                      <IconButton label="Duplicate" onClick={() => openNew(duplicateForm(b))}>⧉</IconButton>
                      <IconButton label="Edit" onClick={() => openEdit(b)}>✎</IconButton>
                      <IconButton
                        label="Delete"
                        onClick={() => {
                          if (window.confirm(`Delete this bet (${formatBRL(b.stake)} @${formatOdds(b.odds)} ${b.betText})? This cannot be undone.`)) void remove(b.id);
                        }}
                      >
                        🗑
                      </IconButton>
                    </span>
                  </td>
                </tr>
                {expanded &&
                  b.legs.map((l, i) => (
                    <tr key={l.id} className="border-b border-zinc-900 bg-zinc-950 text-xs" data-testid="leg-row">
                      <td />
                      <td className="px-2 py-1 text-zinc-500" colSpan={2}>
                        Leg {i + 1}
                      </td>
                      <Cell kind="text" field="sport" value={l.sport} label={`Leg ${i + 1} sport`} onSave={(v) => saveLeg(b, i, { sport: v })} />
                      <Cell kind="text" field="game" sport={l.sport} value={l.game} label={`Leg ${i + 1} game`} onSave={(v) => saveLeg(b, i, { game: v })} />
                      <Cell kind="text" field="selection" sport={l.sport} value={l.selection} label={`Leg ${i + 1} selection`} onSave={(v) => saveLeg(b, i, { selection: v })} />
                      <Cell kind="text" field="market" sport={l.sport} value={l.market} label={`Leg ${i + 1} market`} onSave={(v) => saveLeg(b, i, { market: v })} />
                      <td />
                      <Cell kind="number" value={formatOdds(l.odds)} label={`Leg ${i + 1} odds`} onSave={(v) => saveLeg(b, i, { odds: v.trim() ? (parseNumber(v) ?? l.odds) : null })} right />
                      <td colSpan={3} />
                      <Cell kind="select" options={[...RESULTS]} labels={RESULT_LABEL} value={l.result} label={`Leg ${i + 1} result`} onSave={(v) => saveLeg(b, i, { result: v as Result })} />
                      <td />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white" title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ResultCell({ bet, onPick }: { bet: Bet; onPick(r: Result): void }) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <select
        autoFocus
        className="field py-0.5 text-xs"
        aria-label="Result"
        defaultValue={bet.result}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        onChange={(e) => {
          setEditing(false);
          onPick(e.target.value as Result);
        }}
      >
        {RESULTS.map((r) => (
          <option key={r} value={r}>
            {RESULT_LABEL[r]}
          </option>
        ))}
      </select>
    );
  return (
    <button className={`rounded px-2 py-0.5 text-xs font-medium ${resultClass(bet.result)}`} onClick={() => setEditing(true)} title="Change result" data-testid="result">
      {RESULT_LABEL[bet.result]}
      {bet.result === 'cash-out' && bet.cashout != null ? ` ${formatBRL(bet.cashout)}` : ''}
    </button>
  );
}

type CellProps = {
  value: string;
  label: string;
  onSave(v: string): unknown;
  display?: string;
  right?: boolean;
  wide?: boolean;
} & (
  | { kind: 'text'; field: Field; sport?: string }
  | { kind: 'number' }
  | { kind: 'date' }
  | { kind: 'select'; options: string[]; labels?: Record<string, string> }
);

/** A table cell that turns into an input on click (or Enter when focused). Enter or blur saves, Esc cancels. */
function Cell(props: CellProps) {
  const { suggestFor } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const done = useRef(false);
  const start = () => {
    done.current = false;
    setDraft(props.value);
    setEditing(true);
  };
  const commit = () => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    if (draft.trim() !== props.value.trim()) void props.onSave(draft.trim());
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      done.current = true;
      setEditing(false);
    }
  };
  const td = `px-2 py-1.5 ${props.right ? 'whitespace-nowrap text-right tabular-nums' : ''} ${props.wide ? 'min-w-48' : ''}`;
  if (!editing) {
    const shown = props.display ?? (props.kind === 'select' ? (props.labels?.[props.value] ?? capitalize(props.value)) : props.value);
    return (
      <td className={td}>
        <span
          role="button"
          tabIndex={0}
          aria-label={`Edit ${props.label}`}
          className="-mx-1 block min-h-5 cursor-text rounded px-1 text-zinc-200 hover:bg-zinc-800"
          onClick={start}
          onKeyDown={(e) => e.key === 'Enter' && start()}
        >
          {shown || <span className="text-zinc-700">-</span>}
        </span>
      </td>
    );
  }
  const cls = 'field py-0.5 text-sm';
  return (
    <td className={td}>
      {props.kind === 'text' ? (
        <Autocomplete autoFocus className={cls} value={draft} onChange={setDraft} getSuggestions={(q) => suggestFor(props.field, q, props.sport)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      ) : props.kind === 'select' ? (
        <select
          autoFocus
          className={cls}
          value={draft}
          aria-label={props.label}
          onChange={(e) => {
            setEditing(false);
            if (e.target.value !== props.value) void props.onSave(e.target.value);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={keys}
        >
          {props.options.map((o) => (
            <option key={o} value={o}>
              {props.labels?.[o] ?? capitalize(o)}
            </option>
          ))}
        </select>
      ) : (
        <input autoFocus className={`${cls} w-24`} value={draft} inputMode={props.kind === 'number' ? 'decimal' : undefined} placeholder={props.kind === 'date' ? 'dd/mm/yyyy' : undefined} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      )}
    </td>
  );
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
