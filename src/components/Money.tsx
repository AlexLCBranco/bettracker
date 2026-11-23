'use client';

import { useSyncExternalStore } from 'react';
import type { MoneyScope } from '@/lib/money';
import { isMoneyScope, MONEY_SCOPE_LABEL, MONEY_SCOPES } from '@/lib/scope';
import type { Money } from '@/lib/types';

/** Real (R$) or hypothetical (H$) money for a bet or a dutch (BT-14). */
export function MoneySelect({ value, onChange, className = 'field' }: { value: Money; onChange(m: Money): void; className?: string }) {
  return (
    <select
      className={`${className} ${value === 'hypothetical' ? 'border-violet-500 text-violet-300' : ''}`}
      value={value}
      onChange={(e) => onChange(e.target.value as Money)}
      aria-label="Money"
      title={value === 'hypothetical' ? 'Hypothetical dollars: a pick you track but did not place. Never counted with real money.' : 'Real money'}
    >
      <option value="real">Real (R$)</option>
      <option value="hypothetical">Hypothetical (H$)</option>
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
          className={`rounded px-2.5 py-1 ${scope === s ? (s === 'hypothetical' ? 'bg-violet-500/25 text-violet-200' : 'bg-emerald-500/20 text-white') : 'text-zinc-400 hover:text-white'}`}
          onClick={() => onChange(s)}
        >
          {MONEY_SCOPE_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
