'use client';

// BT-33: the bankroll in the top bar, the insert / take out money form, and the balance hint on the bet form.

import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { balanceOf, bookConversion, MONEY_LABEL, type BookBalance, type EntryInput, type TypeBalance } from '@/lib/bankroll';
import { formatDate, formatDayMonth, parseDateInput, todayISO } from '@/lib/dates';
import { formatMoney, parseNumber } from '@/lib/money';
import { formatPercent } from '@/lib/stats';
import { MONEY, type Money } from '@/lib/types';
import { useApp } from './AppProvider';
import { Autocomplete } from './Autocomplete';
import { DateField } from './BetFormModal';
import { MONEY_TEXT } from './moneyStyle';

const LAST_TYPE = 'bettracker:insert-money-type';

/** The three figures in the top bar: R$, Bonus, H$, each across books, with the amount in pending bets under it. */
export function BankrollBar() {
  const { bankroll, loaded, openMoney } = useApp();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!loaded) return null;
  return (
    <div ref={box} className="relative">
      <button
        className="flex items-center gap-3 rounded-md border border-zinc-800 px-2 py-0.5 text-left hover:border-zinc-600"
        aria-label="Bankroll"
        aria-expanded={open}
        title="Bankroll: what you have now, per money type (click for books)"
        onClick={() => setOpen((o) => !o)}
        data-testid="bankroll"
      >
        {MONEY.map((m) => (
          <Figure key={m} t={bankroll[m]} />
        ))}
      </button>
      {open && (
        <div role="dialog" aria-label="Bankroll by book" className="absolute right-0 top-full z-40 mt-1 w-[460px] rounded-md border border-zinc-700 bg-zinc-900 p-3 text-xs shadow-xl" data-testid="bankroll-panel">
          <Breakdown />
          <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
            <Link href="/bankroll" className="text-zinc-400 hover:text-white" onClick={() => setOpen(false)}>
              All entries →
            </Link>
            <button
              className="btn btn-primary text-xs"
              onClick={() => {
                setOpen(false);
                openMoney();
              }}
              title="Insert money (M)"
            >
              Insert money
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SHORT: Record<Money, string> = { real: 'R$', bonus: 'Bonus', hypothetical: 'H$' };

function Figure({ t }: { t: TypeBalance }) {
  return (
    <span className="flex flex-col leading-tight" data-testid={`bankroll-${t.money}`}>
      <span className="text-[10px] text-zinc-500">{SHORT[t.money]}</span>
      <span className={`whitespace-nowrap text-xs font-semibold tabular-nums ${t.total == null ? 'text-zinc-500' : MONEY_TEXT[t.money] || (t.total < 0 ? 'text-red-400' : 'text-zinc-100')}`} data-testid={`bankroll-${t.money}-total`}>
        {t.total == null ? '-' : formatMoney(t.total, t.money)}
      </span>
      {t.pending > 0 && (
        <span className="whitespace-nowrap text-[10px] tabular-nums text-zinc-500" data-testid={`bankroll-${t.money}-pending`} title="In pending bets">
          {formatMoney(t.pending, t.money)} pending
        </span>
      )}
    </span>
  );
}

/** Per type and book: balance, pending, nearest bonus expiry, expired unused, bonus converted; books needing a start. */
function Breakdown() {
  const { bankroll, bets, openMoney } = useApp();
  return (
    <div className="space-y-3">
      {MONEY.map((m) => {
        const t = bankroll[m];
        return (
          <section key={m} data-testid={`bankroll-books-${m}`}>
            <h3 className={`mb-1 font-semibold ${MONEY_TEXT[m] || 'text-zinc-200'}`}>
              {MONEY_LABEL[m]} {t.total != null && <span className="font-normal tabular-nums">· {formatMoney(t.total, m)}</span>}
              {m === 'bonus' && t.converted?.rate != null && (
                <span className="ml-2 font-normal text-zinc-400" data-testid="bonus-converted" title="Real money won from bonus / bonus spent">
                  converted {formatPercent(t.converted.rate)}
                </span>
              )}
            </h3>
            {t.books.length === 0 && t.missing.length === 0 && <p className="text-zinc-500">No {MONEY_LABEL[m].toLowerCase()} money yet.</p>}
            <ul className="space-y-0.5">
              {t.books.map((b) => (
                <BookLine key={b.book} b={b} conv={m === 'bonus' ? bookConversion(bets, b.book).rate : null} />
              ))}
              {t.missing.map((book) => (
                <li key={book} className="flex items-center justify-between gap-2 text-zinc-500" data-testid="missing-start">
                  <span>{book || 'no book'}: -</span>
                  <button className="text-emerald-400 hover:underline" onClick={() => openMoney({ prefill: { money: m, book } })}>
                    set starting balance
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function BookLine({ b, conv }: { b: BookBalance; conv: number | null }) {
  return (
    <li className="text-zinc-300" data-testid="bankroll-book">
      <div className="flex items-baseline justify-between gap-2">
        <span>{b.book || 'All books'}</span>
        <span className="tabular-nums">
          <span className={b.balance < 0 ? 'text-red-400' : 'text-zinc-100'}>{formatMoney(b.balance, b.money)}</span>
          {b.pending > 0 && <span className="ml-1.5 text-zinc-500">({formatMoney(b.pending, b.money)} pending)</span>}
        </span>
      </div>
      {(b.nextExpiry || b.expired.length > 0 || conv != null) && (
        <div className="pl-3 text-[11px] text-zinc-500">
          {b.nextExpiry && (
            <span data-testid="next-expiry">
              {formatMoney(b.nextExpiry.amount, 'bonus')} expires {formatDayMonth(b.nextExpiry.date)}
            </span>
          )}
          {b.expired.map((x) => (
            <span key={x.entryId} className="ml-2 text-amber-400/80" data-testid="expired-unused">
              {formatMoney(x.amount, 'bonus')} expired unused ({formatDate(x.expiry)})
            </span>
          ))}
          {conv != null && <span className="ml-2">converted {formatPercent(conv)}</span>}
        </div>
      )}
    </li>
  );
}

/** Under the stake: "Balance Bet365 R$ 500,00 · left after this bet R$ 450,00", a warning when the stake is more. */
export function BalanceHint({ money, book, stake }: { money: Money; book: string; stake: number }) {
  const { bankroll } = useApp();
  const bal = balanceOf(bankroll, money, book);
  if (bal == null) return null;
  const left = Math.round((bal - stake) * 100) / 100;
  const over = stake > 0 && stake > bal;
  return (
    <p className={`text-xs ${over ? 'text-amber-300' : 'text-zinc-400'}`} data-testid="balance-hint">
      {over && '⚠ '}
      {MONEY_LABEL[money]} balance{book ? ` at ${book}` : ''}: <span className="tabular-nums">{formatMoney(bal, money)}</span>
      {stake > 0 && (
        <>
          {' · '}left after this bet: <span className="tabular-nums">{formatMoney(left, money)}</span>
        </>
      )}
      {over && ' · the stake is more than the balance'}
    </p>
  );
}

/** The insert / take out money form (one form for every type), opened from the bankroll or with M. */
export function MoneyFormModal() {
  const { moneyForm } = useApp();
  if (!moneyForm) return null;
  return <MoneyForm key={moneyForm.key} />;
}

function MoneyForm() {
  const { moneyForm, saveEntry, closeMoney, suggestFor, notify } = useApp();
  const edit = moneyForm?.edit;
  const pre = moneyForm?.prefill ?? {};
  const [money, setMoney] = useState<Money>(() => edit?.money ?? pre.money ?? (MONEY.find((m) => m === localStorage.getItem(LAST_TYPE)) || 'real'));
  const [direction, setDirection] = useState(edit?.direction ?? pre.direction ?? 'in');
  const [amount, setAmount] = useState(edit ? String(edit.amount) : '');
  const [book, setBook] = useState(edit?.book ?? pre.book ?? '');
  const [date, setDate] = useState(formatDate(edit?.date ?? todayISO()));
  const [note, setNote] = useState(edit?.note ?? '');
  const [expiry, setExpiry] = useState(edit?.expiry ? formatDate(edit.expiry) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => amountRef.current?.focus(), []);

  const save = async (another: boolean) => {
    if (saving) return;
    const a = parseNumber(amount);
    if (a == null || a <= 0) return setError('Amount must be a number above 0');
    const d = parseDateInput(date);
    if (!d) return setError('Date must be dd/mm/yyyy');
    const x = expiry.trim() ? parseDateInput(expiry) : null;
    if (expiry.trim() && !x) return setError('Expiry must be dd/mm/yyyy');
    const input: EntryInput = { money, direction, amount: a, book: book.trim(), date: d, note: note.trim(), expiry: money === 'bonus' && direction === 'in' ? x : null };
    setSaving(true);
    setError('');
    try {
      await saveEntry(input, edit?.id);
      localStorage.setItem(LAST_TYPE, money);
      notify(`${direction === 'in' ? 'Inserted' : 'Taken out'}: ${formatMoney(a, money)}${input.book ? ` at ${input.book}` : ''}`);
      if (another && !edit) {
        setAmount('');
        setNote('');
        setExpiry('');
        amountRef.current?.focus();
      } else closeMoney();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMoney();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void save(e.shiftKey);
    }
  };
  const title = edit ? 'Edit money entry' : direction === 'in' ? 'Insert money' : 'Take out money';

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16" onMouseDown={(e) => e.target === e.currentTarget && closeMoney()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card w-full max-w-lg space-y-4 p-5"
        onKeyDown={onKeyDown}
        onSubmit={(e) => {
          e.preventDefault();
          void save(false);
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          {/* taking money out was not asked for by the owner: added because a bankroll is wrong without it */}
          <label className="flex items-center gap-1.5 text-xs text-zinc-400" title="A withdrawal, or a correction">
            <input type="checkbox" checked={direction === 'out'} onChange={(e) => setDirection(e.target.checked ? 'out' : 'in')} aria-label="Take out" />
            Take out
          </label>
        </div>
        <div role="radiogroup" aria-label="Money type" className="inline-flex rounded-md border border-zinc-700 p-0.5 text-sm">
          {MONEY.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={money === m}
              className={`rounded px-3 py-1 ${money === m ? (m === 'hypothetical' ? 'bg-violet-500/25 text-violet-200' : m === 'bonus' ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-white') : 'text-zinc-400 hover:text-white'}`}
              onClick={() => setMoney(m)}
            >
              {MONEY_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <L label="Amount *">
            <input ref={amountRef} className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          </L>
          <L label={money === 'hypothetical' ? 'Book (optional)' : 'Book *'}>
            <Autocomplete value={book} onChange={setBook} getSuggestions={(q) => suggestFor('book', q)} aria-label="Book" />
          </L>
          <L label="Date">
            <DateField value={date} onChange={setDate} aria-label="Date" />
          </L>
          {money === 'bonus' && direction === 'in' && (
            <L label="Expires (optional)">
              <DateField value={expiry} onChange={setExpiry} aria-label="Expiry" />
            </L>
          )}
        </div>
        <L label="Note">
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="deposit, welcome bonus, correction" aria-label="Note" />
        </L>
        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={closeMoney}>
            Cancel
          </button>
          {!edit && (
            <button type="button" className="btn" disabled={saving} onClick={() => void save(true)}>
              Save and add another
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {edit ? 'Save changes' : 'Save'}
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
