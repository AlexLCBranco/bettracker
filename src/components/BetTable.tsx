'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate, parseDateInput } from '@/lib/dates';
import { betLabel, duplicateDutchDraft, dutchSummary, groupRows, type GroupOutcome } from '@/lib/dutch';
import { duplicateForm } from '@/lib/form';
import { formatBRL, formatOdds, parseNumber, profit } from '@/lib/money';
import { RESULT_LABEL, RESULTS, type Bet, type BetInput, type Leg, type Result } from '@/lib/types';
import type { Field } from '@/lib/autocomplete';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { HitBadge, SplitMarkTag } from './HitBadge';
import { splitMark } from '@/lib/hits';
import { settleDutchRow, undoLast, type DutchRowAction, type SettleChange, type SettleState } from '@/lib/settle';
import { DutchSettleButtons } from './DutchSettle';
import { isTyping } from './Shell';

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

/** Sport shown for a combination: its legs' sports joined. */
function legSports(b: Bet) {
  return [...new Set(b.legs.map((l) => l.sport).filter(Boolean))].join(', ');
}

/**
 * The Game cell of a combination or a dutch: the one game its legs share, or "2 games" when they differ, followed by
 * "· 2 markets" when the legs' markets differ (there is no Market column).
 */
function gamesAndMarkets(legs: Bet['legs']) {
  const distinctOf = (k: 'game' | 'market') => [...new Set(legs.map((l) => l[k]).filter(Boolean))];
  const games = distinctOf('game');
  const markets = distinctOf('market');
  if (games.length <= 1 && markets.length <= 1) return games[0] ?? '';
  return (
    <>
      {games.length > 1 ? <Several vals={games} noun="games" /> : games[0]}
      {markets.length > 1 && (
        <>
          {games.length ? <span className="text-zinc-600"> · </span> : null}
          <Several vals={markets} noun="markets" />
        </>
      )}
    </>
  );
}

/** "2 games" / "2 markets" with the values in a tooltip. */
function Several({ vals, noun }: { vals: string[]; noun: string }) {
  return (
    <span title={vals.join(', ')} className="underline decoration-dotted underline-offset-2" data-testid={`several-${noun}`}>
      {vals.length} {noun}
    </span>
  );
}



/**
 * Bets as table rows, each cell editable inline. A dutch is one row (total stake, combined odds, net profit) that
 * expands to its bets. `limit` caps the rows shown (a dutch counts as one row).
 */
export function BetTable({ bets, limit, empty = 'No bets yet. Type one in the quick-add line above.' }: { bets: Bet[]; limit?: number; empty?: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rowSettle = useDutchRowSettle();
  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (!bets.length) return <p className="py-10 text-center text-sm text-zinc-500">{empty}</p>;
  const rows = groupRows(bets).slice(0, limit);

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
          {rows.map((r) => {
            if (r.kind === 'bet') return <BetRow key={r.bet.id} b={r.bet} expanded={open.has(r.bet.id)} toggle={() => toggle(r.bet.id)} />;
            const expanded = open.has(r.dutchId);
            return (
              <Fragment key={r.dutchId}>
                <DutchRow bets={r.bets} dutchId={r.dutchId} expanded={expanded} toggle={() => toggle(r.dutchId)} settle={rowSettle} />
                {expanded && r.bets.map((b) => <BetRow key={b.id} b={b} expanded={open.has(b.id)} toggle={() => toggle(b.id)} nested />)}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const OUTCOME: Record<GroupOutcome, { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: resultClass('pending') },
  won: { label: 'Won', cls: resultClass('won') },
  lost: { label: 'Lost', cls: resultClass('lost') },
  even: { label: 'Even', cls: resultClass('void') },
};

/** The dutch's bets' shared value for a field, "Mixed" when they differ, "" when none is set. */
function shared(bets: Bet[], pick: (b: Bet) => string) {
  const vals = [...new Set(bets.map(pick).filter(Boolean))];
  return vals.length === 1 ? vals[0]! : vals.length > 1 ? 'Mixed' : '';
}

const ACTION_LABEL = (a: DutchRowAction, bets: Bet[]) =>
  a === 'none' ? 'None won' : a === 'all' ? 'All won' : a === 'void' ? 'Void' : a === 'shared' ? 'Shared leg lost' : a.length ? `Won: ${a.map((i) => betLabel(bets.filter((b) => b.result === 'pending')[i]!)).join(', ')}` : 'None won';

type RowSettle = ReturnType<typeof useDutchRowSettle>;

/**
 * The dutch row buttons' settle and undo (BT-10): the Settle page's functions, one undo step. "Undo" shows on the
 * settled row for 8 s; Z on the page undoes the last one (while not typing and no form is open).
 */
function useDutchRowSettle() {
  const { update, notify, form, dutchForm } = useApp();
  const [last, setLast] = useState<{ dutchId: string; state: SettleState } | null>(null);
  const [undoShown, setUndoShown] = useState<string | null>(null);
  useEffect(() => {
    if (!undoShown) return;
    const t = setTimeout(() => setUndoShown(null), 8000);
    return () => clearTimeout(t);
  }, [undoShown, last]);
  const apply = (changes: SettleChange[]) => {
    for (const c of changes) void update(c.id, { result: c.result, cashout: c.cashout, ...(c.legs ? { legs: c.legs } : {}) }).catch(() => undefined);
  };
  const settle = (dutchId: string, bets: Bet[], action: DutchRowAction) => {
    const step = settleDutchRow(dutchId, bets, action);
    if (!step) return;
    apply(step.changes);
    setLast({ dutchId, state: step.state });
    setUndoShown(dutchId);
    notify(`${ACTION_LABEL(action, bets)} · dutch (${bets.length} bets)`);
  };
  const undo = () => {
    const u = last && undoLast(last.state);
    if (!u) return;
    apply(u.changes);
    setLast(null);
    setUndoShown(null);
    notify('Undone');
  };
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (form || dutchForm || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'z' || !last) return;
      e.preventDefault();
      undo();
    };
  });
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return { settle, undo, undoShown };
}

function DutchRow({ bets, dutchId, expanded, toggle, settle }: { bets: Bet[]; dutchId: string; expanded: boolean; toggle(): void; settle: RowSettle }) {
  const { removeDutch, openDutch } = useApp();
  const s = dutchSummary(bets);
  const o = OUTCOME[s.outcome];
  const names = bets.map(betLabel).join(' / ');
  const books = [...new Set(bets.map((b) => b.book).filter(Boolean))].join(', ');
  const placed = bets.map((b) => b.placedDate).sort()[0]!;
  const game = bets.map((b) => b.gameDate).sort()[0]!;
  const cell = 'px-2 py-1.5 text-zinc-200';
  return (
    <tr className="border-b border-zinc-900 bg-indigo-500/5 hover:bg-zinc-900/60" data-testid="dutch-row" data-dutch-id={dutchId}>
      <td className="px-1">
        <button className="text-zinc-400 hover:text-white" aria-label={expanded ? 'Hide bets' : 'Show bets'} aria-expanded={expanded} onClick={toggle}>
          {expanded ? '▾' : '▸'}
        </button>
      </td>
      <td className={cell}>{formatDate(placed)}</td>
      <td className={cell}>{formatDate(game)}</td>
      <td className={cell}>{shared(bets, (b) => b.legs[0]?.sport ?? '')}</td>
      <td className={cell}>{gamesAndMarkets(bets.flatMap((b) => b.legs))}</td>
      <td className={`${cell} min-w-48`}>
        <span className="mr-1.5 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-semibold text-indigo-300">Dutch</span>
        {names}
      </td>
      <td className={cell}>{books}</td>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums`} data-testid="dutch-stake">
        {formatBRL(s.stake)}
      </td>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums`} data-testid="dutch-odds" title="Combined odds: 1 / Σ(1/odds)">
        {formatOdds(s.combinedOdds)}
      </td>
      <td className={cell}>Dutch · {bets.length}</td>
      <td className={cell}>{capitalize(shared(bets, (b) => b.situation))}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" data-testid="profit">
        <ProfitText value={s.profit} pending={s.outcome === 'pending'} />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5">
        <span className="inline-flex items-start gap-1.5">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${o.cls}`} data-testid="result">
            {o.label}
          </span>
          <HitBadge bets={bets} />
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right">
        <span className="inline-flex items-center gap-0.5">
          {settle.undoShown === dutchId ? (
            <button className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-300 hover:bg-amber-600/30" title="Undo the settle (Z)" onClick={settle.undo}>
              Undo
            </button>
          ) : (
            <DutchSettleButtons dutchId={dutchId} bets={bets} onSettle={(a) => settle.settle(dutchId, bets, a)} />
          )}
          <IconButton label="Duplicate dutch" onClick={() => openDutch(duplicateDutchDraft(bets))}>
            ⧉
          </IconButton>
          <IconButton
            label="Delete dutch"
            onClick={() => {
              if (window.confirm(`Delete this dutch and its ${bets.length} bets (${formatBRL(s.stake)} in all: ${names})? This cannot be undone.`)) void removeDutch(dutchId);
            }}
          >
            🗑
          </IconButton>
        </span>
      </td>
    </tr>
  );
}

function BetRow({ b, expanded, toggle, nested }: { b: Bet; expanded: boolean; toggle(): void; nested?: boolean }) {
  const { update, remove, openEdit, openNew } = useApp();
  const save = (patch: Partial<BetInput>) => update(b.id, patch).catch(() => undefined);
  const saveLeg = (i: number, patch: Partial<Leg>) => save({ legs: b.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  const settle = (r: Result) => {
    if (r === 'cash-out') {
      const a = window.prompt('Cash-out amount returned (R$):');
      const amount = a == null ? null : parseNumber(a);
      if (amount == null) return;
      void save({ result: r, cashout: amount });
    } else void save({ result: r, cashout: null });
  };

  const solo = b.type === 'solo';
  // a dutch's bets are logged without bet text: show the selection instead
  const betDisplay = b.betText || (nested ? b.legs[0]?.selection : undefined);
  return (
    <>
      <tr className={`border-b border-zinc-900 hover:bg-zinc-900/60 ${nested ? 'bg-zinc-950' : ''}`} data-testid="bet-row" data-bet-id={b.id} data-nested={nested || undefined}>
        <td className={`px-1 ${nested ? 'border-l-2 border-indigo-500/40' : ''}`}>
          {!solo && b.legs.length > 0 && (
            <button className="text-zinc-400 hover:text-white" aria-label={expanded ? 'Hide legs' : 'Show legs'} aria-expanded={expanded} onClick={toggle}>
              {expanded ? '▾' : '▸'}
            </button>
          )}
        </td>
        <Cell kind="date" value={formatDate(b.placedDate)} label="Bet date" onSave={(v) => save({ placedDate: parseDateInput(v) ?? b.placedDate })} />
        <Cell kind="date" value={formatDate(b.gameDate)} label="Game date" onSave={(v) => save({ gameDate: parseDateInput(v) ?? b.gameDate })} />
        {solo ? (
          <>
            <Cell kind="text" field="sport" value={b.legs[0]?.sport ?? ''} label="Sport" onSave={(v) => saveLeg(0, { sport: v })} />
            <Cell kind="text" field="game" sport={b.legs[0]?.sport} value={b.legs[0]?.game ?? ''} label="Game" onSave={(v) => saveLeg(0, { game: v })} />
          </>
        ) : (
          <>
            <td className="px-2 py-1.5 text-zinc-300">{legSports(b)}</td>
            <td className="px-2 py-1.5 text-zinc-300">{gamesAndMarkets(b.legs) || <span className="text-zinc-600">Combination</span>}</td>
          </>
        )}
        <Cell kind="text" field="betText" value={b.betText} display={betDisplay} label="Bet" onSave={(v) => save({ betText: v })} wide />
        <Cell kind="text" field="book" value={b.book} label="Book" onSave={(v) => save({ book: v })} />
        <Cell kind="number" value={String(b.stake)} display={formatBRL(b.stake)} label="Stake" onSave={(v) => save({ stake: parseNumber(v) ?? b.stake })} right />
        <Cell kind="number" value={formatOdds(b.odds)} label="Odds" onSave={(v) => save({ odds: parseNumber(v) ?? b.odds })} right />
        <Cell kind="select" options={['solo', 'combination']} value={b.type} label="Type" onSave={(v) => save({ type: v as Bet['type'] })} />
        <Cell kind="select" options={['pregame', 'live']} value={b.situation} label="Situation" onSave={(v) => save({ situation: v as Bet['situation'] })} />
        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums" data-testid="profit">
          <ProfitText value={profit(b)} pending={b.result === 'pending'} />
        </td>
        <td className="whitespace-nowrap px-2 py-1.5">
          <span className="inline-flex items-center gap-1.5">
            <ResultCell bet={b} onPick={(r) => settle(r)} />
            {nested && <SplitMarkTag mark={splitMark(b)} />}
          </span>
        </td>
        <td className="whitespace-nowrap px-2 py-1.5 text-right">
          <span className="inline-flex gap-0.5">
            {QUICK_RESULTS.map(({ r, key, cls }) => (
              <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls} ${b.result === r ? 'ring-1 ring-current' : ''}`} title={RESULT_LABEL[r]} aria-label={`Mark ${RESULT_LABEL[r]}`} onClick={() => settle(r)}>
                {key}
              </button>
            ))}
            <IconButton label="Duplicate" onClick={() => openNew(duplicateForm(b))}>
              ⧉
            </IconButton>
            <IconButton label="Edit" onClick={() => openEdit(b)}>
              ✎
            </IconButton>
            <IconButton
              label="Delete"
              onClick={() => {
                if (window.confirm(`Delete this bet (${formatBRL(b.stake)} @${formatOdds(b.odds)} ${betDisplay ?? ''})? This cannot be undone.`)) void remove(b.id);
              }}
            >
              🗑
            </IconButton>
          </span>
        </td>
      </tr>
      {expanded &&
        b.legs.map((l, i) => (
          <tr key={l.id} className={`border-b border-zinc-900 text-xs ${l.result === 'lost' || l.result === 'half-lost' ? 'bg-red-950/60 text-red-300' : 'bg-zinc-950'}`} data-testid="leg-row" data-lost={l.result === 'lost' || l.result === 'half-lost' || undefined}>
            <td />
            <td className="px-2 py-1 text-zinc-500" colSpan={2}>
              Leg {i + 1}
            </td>
            <Cell kind="text" field="sport" value={l.sport} label={`Leg ${i + 1} sport`} onSave={(v) => saveLeg(i, { sport: v })} />
            <Cell kind="text" field="game" sport={l.sport} value={l.game} label={`Leg ${i + 1} game`} onSave={(v) => saveLeg(i, { game: v })} />
            <Cell kind="text" field="selection" sport={l.sport} value={l.selection} label={`Leg ${i + 1} selection`} onSave={(v) => saveLeg(i, { selection: v })} />
            <Cell kind="text" field="market" sport={l.sport} value={l.market} label={`Leg ${i + 1} market`} onSave={(v) => saveLeg(i, { market: v })} />
            <td />
            <Cell kind="number" value={formatOdds(l.odds)} label={`Leg ${i + 1} odds`} onSave={(v) => saveLeg(i, { odds: v.trim() ? (parseNumber(v) ?? l.odds) : null })} right />
            <td colSpan={3} />
            <Cell kind="select" options={[...RESULTS]} labels={RESULT_LABEL} value={l.result} label={`Leg ${i + 1} result`} onSave={(v) => saveLeg(i, { result: v as Result })} />
            <td />
          </tr>
        ))}
    </>
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
