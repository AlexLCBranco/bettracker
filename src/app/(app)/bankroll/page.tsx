'use client';

// BT-33: every money entry, newest first, filtered by type and book; each can be edited or deleted (Undo / Z).

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/components/AppProvider';
import { Autocomplete } from '@/components/Autocomplete';
import { MONEY_TEXT } from '@/components/moneyStyle';
import { isTyping, isUndoKey } from '@/components/Shell';
import { normalize } from '@/lib/autocomplete';
import { MONEY_LABEL, type MoneyEntry } from '@/lib/bankroll';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { MONEY, type Money } from '@/lib/types';

export default function BankrollPage() {
  const { entries, loaded, openMoney, removeEntry, suggestFor, notify, form, dutchForm, moneyForm } = useApp();
  const [type, setType] = useState<Money | ''>('');
  const [book, setBook] = useState('');
  const [undo, setUndo] = useState<{ restore: () => Promise<void>; label: string } | null>(null);
  const shown = useMemo(() => entries.filter((e) => (!type || e.money === type) && (!book.trim() || normalize(e.book) === normalize(book))), [entries, type, book]);

  const del = async (e: MoneyEntry) => {
    const restore = await removeEntry(e).catch(() => null);
    if (!restore) return;
    const label = `${e.direction === 'in' ? 'Inserted' : 'Taken out'} ${formatMoney(e.amount, e.money)}`;
    setUndo({ restore, label });
    notify(`Deleted: ${label} (Z undoes)`);
  };
  const doUndo = async () => {
    if (!undo) return;
    setUndo(null);
    await undo.restore().catch((err: Error) => notify(err.message, 'error'));
    notify('Undone');
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (form || dutchForm || moneyForm || isTyping(e)) return;
      if (isUndoKey(e) || (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'z' || e.key === 'Z'))) {
        e.preventDefault();
        void doUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!loaded) return <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bankroll</h1>
          <p className="text-sm text-zinc-400">Money inserted and taken out. Balances are in the top bar (click it for each book).</p>
        </div>
        <button className="btn btn-primary" onClick={() => openMoney()} title="Insert money (M)">
          Insert money
        </button>
      </div>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-zinc-500">Type</span>
          <select className="field w-36" value={type} onChange={(e) => setType(e.target.value as Money | '')} aria-label="Filter type">
            <option value="">All</option>
            {MONEY.map((m) => (
              <option key={m} value={m}>
                {MONEY_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-56 flex-col gap-0.5">
          <span className="text-[11px] text-zinc-500">Book</span>
          <Autocomplete value={book} onChange={setBook} getSuggestions={(q) => suggestFor('book', q)} aria-label="Filter book" />
        </label>
        {undo && (
          <button className="btn ml-auto text-amber-300" onClick={() => void doUndo()} title="Put the deleted entry back (Z)">
            Undo delete
          </button>
        )}
      </div>
      <section className="card overflow-x-auto">
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">{entries.length ? 'No entries match.' : 'No money entered yet. Insert money to start the bankroll.'}</p>
        ) : (
          <table className="w-full text-sm" data-testid="entries">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Book</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Expires</th>
                <th className="px-3 py-2 font-medium">Note</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} className="border-t border-zinc-900 hover:bg-zinc-900/50" data-testid="entry-row" data-entry-id={e.id}>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatDate(e.date)}</td>
                  <td className={`px-3 py-1.5 ${MONEY_TEXT[e.money]}`}>{MONEY_LABEL[e.money]}</td>
                  <td className="px-3 py-1.5">{e.book || <span className="text-zinc-600">-</span>}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums ${e.direction === 'out' ? 'text-red-400' : 'text-emerald-400'}`} data-testid="entry-amount">
                    {e.direction === 'out' ? '−' : '+'}
                    {formatMoney(e.amount, e.money)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-zinc-400">{e.expiry ? formatDate(e.expiry) : ''}</td>
                  <td className="px-3 py-1.5 text-zinc-400 [overflow-wrap:anywhere]">{e.note}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Edit entry" title="Edit" onClick={() => openMoney({ edit: e })}>
                      ✎
                    </button>
                    <button className="rounded px-1.5 py-0.5 text-xs text-red-300 hover:bg-zinc-800" aria-label="Delete entry" title="Delete (Z undoes)" onClick={() => void del(e)}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
