'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate, parseDateInput } from '@/lib/dates';
import { emptyLeg, formFromBet, formToBet, newForm, nextForm, type BetForm, type LegForm } from '@/lib/form';
import { formatBRL, parseNumber, potentialReturn } from '@/lib/money';
import { BET_TYPES, RESULT_LABEL, RESULTS, SITUATIONS, type Bet } from '@/lib/types';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';

/** The full bet form, as a modal. New bets, edits and duplicates. */
export function BetFormModal() {
  const { form: req } = useApp();
  if (!req) return null;
  return <FormBody key={req.key} />;
}

function FormBody() {
  const { form: req, defaults, presets, suggestFor, create, update, closeForm, notify } = useApp();
  const editing: Bet | null = req?.mode === 'edit' ? req.bet : null;
  const [f, setF] = useState<BetForm>(() => (editing ? formFromBet(editing) : { ...newForm(defaults), ...(req?.mode === 'new' ? req.prefill : {}) }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const stakeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    stakeRef.current?.focus();
    stakeRef.current?.select();
  }, []);

  const set = <K extends keyof BetForm>(k: K, v: BetForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const setLeg = (i: number, patch: Partial<LegForm>) => setF((x) => ({ ...x, legs: x.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const save = async (another: boolean) => {
    if (saving) return;
    const v = formToBet(f);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      // the form has no dutch field: an edited bet stays in its dutch
      if (editing) await update(editing.id, { ...v.value, dutchId: editing.dutchId });
      else await create(v.value);
      notify(editing ? 'Bet updated' : 'Bet saved');
      if (another && !editing) {
        setF(nextForm(f));
        stakeRef.current?.focus();
      } else closeForm();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeForm();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save(e.shiftKey);
    }
  };

  const stake = parseNumber(f.stake);
  const odds = parseNumber(f.odds);
  const potential = stake && odds ? potentialReturn(stake, odds) : 0;
  const lastSport = f.type === 'solo' ? f.sport : (f.legs.at(-1)?.sport ?? defaults.sport);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10" onMouseDown={(e) => e.target === e.currentTarget && closeForm()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit bet' : 'New bet'}
        className="card w-full max-w-3xl space-y-4 p-5"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editing ? 'Edit bet' : 'New bet'}</h2>
          <span className="text-xs text-zinc-500">Enter saves · Ctrl+Shift+Enter saves and adds another · Esc closes</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <L label="Stake (R$) *">
            <input ref={stakeRef} className="field" inputMode="decimal" value={f.stake} onChange={(e) => set('stake', e.target.value)} aria-label="Stake" />
          </L>
          <L label="Total odds *">
            <input className="field" inputMode="decimal" value={f.odds} onChange={(e) => set('odds', e.target.value)} aria-label="Odds" />
          </L>
          <L label="Result *">
            <select className="field" value={f.result} onChange={(e) => set('result', e.target.value as BetForm['result'])} aria-label="Result">
              {RESULTS.map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABEL[r]}
                </option>
              ))}
            </select>
          </L>
          {f.result === 'cash-out' ? (
            <L label="Cash-out amount *">
              <input className="field" inputMode="decimal" value={f.cashout} onChange={(e) => set('cashout', e.target.value)} aria-label="Cash-out amount" />
            </L>
          ) : (
            <div className="flex flex-col justify-end">
              <span className="text-xs text-zinc-500">Potential return</span>
              <span className="text-lg font-semibold text-emerald-400" data-testid="potential-return">
                {formatBRL(potential)}
              </span>
            </div>
          )}
        </div>

        {presets.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500">Stakes:</span>
            {presets.map((p) => (
              <button key={p} type="button" tabIndex={-1} className="chip" onClick={() => set('stake', String(p))}>
                {formatBRL(p)}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <L label="Book">
            <Autocomplete value={f.book} onChange={(v) => set('book', v)} getSuggestions={(q) => suggestFor('book', q)} aria-label="Book" />
          </L>
          <L label="Type">
            <select className="field" value={f.type} onChange={(e) => set('type', e.target.value as BetForm['type'])} aria-label="Type">
              {BET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'solo' ? 'Solo' : 'Combination'}
                </option>
              ))}
            </select>
          </L>
          <L label="Situation">
            <select className="field" value={f.situation} onChange={(e) => set('situation', e.target.value as BetForm['situation'])} aria-label="Situation">
              {SITUATIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'pregame' ? 'Pregame' : 'Live'}
                </option>
              ))}
            </select>
          </L>
          <L label="Placed date">
              <DateField value={f.placedDate} onChange={(v) => set('placedDate', v)} aria-label="Placed date" />
            </L>
          <L label="Game date">
              <DateField value={f.gameDate} onChange={(v) => set('gameDate', v)} aria-label="Game date" />
            </L>
        </div>

        {f.type === 'solo' ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <L label="Sport">
              <Autocomplete value={f.sport} onChange={(v) => set('sport', v)} getSuggestions={(q) => suggestFor('sport', q)} aria-label="Sport" />
            </L>
            <L label="Game">
              <Autocomplete value={f.game} onChange={(v) => set('game', v)} getSuggestions={(q) => suggestFor('game', q, f.sport)} aria-label="Game" />
            </L>
            <L label="Market">
              <Autocomplete value={f.market} onChange={(v) => set('market', v)} getSuggestions={(q) => suggestFor('market', q, f.sport)} aria-label="Market" />
            </L>
            <L label="Selection">
              <Autocomplete value={f.selection} onChange={(v) => set('selection', v)} getSuggestions={(q) => suggestFor('selection', q, f.sport)} aria-label="Selection" />
            </L>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Legs (optional)</span>
              <button type="button" className="btn text-xs" onClick={() => set('legs', [...f.legs, emptyLeg(lastSport)])}>
                + Add leg
              </button>
            </div>
            {f.legs.map((l, i) => (
              <div key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_5rem_7rem_auto] items-end gap-2" data-testid="leg-row">
                <L label={`Leg ${i + 1} sport`}>
                  <Autocomplete value={l.sport} onChange={(v) => setLeg(i, { sport: v })} getSuggestions={(q) => suggestFor('sport', q)} aria-label={`Leg ${i + 1} sport`} />
                </L>
                <L label="Game">
                  <Autocomplete value={l.game} onChange={(v) => setLeg(i, { game: v })} getSuggestions={(q) => suggestFor('game', q, l.sport)} aria-label={`Leg ${i + 1} game`} />
                </L>
                <L label="Market">
                  <Autocomplete value={l.market} onChange={(v) => setLeg(i, { market: v })} getSuggestions={(q) => suggestFor('market', q, l.sport)} aria-label={`Leg ${i + 1} market`} />
                </L>
                <L label="Selection">
                  <Autocomplete value={l.selection} onChange={(v) => setLeg(i, { selection: v })} getSuggestions={(q) => suggestFor('selection', q, l.sport)} aria-label={`Leg ${i + 1} selection`} />
                </L>
                <L label="Odds">
                  <input className="field" inputMode="decimal" value={l.odds} onChange={(e) => setLeg(i, { odds: e.target.value })} aria-label={`Leg ${i + 1} odds`} />
                </L>
                <L label="Result">
                  <select className="field" value={l.result} onChange={(e) => setLeg(i, { result: e.target.value as LegForm['result'] })} aria-label={`Leg ${i + 1} result`}>
                    {RESULTS.map((r) => (
                      <option key={r} value={r}>
                        {RESULT_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </L>
                <button type="button" className="btn mb-0.5 text-xs" aria-label={`Remove leg ${i + 1}`} onClick={() => set('legs', f.legs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            {f.legs.length === 0 && <p className="text-xs text-zinc-500">No legs: total odds only. Add 2 or more legs to track each one.</p>}
          </div>
        )}

        <L label="Bet text">
          <Autocomplete value={f.betText} onChange={(v) => set('betText', v)} getSuggestions={(q) => suggestFor('betText', q)} aria-label="Bet text" />
        </L>

        <div className="grid gap-3 md:grid-cols-2">
          <L label="Pre-bet analysis">
            <textarea className="field min-h-20" value={f.preAnalysis} onChange={(e) => set('preAnalysis', e.target.value)} aria-label="Pre-bet analysis" />
          </L>
          <L label="Post-bet analysis">
            <textarea className="field min-h-20" value={f.postAnalysis} onChange={(e) => set('postAnalysis', e.target.value)} aria-label="Post-bet analysis" />
          </L>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={closeForm}>
            Cancel
          </button>
          {!editing && (
            <button type="button" className="btn" disabled={saving} onClick={() => void save(true)}>
              Save and add another
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {editing ? 'Save changes' : 'Save'}
          </button>
        </div>
      </form>
    </div>
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

/** dd/mm/yyyy text field; also takes "22/11", "t" (today), "y" (yesterday). Normalized on blur. */
export function DateField({ value, onChange, ...rest }: { value: string; onChange(v: string): void; 'aria-label': string; autoFocus?: boolean; onKeyDown?(e: KeyboardEvent<HTMLInputElement>): void; className?: string }) {
  const bad = value.trim() !== '' && !parseDateInput(value);
  return (
    <input
      {...rest}
      className={`${rest.className ?? 'field'} ${bad ? 'border-red-500' : ''}`}
      placeholder="dd/mm/yyyy"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const iso = parseDateInput(value);
        if (iso) onChange(formatDate(iso));
      }}
    />
  );
}
