'use client';

// BT-30: one PP batch. The main view is the LEG list grouped by tier: settle each leg once (W / L / V, keyboard as on
// the Bets page) and every PP follows. The Tickets view lists every PP with its legs as coloured chips. Structure
// (fields, tiers, legs, tickets) changes only after "Edit"; pending legs can be settled any time.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { Autocomplete } from '@/components/Autocomplete';
import { DateField } from '@/components/BetFormModal';
import { MoneySelect } from '@/components/Money';
import { MONEY_TEXT } from '@/components/moneyStyle';
import { OddsInput } from '@/components/OddsInput';
import { isTyping } from '@/components/Shell';
import { Builder } from './Builder';
import { formatDate, parseDateInput } from '@/lib/dates';
import { formatMoney, formatOdds, oddsFromText, parseNumber, profitMoney } from '@/lib/money';
import {
  batchSummary,
  isAlive,
  legsByTier,
  legUse,
  nextNumber,
  ppId,
  STATUS_LABEL,
  ticketView,
  type BatchInput,
  type PPBatch,
  type PPLeg,
  type PPLegResult,
  type PPTicket,
  type TicketStatus,
  type TicketView,
} from '@/lib/pp';
import { formatPercent } from '@/lib/stats';

export type BatchTab = 'legs' | 'tickets';

const inputOf = (b: PPBatch): BatchInput => {
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = b;
  void _i;
  void _c;
  void _u;
  return rest;
};

const RESULT_KEYS: { r: PPLegResult; key: string; cls: string; label: string }[] = [
  { r: 'won', key: 'W', cls: 'hover:bg-emerald-600/40 text-emerald-400', label: 'Won' },
  { r: 'lost', key: 'L', cls: 'hover:bg-red-600/40 text-red-400', label: 'Lost' },
  { r: 'void', key: 'V', cls: 'hover:bg-zinc-600/40 text-zinc-300', label: 'Void' },
];
const RESULT_PILL: Record<PPLegResult, string> = {
  pending: 'bg-zinc-700/40 text-zinc-300',
  won: 'bg-emerald-500/15 text-emerald-400',
  lost: 'bg-red-500/15 text-red-400',
  void: 'bg-zinc-500/15 text-zinc-300',
};
const RESULT_EDGE: Record<PPLegResult, string> = {
  pending: 'border-l-[3px] border-l-zinc-800',
  won: 'border-l-[3px] border-l-emerald-500',
  lost: 'border-l-[3px] border-l-red-500',
  void: 'border-l-[3px] border-l-zinc-600',
};
const CHIP: Record<PPLegResult, string> = {
  pending: 'border-zinc-700 text-zinc-300',
  won: 'border-emerald-600/60 bg-emerald-500/15 text-emerald-300',
  lost: 'border-red-600/60 bg-red-500/15 text-red-300',
  void: 'border-zinc-600 bg-zinc-700/30 text-zinc-500 line-through',
};
export const STATUS_PILL: Record<TicketStatus, string> = {
  alive: 'bg-zinc-700/40 text-zinc-200',
  'one-away': 'bg-amber-500/15 text-amber-300',
  won: 'bg-emerald-500/15 text-emerald-400',
  dead: 'bg-red-500/15 text-red-400',
  void: 'bg-zinc-500/15 text-zinc-300',
};

/** Extra tabs a later item adds to the batch (BT-31 builder, BT-32 stats). */
export interface ExtraTab {
  id: string;
  label: string;
  render(batch: PPBatch, editing: boolean): ReactNode;
}

export function BatchView({ id, extraTabs = [] }: { id: string; extraTabs?: ExtraTab[] }) {
  const { batches, loaded, saveBatch, patchPPLeg, removeBatch, notify, form, dutchForm, moneyForm } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const batch = batches.find((b) => b.id === id);
  const [editing, setEditing] = useState(params.get('edit') === '1');
  const [tab, setTab] = useState<string>(params.get('tab') ?? 'legs');
  const [selected, setSelected] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState<string | null>(null);
  const [legFilter, setLegFilter] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ legId: string; before: Pick<PPLeg, 'result' | 'actual' | 'note'> }[]>([]);

  const groups = useMemo(() => (batch ? legsByTier(batch) : []), [batch]);
  const order = useMemo(() => groups.flatMap((g) => g.legs.map((l) => l.id)), [groups]);

  const save = (patch: Partial<BatchInput>) => (batch ? saveBatch({ ...inputOf(batch), ...patch }, batch.id).catch(() => undefined) : undefined);
  const settle = (leg: PPLeg, r: PPLegResult) => {
    if (!batch) return;
    if (leg.result === r) return;
    if (leg.result !== 'pending' && !editing) return notify('Already settled: press Edit to change it', 'error');
    setUndo((u) => [...u, { legId: leg.id, before: { result: leg.result, actual: leg.actual, note: leg.note } }]);
    void patchPPLeg(batch.id, leg.id, { result: r });
    const n = order.indexOf(leg.id);
    if (selected === leg.id) setSelected(order[n + 1] ?? order[n - 1] ?? leg.id);
    notify(`${r === 'pending' ? 'Back to pending' : r[0]!.toUpperCase() + r.slice(1)}: ${leg.selection || 'leg'}`);
  };
  const annotate = (leg: PPLeg, patch: Pick<PPLeg, 'actual' | 'note'>) => {
    if (!batch) return;
    if (patch.actual === leg.actual && patch.note === leg.note) return;
    setUndo((u) => [...u, { legId: leg.id, before: { result: leg.result, actual: leg.actual, note: leg.note } }]);
    void patchPPLeg(batch.id, leg.id, patch);
  };
  const doUndo = () => {
    const last = undo.at(-1);
    if (!last || !batch) return;
    setUndo((u) => u.slice(0, -1));
    void patchPPLeg(batch.id, last.legId, last.before);
    setSelected(last.legId);
    notify('Undone');
  };

  const handler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    handler.current = (e) => {
      if (!batch || form || dutchForm || moneyForm || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.('[role=dialog], [role=menu]')) return;
      if (tab !== 'legs') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        const i = selected ? order.indexOf(selected) : -1;
        const next = i < 0 ? order[0] : order[Math.max(0, Math.min(order.length - 1, i + (k === 'ArrowDown' ? 1 : -1)))];
        setSelected(next ?? null);
        return;
      }
      if (k === 'z') {
        e.preventDefault();
        return doUndo();
      }
      if (k === 'Escape') return setSelected(null);
      const leg = batch.legs.find((l) => l.id === selected);
      if (!leg) return;
      if (k === 'w' || k === 'l' || k === 'v') {
        e.preventDefault();
        settle(leg, k === 'w' ? 'won' : k === 'l' ? 'lost' : 'void');
      } else if (k === 't') {
        e.preventDefault();
        setAnnotating(leg.id);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handler.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (selected) document.querySelector(`[data-leg-id="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!loaded) return <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>;
  if (!batch)
    return (
      <p className="py-10 text-center text-sm text-zinc-500">
        This batch does not exist (any more). <Link href="/pp" className="text-emerald-400 hover:underline">All batches</Link>
      </p>
    );

  const tabs: { id: string; label: string }[] = [{ id: 'legs', label: `Legs · ${batch.legs.length}` }, { id: 'tickets', label: `Tickets · ${batch.tickets.length}` }, { id: 'build', label: 'Build' }, ...extraTabs.map((t) => ({ id: t.id, label: t.label }))];
  const del = async () => {
    if (!window.confirm(`Delete ${batch.name} with its ${batch.legs.length} legs and ${batch.tickets.length} PPs? This cannot be undone.`)) return;
    await removeBatch(batch).catch(() => undefined);
    router.push('/pp');
  };

  return (
    <div className="space-y-3" data-testid="batch" data-editing={editing || undefined}>
      <Header batch={batch} editing={editing} save={save} />
      <div className="flex items-center gap-1 border-b border-zinc-800" role="tablist" aria-label="Batch view">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === t.id ? 'border-emerald-500 font-semibold text-white' : 'border-transparent text-zinc-400 hover:text-white'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2 pb-1">
          {undo.length > 0 && <span className="text-xs text-zinc-500">Z undoes the last settle</span>}
          {editing && (
            <button className="btn text-xs text-red-300" onClick={() => void del()}>
              Delete batch
            </button>
          )}
          <button className={`btn text-xs ${editing ? 'btn-primary' : ''}`} onClick={() => setEditing((e) => !e)} data-testid="edit-toggle">
            {editing ? 'Done' : 'Edit'}
          </button>
        </span>
      </div>
      {tab === 'legs' && (
        <LegsView batch={batch} groups={groups} editing={editing} save={save} selected={selected} select={setSelected} settle={settle} annotating={annotating} setAnnotating={setAnnotating} annotate={annotate} showTickets={(legId) => { setLegFilter(legId); setTab('tickets'); }} />
      )}
      {tab === 'tickets' && <TicketsView batch={batch} editing={editing} save={save} legFilter={legFilter} setLegFilter={setLegFilter} />}
      {tab === 'build' && (
        <Builder
          batch={batch}
          save={save}
          editPool={() => {
            setEditing(true);
            setTab('legs');
          }}
        />
      )}
      {extraTabs.map((t) => tab === t.id && <Fragment key={t.id}>{t.render(batch, editing)}</Fragment>)}
    </div>
  );
}

function Header({ batch, editing, save }: { batch: PPBatch; editing: boolean; save(p: Partial<BatchInput>): unknown }) {
  const { suggestFor } = useApp();
  const s = batchSummary(batch);
  const pm = profitMoney(batch.money);
  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-500">
        <Link href="/pp" className="hover:text-white">
          PP
        </Link>{' '}
        ›
      </div>
      {editing ? (
        <div className="card grid grid-cols-2 items-end gap-3 p-3 md:grid-cols-7" data-testid="batch-fields">
          <Commit key={`Name-${batch.name}`} label="Name" value={batch.name} onSave={(v) => save({ name: v || batch.name })} />
          <Commit key={`Placed date-${formatDate(batch.placedDate)}`} label="Placed date" value={formatDate(batch.placedDate)} date onSave={(v) => save({ placedDate: parseDateInput(v) ?? batch.placedDate })} />
          <Commit key={`Book-${batch.book}`} label="Book" value={batch.book} suggest={(q) => suggestFor('book', q)} onSave={(v) => save({ book: v })} />
          <Commit key={`Stake per PP-${String(batch.stake)}`} label="Stake per PP" value={String(batch.stake)} onSave={(v) => save({ stake: parseNumber(v) ?? batch.stake })} />
          <Commit key={`Target odds-${String(batch.targetOdds)}`} label="Target odds" value={String(batch.targetOdds)} onSave={(v) => save({ targetOdds: parseNumber(v) ?? batch.targetOdds })} />
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-zinc-400">Money</span>
            <MoneySelect value={batch.money} onChange={(m) => save({ money: m })} />
          </label>
          <Commit key={`Notes-${batch.notes}`} label="Notes" value={batch.notes} onSave={(v) => save({ notes: v })} />
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold [overflow-wrap:anywhere]">{batch.name}</h1>
          <p className="text-sm text-zinc-400">
            {formatDate(batch.placedDate)} · {batch.book || 'no book'} · <span className={MONEY_TEXT[batch.money]}>{formatMoney(batch.stake, batch.money)}</span> per PP · target {formatOdds(batch.targetOdds, 2)}
            {batch.notes && <span className="text-zinc-500"> · {batch.notes}</span>}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400" data-testid="batch-summary">
        <span>
          PPs <b className="text-zinc-100">{s.tickets}</b>
        </span>
        <span>
          Won <b className="text-emerald-400" data-testid="sum-won">{s.won}</b>
        </span>
        <span>
          Alive <b className="text-zinc-100" data-testid="sum-alive">{s.alive}</b>
          {s.oneAway > 0 && <span className="text-amber-300"> ({s.oneAway} one leg away)</span>}
        </span>
        <span>
          Dead <b className="text-red-400" data-testid="sum-dead">{s.dead}</b>
        </span>
        <span>
          Staked <b className={MONEY_TEXT[batch.money] || 'text-zinc-100'}>{formatMoney(s.staked, batch.money)}</b>
        </span>
        <span>
          Returned <b className="text-zinc-100" data-testid="sum-returned">{formatMoney(s.returned, pm)}</b>
        </span>
        <span>
          Profit <b className={s.profit > 0 ? 'text-emerald-400' : s.profit < 0 ? 'text-red-400' : 'text-zinc-300'} data-testid="sum-profit">{formatMoney(s.profit, pm, true)}</b>
        </span>
        {batch.money === 'bonus' && (
          <span title="Real money won / bonus spent">
            Bonus converted <b className="text-amber-300">{formatPercent(s.converted)}</b>
          </span>
        )}
      </div>
    </div>
  );
}

/** A field that saves when it loses focus or on Enter. */
function Commit({ label, value, onSave, suggest, date }: { label: string; value: string; onSave(v: string): unknown; suggest?(q: string): string[]; date?: boolean }) {
  const [v, setV] = useState(value);
  const commit = () => v.trim() !== value.trim() && onSave(v.trim());
  return (
    <label className="flex min-w-0 flex-col gap-1" onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}>
      <span className="text-xs text-zinc-400">{label}</span>
      {suggest ? <Autocomplete value={v} onChange={setV} getSuggestions={suggest} aria-label={label} /> : date ? <DateField value={v} onChange={setV} aria-label={label} /> : <input className="field" value={v} onChange={(e) => setV(e.target.value)} aria-label={label} />}
    </label>
  );
}

interface LegsProps {
  batch: PPBatch;
  groups: ReturnType<typeof legsByTier>;
  editing: boolean;
  save(p: Partial<BatchInput>): unknown;
  selected: string | null;
  select(id: string | null): void;
  settle(leg: PPLeg, r: PPLegResult): void;
  annotating: string | null;
  setAnnotating(id: string | null): void;
  annotate(leg: PPLeg, p: Pick<PPLeg, 'actual' | 'note'>): void;
  showTickets(legId: string): void;
}

function LegsView({ batch, groups, editing, save, selected, select, settle, annotating, setAnnotating, annotate, showTickets }: LegsProps) {
  const use = useMemo(() => legUse(batch), [batch]);
  const [edit, setEdit] = useState<string | null>(null);
  const tierName = new Map(batch.tiers.map((t) => [t.id, t.name]));
  const removeLeg = (leg: PPLeg) => {
    const on = use.get(leg.id)?.on ?? 0;
    if (on && !window.confirm(`Remove "${leg.selection}"? It is on ${on} PPs: it is taken off them (a PP left with no legs is deleted).`)) return;
    void save({
      legs: batch.legs.filter((l) => l.id !== leg.id),
      tickets: batch.tickets.map((t) => ({ ...t, legIds: t.legIds.filter((x) => x !== leg.id) })).filter((t) => t.legIds.length),
    });
  };
  return (
    <div className="space-y-3">
      {editing && <TierEditor batch={batch} save={save} />}
      {editing && <LegForm batch={batch} onSave={(leg) => void save({ legs: [...batch.legs, leg] })} />}
      {!batch.legs.length && <p className="py-6 text-center text-sm text-zinc-500">No legs yet. {editing ? 'Add the pool above.' : 'Press Edit to add the pool.'}</p>}
      {groups.map(
        (g) =>
          g.legs.length > 0 && (
            <section key={g.tier.id || 'none'} className="card px-2 pb-1" data-testid="tier-group" data-tier={g.tier.name}>
              <h2 className="px-1 py-2 text-sm font-semibold text-zinc-200">
                {g.tier.name} <span className="font-normal text-zinc-500">· {g.legs.length} {g.legs.length === 1 ? 'leg' : 'legs'}</span>
              </h2>
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-[72px]" />
                  <col className="w-[170px]" />
                  <col className="w-[150px]" />
                </colgroup>
                <tbody>
                  {g.legs.map((l) => {
                    const u = use.get(l.id)!;
                    if (edit === l.id)
                      return (
                        <tr key={l.id}>
                          <td colSpan={4} className="py-1">
                            <LegForm batch={batch} leg={l} onSave={(leg) => { void save({ legs: batch.legs.map((x) => (x.id === l.id ? leg : x)) }); setEdit(null); }} onCancel={() => setEdit(null)} />
                          </td>
                        </tr>
                      );
                    return (
                      <Fragment key={l.id}>
                        <tr
                          className="group border-t border-zinc-900 hover:bg-zinc-900/50 data-[selected]:bg-emerald-500/[0.07]"
                          data-testid="pp-leg"
                          data-leg-id={l.id}
                          data-result={l.result}
                          data-selected={selected === l.id || undefined}
                          onClick={() => select(l.id)}
                        >
                          <td className={`px-2 py-1.5 align-top ${RESULT_EDGE[l.result]}`}>
                            <div className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="font-semibold text-zinc-100 [overflow-wrap:anywhere]" data-testid="leg-selection">
                                {l.selection || '(no selection)'}
                              </span>
                              {l.actual && <span className="text-zinc-400" data-testid="leg-actual">→ {l.actual}</span>}
                              <span className="rounded bg-sky-500/10 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-sky-300">{tierName.get(l.tier) ?? 'No tier'}</span>
                              {u.decides > 0 && l.result === 'pending' && (
                                <span className="rounded bg-amber-500/15 px-1 text-[10px] font-bold uppercase leading-4 tracking-wide text-amber-300" data-testid="decides" title="The last pending leg of these PPs: its result decides them">
                                  decides {u.decides} {u.decides === 1 ? 'PP' : 'PPs'}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] leading-5 text-zinc-500 [overflow-wrap:anywhere]">
                              {[l.game, l.sport, l.market].filter(Boolean).join(' · ')}
                              {l.note && <span className="italic text-zinc-400" data-testid="leg-note"> · {l.note}</span>}
                            </div>
                            {annotating === l.id && <LegAnnotator leg={l} onSave={(p) => { annotate(l, p); setAnnotating(null); }} onClose={() => setAnnotating(null)} />}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums text-zinc-200">{formatOdds(l.odds)}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 align-top text-xs text-zinc-400">
                            <button className="hover:text-white hover:underline" onClick={(e) => { e.stopPropagation(); showTickets(l.id); }} title="Show the PPs with this leg" data-testid="leg-use">
                              on {u.on} {u.on === 1 ? 'PP' : 'PPs'} · {u.alive} alive
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right align-top">
                            <span className="inline-flex items-center gap-0.5">
                              {l.result === 'pending' ? (
                                RESULT_KEYS.map(({ r, key, cls, label }) => (
                                  <button key={r} className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`} title={`${label} (${key})`} aria-label={`Mark ${label}`} onClick={(e) => { e.stopPropagation(); settle(l, r); }}>
                                    {key}
                                  </button>
                                ))
                              ) : (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_PILL[l.result]}`} data-testid="leg-result">
                                  {l.result[0]!.toUpperCase() + l.result.slice(1)}
                                </span>
                              )}
                              {editing && l.result !== 'pending' && (
                                <button className="rounded px-1 text-xs text-zinc-400 hover:text-white" title="Back to pending" aria-label="Back to pending" onClick={(e) => { e.stopPropagation(); settle(l, 'pending'); }}>
                                  ?
                                </button>
                              )}
                              <button className="rounded px-1 py-0.5 text-[11px] text-zinc-500 opacity-0 hover:text-white group-hover:opacity-100" title="Actual and note (T)" onClick={(e) => { e.stopPropagation(); select(l.id); setAnnotating(l.id); }}>
                                T
                              </button>
                              {editing && (
                                <>
                                  <button className="rounded px-1 text-xs text-zinc-400 hover:text-white" aria-label="Edit leg" title="Edit leg" onClick={(e) => { e.stopPropagation(); setEdit(l.id); }}>
                                    ✎
                                  </button>
                                  <button className="rounded px-1 text-xs text-red-300 hover:text-red-200" aria-label="Remove leg" title="Remove leg" onClick={(e) => { e.stopPropagation(); removeLeg(l); }}>
                                    ✕
                                  </button>
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ),
      )}
      {batch.legs.length > 0 && <p className="text-xs text-zinc-500">Keys: ↑ ↓ move · W L V settle · T actual and note · Z undo</p>}
    </div>
  );
}

/** T: what actually happened and his note on the leg. Enter saves, Esc closes. */
function LegAnnotator({ leg, onSave, onClose }: { leg: PPLeg; onSave(p: Pick<PPLeg, 'actual' | 'note'>): void; onClose(): void }) {
  const [actual, setActual] = useState(leg.actual);
  const [note, setNote] = useState(leg.note);
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ actual: actual.trim(), note: note.trim() });
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <input autoFocus className="field w-40 py-0.5 text-xs" placeholder="actual: 11, 111-112" value={actual} onChange={(e) => setActual(e.target.value)} aria-label="Actual" />
      <input className="field min-w-0 flex-1 py-0.5 text-xs" placeholder="note: confidence, theory" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Leg note" />
      <button type="submit" className="btn py-0.5 text-xs">
        Save
      </button>
    </form>
  );
}

/** Adds a leg to the pool (or edits one): sport, game, market, selection, odds in any format, tier, note. */
function LegForm({ batch, leg, onSave, onCancel }: { batch: PPBatch; leg?: PPLeg; onSave(l: PPLeg): void; onCancel?(): void }) {
  const { suggestFor } = useApp();
  const blank = { sport: '', game: '', market: '', selection: '', odds: '', tier: batch.tiers[0]?.id ?? '', note: '' };
  const [f, setF] = useState(leg ? { ...leg, odds: String(leg.odds) } : blank);
  const [error, setError] = useState('');
  const sel = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    const odds = oddsFromText(f.odds);
    if (!f.selection.trim()) return setError('Selection is needed');
    if (odds == null) return setError('Odds must be above 1');
    setError('');
    onSave({ id: leg?.id ?? ppId('leg'), sport: f.sport.trim(), game: f.game.trim(), market: f.market.trim(), selection: f.selection.trim(), odds, tier: f.tier, result: leg?.result ?? 'pending', actual: leg?.actual ?? '', note: f.note.trim() });
    // the next leg keeps sport, game and tier
    if (!leg) {
      setF((x) => ({ ...x, market: '', selection: '', odds: '', note: '' }));
      sel.current?.focus();
    }
  };
  return (
    <form
      className="card grid grid-cols-[repeat(4,minmax(0,1fr))_6rem_9rem_minmax(0,1fr)_auto] items-end gap-2 p-3"
      aria-label={leg ? 'Edit leg' : 'Add leg'}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
    >
      <L label="Sport">
        <Autocomplete value={f.sport} onChange={(v) => set('sport', v)} getSuggestions={(q) => suggestFor('sport', q)} aria-label="Leg sport" />
      </L>
      <L label="Game">
        <Autocomplete value={f.game} onChange={(v) => set('game', v)} getSuggestions={(q) => suggestFor('game', q, f.sport)} aria-label="Leg game" />
      </L>
      <L label="Market">
        <Autocomplete value={f.market} onChange={(v) => set('market', v)} getSuggestions={(q) => suggestFor('market', q, f.sport)} aria-label="Leg market" />
      </L>
      <L label="Selection *">
        <Autocomplete ref={sel} value={f.selection} onChange={(v) => set('selection', v)} getSuggestions={(q) => suggestFor('selection', q, f.sport)} aria-label="Leg selection" />
      </L>
      <L label="Odds *">
        <OddsInput value={f.odds} onChange={(v) => set('odds', v)} aria-label="Leg odds" />
      </L>
      <L label="Tier">
        <select className="field" value={f.tier} onChange={(e) => set('tier', e.target.value)} aria-label="Leg tier">
          {batch.tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </L>
      <L label="Note">
        <input className="field" value={f.note} onChange={(e) => set('note', e.target.value)} placeholder="confidence, theory" aria-label="Leg note" />
      </L>
      <span className="flex gap-1">
        {onCancel && (
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          {leg ? 'Save' : 'Add leg'}
        </button>
      </span>
      {error && (
        <p role="alert" className="col-span-full text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

/** Tiers: rename, add a level ("Major 2"), remove an empty one. Ordered most confident first. */
function TierEditor({ batch, save }: { batch: PPBatch; save(p: Partial<BatchInput>): unknown }) {
  const add = () => {
    const majors = batch.tiers.filter((t) => /^major/i.test(t.name) && !/major-major/i.test(t.name)).length;
    const tier = { id: ppId('tier'), name: `Major ${majors + 1}` };
    // a new level goes before the last tier (PP shot)
    const at = Math.max(0, batch.tiers.length - 1);
    void save({ tiers: [...batch.tiers.slice(0, at), tier, ...batch.tiers.slice(at)] });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="tier-editor">
      <span className="text-zinc-500">Tiers:</span>
      {batch.tiers.map((t) => {
        const used = batch.legs.some((l) => l.tier === t.id);
        return (
          <span key={t.id} className="inline-flex items-center gap-0.5">
            <TierName key={t.name} value={t.name} onSave={(name) => void save({ tiers: batch.tiers.map((x) => (x.id === t.id ? { ...x, name } : x)) })} />
            {!used && batch.tiers.length > 1 && (
              <button className="px-1 text-zinc-500 hover:text-red-300" aria-label={`Remove tier ${t.name}`} onClick={() => void save({ tiers: batch.tiers.filter((x) => x.id !== t.id) })}>
                ✕
              </button>
            )}
          </span>
        );
      })}
      <button className="chip" onClick={add}>
        + Add level
      </button>
    </div>
  );
}

function TierName({ value, onSave }: { value: string; onSave(v: string): void }) {
  const [v, setV] = useState(value);
  const commit = () => v.trim() && v.trim() !== value && onSave(v.trim());
  return <input className="field w-32 py-0.5 text-xs" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} aria-label={`Tier name ${value}`} />;
}

type Filter = 'all' | 'alive' | 'one-away' | 'won' | 'dead';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'alive', label: 'Alive' },
  { id: 'one-away', label: 'One leg away' },
  { id: 'won', label: 'Won' },
  { id: 'dead', label: 'Dead' },
];
type Sort = 'number' | 'odds' | 'left';

const matches = (v: TicketView, f: Filter) => f === 'all' || (f === 'alive' ? isAlive(v.status) : v.status === f);

function TicketsView({ batch, editing, save, legFilter, setLegFilter }: { batch: PPBatch; editing: boolean; save(p: Partial<BatchInput>): unknown; legFilter: string | null; setLegFilter(id: string | null): void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('number');
  const [edit, setEdit] = useState<string | 'new' | null>(null);
  const views = useMemo(() => batch.tickets.map((t) => ticketView(t, batch)), [batch]);
  const shown = useMemo(() => {
    const list = views.filter((v) => matches(v, filter) && (!legFilter || v.ticket.legIds.includes(legFilter)));
    return [...list].sort((a, b) => (sort === 'odds' ? b.odds - a.odds : sort === 'left' ? a.left - b.left : 0) || a.ticket.number - b.ticket.number);
  }, [views, filter, sort, legFilter]);
  const leg = legFilter ? batch.legs.find((l) => l.id === legFilter) : undefined;
  const pm = profitMoney(batch.money);
  const saveTicket = (t: PPTicket) => {
    void save({ tickets: [...batch.tickets.filter((x) => x.id !== t.id), t].sort((a, b) => a.number - b.number) });
    setEdit(null);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const n = views.filter((v) => matches(v, f.id) && (!legFilter || v.ticket.legIds.includes(legFilter))).length;
          return (
            <button key={f.id} className={`chip text-sm ${filter === f.id ? 'border-emerald-500 bg-emerald-500/15 text-white' : ''}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span className="text-zinc-500">{n}</span>
            </button>
          );
        })}
        {leg && (
          <span className="chip border-sky-500 text-sky-200" data-testid="leg-filter">
            with {leg.selection}
            <button className="ml-1 text-sky-300 hover:text-white" aria-label="Clear the leg filter" onClick={() => setLegFilter(null)}>
              ✕
            </button>
          </span>
        )}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400">
          Sort
          <select className="field w-32 py-0.5 text-xs" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort tickets">
            <option value="number">Number</option>
            <option value="odds">Odds</option>
            <option value="left">Legs left</option>
          </select>
        </label>
        {editing && (
          <button className="btn text-xs" onClick={() => setEdit('new')}>
            + Add PP
          </button>
        )}
      </div>
      {edit && (
        <TicketEditor
          batch={batch}
          ticket={edit === 'new' ? undefined : batch.tickets.find((t) => t.id === edit)}
          onSave={saveTicket}
          onCancel={() => setEdit(null)}
        />
      )}
      <section className="card px-2">
        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">{batch.tickets.length ? 'No PPs match.' : editing ? 'No PPs yet: add them with “+ Add PP”.' : 'No PPs yet. Press Edit to add them.'}</p>
        ) : (
          <table className="w-full table-fixed text-sm" data-testid="tickets">
            <colgroup>
              <col className="w-16" />
              <col />
              <col className="w-[88px]" />
              <col className="w-[100px]" />
              <col className="w-[120px]" />
              <col className="w-[120px]" />
              {editing && <col className="w-16" />}
            </colgroup>
            <thead>
              <tr className="text-left text-[11px] text-zinc-500">
                <th className="px-2 py-2 font-medium">PP</th>
                <th className="px-2 py-2 font-medium">Legs</th>
                <th className="px-2 py-2 text-right font-medium">Odds</th>
                <th className="px-2 py-2 text-right font-medium">Stake</th>
                <th className="px-2 py-2 text-right font-medium">Potential</th>
                <th className="px-2 py-2 font-medium">Status</th>
                {editing && <th />}
              </tr>
            </thead>
            <tbody>
              {shown.map((v) => (
                <tr key={v.ticket.id} className="border-t border-zinc-900 align-top" data-testid="ticket" data-number={v.ticket.number} data-status={v.status}>
                  <td className="px-2 py-1.5 font-semibold text-zinc-200">
                    PP {v.ticket.number}
                    {!v.ticket.placed && <div className="text-[10px] font-normal text-zinc-500">not placed</div>}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {v.legs.map((l) => (
                        <button key={l.id} className={`rounded border px-1.5 text-[11px] leading-5 ${CHIP[l.result]} ${legFilter === l.id ? 'ring-1 ring-sky-400' : ''} hover:brightness-125`} title={`${l.selection} @ ${formatOdds(l.odds)} · ${l.result} · click: the PPs with this leg`} onClick={() => setLegFilter(l.id)} data-testid="ticket-leg" data-result={l.result}>
                          {l.selection}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-zinc-200" data-testid="ticket-odds">
                    {formatOdds(v.odds, 2)}
                    {v.estimated && <div className="text-[10px] text-zinc-500">estimated</div>}
                  </td>
                  <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${MONEY_TEXT[batch.money] || 'text-zinc-200'}`}>{formatMoney(batch.stake, batch.money)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-zinc-300" data-testid="ticket-potential">
                    {v.result === 'pending' ? formatMoney(v.potential, pm) : <span className={v.profit > 0 ? 'text-emerald-400' : v.profit < 0 ? 'text-red-400' : 'text-zinc-400'}>{formatMoney(v.profit, pm, true)}</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[v.status]}`} data-testid="ticket-status">
                      {STATUS_LABEL[v.status]}
                    </span>
                    {v.status !== 'won' && v.status !== 'dead' && v.status !== 'void' && <div className="mt-0.5 text-[10px] text-zinc-500">{v.left} left</div>}
                  </td>
                  {editing && (
                    <td className="whitespace-nowrap px-1 py-1.5 text-right">
                      <button className="rounded px-1 text-xs text-zinc-400 hover:text-white" aria-label={`Edit PP ${v.ticket.number}`} onClick={() => setEdit(v.ticket.id)}>
                        ✎
                      </button>
                      <button className="rounded px-1 text-xs text-red-300" aria-label={`Delete PP ${v.ticket.number}`} onClick={() => window.confirm(`Delete PP ${v.ticket.number}?`) && void save({ tickets: batch.tickets.filter((t) => t.id !== v.ticket.id) })}>
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** A PP by hand: pick its legs from the pool; the book's price and whether it is placed are optional. */
function TicketEditor({ batch, ticket, onSave, onCancel }: { batch: PPBatch; ticket?: PPTicket; onSave(t: PPTicket): void; onCancel(): void }) {
  const [legIds, setLegIds] = useState<string[]>(ticket?.legIds ?? batch.legs.filter((l) => l.tier === batch.tiers[0]?.id).map((l) => l.id));
  const [odds, setOdds] = useState(ticket?.oddsOverride != null ? String(ticket.oddsOverride) : '');
  const [placed, setPlaced] = useState(ticket?.placed ?? true);
  const [error, setError] = useState('');
  const groups = legsByTier({ ...batch, tickets: [] });
  const estimate = legIds.map((id) => batch.legs.find((l) => l.id === id)!).filter(Boolean).reduce((p, l) => p * l.odds, 1);
  const toggle = (id: string) => setLegIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const submit = () => {
    if (!legIds.length) return setError('Pick at least one leg');
    const ov = odds.trim() ? oddsFromText(odds) : null;
    if (odds.trim() && ov == null) return setError('Odds must be above 1');
    const order = batch.legs.map((l) => l.id);
    const t = { id: ticket?.id ?? ppId('pp'), number: ticket?.number ?? nextNumber(batch.tickets), legIds: [...legIds].sort((a, b) => order.indexOf(a) - order.indexOf(b)), placed, oddsOverride: ov };
    const same = batch.tickets.find((x) => x.id !== t.id && x.legIds.length === t.legIds.length && x.legIds.every((id) => t.legIds.includes(id)));
    if (same && !window.confirm(`PP ${same.number} has exactly these legs. Save anyway?`)) return;
    onSave(t);
  };
  return (
    <form
      className="card space-y-2 p-3"
      aria-label={ticket ? `Edit PP ${ticket.number}` : 'New PP'}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div className="text-sm font-semibold">{ticket ? `PP ${ticket.number}` : `New PP ${nextNumber(batch.tickets)}`}</div>
      {groups.map((g) => (
        <div key={g.tier.id} className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="w-24 shrink-0 text-zinc-500">{g.tier.name}</span>
          {g.legs.map((l) => (
            <label key={l.id} className={`chip cursor-pointer ${legIds.includes(l.id) ? 'border-emerald-500 bg-emerald-500/15 text-white' : ''}`}>
              <input type="checkbox" className="sr-only" checked={legIds.includes(l.id)} onChange={() => toggle(l.id)} aria-label={`Leg ${l.selection}`} />
              {l.selection} <span className="text-zinc-500">{formatOdds(l.odds, 2)}</span>
            </label>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3 text-xs">
        <span className="text-zinc-400">
          {legIds.length} legs · estimated <b className="text-zinc-100">{formatOdds(estimate, 2)}</b>
        </span>
        <L label="Book's odds (optional)">
          <OddsInput value={odds} onChange={setOdds} aria-label="PP odds" className="field w-28" />
        </L>
        <label className="flex items-center gap-1.5 pb-1.5 text-zinc-300">
          <input type="checkbox" checked={placed} onChange={(e) => setPlaced(e.target.checked)} aria-label="Placed" />
          Placed
        </label>
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save PP
          </button>
        </span>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function L({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
