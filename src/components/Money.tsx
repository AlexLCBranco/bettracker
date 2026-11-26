'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
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

/**
 * BT-60: the top bar's one menu for the money scope and the units view. Its label always shows the current scope, and
 * "u" while units are on, so the state is never hidden. A pick closes it. U still toggles units from anywhere.
 */
export function ViewMenu({ scope, onScope, units, onUnits }: { scope: MoneyScope; onScope(s: MoneyScope): void; units: boolean; onUnits(on: boolean): void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const tint = scope === 'hypothetical' ? 'border-violet-500/60 text-violet-200' : scope === 'bonus' ? 'border-amber-500/60 text-amber-200' : 'border-zinc-700 text-zinc-100';
  return (
    <div ref={box} className="relative">
      <button
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:border-zinc-500 ${tint}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Money shown and units (U toggles units)"
        onClick={() => setOpen((o) => !o)}
        data-testid="view-menu"
      >
        <span data-testid="view-menu-scope">{MONEY_SCOPE_LABEL[scope]}</span>
        {units && (
          <span className="rounded bg-zinc-700 px-1 font-semibold text-white" data-testid="view-menu-units">
            u
          </span>
        )}
        <span className="text-zinc-500">▾</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Money and units" className="absolute right-0 top-full z-40 mt-1 w-max space-y-3 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 p-3 shadow-xl" data-testid="view-menu-panel">
          <div>
            <p className="mb-1 text-[11px] text-zinc-500">Money shown</p>
            <MoneyScopeSwitch
              scope={scope}
              onChange={(v) => {
                onScope(v);
                setOpen(false);
              }}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] text-zinc-500">Amounts in</p>
            <UnitsToggle
              on={units}
              onChange={(v) => {
                onUnits(v);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
