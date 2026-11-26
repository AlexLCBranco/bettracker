'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayISO } from '@/lib/dates';
import { countBets } from '@/lib/dutch';
import { settleQueue } from '@/lib/settle';
import { BUILD_INFO } from '@/lib/build-info';
import { AppProvider, useApp } from './AppProvider';
import { BetFormModal } from './BetFormModal';
import { BankrollBar, MoneyFormModal } from './Bankroll';
import { BankedBar } from './Banked';
import { DutchFormModal } from './DutchFormModal';
import { useMoneyScope, useUnitsView, ViewMenu } from './Money';
import { QuickAdd } from './QuickAdd';
import { isUndoKey } from '@/lib/undo';
import { CHANNEL, tabLock } from '@/lib/oneTab';

export function Shell({ children }: { children: ReactNode }) {
  const { active, takeOver } = useOneTab();
  // another tab took over: the app unmounts here (no reloads, shortcuts or saves) and loads afresh on "Use here"
  if (!active) return <OtherTab onUseHere={takeOver} />;
  return (
    <AppProvider>
      <Frame>{children}</Frame>
    </AppProvider>
  );
}

/** One open tab at a time (src/lib/oneTab.ts): false once a newer tab of the site claims it. */
function useOneTab() {
  const [active, setActive] = useState(true);
  const lock = useRef<ReturnType<typeof tabLock> | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bus = new BroadcastChannel(CHANNEL);
    const l = tabLock(bus, crypto.randomUUID(), setActive);
    lock.current = l;
    return () => {
      l.stop();
      bus.close();
    };
  }, []);
  return { active, takeOver: () => lock.current?.useHere() };
}

function OtherTab({ onUseHere }: { onUseHere: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6" data-testid="other-tab">
      <div role="dialog" aria-labelledby="other-tab-title" className="max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-xl">
        <h1 id="other-tab-title" className="text-lg font-semibold text-zinc-100">
          Bet tracker is open in another window
        </h1>
        <p className="mt-2 text-sm text-zinc-400">Click “Use here” to use it in this window instead. The other window will stop.</p>
        <div className="mt-5 flex justify-center">
          <button type="button" autoFocus onClick={onUseHere} className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500">
            Use here
          </button>
        </div>
      </div>
    </div>
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
  const [unitsView, setUnitsView] = useUnitsView();

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
      // BT-38: U shows amounts as money or as units
      if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        setUnitsView(!unitsView);
      }
      // BT-33: M inserts money
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        openMoney();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, dutchForm, moneyForm, openNew, openMoney, undo, path, unitsView, setUnitsView]);

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
          {/* BT-26: one money scope for every page; BT-60: it and the units view live in one menu */}
          <ViewMenu scope={scope} onScope={setScope} units={unitsView} onUnits={setUnitsView} />
          {/* BT-33: what you have now, per money type; BT-55: a tile on the Bets page instead */}
          {path !== '/' && <BankrollBar />}
          {/* money won and banked, waiting for its next bet */}
          <BankedBar />
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
  const { saving } = useApp();
  const t = Date.parse(BUILD_INFO.builtAt);
  const when = Number.isNaN(t) ? '' : `, built ${new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`;
  return (
    <div className="pointer-events-auto fixed bottom-1 right-2 z-20 select-none text-[11px] text-zinc-600" data-testid="site-version" title={`Version ${BUILD_INFO.version} · commit ${BUILD_INFO.commit}${when}`}>
      {saving > 0 && (
        <span className="mr-2 text-zinc-500" data-testid="saving" title={`${saving} change${saving === 1 ? '' : 's'} still saving: keep this page open`}>
          saving…
        </span>
      )}
      v{BUILD_INFO.version}
    </div>
  );
}
