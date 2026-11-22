'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { todayISO } from '@/lib/dates';
import { settleQueue } from '@/lib/settle';
import { BUILD_INFO } from '@/lib/build-info';
import { AppProvider, useApp } from './AppProvider';
import { BetFormModal } from './BetFormModal';
import { QuickAdd } from './QuickAdd';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <Frame>{children}</Frame>
    </AppProvider>
  );
}

/** True when a key press is meant for a field, not a page shortcut. */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

const LINKS = [
  { href: '/', label: 'Dashboard' },
  { href: '/betting-tool', label: 'Betting Tool' },
  { href: '/history', label: 'History' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/settle', label: 'Settle' },
];

function Frame({ children }: { children: ReactNode }) {
  const { bets, openNew, form, toast, loadError } = useApp();
  const path = usePathname();
  const due = useMemo(() => settleQueue(bets, todayISO()).length, [bets]);
  const pending = useMemo(() => bets.filter((b) => b.result === 'pending').length, [bets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (form || isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        openNew();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [form, openNew]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-black">↗</span>
            BetTracker
          </Link>
          <div className="flex-1">
            <QuickAdd />
          </div>
          <nav className="flex items-center gap-4 text-sm">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={path === l.href ? 'font-semibold text-white' : 'text-zinc-400 hover:text-white'}>
                {l.label}
                {l.href === '/settle' && due > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-black" data-testid="due-count" title={`${due} to settle (game date today or earlier); ${pending} pending in all`}>
                    {due}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">
        {loadError ? <p className="rounded-md border border-red-800 bg-red-950 p-4 text-sm text-red-300">Could not load bets: {loadError}</p> : children}
      </main>
      <BetFormModal />
      {toast && (
        <div role="status" className={`fixed bottom-6 left-6 z-50 rounded-md border px-4 py-2 text-sm shadow-lg ${toast.kind === 'error' ? 'border-red-700 bg-red-950 text-red-200' : 'border-zinc-700 bg-zinc-900 text-zinc-100'}`}>
          {toast.text}
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
