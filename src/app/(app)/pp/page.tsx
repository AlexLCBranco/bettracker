'use client';

// BT-30: the PP page. Batches newest first, one row each; "New batch" starts one. Click a row to open it.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { Autocomplete } from '@/components/Autocomplete';
import { DateField } from '@/components/BetFormModal';
import { MoneySelect } from '@/components/Money';
import { MONEY_TEXT } from '@/components/moneyStyle';
import { formatDate, parseDateInput, todayISO } from '@/lib/dates';
import { formatMoney, formatOdds, parseNumber, profitMoney } from '@/lib/money';
import { batchSummary, DEFAULT_TARGET, DEFAULT_TIERS, defaultBatchName } from '@/lib/pp';
import type { Money } from '@/lib/types';

const LAST_MONEY = 'bettracker:pp-money';

export default function PPPage() {
  const { batches, loaded } = useApp();
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => batches.map((b) => ({ b, s: batchSummary(b) })), [batches]);
  if (!loaded) return <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">PP</h1>
          <p className="text-sm text-zinc-400">Batches of PPs built from one pool of legs. Settle each leg once; every PP follows. PPs never count in the Bets or Analytics totals.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          New batch
        </button>
      </div>
      {creating && <NewBatch onClose={() => setCreating(false)} />}
      <section className="card overflow-x-auto">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No batches yet. Start one with “New batch”.</p>
        ) : (
          <table className="w-full text-sm" data-testid="batches">
            <thead>
              <tr className="text-left text-[11px] text-zinc-500">
                <th className="px-3 py-2 font-medium">Batch</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium" title="Tickets won / alive / dead">Won / alive / dead</th>
                <th className="px-3 py-2 text-right font-medium">One leg away</th>
                <th className="px-3 py-2 text-right font-medium">Staked</th>
                <th className="px-3 py-2 text-right font-medium">Returned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ b, s }) => (
                <tr key={b.id} className="border-t border-zinc-900 hover:bg-zinc-900/50" data-testid="batch-row" data-batch-id={b.id}>
                  <td className="px-3 py-1.5">
                    <Link href={`/pp/${b.id}`} className="font-semibold text-zinc-100 hover:underline [overflow-wrap:anywhere]">
                      {b.name}
                    </Link>
                    <div className="text-[11px] text-zinc-500">
                      {s.tickets} PPs · {b.legs.length} legs · {b.book || 'no book'} · <span className={MONEY_TEXT[b.money]}>{formatMoney(b.stake, b.money)}</span> each · target {formatOdds(b.targetOdds, 2)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatDate(b.placedDate)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums" data-testid="batch-counts">
                    <span className="text-emerald-400">{s.won}</span> / <span className="text-zinc-200">{s.alive}</span> / <span className="text-red-400">{s.dead}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-amber-300">{s.oneAway || ''}</td>
                  <td className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${MONEY_TEXT[b.money]}`}>{formatMoney(s.staked, b.money)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums" data-testid="batch-returned">
                    {formatMoney(s.returned, profitMoney(b.money))}
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

/** A new batch: name, date, book, stake per ticket, target odds, money. It opens in edit mode to add legs. */
function NewBatch({ onClose }: { onClose(): void }) {
  const { saveBatch, suggestFor, defaults } = useApp();
  const router = useRouter();
  const today = todayISO();
  const [name, setName] = useState('');
  const [date, setDate] = useState(formatDate(today));
  const [book, setBook] = useState(defaults.book ?? '');
  const [stake, setStake] = useState('');
  const [target, setTarget] = useState(String(DEFAULT_TARGET));
  // PPs are mainly placed with bonus money
  const [money, setMoney] = useState<Money>(() => {
    const m = typeof window === 'undefined' ? null : localStorage.getItem(LAST_MONEY);
    return m === 'real' || m === 'hypothetical' || m === 'bonus' ? m : 'bonus';
  });
  const [error, setError] = useState('');
  const create = async () => {
    const d = parseDateInput(date);
    const s = parseNumber(stake);
    const t = parseNumber(target);
    if (!d) return setError('Date must be dd/mm/yyyy');
    if (s == null || s <= 0) return setError('Stake per ticket must be above 0');
    if (t == null || t <= 1) return setError('Target odds must be above 1');
    try {
      localStorage.setItem(LAST_MONEY, money);
      const b = await saveBatch({ name: name.trim() || defaultBatchName(d), placedDate: d, book: book.trim(), stake: s, targetOdds: t, money, scheme: null, notes: '', tiers: DEFAULT_TIERS, legs: [], tickets: [] });
      router.push(`/pp/${b.id}?edit=1`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form
      className="card grid grid-cols-2 items-end gap-3 p-4 md:grid-cols-7"
      aria-label="New batch"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <F label="Name">
        <input className="field" value={name} placeholder={defaultBatchName(parseDateInput(date) ?? today)} onChange={(e) => setName(e.target.value)} aria-label="Batch name" />
      </F>
      <F label="Placed date">
        <DateField value={date} onChange={setDate} aria-label="Placed date" />
      </F>
      <F label="Book">
        <Autocomplete value={book} onChange={setBook} getSuggestions={(q) => suggestFor('book', q)} aria-label="Book" />
      </F>
      <F label="Stake per PP *">
        <input className="field" inputMode="decimal" autoFocus value={stake} onChange={(e) => setStake(e.target.value)} aria-label="Stake per PP" />
      </F>
      <F label="Target odds">
        <input className="field" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target odds" />
      </F>
      <F label="Money">
        <MoneySelect value={money} onChange={setMoney} />
      </F>
      <div className="flex gap-2">
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Create
        </button>
      </div>
      {error && (
        <p role="alert" className="col-span-full text-sm text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
