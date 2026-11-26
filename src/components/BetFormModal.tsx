'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatDate, parseDateInput } from '@/lib/dates';
import { editPatch, emptyLeg, formFromBet, formToBet, legsOdds, newForm, nextForm, overridesLegs, withLegs, type BetForm, type LegForm } from '@/lib/form';
import { formatMoney, formatOdds, MONEY_SYMBOL, oddsFromText, parseNumber, profitMoney, winReturn } from '@/lib/money';
import { MONEY_OPTION_LABEL, MONEY_TEXT } from './moneyStyle';
import { BalanceHint } from './Bankroll';
import { BET_TYPES, RESULT_LABEL, RESULTS, SITUATIONS, type Bet } from '@/lib/types';
import { clashText, teamClashes } from '@/lib/clash';
import { quickAddLegs } from '@/lib/quickadd';
import { newRolloverId } from '@/lib/rollover';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { MoneySelect } from './Money';
import { OddsInput } from './OddsInput';
import { WhatIfPreview } from './WhatIf';
import { previewText, readStake } from '@/lib/units';

/** The full bet form, as a modal. New bets, edits and duplicates. */
export function BetFormModal() {
  const { form: req } = useApp();
  if (!req) return null;
  return <FormBody key={req.key} />;
}

function FormBody() {
  const { form: req, bets, defaults, presets, suggestFor, create, update, closeForm, notify, units } = useApp();
  const editing: Bet | null = req?.mode === 'edit' ? req.bet : null;
  // BT-29: adding the next bet of a rollover shot: stake and money are fixed (a different stake is not a rollover)
  const rollover = req?.mode === 'new' ? req.rollover : undefined;
  const [f, setF] = useState<BetForm>(() =>
    editing ? formFromBet(editing) : { ...newForm(defaults), ...(req?.mode === 'new' ? req.prefill : {}), ...(rollover ? { stake: String(rollover.stake), money: rollover.money } : {}) },
  );
  // a bet in a rollover keeps the shot's money
  const moneyLocked = !!rollover || !!editing?.rolloverId;
  // BT-35: a new bet can be rung 1 of a new ladder, with an optional goal (rungs or an amount)
  // BT-36: "Start this ladder" in the Ladder sim opens the form with the ladder ticked and the plan's goal
  const ladderStart = req?.mode === 'new' ? req.ladder : undefined;
  const [ladderOn, setLadderOn] = useState(!!ladderStart);
  const [goalRungs, setGoalRungs] = useState(ladderStart?.goalRungs != null ? String(ladderStart.goalRungs) : '');
  const [goalAmount, setGoalAmount] = useState(ladderStart?.goalAmount != null ? String(ladderStart.goalAmount) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const stakeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    stakeRef.current?.focus();
    stakeRef.current?.select();
  }, []);

  const set = <K extends keyof BetForm>(k: K, v: BetForm[K]) => setF((x) => ({ ...x, [k]: v }));
  // a combination's total odds follow its legs (multiplied, "estimated") until the book's price is typed over them
  // (the book's price: typed while every leg has odds; a saved bet whose total differs from its legs keeps its own)
  const [oddsOverride, setOddsOverride] = useState(() => overridesLegs(f.odds, f.legs));
  const setLegs = (fn: (legs: LegForm[]) => LegForm[]) => setF((x) => withLegs(x, fn(x.legs), oddsOverride));
  const setTotalOdds = (v: string) => {
    setOddsOverride(overridesLegs(v, f.legs));
    set('odds', v);
  };
  const setLeg = (i: number, patch: Partial<LegForm>) => setLegs((legs) => legs.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async (another: boolean) => {
    if (saving) return;
    const v = formToBet(f, undefined, units.unitSizes);
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      // the form has no dutch, rollover or ladder field: the edited bet keeps them (editPatch)
      if (editing) await update(editing.id, editPatch(editing, v.value, units.unitSizes), {});
      else if (rollover) {
        const input = { ...v.value, stake: rollover.stake, money: rollover.money, rolloverId: rollover.rolloverId, banked: false, ladder: rollover.ladder ?? null };
        // the rollover records its own undo step ("Rung added")
        if (rollover.onSaved) rollover.onSaved(await create(input, false));
        else await create(input);
      }
      else if (ladderOn) {
        const gr = goalRungs.trim() ? Math.round(parseNumber(goalRungs) ?? NaN) : null;
        const ga = goalAmount.trim() ? parseNumber(goalAmount) : null;
        if ((gr != null && !(gr >= 1)) || (goalAmount.trim() && ga == null)) throw new Error('The ladder goal must be a number of rungs or an amount');
        await create({ ...v.value, rolloverId: newRolloverId(), banked: false, ladder: { goalRungs: gr, goalAmount: ga, taken: false } });
      } else await create(v.value);
      if (!rollover) notify(editing ? 'Bet updated' : 'Bet saved');
      if (another && !editing && !rollover) {
        setF(nextForm(f));
        setOddsOverride(false);
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

  // BT-38: "1,5u" is units: the money it makes is shown over the field's right end, never moving the form
  const typed = readStake(f.stake, f.money, units.unitSizes);
  const stake = typed?.ok ? typed.amount : null;
  const unitHint = typed && (!typed.ok ? { ok: false, text: typed.error } : typed.units != null ? { ok: true, text: previewText(typed.units, typed.amount, typed.money, formatMoney) } : null);
  const odds = oddsFromText(f.odds);
  const legsEstimate = f.type === 'combination' ? legsOdds(f.legs) : null;
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
        aria-label={editing ? 'Edit bet' : rollover ? (rollover.ladder ? 'Add ladder rung' : 'Add rollover leg') : 'New bet'}
        className="card w-full max-w-3xl space-y-4 p-5"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{editing ? 'Edit bet' : rollover ? (rollover.ladder ? 'Add ladder rung' : 'Add rollover leg') : 'New bet'}</h2>
          <span className="text-xs text-zinc-500">Enter saves · Ctrl+Shift+Enter saves and adds another · Esc closes</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <L label={`Stake (${MONEY_SYMBOL[f.money]}) *`}>
            <span className="relative flex flex-col">
              <input ref={stakeRef} className="field" inputMode="decimal" value={f.stake} readOnly={!!rollover} title={rollover ? 'The banked payout: the whole of it rolls on' : 'An amount, or units: "1u", "0,5u"'} onChange={(e) => set('stake', e.target.value)} aria-label="Stake" />
              {unitHint && (
                <span className={`pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 truncate rounded bg-zinc-900 px-1 text-[11px] tabular-nums ${unitHint.ok ? 'text-sky-300' : 'text-amber-300'}`} style={{ maxWidth: '90%' }} title={unitHint.text} data-testid="unit-preview">
                  {unitHint.text}
                </span>
              )}
            </span>
          </L>
          <L label="Total odds *">
            <span className="relative flex flex-col">
              <OddsInput value={f.odds} onChange={setTotalOdds} placeholder="2.10, -114, 5/2" aria-label="Odds" />
              {legsEstimate != null &&
                (!oddsOverride && oddsFromText(f.odds) === legsEstimate ? (
                  <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-zinc-900 px-1 text-[11px] text-amber-300" title="The legs' odds multiplied. Type the book's real price over it." data-testid="total-odds-estimated">
                    estimated
                  </span>
                ) : (
                  <button type="button" tabIndex={-1} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-zinc-900 px-1 text-[11px] text-zinc-400 hover:text-white" title="Use the legs' odds multiplied" onClick={() => setTotalOdds(String(legsEstimate))} data-testid="total-odds-use-legs">
                    legs {formatOdds(legsEstimate, 2)}
                  </button>
                ))}
            </span>
            {rollover?.shot && <WhatIfPreview shot={rollover.shot} odds={f.odds} money={rollover.money} unitSize={rollover.shot.unitSize} />}
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
            {rollover.ladder ? (
              <>Ladder: the whole payout, {formatMoney(rollover.stake, rollover.money)}, goes on this rung.</>
            ) : (
              <>Rollover: the whole banked payout, {formatMoney(rollover.stake, rollover.money)}, goes on this bet. Its odds multiply the shot&apos;s.</>
            )}
          </p>
        )}

        {!editing && !rollover && (
          <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="ladder-option">
            <label className="flex items-center gap-1.5 text-zinc-300" title="Rung 1 of a new ladder: each win puts the whole payout on the next rung, until a rung loses or you take the money">
              <input type="checkbox" checked={ladderOn} onChange={(e) => setLadderOn(e.target.checked)} aria-label="Ladder" />
              Ladder
            </label>
            {ladderOn && (
              <>
                <span className="text-xs text-zinc-500">goal (optional):</span>
                <input className="field w-20 py-0.5 text-xs" inputMode="numeric" placeholder="rungs" value={goalRungs} onChange={(e) => setGoalRungs(e.target.value)} aria-label="Goal rungs" />
                <span className="text-xs text-zinc-500">or</span>
                <input className="field w-28 py-0.5 text-xs" inputMode="decimal" placeholder={`${MONEY_SYMBOL[f.money]} amount`} value={goalAmount} onChange={(e) => setGoalAmount(e.target.value)} aria-label="Goal amount" />
              </>
            )}
          </div>
        )}

        <label className="flex w-fit items-center gap-1.5 text-sm text-zinc-300" title="Marks the bet as a no brainer: its bet cell is highlighted in the table (X on a selected row)">
          <input type="checkbox" checked={f.noBrainer} onChange={(e) => set('noBrainer', e.target.checked)} aria-label="No brainer" />
          No brainer
        </label>

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
              <button type="button" className="btn text-xs" onClick={() => setLegs((legs) => [...legs, emptyLeg(lastSport)])}>
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
                <button type="button" className="btn mb-0.5 text-xs" aria-label={`Remove leg ${i + 1}`} onClick={() => setLegs((legs) => legs.filter((_, j) => j !== i))}>
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

        {/* BT-52: the three notes, as in the table */}
        <div className="grid gap-3 md:grid-cols-3">
          <L label="Pre">
            <textarea className="field min-h-20" value={f.preAnalysis} onChange={(e) => set('preAnalysis', e.target.value)} placeholder="Why this bet" aria-label="Pre note" />
          </L>
          <L label="Live">
            <textarea className="field min-h-20" value={f.liveAnalysis} onChange={(e) => set('liveAnalysis', e.target.value)} placeholder="During the game" aria-label="Live note" />
          </L>
          <L label="Post">
            <textarea className="field min-h-20" value={f.postAnalysis} onChange={(e) => set('postAnalysis', e.target.value)} placeholder="What happened" aria-label="Post note" />
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
