'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate, parseDateInput } from '@/lib/dates';
import { betLabel, duplicateDutchDraft, dutchSummary, editDutchDraft, groupRows, type GroupOutcome } from '@/lib/dutch';
import { duplicateForm } from '@/lib/form';
import { formatBRL, formatOdds, oddsFromText, parseNumber, profit } from '@/lib/money';
import { RESULT_LABEL, RESULTS, type Bet, type BetInput, type Leg, type Result } from '@/lib/types';
import type { Field } from '@/lib/autocomplete';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { OddsInput } from './OddsInput';
import { HitBadge, SplitMarkTag } from './HitBadge';
import { splitMark } from '@/lib/hits';
import { settleDutchRow, undoLast, type DutchRowAction, type SettleChange, type SettleState } from '@/lib/settle';
import { DutchSettleButtons } from './DutchSettle';
import { isTyping } from './Shell';
import { betTone, groupTone, losingLegs, resultTone, TONE_SIGN, type Tone } from '@/lib/tone';
import { TONE_BADGE, TONE_EDGE, TONE_TEXT, TONE_TINT } from './tone';

const QUICK_RESULTS: { r: Result; key: string; cls: string }[] = [
  { r: 'won', key: 'W', cls: 'hover:bg-emerald-600/40 text-emerald-400' },
  { r: 'lost', key: 'L', cls: 'hover:bg-red-600/40 text-red-400' },
  { r: 'void', key: 'V', cls: 'hover:bg-zinc-600/40 text-zinc-300' },
];

export function ProfitText({ value, pending, big }: { value: number; pending?: boolean; big?: boolean }) {
  if (pending) return <span className="text-zinc-500">-</span>;
  return <span className={`${value > 0 ? 'text-emerald-400' : value < 0 ? 'text-red-400' : 'text-zinc-400'} ${big ? 'text-base font-bold' : ''}`}>{formatBRL(value, true)}</span>;
}

/** ✓ / ✕ / ½ / – / … next to a result, so it reads without colour (BT-13). */
function Sign({ tone, className = '' }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden className={`inline-block w-3 text-center text-xs font-bold ${TONE_TEXT[tone]} ${className}`} data-testid="result-sign" data-tone={tone}>
      {TONE_SIGN[tone]}
    </span>
  );
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
    // BT-15: fits a 1366px screen; dates, sport + game and type + situation share a column, long text is cut with
    // the full text on hover, and the actions column stays pinned on the right if it ever has to scroll
    <div className="overflow-x-auto" data-testid="bet-table-scroll">
      <table className="w-full text-sm" data-testid="bet-table">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="w-6" />
            <th className="px-1.5 py-2" title="Bet date, game date under it">
              Date
            </th>
            <th className="px-1.5 py-2" title="Game, sport under it">
              Game
            </th>
            <th className="px-1.5 py-2">Bet</th>
            <th className="px-1.5 py-2">Book</th>
            <th className="px-1.5 py-2 text-right">Stake</th>
            <th className="px-1.5 py-2 text-right">Odds</th>
            <th className="px-1.5 py-2" title="Type, situation under it">
              Type
            </th>
            <th className="px-1.5 py-2 text-right">+/-</th>
            <th className="px-1.5 py-2">Result</th>
            <th className={`${STICKY} px-1.5 py-2 text-right`}>Actions</th>
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

/** The actions column: pinned to the right edge with the card's background. */
const STICKY = 'sticky right-0 z-[1] bg-zinc-950 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.8)]';
/** Second line of a merged cell (game date, sport, situation). */
const SUB = 'text-[11px] leading-tight text-zinc-500';
const shortDate = (iso: string) => formatDate(iso).slice(0, 5);

const OUTCOME_LABEL: Record<GroupOutcome, string> = { pending: 'Pending', won: 'Won', lost: 'Lost', even: 'Even' };

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
  const tone = groupTone(s.outcome);
  const names = bets.map(betLabel).join(' / ');
  const books = [...new Set(bets.map((b) => b.book).filter(Boolean))].join(', ');
  const placed = bets.map((b) => b.placedDate).sort()[0]!;
  const game = bets.map((b) => b.gameDate).sort()[0]!;
  const cell = 'px-1.5 py-1.5 text-zinc-200';
  return (
    <tr className={`border-b border-zinc-900 hover:bg-zinc-900/60 ${TONE_TINT[tone] || 'bg-indigo-500/5'}`} data-testid="dutch-row" data-dutch-id={dutchId} data-tone={tone}>
      <td className={`px-1 ${TONE_EDGE[tone]}`}>
        <button className="text-zinc-400 hover:text-white" aria-label={expanded ? 'Hide bets' : 'Show bets'} aria-expanded={expanded} onClick={toggle}>
          {expanded ? '▾' : '▸'}
        </button>
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        {formatDate(placed)}
        <div className={SUB}>game {shortDate(game)}</div>
      </td>
      <td className={cell}>
        <div className="max-w-36 truncate">{gamesAndMarkets(bets.flatMap((b) => b.legs))}</div>
        <div className={SUB}>{shared(bets, (b) => b.legs[0]?.sport ?? '')}</div>
      </td>
      <td className={cell}>
        <div className="flex max-w-44 items-center" title={names}>
          <span className="mr-1.5 shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 text-xs font-semibold text-indigo-300">Dutch</span>
          <span className="truncate">{names}</span>
        </div>
      </td>
      <td className={cell}>
        <div className="max-w-24 truncate" title={books}>
          {books}
        </div>
      </td>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums`} data-testid="dutch-stake">
        {formatBRL(s.stake)}
      </td>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums`} data-testid="dutch-odds" title="Combined odds: 1 / Σ(1/odds)">
        {formatOdds(s.combinedOdds)}
      </td>
      <td className={`${cell} whitespace-nowrap`}>
        Dutch · {bets.length}
        <div className={SUB}>{capitalize(shared(bets, (b) => b.situation))}</div>
      </td>
      <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums" data-testid="profit">
        <ProfitText value={s.profit} pending={s.outcome === 'pending'} big />
      </td>
      <td className="whitespace-nowrap px-1.5 py-1.5">
        <span className="inline-flex flex-col items-start gap-0.5">
          <span className="inline-flex items-center gap-1">
            <Sign tone={tone} />
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`} data-testid="result">
              {OUTCOME_LABEL[s.outcome]}
            </span>
          </span>
          <HitBadge bets={bets} />
        </span>
      </td>
      <td className={`${STICKY} whitespace-nowrap px-1.5 py-1.5 text-right`}>
        <span className="inline-flex items-center gap-0.5">
          {settle.undoShown === dutchId ? (
            <button className="rounded px-1.5 py-0.5 text-xs font-semibold text-amber-300 hover:bg-amber-600/30" title="Undo the settle (Z)" onClick={settle.undo}>
              Undo
            </button>
          ) : (
            <DutchSettleButtons dutchId={dutchId} bets={bets} onSettle={(a) => settle.settle(dutchId, bets, a)} />
          )}
          <IconButton label="Edit dutch" onClick={() => openDutch(editDutchDraft(bets), undefined, { dutchId, bets })}>
            ✎
          </IconButton>
          <RowMenu
            label="More dutch actions"
            items={[
              { label: 'Duplicate dutch', icon: '⧉', onClick: () => openDutch(duplicateDutchDraft(bets)) },
              {
                label: 'Delete dutch',
                icon: '🗑',
                danger: true,
                onClick: () => {
                  if (window.confirm(`Delete this dutch and its ${bets.length} bets (${formatBRL(s.stake)} in all: ${names})? This cannot be undone.`)) void removeDutch(dutchId);
                },
              },
            ]}
          />
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
  const tone = betTone(b);
  const killers = b.result === 'lost' || b.result === 'half-lost' ? losingLegs(b) : [];
  // a dutch's bets are logged without bet text: show the selection instead
  const betDisplay = b.betText || (nested ? b.legs[0]?.selection : undefined);
  return (
    <>
      <tr className={`border-b border-zinc-900 hover:bg-zinc-900/60 ${TONE_TINT[tone] || (nested ? 'bg-zinc-950' : '')}`} data-testid="bet-row" data-bet-id={b.id} data-nested={nested || undefined} data-tone={tone}>
        <td className={`px-1 ${TONE_EDGE[tone]} ${nested ? 'pl-3' : ''}`}>
          {!solo && b.legs.length > 0 && (
            <button className="text-zinc-400 hover:text-white" aria-label={expanded ? 'Hide legs' : 'Show legs'} aria-expanded={expanded} onClick={toggle}>
              {expanded ? '▾' : '▸'}
            </button>
          )}
        </td>
        <td className="whitespace-nowrap px-1.5 py-1.5">
          <Cell bare kind="date" value={formatDate(b.placedDate)} label="Bet date" onSave={(v) => save({ placedDate: parseDateInput(v) ?? b.placedDate })} />
          <div className={SUB}>
            <Cell bare kind="date" value={formatDate(b.gameDate)} display={`game ${shortDate(b.gameDate)}`} label="Game date" onSave={(v) => save({ gameDate: parseDateInput(v) ?? b.gameDate })} />
          </div>
        </td>
        {solo ? (
          <td className="px-1.5 py-1.5">
            <Cell bare truncate="max-w-36" kind="text" field="game" sport={b.legs[0]?.sport} value={b.legs[0]?.game ?? ''} label="Game" onSave={(v) => saveLeg(0, { game: v })} />
            <div className={SUB}>
              <Cell bare truncate="max-w-36" kind="text" field="sport" value={b.legs[0]?.sport ?? ''} label="Sport" onSave={(v) => saveLeg(0, { sport: v })} />
            </div>
          </td>
        ) : (
          <td className="px-1.5 py-1.5 text-zinc-300">
            <div className="max-w-36 truncate">{gamesAndMarkets(b.legs) || <span className="text-zinc-600">Combination</span>}</div>
            <div className={`${SUB} max-w-36 truncate`}>{legSports(b)}</div>
          </td>
        )}
        <td className="px-1.5 py-1.5">
          <Cell bare truncate="max-w-44" kind="text" field="betText" value={b.betText} display={betDisplay} label="Bet" onSave={(v) => save({ betText: v })} />
          {killers.length > 0 && (
            <div className="max-w-44 truncate text-[11px] font-medium text-red-400" title={`Lost by: ${killers.join(', ')}`} data-testid="lost-by">
              ✕ lost by {killers.join(', ')}
            </div>
          )}
        </td>
        <Cell kind="text" truncate="max-w-24" field="book" value={b.book} label="Book" onSave={(v) => save({ book: v })} />
        <Cell kind="number" value={String(b.stake)} display={formatBRL(b.stake)} label="Stake" onSave={(v) => save({ stake: parseNumber(v) ?? b.stake })} right />
        <Cell kind="odds" value={formatOdds(b.odds)} label="Odds" onSave={(v) => save({ odds: oddsFromText(v) ?? b.odds })} right />
        <td className="whitespace-nowrap px-1.5 py-1.5">
          <Cell bare kind="select" options={['solo', 'combination']} labels={{ solo: 'Solo', combination: 'Combo' }} value={b.type} label="Type" onSave={(v) => save({ type: v as Bet['type'] })} />
          <div className={SUB}>
            <Cell bare kind="select" options={['pregame', 'live']} value={b.situation} label="Situation" onSave={(v) => save({ situation: v as Bet['situation'] })} />
          </div>
        </td>
        <td className="whitespace-nowrap px-1.5 py-1.5 text-right tabular-nums" data-testid="profit">
          <ProfitText value={profit(b)} pending={b.result === 'pending'} />
        </td>
        <td className="whitespace-nowrap px-1.5 py-1.5">
          <span className="inline-flex items-center gap-1.5">
            <Sign tone={tone} />
            <ResultCell bet={b} onPick={(r) => settle(r)} />
            {nested && <SplitMarkTag mark={splitMark(b)} />}
          </span>
        </td>
        <td className={`${STICKY} whitespace-nowrap px-1.5 py-1.5 text-right`}>
          <span className="inline-flex gap-0.5">
            {QUICK_RESULTS.map(({ r, key, cls }) => (
              <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls} ${b.result === r ? 'ring-1 ring-current' : ''}`} title={RESULT_LABEL[r]} aria-label={`Mark ${RESULT_LABEL[r]}`} onClick={() => settle(r)}>
                {key}
              </button>
            ))}
            <IconButton label="Edit" onClick={() => openEdit(b)}>
              ✎
            </IconButton>
            <RowMenu
              label="More actions"
              items={[
                { label: 'Duplicate', icon: '⧉', onClick: () => openNew(duplicateForm(b)) },
                {
                  label: 'Delete',
                  icon: '🗑',
                  danger: true,
                  onClick: () => {
                    if (window.confirm(`Delete this bet (${formatBRL(b.stake)} @${formatOdds(b.odds)} ${betDisplay ?? ''})? This cannot be undone.`)) void remove(b.id);
                  },
                },
              ]}
            />
          </span>
        </td>
      </tr>
      {expanded &&
        b.legs.map((l, i) => (
          <tr key={l.id} className={`border-b border-zinc-900 text-xs ${l.result === 'lost' || l.result === 'half-lost' ? 'bg-red-950/60 text-red-300' : l.result === 'won' || l.result === 'half-won' ? 'bg-emerald-950/40' : 'bg-zinc-950'}`} data-testid="leg-row" data-lost={l.result === 'lost' || l.result === 'half-lost' || undefined} data-tone={resultTone(l.result)}>
            <td />
            <td className="whitespace-nowrap px-1.5 py-1 text-zinc-500">
              <Sign tone={resultTone(l.result)} className="mr-1" />
              Leg {i + 1}
            </td>
            <td className="px-1.5 py-1">
              <Cell bare truncate="max-w-36" kind="text" field="game" sport={l.sport} value={l.game} label={`Leg ${i + 1} game`} onSave={(v) => saveLeg(i, { game: v })} />
              <div className={SUB}>
                <Cell bare truncate="max-w-36" kind="text" field="sport" value={l.sport} label={`Leg ${i + 1} sport`} onSave={(v) => saveLeg(i, { sport: v })} />
              </div>
            </td>
            <Cell kind="text" truncate="max-w-44" field="selection" sport={l.sport} value={l.selection} label={`Leg ${i + 1} selection`} onSave={(v) => saveLeg(i, { selection: v })} />
            <Cell kind="text" truncate="max-w-24" field="market" sport={l.sport} value={l.market} label={`Leg ${i + 1} market`} onSave={(v) => saveLeg(i, { market: v })} />
            <td />
            <Cell kind="odds" value={formatOdds(l.odds)} label={`Leg ${i + 1} odds`} onSave={(v) => saveLeg(i, { odds: v.trim() ? (oddsFromText(v) ?? l.odds) : null })} right />
            <td colSpan={2} />
            <Cell kind="select" options={[...RESULTS]} labels={RESULT_LABEL} value={l.result} label={`Leg ${i + 1} result`} onSave={(v) => saveLeg(i, { result: v as Result })} />
            <td className={STICKY} />
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
    <button className={`rounded px-2 py-0.5 text-xs font-medium ${TONE_BADGE[betTone(bet)]}`} onClick={() => setEditing(true)} title="Change result" data-testid="result">
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
  /** Render without its own <td> (a second line inside a merged cell). */
  bare?: boolean;
  /** Max-width class: the text is cut with "…" and shown in full on hover. */
  truncate?: string;
} & (
  | { kind: 'text'; field: Field; sport?: string }
  | { kind: 'number' }
  | { kind: 'odds' }
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
  const td = `px-1.5 py-1.5 ${props.right ? 'whitespace-nowrap text-right tabular-nums' : ''}`;
  const wrap = (inner: ReactNode) => (props.bare ? inner : <td className={td}>{inner}</td>);
  if (!editing) {
    const shown = props.display ?? (props.kind === 'select' ? (props.labels?.[props.value] ?? capitalize(props.value)) : props.value);
    return wrap(
      <span
        role="button"
        tabIndex={0}
        aria-label={`Edit ${props.label}`}
        title={props.truncate && shown ? shown : undefined}
        className={`-mx-1 block min-h-4 cursor-text rounded px-1 hover:bg-zinc-800 ${props.bare ? '' : 'text-zinc-200'} ${props.truncate ? `${props.truncate} truncate` : ''}`}
        onClick={start}
        onKeyDown={(e) => e.key === 'Enter' && start()}
      >
        {shown || <span className="text-zinc-700">-</span>}
      </span>,
    );
  }
  const cls = 'field py-0.5 text-sm';
  return wrap(
    <>
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
      ) : props.kind === 'odds' ? (
        <OddsInput autoFocus className={`${cls} w-24`} value={draft} onChange={setDraft} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      ) : (
        <input autoFocus className={`${cls} w-24`} value={draft} inputMode={props.kind === 'number' ? 'decimal' : undefined} placeholder={props.kind === 'date' ? 'dd/mm/yyyy' : undefined} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={keys} aria-label={props.label} />
      )}
    </>,
  );
}

type MenuItem = { label: string; icon: string; onClick(): void; danger?: boolean };

/** "⋯": the row's less used actions (Duplicate, Delete), so the actions column stays narrow (BT-15). */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  // fixed position, so the table's scroll box never clips it; closes on scroll or a click elsewhere
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const open = at != null;
  const box = useRef<HTMLSpanElement>(null);
  const setOpen = (o: boolean | ((x: boolean) => boolean)) => {
    const next = typeof o === 'function' ? o(open) : o;
    const r = box.current?.getBoundingClientRect();
    setAt(next && r ? { top: r.bottom + 4, right: window.innerWidth - r.right } : null);
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setAt(null);
    const close = () => setAt(null);
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  return (
    <span ref={box} className="relative inline-flex">
      <button className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white" title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <span
          role="menu"
          style={at ?? undefined}
          className="fixed z-50 flex w-44 flex-col rounded-md border border-zinc-700 bg-zinc-900 py-1 text-left text-xs shadow-xl"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              role="menuitem"
              autoFocus={i === 0}
              aria-label={it.label}
              className={`flex items-center gap-2 px-3 py-1.5 text-left hover:bg-zinc-800 ${it.danger ? 'text-red-300' : 'text-zinc-200'}`}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
            >
              <span className="w-4 text-center">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

const capitalize = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
