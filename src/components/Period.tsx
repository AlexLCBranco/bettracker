'use client';

// BT-56: the period switch and its remembered choice, one for the Bets page and Analytics (BT-63).

import { useSyncExternalStore } from 'react';
import { DEFAULT_PERIOD, isPeriod, PERIOD_LABEL, PERIOD_TITLE, PERIODS, type Period } from '@/lib/period';

const KEY = 'bettracker:period';
const listeners = new Set<() => void>();
const read = (): Period => {
  const v = localStorage.getItem(KEY);
  return isPeriod(v) ? v : DEFAULT_PERIOD;
};

export function usePeriod(): [Period, (p: Period) => void] {
  const p = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULT_PERIOD,
  );
  return [
    p,
    (v) => {
      localStorage.setItem(KEY, v);
      listeners.forEach((l) => l());
    },
  ];
}

/** Today / 7d / 30d / Month / All; "Custom" lights up (not clickable) while typed From / To dates are in use. */
export function PeriodSwitch({ value, onChange }: { value: Period | 'custom'; onChange(p: Period): void }) {
  return (
    <div role="radiogroup" aria-label="Period" className="inline-flex h-fit rounded-md border border-zinc-700 p-0.5 text-xs" data-testid="period-switch">
      {PERIODS.map((p) => (
        <button
          key={p}
          role="radio"
          aria-checked={value === p}
          title={PERIOD_TITLE[p]}
          className={`rounded px-2.5 py-1 ${value === p ? 'bg-zinc-700 font-semibold text-white' : 'text-zinc-400 hover:text-white'}`}
          onClick={() => onChange(p)}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
      {value === 'custom' && (
        <span role="radio" aria-checked className="rounded bg-zinc-700 px-2.5 py-1 font-semibold text-white" title="Your From / To dates">
          {PERIOD_LABEL.custom}
        </span>
      )}
    </div>
  );
}

/** BT-68: a remembered on / off switch (localStorage), off by default. */
const flagListeners = new Set<() => void>();
export function useStoredFlag(key: string): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      flagListeners.add(cb);
      return () => flagListeners.delete(cb);
    },
    () => localStorage.getItem(key) === '1',
    () => false,
  );
  return [
    on,
    (v) => {
      localStorage.setItem(key, v ? '1' : '0');
      flagListeners.forEach((l) => l());
    },
  ];
}
