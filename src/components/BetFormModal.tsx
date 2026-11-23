'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate, parseDateInput } from '@/lib/dates';
import { emptyLeg, formFromBet, formToBet, newForm, nextForm, type BetForm, type LegForm } from '@/lib/form';
import { formatMoney, MONEY_SYMBOL, oddsFromText, parseNumber, profitMoney, winReturn } from '@/lib/money';
import { MONEY_OPTION_LABEL, MONEY_TEXT } from './moneyStyle';
import { BalanceHint } from './Bankroll';
import { BET_TYPES, RESULT_LABEL, RESULTS, SITUATIONS, type Bet } from '@/lib/types';
import { clashText, teamClashes } from '@/lib/clash';
import { quickAddLegs } from '@/lib/quickadd';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { MoneySelect } from './Money';
import { OddsInput } from './OddsInput';

/** The full bet form, as a modal. New bets, edits and duplicates. */
export function BetFormModal() {
  const { form: req } = useApp();
  if (!req) return null;
  return <FormBody key={req.key} />;
}

function FormBody() {
  const { form: req, bets, defaults, presets, suggestFor, create, update, closeForm, notify } = useApp();
  const editing: Bet | null = req?.mode === 'edit' ? req.bet : null;
  // BT-29: adding the next bet of a rollover shot: stake and money are fixed (a different stake is not a rollover)
  const rollover = req?.mode === 'new' ? req.rollover : undefined;
  const [f, setF] = useState<BetForm>(() =>
    editing ? formFromBet(editing) : { ...newForm(defaults), ...(req?.mode === 'new' ? req.prefill : {}), ...(rollover ? { stake: String(rollover.stake), money: rollover.money } : {}) },
  );
  // a bet in a rollover keeps the shot's money
  const moneyLocked = !!rollover || !!editing?.rolloverId;
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
      // the form has no dutch or rollover field: an edited bet stays in its dutch / rollover (and banked)
      if (editing) await update(editing.id, { ...v.value, dutchId: editing.dutchId, rolloverId: editing.rolloverId, banked: editing.banked, ...(editing.rolloverId ? { money: editing.money } : {}) });
      else if (rollover) rollover.onSaved?.(await create({ ...v.value, stake: rollover.stake, money: rollover.money, rolloverId: rollover.rolloverId, banked: false }));
      else await create(v.value);
      if (!rollover) notify(editing ? 'Bet updated' : 'Bet saved');
      if (another && !editing && !rollover) {
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
  const odds = oddsFromText(f.odds);
  // BT-33: a bonus bet returns its winnings only
  const potential = stake && odds ? winReturn({ stake, odds, money: f.money }) : 0;
  // BT-22: a team in two games on the game date (this bet's games and every other bet's)
  const gameDateISO = (f.gameDate.trim() ? parseDateInput(f.gameDate) : null) ?? (f.placedDate.trim() ? parseDateInput(f.placedDate) : null);
  const clashes = gameDateISO ? teamClashes(f.type === 'solo' ? [f.game] : f.legs.map((l) => l.game), gameDateISO, bets.filter((b) => b.id !== editing?.id)) : [];
  const lastSport = f.type === 'solo' ? f.sport : (f.legs.at(-1)?.sport ?? defaults.sport);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10" onMouseDown={(e) => e.target === e.currentTarget && closeForm()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Edit bet' : rollover ? 'Add rollover leg' : 'New bet'}
        className="card w-full max-w-3xl space-y-4 p-5"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editing ? 'Edit bet' : rollover ? 'Add rollover leg' : 'New bet'}</h2>
          <span className="text-xs text-zinc-500">Enter saves · Ctrl+Shift+Enter saves and adds another · Esc closes</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <L label={`Stake (${MONEY_SYMBOL[f.money]}) *`}>
            <input ref={stakeRef} className="field" inputMode="decimal" value={f.stake} readOnly={!!rollover} title={rollover ? 'The banked payout: the whole of it rolls on' : undefined} onChange={(e) => set('stake', e.target.value)} aria-label="Stake" />
          </L>
          <L label="Total odds *">
            <OddsInput value={f.odds} onChange={(v) => set('odds', v)} placeholder="2.10, -114, 5/2" aria-label="Odds" />
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
                {formatMoney(potential, profitMoney(f.money))}
              </span>
            </div>
          )}
        </div>

        {/* BT-33: the balance of this money + book, and what the stake leaves (a warning, never a block) */}
        {!editing && <BalanceHint money={f.money} book={f.book} stake={rollover ? 0 : (stake ?? 0)} />}

        {rollover && (
          <p className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-200" data-testid="rollover-note">
            Rollover: the whole banked payout, {formatMoney(rollover.stake, rollover.money)}, goes on this bet. Its odds multiply the shot&apos;s.
          </p>
        )}

        {presets.length > 0 && !rollover && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500">Stakes:</span>
            {presets.map((p) => (
              <button key={p} type="button" tabIndex={-1} className="chip" onClick={() => set('stake', String(p))}>
                {formatMoney(p, f.money)}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <L label="Money">
            {moneyLocked ? (
              <span className={`field ${MONEY_TEXT[f.money]}`} title="A rollover keeps the money of its first bet" data-testid="money-locked">
                {MONEY_OPTION_LABEL[f.money]}
              </span>
            ) : (
              <MoneySelect value={f.money} onChange={(m) => set('money', m)} />
            )}
          </L>
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
              <div key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_5rem_7rem_6rem_auto] items-end gap-2" data-testid="leg-row">
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
                  <OddsInput value={l.odds} onChange={(v) => setLeg(i, { odds: v })} aria-label={`Leg ${i + 1} odds`} />
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
                <L label="Actual">
                  <input className="field" value={l.actual} onChange={(e) => setLeg(i, { actual: e.target.value })} placeholder="11, 111-112" aria-label={`Leg ${i + 1} actual`} />
                </L>
                <button type="button" className="btn mb-0.5 text-xs" aria-label={`Remove leg ${i + 1}`} onClick={() => set('legs', f.legs.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
            ))}
            {f.legs.length === 0 &&
              (quickAddLegs(f.betText) ? (
                <p className="text-xs text-zinc-500">No legs: total odds only. Add 2 or more legs to track each one.</p>
              ) : (
                <p className="text-xs text-amber-300" data-testid="no-legs-solo">
                  No legs: saved as a Solo. Add 2 or more legs, or write the bet text as {'"a + b"'}.
                </p>
              ))}
            {f.legs.length === 1 && (
              <p className="text-xs text-amber-300" data-testid="one-leg">
                One leg is a Solo bet: add another leg, or it is saved as a Solo.
              </p>
            )}
          </div>
        )}

        <L label="Bet text">
          <Autocomplete value={f.betText} onChange={(v) => set('betText', v)} getSuggestions={(q) => suggestFor('betText', q)} aria-label="Bet text" />
        </L>

        {/* BT-27: a label chip and what actually happened (a combination's actuals are on its legs) */}
        <div className="grid gap-3 md:grid-cols-2">
          <L label="Label">
            <Autocomplete value={f.label} onChange={(v) => set('label', v)} getSuggestions={(q) => suggestFor('label', q)} placeholder="lost by one" aria-label="Label" />
          </L>
          {f.type === 'solo' && (
            <L label="What happened">
              <input className="field" value={f.actual} onChange={(e) => set('actual', e.target.value)} placeholder="24 pts" aria-label="What happened" />
            </L>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <L label="Pre-bet analysis">
            <textarea className="field min-h-20" value={f.preAnalysis} onChange={(e) => set('preAnalysis', e.target.value)} aria-label="Pre-bet analysis" />
          </L>
          <L label="Post-bet analysis">
            <textarea className="field min-h-20" value={f.postAnalysis} onChange={(e) => set('postAnalysis', e.target.value)} aria-label="Post-bet analysis" />
          </L>
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
          <button type="button" className="btn" onClick={closeForm}>
            Cancel
          </button>
          {!editing && !rollover && (
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
