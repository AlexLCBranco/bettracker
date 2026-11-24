'use client';

// Money won and banked (open rollover shots and ladders), waiting for its next bet: a top-bar figure with one small
// gauge per shot (how far its odds are toward the 1.80 target), and a list that opens each one on the Bets page.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDayMonth } from '@/lib/dates';
import { formatMoney, formatOdds } from '@/lib/money';
import { bankedItems, bankedTotals, needsText, tierOf, type BankedItem } from '@/lib/rollover';
import { useApp } from './AppProvider';
import { MONEY_TEXT } from './moneyStyle';

/** A shot's gauge: filled toward the target (sky), full and brighter once there; a ladder: indigo. */
function Gauge({ it, wide = false }: { it: BankedItem; wide?: boolean }) {
  const p = it.progress ?? 1;
  const color = it.ladder ? 'bg-indigo-400' : p >= 1 ? 'bg-emerald-400' : 'bg-sky-400';
  return (
    <span className={`relative inline-block overflow-hidden rounded-sm bg-zinc-700 ${wide ? 'h-1.5 w-full' : 'h-1 w-3'}`} data-testid="banked-gauge">
      <span className={`absolute inset-y-0 left-0 ${color}`} style={{ width: `${Math.round(p * 100)}%` }} />
    </span>
  );
}

export function BankedBar() {
  const { bets, loaded } = useApp();
  const router = useRouter();
  const items = useMemo(() => bankedItems(bets), [bets]);
  const totals = useMemo(() => bankedTotals(items), [items]);
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
  if (!loaded || !items.length) return null;
  const shown = items.slice(0, 8);
  const go = (id: string) => {
    setOpen(false);
    router.push(`/?tab=banked&sel=${encodeURIComponent(`rollover:${id}`)}`);
  };
  return (
    <div ref={box} className="relative">
      <button
        className="flex flex-col rounded-md border border-sky-900 px-2 py-0.5 text-left leading-tight hover:border-sky-600"
        aria-label={`Banked: ${items.length}`}
        aria-expanded={open}
        title="Banked: won money waiting for its next bet (click for the list)"
        onClick={() => setOpen((o) => !o)}
        data-testid="banked"
      >
        <span className="text-[10px] text-sky-300">
          ⤴ <span data-testid="banked-count">{items.length}</span> banked
        </span>
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-sky-100" data-testid="banked-total">
          {totals.map((t) => (
            <span key={t.money} className={`mr-1.5 last:mr-0 ${MONEY_TEXT[t.money]}`}>
              {formatMoney(t.amount, t.money)}
            </span>
          ))}
        </span>
        <span className="mt-0.5 flex gap-0.5" aria-hidden>
          {shown.map((it) => (
            <Gauge key={it.rolloverId} it={it} />
          ))}
          {items.length > shown.length && <span className="text-[9px] leading-none text-zinc-500">+{items.length - shown.length}</span>}
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label="Banked shots" className="absolute right-0 top-full z-40 mt-1 w-[400px] rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs shadow-xl" data-testid="banked-panel">
          <p className="px-1 pb-2 text-zinc-400">
            {items.length} banked, oldest first · the next bet&apos;s stake is the whole amount
          </p>
          <ul className="space-y-1">
            {items.map((it) => {
              const tier = tierOf(it.odds);
              return (
                <li key={it.rolloverId}>
                  <button className="w-full rounded px-1.5 py-1 text-left hover:bg-zinc-800" onClick={() => go(it.rolloverId)} data-testid="banked-item" title="Open it on the Bets page">
                    <span className="flex items-baseline gap-2">
                      <span className={`font-semibold tabular-nums ${MONEY_TEXT[it.money] || 'text-zinc-100'}`}>{formatMoney(it.amount, it.money)}</span>
                      <span className="text-zinc-400">
                        {it.ladder ? `Ladder · rung ${it.legs + 1} next` : `@ ${formatOdds(it.odds, 2)}${tier ? ` ${tier}` : ''} · ${it.legs} bet${it.legs === 1 ? '' : 's'}`}
                      </span>
                      <span className="ml-auto text-zinc-500">since {formatDayMonth(it.since)}</span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <Gauge it={it} wide />
                      {!it.ladder && <span className="shrink-0 text-[10px] text-zinc-500">{needsText(it)}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-zinc-800 px-1 pt-2">
            <Link href="/?tab=banked" className="text-zinc-400 hover:text-white" onClick={() => setOpen(false)}>
              Banked tab →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
