'use client';

// BT-37: the would-have chip of a cashed-out bet, in the bet text line next to its label chip (same style). It never
// makes the row taller: when the whole chip does not fit, the figure moves to its tooltip ("WOULDA WON").

import { useLayoutEffect, useRef } from 'react';
import { formatMoney, profitMoney } from '@/lib/money';
import type { Bet } from '@/lib/types';
import { wouldaFigure } from '@/lib/woulda';

export function WouldaChip({ bet, fmt }: { bet: Bet; fmt?: (n: number) => string }) {
  const f = wouldaFigure(bet);
  const chip = useRef<HTMLSpanElement>(null);
  const tail = useRef<HTMLSpanElement>(null);
  const head = f ? `Woulda ${f.kind}` : '';
  const figure = f ? `${f.kind === 'won' ? 'left' : 'saved'} ${fmt ? fmt(f.amount) : formatMoney(f.amount, profitMoney(bet.money))}` : '';

  useLayoutEffect(() => {
    const el = chip.current;
    const t = tail.current;
    const box = el?.closest('tr') ?? el?.parentElement;
    if (!el || !t || !box) return;
    // the row's height without the chip, then with the whole chip: the figure stays only when it adds no height
    const fit = () => {
      el.style.display = 'none';
      const bare = box.offsetHeight;
      el.style.display = '';
      t.style.display = 'inline';
      const compact = box.offsetHeight > bare;
      t.style.display = compact ? 'none' : 'inline';
      el.dataset.compact = compact ? 'true' : 'false';
    };
    fit();
    let width = box.offsetWidth;
    const ro = new ResizeObserver(() => {
      if (box.offsetWidth === width) return;
      width = box.offsetWidth;
      fit();
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [head, figure]);

  if (!f) return null;
  const tone = f.kind === 'won' ? 'bg-amber-400/15 text-amber-300' : 'bg-emerald-400/15 text-emerald-300';
  return (
    <span ref={chip} className={`ml-1.5 inline-block whitespace-nowrap rounded px-1 align-[1px] text-[10px] font-bold uppercase leading-4 tracking-wide ${tone}`} title={`${head} · ${figure}`} data-testid="woulda-chip" data-kind={f.kind}>
      {head}
      <span ref={tail}>{` · ${figure}`}</span>
    </span>
  );
}
