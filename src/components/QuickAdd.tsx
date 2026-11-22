'use client';

import { useMemo, useRef, useState } from 'react';
import { normalize } from '@/lib/autocomplete';
import { formToBet, newForm } from '@/lib/form';
import { formatBRL, formatOdds } from '@/lib/money';
import { parseQuickAdd, splitQuickAddText } from '@/lib/quickadd';
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
      const l = `${b.stake} @${formatOdds(b.odds)} ${b.betText}`.trim();
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
    const base = newForm(defaults);
    if (!p.ok) {
      openNew({ stake: p.stake != null ? String(p.stake) : '', odds: p.odds != null ? String(p.odds) : '', betText: p.betText });
      notify(`${p.reason}: finish the bet in the form`);
      setLine('');
      return;
    }
    const v = formToBet({ ...base, stake: String(p.stake), odds: String(p.odds), betText: p.betText });
    if (!v.ok) {
      openNew({ stake: String(p.stake), odds: String(p.odds), betText: p.betText });
      notify(v.error, 'error');
      return;
    }
    setBusy(true);
    try {
      await create(v.value);
      setLine('');
      notify(`Saved: ${formatBRL(p.stake)} @${formatOdds(p.odds)} ${p.betText}`.trim());
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
          placeholder='Quick add: "150 @2.10 lakers ml" then Enter'
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
