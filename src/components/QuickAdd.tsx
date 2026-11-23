'use client';

import { useMemo, useRef, useState } from 'react';
import { normalize } from '@/lib/autocomplete';
import { emptyLeg, formToBet, newForm } from '@/lib/form';
import { formatMoney, formatOdds } from '@/lib/money';
import { parseQuickAdd, quickAddLegs, splitQuickAddText } from '@/lib/quickadd';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';

/** One line, e.g. "150 @2.10 lakers ml" + Enter: saved as pending with the last-used defaults. */
export function QuickAdd() {
  const { bets, suggestFor, defaults, create, openNew, notify } = useApp();
  const [line, setLine] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  // Empty line: recent whole lines (stake @odds text) to repeat a bet. Typing: the text part is completed from past bet texts.
  const recentLines = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const b of [...bets].sort((a, c) => (a.createdAt < c.createdAt ? 1 : -1))) {
      const l = `${b.money === 'hypothetical' ? 'H$' : ''}${b.stake} @${formatOdds(b.odds)} ${b.betText}`.trim();
      if (!seen.has(normalize(l))) {
        seen.add(normalize(l));
        out.push(l);
      }
      if (out.length >= 8) break;
    }
    return out;
  }, [bets]);

  const submit = async () => {
    const text = line.trim();
    if (!text || busy) return;
    const p = parseQuickAdd(text);
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
      await create(v.value);
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
      <div className="flex-1">
        <Autocomplete
          ref={ref}
          value={line}
          onChange={setLine}
          getSuggestions={(q) => (line.trim() ? (q.trim() ? suggestFor('betText', q) : []) : recentLines)}
          toQuery={(v) => splitQuickAddText(v).text}
          applySuggestion={(v, s) => (v.trim() ? splitQuickAddText(v).prefix + s : s)}
          placeholder='Quick add: "150 @2.10 lakers ml" then Enter ("H$150" for hypothetical)'
          aria-label="Quick add"
          data-testid="quick-add"
          className="field w-full"
        />
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
