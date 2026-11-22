'use client';

import { useState, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { Autocomplete } from '@/components/Autocomplete';
import { BetTable } from '@/components/BetTable';
import { DateField } from '@/components/BetFormModal';
import { DataTransfer } from '@/components/DataTransfer';
import { parseDateInput } from '@/lib/dates';
import { filterBets, NO_FILTERS, type Filters } from '@/lib/filters';
import { formatBRL } from '@/lib/money';
import { formatPercent, summarize } from '@/lib/stats';
import { RESULT_LABEL, RESULTS } from '@/lib/types';

export default function HistoryPage() {
  const { bets, loaded, suggestFor } = useApp();
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((x) => ({ ...x, [k]: v }));

  const filters = { ...f, from: parseDateInput(fromText) ?? '', to: parseDateInput(toText) ?? '' };
  const shown = filterBets(bets, filters);
  const s = summarize(shown);
  const active = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || fromText || toText;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">History</h1>
        <DataTransfer />
      </div>
      <div className="card grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-9">
        <F label="From (bet date)">
          <DateField value={fromText} onChange={setFromText} aria-label="From date" />
        </F>
        <F label="To">
          <DateField value={toText} onChange={setToText} aria-label="To date" />
        </F>
        <F label="Book">
          <Autocomplete value={f.book} onChange={(v) => set('book', v)} getSuggestions={(q) => suggestFor('book', q)} aria-label="Filter book" />
        </F>
        <F label="Sport">
          <Autocomplete value={f.sport} onChange={(v) => set('sport', v)} getSuggestions={(q) => suggestFor('sport', q)} aria-label="Filter sport" />
        </F>
        <F label="Type">
          <select className="field" value={f.type} onChange={(e) => set('type', e.target.value as Filters['type'])} aria-label="Filter type">
            <option value="">All</option>
            <option value="solo">Solo</option>
            <option value="combination">Combination</option>
          </select>
        </F>
        <F label="Situation">
          <select className="field" value={f.situation} onChange={(e) => set('situation', e.target.value as Filters['situation'])} aria-label="Filter situation">
            <option value="">All</option>
            <option value="pregame">Pregame</option>
            <option value="live">Live</option>
          </select>
        </F>
        <F label="Result">
          <select className="field" value={f.result} onChange={(e) => set('result', e.target.value as Filters['result'])} aria-label="Filter result">
            <option value="">All</option>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </F>
        <F label="Search">
          <input className="field" value={f.text} onChange={(e) => set('text', e.target.value)} placeholder="bet, game, selection" aria-label="Search bets" />
        </F>
        <div className="flex items-end">
          <button
            className="btn w-full justify-center"
            disabled={!active}
            onClick={() => {
              setF(NO_FILTERS);
              setFromText('');
              setToText('');
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-400" data-testid="history-summary">
        {shown.length} of {bets.length} bets · net <span className={s.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}>{formatBRL(s.netProfit, true)}</span> · ROI {formatPercent(s.roi, true)} · win rate {formatPercent(s.winRate)} ({s.wins}W/{s.losses}L)
      </p>

      <section className="card p-4">{loaded ? <BetTable bets={shown} empty={bets.length ? 'No bets match these filters.' : undefined} /> : <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}</section>
    </div>
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
