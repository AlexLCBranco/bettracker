'use client';

import { useSyncExternalStore } from 'react';
import type { MoneyScope } from '@/lib/money';
import { isMoneyScope, MONEY_SCOPE_LABEL, MONEY_SCOPES } from '@/lib/scope';
import { MONEY, type Money } from '@/lib/types';
import { MONEY_OPTION_LABEL, MONEY_TITLE } from './moneyStyle';

/** Real (R$), bonus (B$, BT-33) or hypothetical (H$) money for a bet or a dutch (BT-14). */
export function MoneySelect({ value, onChange, className = 'field', disabled }: { value: Money; onChange(m: Money): void; className?: string; disabled?: boolean }) {
  return (
    <select
      className={`${className} ${value === 'hypothetical' ? 'border-violet-500 text-violet-300' : value === 'bonus' ? 'border-amber-500 text-amber-300' : ''}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Money)}
      aria-label="Money"
      title={MONEY_TITLE[value]}
    >
      {MONEY.map((m) => (
        <option key={m} value={m}>
          {MONEY_OPTION_LABEL[m]}
        </option>
      ))}
    </select>
  );
}

const KEY = 'bettracker:money-scope';

/** The Real / Hypothetical / Both switch shared by the dashboard and Analytics; Real by default, remembered. */
const listeners = new Set<() => void>();
const readScope = (): MoneyScope => {
  const saved = localStorage.getItem(KEY);
  return isMoneyScope(saved) ? saved : 'real';
};

export function useMoneyScope(): [MoneyScope, (s: MoneyScope) => void] {
  // the server (and the first client render) shows Real; the saved choice comes from localStorage
  const scope = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    readScope,
    () => 'real' as MoneyScope,
  );
  return [
    scope,
    (s) => {
      localStorage.setItem(KEY, s);
      listeners.forEach((l) => l());
    },
  ];
}

export function MoneyScopeSwitch({ scope, onChange }: { scope: MoneyScope; onChange(s: MoneyScope): void }) {
  return (
    <div role="radiogroup" aria-label="Money shown" className="inline-flex rounded-md border border-zinc-700 p-0.5 text-xs">
      {MONEY_SCOPES.map((s) => (
        <button
          key={s}
          role="radio"
          aria-checked={scope === s}
          className={`rounded px-2.5 py-1 ${scope === s ? (s === 'hypothetical' ? 'bg-violet-500/25 text-violet-200' : s === 'bonus' ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-white') : 'text-zinc-400 hover:text-white'}`}
          onClick={() => onChange(s)}
        >
          {MONEY_SCOPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

// BT-38: the money / units view, remembered; U toggles it on every page
const UNITS_KEY = 'bettracker:units-view';
const unitListeners = new Set<() => void>();

export function useUnitsView(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (cb) => {
      unitListeners.add(cb);
      return () => unitListeners.delete(cb);
    },
    () => localStorage.getItem(UNITS_KEY) === 'units',
    () => false,
  );
  return [
    on,
    (v) => {
      localStorage.setItem(UNITS_KEY, v ? 'units' : 'money');
      unitListeners.forEach((l) => l());
    },
  ];
}

export function UnitsToggle({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
  return (
    <div role="radiogroup" aria-label="Amounts shown in" className="inline-flex rounded-md border border-zinc-700 p-0.5 text-xs" title="Show amounts as money or as units (U)" data-testid="units-toggle">
      {([false, true] as const).map((u) => (
        <button
          key={String(u)}
          role="radio"
          aria-checked={on === u}
          aria-label={u ? 'Units' : 'Money'}
          className={`rounded px-2 py-1 ${on === u ? 'bg-zinc-700 font-semibold text-white' : 'text-zinc-400 hover:text-white'}`}
          onClick={() => onChange(u)}
        >
          {u ? 'u' : '$'}
        </button>
      ))}
    </div>
  );
}
