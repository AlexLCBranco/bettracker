'use client';

import { useMemo, useRef, useState } from 'react';
import { normalize } from '@/lib/autocomplete';
import { emptyLeg, formToBet, newForm } from '@/lib/form';
import { formatMoney, formatOdds } from '@/lib/money';
import { parseQuickAdd, quickAddLegs, splitQuickAddText } from '@/lib/quickadd';
import { previewText, unitsToMoney } from '@/lib/units';
import { newRolloverId } from '@/lib/rollover';
import { isUndoKey } from '@/lib/undo';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';

/** One line, e.g. "150 @2.10 lakers ml" + Enter: saved as pending with the last-used defaults. */
export function QuickAdd() {
  const { bets, suggestFor, defaults, create, openNew, notify, undo, units } = useApp();
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Empty line: recent whole lines (stake @odds text) to repeat a bet. Typing: the text part is completed from past bet texts.
  const recentLines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of [...bets].sort((a, c) => (a.createdAt < c.createdAt ? 1 : -1))) {
      const l = `${b.money === 'hypothetical' ? 'H$' : b.money === 'bonus' ? 'B$' : ''}${b.stake} @${formatOdds(b.odds)} ${b.betText}`.trim();
      if (!seen.has(normalize(l))) {
        seen.add(normalize(l));
        out.push(l);
      }
      if (out.length >= 8) break;
    }
    return out;
  }, [bets]);

  // BT-38: a stake typed in units ("1,5u") shows what it is in money before Enter, or why it cannot be read
  const unitPreview = useMemo(() => {
    const p = parseQuickAdd(line);
    if (!p.units || p.stake == null) return null;
    const money = p.money ?? defaults.money;
    const r = unitsToMoney(p.stake, money, units.unitSizes);
    return r.ok ? { ok: true as const, text: previewText(p.stake, r.amount, money, formatMoney) } : { ok: false as const, text: r.error };
  }, [line, defaults.money, units.unitSizes]);

  const submit = async () => {
    const text = line.trim();
    if (!text || busy) return;
    const parsed = parseQuickAdd(text);
    let p = parsed;
    if (parsed.units && parsed.stake != null) {
      const r = unitsToMoney(parsed.stake, parsed.money ?? defaults.money, units.unitSizes);
      // no unit size for that money type: nothing is saved, the line stays
      if (!r.ok) return notify(r.error, 'error');
      p = { ...parsed, stake: r.amount };
    }
    const legs = quickAddLegs(p.betText);
    const base = {
      ...newForm(defaults),
      ...(p.money ? { money: p.money } : {}),
      // BT-17: a solo, or a combination with its legs; never a combination without legs (the last-used type)
      type: legs ? ('combination' as const) : ('solo' as const),
      legs: legs ? legs.map((selection) => ({ ...emptyLeg(defaults.sport), selection })) : [],
    };
    if (!p.ok) {
      openNew({ type: base.type, legs: base.legs, stake: p.stake != null ? String(p.stake) : '', odds: p.odds != null ? String(p.odds) : '', betText: p.betText, ...(p.money ? { money: p.money } : {}) });
      notify(`${p.reason}: finish the bet in the form`);
      setLine('');
      return;
    }
    const v = formToBet({ ...base, stake: String(p.stake), odds: String(p.odds), betText: p.betText });
    if (!v.ok) {
      openNew({ type: base.type, legs: base.legs, stake: String(p.stake), odds: String(p.odds), betText: p.betText, money: base.money });
      notify(v.error, 'error');
      return;
    }
    setBusy(true);
    try {
      // BT-35: "ladder" on the line: rung 1 of a new ladder
      await create(p.ladder ? { ...v.value, rolloverId: newRolloverId(), ladder: { ...p.ladder, taken: false } } : v.value);
      setLine('');
      notify(`Saved: ${formatMoney(p.stake, v.value.money)} @${formatOdds(p.odds)} ${p.betText}`.trim());
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(false);
      ref.current?.focus();
    }
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div
        className="relative flex-1"
        // the box is empty after a bet is added: Ctrl+Z there undoes that bet (with text in it, it undoes typing)
        onKeyDownCapture={(e) => {
          if (!line && isUndoKey(e.nativeEvent)) {
            e.preventDefault();
            e.stopPropagation();
            undo();
          }
        }}
      >
        <Autocomplete
          ref={ref}
          value={line}
          onChange={setLine}
          getSuggestions={(q) => (line.trim() ? (q.trim() ? suggestFor('betText', q) : []) : recentLines)}
          toQuery={(v) => splitQuickAddText(v).text}
          applySuggestion={(v, s) => (v.trim() ? splitQuickAddText(v).prefix + s : s)}
          placeholder="Quick add: 150 @2.10 lakers ml"
          title='Quick add: "150 @2.10 lakers ml" then Enter. "1u" = 1 unit (unit sizes on the Bankroll page). "B$150" = bonus money, "H$150" = hypothetical, "R$150" = real. "ladder" (or "ladder:5" rungs, "ladder:R$1600" amount) starts a ladder.'
          aria-label="Quick add"
          data-testid="quick-add"
          className="field w-full"
        />
        {unitPreview && (
          <span
            className={`pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded bg-zinc-900 px-1.5 text-[11px] tabular-nums ${unitPreview.ok ? 'text-sky-300' : 'text-amber-300'}`}
            data-testid="unit-preview"
          >
            {unitPreview.text}
          </span>
        )}
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Add
      </button>
      <button type="button" className="btn" onClick={() => openNew()} title="Full form (N)">
        Full form
      </button>
    </form>
  );
}
