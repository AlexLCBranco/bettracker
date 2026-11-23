'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { draftToBets, resolvedBooks, type DutchDraft } from '@/lib/dutch';
import { formatBRL, formatOdds } from '@/lib/money';
import { SITUATIONS } from '@/lib/types';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { DateField } from './BetFormModal';

/** Logs a dutch as linked solo bets in one go: shared fields once, a book per selection. */
export function DutchFormModal() {
  const { dutchForm } = useApp();
  if (!dutchForm) return null;
  return <Body key={dutchForm.key} />;
}

function Body() {
  const { dutchForm, defaults, suggestFor, createMany, closeDutch, notify } = useApp();
  const [d, setD] = useState<DutchDraft>(() => dutchForm!.draft);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const set = <K extends keyof DutchDraft>(k: K, v: DutchDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const books = resolvedBooks(d.rows, defaults.book);
  const total = d.rows.reduce((s, r) => s + r.stake, 0);
  const combined = 1 / d.rows.reduce((s, r) => s + 1 / r.odds, 0);

  const save = async () => {
    if (saving) return;
    const v = draftToBets(d, defaults.book, crypto.randomUUID());
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createMany(v.value);
      notify(`Dutch logged: ${v.value.length} bets`);
      closeDutch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
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

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-10" onMouseDown={(e) => e.target === e.currentTarget && closeDutch()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Log dutch"
        className="card w-full max-w-3xl space-y-4 p-5"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Log dutch as bets</h2>
          <span className="text-xs text-zinc-500">Enter saves · Esc closes</span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <L label="Sport">
            <Autocomplete ref={first} value={d.sport} onChange={(v) => set('sport', v)} getSuggestions={(q) => suggestFor('sport', q)} aria-label="Sport" />
          </L>
          <L label="Game">
            <Autocomplete value={d.game} onChange={(v) => set('game', v)} getSuggestions={(q) => suggestFor('game', q, d.sport)} aria-label="Game" />
          </L>
          <L label="Market">
            <Autocomplete value={d.market} onChange={(v) => set('market', v)} getSuggestions={(q) => suggestFor('market', q, d.sport)} aria-label="Market" />
          </L>
          <L label="Placed date">
            <DateField value={d.placedDate} onChange={(v) => set('placedDate', v)} aria-label="Placed date" />
          </L>
          <L label="Game date">
            <DateField value={d.gameDate} onChange={(v) => set('gameDate', v)} aria-label="Game date" />
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
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={i} className="border-b border-zinc-900" data-testid="dutch-log-row">
                <td className="py-2 pr-3 text-zinc-100">{r.selection || `Selection ${i + 1}`}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatOdds(r.odds)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBRL(r.stake)}</td>
                <td className="py-1.5 pl-3">
                  <Autocomplete
                    value={books[i]!}
                    onChange={(v) => setD((x) => ({ ...x, rows: x.rows.map((row, j) => (j === i ? { ...row, book: v } : row)) }))}
                    getSuggestions={(q) => suggestFor('book', q)}
                    aria-label={`Selection ${i + 1} book`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="text-xs text-zinc-400">
              <td className="py-2 pr-3">{d.rows.length} bets · combined odds</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatOdds(combined)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatBRL(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        <p className="text-xs text-zinc-500">Each selection is saved as its own pending bet, linked as one dutch. A book you change is copied to the rows below it until you change those.</p>

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
            Log {d.rows.length} bets
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
