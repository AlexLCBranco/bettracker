'use client';

import { useSyncExternalStore } from 'react';
import type { CashoutMode } from '@/lib/cashout';

// BT-34: the cash-out box's R$ / % toggle; the last-used mode is remembered in this browser.
const KEY = 'bettracker:cashout-mode';
const listeners = new Set<() => void>();
const read = (): CashoutMode => (localStorage.getItem(KEY) === 'percent' ? 'percent' : 'amount');

export function useCashoutMode(): [CashoutMode, (m: CashoutMode) => void] {
  const mode = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => 'amount' as CashoutMode,
  );
  return [
    mode,
    (m) => {
      localStorage.setItem(KEY, m);
      listeners.forEach((l) => l());
    },
  ];
}
