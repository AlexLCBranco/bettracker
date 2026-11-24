'use client';

import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Field } from '@/lib/autocomplete';
import { logDraft, planDutchEdit, resolvedBooks, resolvedPicks, type DraftLeg, type DutchDraft, type DutchDraftRow, type PickField, type ResolvedPick } from '@/lib/dutch';
import { outcomeTable } from '@/lib/dutching';
import { formatMoney, formatOdds, oddsFromText, parseNumber } from '@/lib/money';
import { SITUATIONS, type Bet } from '@/lib/types';
import { clashText, teamClashes } from '@/lib/clash';
import { parseDateInput } from '@/lib/dates';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { DateField } from './BetFormModal';
import { MoneySelect } from './Money';
import { OddsInput } from './OddsInput';
import { OutcomeTable } from './OutcomeTable';

/** Logs a dutch as linked bets in one go: shared fields once, a book per selection, a game and market per leg. */
export function DutchFormModal() {
  const { dutchForm } = useApp();
  if (!dutchForm) return null;
  return <Body key={dutchForm.key} />;
}

const CHIPS: Record<PickField, 'games' | 'markets'> = { game: 'games', market: 'markets' };

function Body() {
  const { dutchForm, bets, defaults, suggestFor, createMany, update, remove, closeDutch, notify, undoGroup } = useApp();
  /** BT-12: editing a logged dutch: selections, odds and stakes become editable, splits can be added and removed. */
  const edit = dutchForm!.edit;
  const [d, setD] = useState<DutchDraft>(() => dutchForm!.draft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const set = <K extends keyof DutchDraft>(k: K, v: DutchDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setLeg = (i: number, k: number, patch: Partial<DraftLeg>) =>
    setD((x) => ({ ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, legs: r.legs.map((l, m) => (m === k ? { ...l, ...patch } : l)) } : r)) }));
  const setShared = (k: number, patch: Partial<DraftLeg>) => setD((x) => ({ ...x, shared: x.shared.map((l, m) => (m === k ? { ...l, ...patch } : l)) }));
  /** Adding or removing a chip; a removed chip is also taken off the legs that picked it. */
  const setChips = (field: PickField, chips: string[]) =>
    setD((x) => {
      const keep = (l: DraftLeg) => (l[field] && !chips.includes(l[field]!) && x[CHIPS[field]].includes(l[field]!) ? { ...l, [field]: '' } : l);
      return { ...x, [CHIPS[field]]: chips, rows: x.rows.map((r) => ({ ...r, legs: r.legs.map(keep) })), shared: x.shared.map(keep) };
    });

  const books = resolvedBooks(d.rows, defaults.book);
  const picks = { game: resolvedPicks(d, 'game'), market: resolvedPicks(d, 'market') };
  const setRow = (i: number, patch: Partial<DutchDraftRow>) => setD((x) => ({ ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const addRow = () => setD((x) => ({ ...x, rows: [...x.rows, { selection: '', legs: [{ selection: '', odds: null }], odds: NaN, stake: NaN, book: null }] }));
  const removeRow = (i: number) => setD((x) => ({ ...x, rows: x.rows.filter((_, j) => j !== i) }));
  const numbersOk = d.rows.every((r) => r.odds > 1 && r.stake > 0);
  const total = numbersOk ? d.rows.reduce((s, r) => s + r.stake, 0) : NaN;
  const combined = numbersOk ? 1 / d.rows.reduce((s, r) => s + 1 / r.odds, 0) : NaN;
  const outcomes = !numbersOk ? [] : outcomeTable(
    Math.round(total * 100) / 100,
    d.rows.map((r) => r.stake),
    d.rows.map((r) => r.odds),
    d.shared.length > 0,
  );
  // BT-22: a team in two games on the game date (this dutch's games and every other bet's)
  const gameDateISO = (d.gameDate.trim() ? parseDateInput(d.gameDate) : null) ?? (d.placedDate.trim() ? parseDateInput(d.placedDate) : null);
  const editIds = new Set(edit?.bets.map((b) => b.id));
  const clashes = gameDateISO ? teamClashes([...d.games, ...[...picks.game.rows.flat(), ...picks.game.shared].map((p) => p.value ?? '')], gameDateISO, bets.filter((b) => !editIds.has(b.id))) : [];
  const isCombo = (i: number) => d.rows[i]!.legs.length + d.shared.length >= 2;

  const saveEdit = async (e: NonNullable<typeof edit>) => {
    const v = planDutchEdit(d, e.bets, defaults.book, e.dutchId);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setSaving(true);
    try {
      await undoGroup('Dutch edited', `dutch:${e.dutchId}`, async () => {
        for (const u of v.plan.updates) await update(u.id, u.patch, {});
        if (v.plan.creates.length) await createMany(v.plan.creates);
        for (const id of v.plan.deletes) await remove(id);
      });
      const parts = [`${v.plan.updates.length} updated`, v.plan.creates.length && `${v.plan.creates.length} added`, v.plan.deletes.length && `${v.plan.deletes.length} removed`].filter(Boolean);
      notify(`Dutch saved: ${parts.join(', ')}`);
      closeDutch();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving) return;
    if (edit) return saveEdit(edit);
    setSaving(true);
    const onSaved = dutchForm!.onSaved ?? ((made: Bet[]) => notify(`Dutch logged: ${made.length} bets`));
    const r = await logDraft(d, defaults.book, crypto.randomUUID(), createMany, onSaved);
    setSaving(false);
    if (r.ok) closeDutch();
    else setError(r.error);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDutch();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save();
    }
  };

  const pickCells = (label: string, legPicks: { game: ResolvedPick; market: ResolvedPick }, leg: DraftLeg, onPick: (patch: Partial<DraftLeg>) => void) =>
    (['game', 'market'] as const).map((f) => (
      <td key={f} className="py-1 pl-3">
        <PickCell
          field={f}
          chips={d[CHIPS[f]]}
          pick={leg[f] ?? ''}
          resolved={legPicks[f]}
          label={`${label} ${f}`}
          suggest={(q) => suggestFor(f as Field, q, d.sport)}
          onPick={(v) => onPick({ [f]: v })}
        />
      </td>
    ));

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10" onMouseDown={(e) => e.target === e.currentTarget && closeDutch()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={edit ? 'Edit dutch' : 'Log dutch'}
        className="card w-full max-w-5xl space-y-4 p-5"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{edit ? 'Edit dutch' : 'Log dutch as bets'}</h2>
          <span className="text-xs text-zinc-500">Enter saves · Esc closes</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <L label="Sport">
            <Autocomplete ref={first} value={d.sport} onChange={(v) => set('sport', v)} getSuggestions={(q) => suggestFor('sport', q)} aria-label="Sport" />
          </L>
          <L label="Game(s)" group>
            <ChipsField chips={d.games} onChange={(c) => setChips('game', c)} suggest={(q) => suggestFor('game', q, d.sport)} label="Game(s)" noun="game" />
          </L>
          <L label="Market(s)" group>
            <ChipsField chips={d.markets} onChange={(c) => setChips('market', c)} suggest={(q) => suggestFor('market', q, d.sport)} label="Market(s)" noun="market" />
          </L>
          <L label="Placed date">
            <DateField value={d.placedDate} onChange={(v) => set('placedDate', v)} aria-label="Placed date" />
          </L>
          <L label="Game date">
            <DateField value={d.gameDate} onChange={(v) => set('gameDate', v)} aria-label="Game date" />
          </L>
          <L label="Money">
            <MoneySelect value={d.money} onChange={(m) => set('money', m)} />
          </L>
          <L label="Situation">
            <select className="field" value={d.situation} onChange={(e) => set('situation', e.target.value as DutchDraft['situation'])} aria-label="Situation">
              {SITUATIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'pregame' ? 'Pregame' : 'Live'}
                </option>
              ))}
            </select>
          </L>
        </div>

        <table className="w-full text-sm" aria-label="Bets to log">
          <thead>
            <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
              <th className="py-2 pr-3 font-medium">Selection</th>
              <th className="px-3 py-2 text-right font-medium">Odds</th>
              <th className="px-3 py-2 text-right font-medium">Stake</th>
              <th className="py-2 pl-3 font-medium">Book</th>
              <th className="py-2 pl-3 font-medium">Game</th>
              <th className="py-2 pl-3 font-medium">Market</th>
              {edit && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r, i) => {
              const combo = isCombo(i);
              return (
                <Fragment key={i}>
                  <tr className={combo ? '' : 'border-b border-zinc-900'} data-testid="dutch-log-row">
                    {edit ? (
                      <>
                        <td className="py-1.5 pr-3">
                          {combo ? (
                            <span className="text-zinc-100">{r.legs.map((l) => l.selection).filter(Boolean).join(' + ') || `Selection ${i + 1}`}</span>
                          ) : (
                            <input
                              className="field"
                              value={r.legs[0]?.selection ?? r.selection}
                              placeholder={`Selection ${i + 1}`}
                              onChange={(e) => setRow(i, { selection: e.target.value, legs: [{ ...r.legs[0]!, selection: e.target.value }] })}
                              aria-label={`Selection ${i + 1} name`}
                            />
                          )}
                        </td>
                        <td className="w-28 px-3 py-1.5">
                          <EditOdds value={r.odds} onValue={(n) => setRow(i, { odds: n ?? NaN })} label={`Selection ${i + 1} odds`} />
                        </td>
                        <td className="w-28 px-3 py-1.5">
                          <EditStake value={r.stake} onValue={(n) => setRow(i, { stake: n })} label={`Selection ${i + 1} stake`} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 text-zinc-100">{r.selection || `Selection ${i + 1}`}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatOdds(r.odds)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(r.stake, d.money)}</td>
                      </>
                    )}
                    <td className="py-1.5 pl-3">
                      <Autocomplete
                        value={books[i]!}
                        onChange={(v) =>
                          setD((x) => ({
                            ...x,
                            rows: x.rows.map((row, j) => (j === i ? { ...row, book: v } : row)),
                          }))
                        }
                        getSuggestions={(q) => suggestFor('book', q)}
                        aria-label={`Selection ${i + 1} book`}
                      />
                    </td>
                    {combo ? (
                      <td colSpan={2} className="py-2 pl-3 text-xs text-zinc-500">
                        Combination: per leg below
                      </td>
                    ) : (
                      pickCells(`Selection ${i + 1}`, { game: picks.game.rows[i]![0]!, market: picks.market.rows[i]![0]! }, r.legs[0]!, (p) => setLeg(i, 0, p))
                    )}
                    {edit && (
                      <td className="pl-2 text-right">
                        <button type="button" className="text-zinc-500 hover:text-red-400" title="Remove this split (its bet is deleted when you save)" aria-label={`Remove selection ${i + 1}`} onClick={() => removeRow(i)}>
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                  {combo &&
                    r.legs.map((l, k) => (
                      <tr key={k} className={`text-xs text-zinc-300 ${k === r.legs.length - 1 ? 'border-b border-zinc-900' : ''}`} data-testid="dutch-log-leg">
                        {edit ? (
                          <>
                            <td className="py-1 pl-4 pr-3">
                              <input className="field py-0.5 text-xs" value={l.selection} placeholder={`Leg ${k + 1}`} onChange={(e) => setLeg(i, k, { selection: e.target.value })} aria-label={`Selection ${i + 1} leg ${k + 1} name`} />
                            </td>
                            <td className="px-3 py-1">
                              <EditOdds small value={l.odds} onValue={(n) => setLeg(i, k, { odds: n })} label={`Selection ${i + 1} leg ${k + 1} odds`} allowEmpty />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-1 pl-4 pr-3">↳ {l.selection}</td>
                            <td className="px-3 py-1 text-right tabular-nums text-zinc-400">{l.odds != null ? formatOdds(l.odds) : ''}</td>
                          </>
                        )}
                        <td colSpan={2} className="py-1 pl-3 text-zinc-500">
                          {d.shared.length > 0 && k === r.legs.length - 1 ? `+ shared: ${d.shared.map((x) => x.selection).join(', ')}` : ''}
                        </td>
                        {pickCells(`Selection ${i + 1} leg ${k + 1}`, { game: picks.game.rows[i]![k]!, market: picks.market.rows[i]![k]! }, l, (p) => setLeg(i, k, p))}
                        {edit && <td />}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
            {d.shared.map((l, k) => (
              <tr key={`s${k}`} className="border-b border-zinc-900 bg-indigo-500/5 text-xs text-zinc-300" data-testid="dutch-log-shared">
                <td className="py-1 pl-2 pr-3">
                  <span className="flex items-center">
                    <span className="mr-1.5 rounded bg-indigo-500/20 px-1.5 py-0.5 font-semibold text-indigo-300">Shared</span>
                    {edit ? <input className="field py-0.5 text-xs" value={l.selection} onChange={(e) => setShared(k, { selection: e.target.value })} aria-label={`Shared leg ${k + 1} name`} /> : l.selection}
                  </span>
                </td>
                <td className="px-3 py-1 text-right tabular-nums text-zinc-400">
                  {edit ? <EditOdds small value={l.odds} onValue={(n) => setShared(k, { odds: n })} label={`Shared leg ${k + 1} odds`} allowEmpty /> : l.odds != null ? formatOdds(l.odds) : ''}
                </td>
                <td colSpan={2} className="py-1 pl-3 text-zinc-500">
                  on every bet
                </td>
                {pickCells(`Shared leg ${k + 1}`, { game: picks.game.shared[k]!, market: picks.market.shared[k]! }, l, (p) => setShared(k, p))}
                {edit && <td />}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs text-zinc-400">
              <td className="py-2 pr-3">
                {d.rows.length} bets · combined odds
                {edit && (
                  <button type="button" className="btn ml-3 py-0.5 text-xs" onClick={addRow}>
                    + Add split
                  </button>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="dutch-form-odds">
                {numbersOk ? formatOdds(combined, 2) : '-'}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="dutch-form-total">
                {numbersOk ? formatMoney(total, d.money) : '-'}
              </td>
              <td colSpan={edit ? 4 : 3} />
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-zinc-500">
          {edit && 'Saving updates the bets in place: results already set stay. A removed split deletes its bet; an added split is a new pending bet. '}
          Each selection is saved as its own pending bet (a selection with legs as a combination bet at its total odds), linked as one dutch. A book, game or market you pick is copied to the rows below
          it until you change those.
        </p>

        <div className="rounded-md border border-zinc-800 p-3">
          <OutcomeTable rows={outcomes} compact />
        </div>

        {clashes.map((c) => (
          <p key={c.team} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300" data-testid="team-clash">
            ⚠ {clashText(c)}
          </p>
        ))}

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={closeDutch}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {edit ? 'Save changes' : `Log ${d.rows.length} bets`}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Several values as chips: Enter or comma adds the typed value, Backspace on an empty box removes the last one. */
function ChipsField({ chips, onChange, suggest, label, noun }: { chips: string[]; onChange(chips: string[]): void; suggest(q: string): string[]; label: string; noun: string }) {
  const [text, setText] = useState('');
  const add = (vals: string[]) => {
    const next = [...chips];
    for (const v of vals.map((x) => x.trim())) if (v && !next.includes(v)) next.push(v);
    if (next.length !== chips.length) onChange(next);
  };
  return (
    <div className="space-y-1">
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid={`chips-${noun}`}>
          {chips.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200" data-testid="chip">
              {c}
              <button type="button" className="text-zinc-500 hover:text-white" onClick={() => onChange(chips.filter((x) => x !== c))} aria-label={`Remove ${noun} ${c}`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Autocomplete
        value={text}
        placeholder={chips.length ? `Add another ${noun}` : `Type a ${noun}, Enter to add`}
        onChange={(v) => {
          if (v.includes(',')) {
            const parts = v.split(',');
            add(parts.slice(0, -1));
            setText(parts.at(-1)!);
          } else setText(v);
        }}
        onAccept={(v) => {
          add([v]);
          setText('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && text.trim()) {
            e.preventDefault();
            add([text]);
            setText('');
          } else if (e.key === 'Backspace' && !text && chips.length) {
            e.preventDefault();
            onChange(chips.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (text.trim()) {
            add([text]);
            setText('');
          }
        }}
        getSuggestions={(q) => suggest(q).filter((s) => !chips.includes(s))}
        aria-label={label}
      />
    </div>
  );
}

const OTHER = '\u0000other';

/** A leg's game or market: one of the chips, "Other…" to type one, or nothing (the leg above's, or the only chip). */
function PickCell(props: { field: PickField; chips: string[]; pick: string; resolved: ResolvedPick; label: string; suggest(q: string): string[]; onPick(v: string): void }) {
  const { chips, pick, resolved, label } = props;
  const [other, setOther] = useState(false);
  const missing = resolved.value == null;
  if (other || (pick && !chips.includes(pick))) {
    return (
      <Autocomplete
        autoFocus={other}
        className="field py-0.5 text-xs"
        value={pick}
        onChange={props.onPick}
        onBlur={() => setOther(false)}
        getSuggestions={props.suggest}
        aria-label={label}
        placeholder={`Type a ${props.field}`}
      />
    );
  }
  const blankLabel = pick ? '(clear)' : missing ? `— pick ${props.field} —` : resolved.value || '—';
  return (
    <select
      className={`field py-0.5 text-xs ${!pick ? 'text-zinc-500' : ''} ${missing ? 'border-red-500' : ''}`}
      value={pick}
      aria-label={label}
      aria-invalid={missing}
      title={!pick && resolved.value ? `${resolved.value} (not picked on this leg: the only one, or copied from above)` : undefined}
      onChange={(e) => {
        if (e.target.value === OTHER) setOther(true);
        else props.onPick(e.target.value);
      }}
    >
      <option value="">{blankLabel}</option>
      {chips.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value={OTHER}>Other…</option>
    </select>
  );
}

/** A labelled field. `group`: a div, for a field holding several controls (chips and their × buttons). */
function L({ label, group, children }: { label: string; group?: boolean; children: ReactNode }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </Tag>
  );
}

/** An editable odds box in the edit form (any format, BT-16): reports the decimal value, NaN while unreadable. */
function EditOdds({ value, onValue, label, allowEmpty, small }: { value: number | null; onValue(n: number | null): void; label: string; allowEmpty?: boolean; small?: boolean }) {
  const [text, setText] = useState(() => (value == null || !Number.isFinite(value) ? '' : formatOdds(value)));
  return (
    <OddsInput
      className={`field text-right ${small ? 'py-0.5 text-xs' : ''}`}
      value={text}
      onChange={(t) => {
        setText(t);
        onValue(t.trim() ? (oddsFromText(t) ?? NaN) : allowEmpty ? null : NaN);
      }}
      aria-label={label}
    />
  );
}

function EditStake({ value, onValue, label }: { value: number; onValue(n: number): void; label: string }) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? String(value) : ''));
  const bad = text.trim() !== '' && !((parseNumber(text) ?? 0) > 0);
  return (
    <input
      className={`field text-right tabular-nums ${bad ? 'border-red-500' : ''}`}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onValue(parseNumber(e.target.value) ?? NaN);
      }}
      aria-label={label}
    />
  );
}
