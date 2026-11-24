'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { todayISO } from '@/lib/dates';
import { countBets } from '@/lib/dutch';
import { settleQueue } from '@/lib/settle';
import { BUILD_INFO } from '@/lib/build-info';
import { AppProvider, useApp } from './AppProvider';
import { BetFormModal } from './BetFormModal';
import { BankrollBar, MoneyFormModal } from './Bankroll';
import { DutchFormModal } from './DutchFormModal';
import { MoneyScopeSwitch, useMoneyScope } from './Money';
import { QuickAdd } from './QuickAdd';
import { isUndoKey } from '@/lib/undo';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <Frame>{children}</Frame>
    </AppProvider>
  );
}

export { isUndoKey };

/** True when a key press is meant for a field, not a page shortcut. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

// BT-26: three pages; Dashboard, History and Settle are the Bets page
const LINKS = [
  { href: '/', label: 'Bets' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/betting-tool', label: 'Dutch tool' },
  // BT-36
  { href: '/ladder-sim', label: 'Ladder sim' },
  // BT-30
  { href: '/pp', label: 'PP' },
];

function Frame({ children }: { children: ReactNode }) {
  const { bets, openNew, form, dutchForm, toast, loadError, moneyForm, openMoney, undo, lastUndo } = useApp();
  const path = usePathname();
  const due = useMemo(() => settleQueue(bets, todayISO()).length, [bets]);
  const pending = useMemo(() => countBets(bets).pending, [bets]);
  const [scope, setScope] = useMoneyScope();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (form || dutchForm || moneyForm || isTyping(e)) return;
      // Ctrl+Z undoes the last change to the bets; the Bets, Bankroll and PP pages handle it themselves
      if (isUndoKey(e) && !(path === '/' || path.startsWith('/bankroll') || path.startsWith('/pp'))) {
        if ((e.target as HTMLElement | null)?.closest?.('[role=dialog]')) return;
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNew();
      }
      // BT-33: M inserts money
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        openMoney();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, dutchForm, moneyForm, openNew, openMoney, undo, path]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-black/90 backdrop-blur">
        <div className="flex h-14 items-center gap-5 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-black">↗</span>
            BetTracker
          </Link>
          <div className="flex-1">
            <QuickAdd />
          </div>
          {/* BT-26: one Real / Hypothetical / Both switch for every page */}
          <MoneyScopeSwitch scope={scope} onChange={setScope} />
          {/* BT-33: what you have now, per money type */}
          <BankrollBar />
          <nav className="flex items-center gap-4 text-sm">
            {LINKS.map((l) => (
              <span key={l.href} className="inline-flex items-center">
                <Link href={l.href} className={path === l.href || (l.href !== '/' && path.startsWith(`${l.href}/`)) ? 'font-semibold text-white' : 'text-zinc-400 hover:text-white'}>
                  {l.label}
                </Link>
                {l.href === '/' && due > 0 && (
                  <Link href="/?tab=settle" className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-black" data-testid="due-count" aria-label={`${due} to settle`} title={`${due} to settle (game date today or earlier); ${pending} pending in all`}>
                    {due}
                  </Link>
                )}
              </span>
            ))}
          </nav>
        </div>
      </header>
      <main className="w-full flex-1 px-4 pb-8 pt-3">
        {loadError ? <p className="rounded-md border border-red-800 bg-red-950 p-4 text-sm text-red-300">Could not load bets: {loadError}</p> : children}
      </main>
      <BetFormModal />
      <DutchFormModal />
      <MoneyFormModal />
      {toast && (
        <div role="status" className={`fixed bottom-6 left-6 z-50 rounded-md border px-4 py-2 text-sm shadow-lg ${toast.kind === 'error' ? 'border-red-700 bg-red-950 text-red-200' : 'border-zinc-700 bg-zinc-900 text-zinc-100'}`}>
          {toast.text}
          {toast.undoable && lastUndo && (
            <button className="ml-3 font-semibold text-amber-300 hover:text-amber-200" title={`Undo: ${lastUndo.label} (Ctrl+Z)`} onClick={() => undo()}>
              Undo
            </button>
          )}
        </div>
      )}
      <SiteVersion />
    </div>
  );
}

/** "v1.3.0" in the bottom-right corner; commit and build time in the tooltip. */
export function SiteVersion() {
  const t = Date.parse(BUILD_INFO.builtAt);
  const when = Number.isNaN(t) ? '' : `, built ${new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
  return (
    <div className="pointer-events-auto fixed bottom-1 right-2 z-20 select-none text-[11px] text-zinc-600" data-testid="site-version" title={`Version ${BUILD_INFO.version} · commit ${BUILD_INFO.commit}${when}`}>
      v{BUILD_INFO.version}
    </div>
  );
}
