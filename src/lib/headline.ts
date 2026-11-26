// BT-55: the Bets page's headline tiles. They count the chosen period and filters, never the tab, and never add real
// and hypothetical money together: scope "All" gives one group per money type, side by side.

import type { MoneyScope } from './money';
import { cumulativeProfit, summarize, type Summary } from './stats';
import { asUnitBets, formatUnits } from './units';
import { formatMoney } from './money';
import type { Bet } from './types';

export interface HeadlineGroup {
  /** The money its figures are in: "real" (real + bonus bets, as the Real scope counts), "bonus" or "hypothetical". */
  money: Exclude<MoneyScope, 'both'>;
  summary: Summary;
  /** Cumulative profit by game date, for the sparkline. */
  curve: number[];
  /** True when the figures are units (BT-38): every bet has a unit size and one money type. */
  units: boolean;
}

/** The bets of a scope split by money type: one group, or real and hypothetical side by side for "All". */
export function moneyGroups(bets: Bet[], scope: MoneyScope): { money: HeadlineGroup['money']; bets: Bet[] }[] {
  if (scope !== 'both') return [{ money: scope, bets }];
  const hypo = bets.filter((b) => b.money === 'hypothetical');
  const real = bets.filter((b) => b.money !== 'hypothetical');
  return [{ money: 'real' as const, bets: real }, ...(hypo.length ? [{ money: 'hypothetical' as const, bets: hypo }] : [])];
}

/** The tiles' figures per money group; in the units view a group falls back to money when it cannot be counted in units. */
export function headline(bets: Bet[], scope: MoneyScope, unitsView: boolean): HeadlineGroup[] {
  return moneyGroups(bets, scope).map(({ money, bets: g }) => {
    const u = unitsView ? asUnitBets(g) : null;
    const counted = u ?? g;
    return { money, summary: summarize(counted), curve: cumulativeProfit(counted).map((p) => p.cumulative), units: !!u };
  });
}

/** An SVG path for a sparkline of `values` in a w × h box (a flat line for one point); "" with none. */
export function sparkPath(values: number[], w: number, h: number): string {
  if (!values.length) return '';
  const pts = values.length === 1 ? [0, values[0]!] : [0, ...values];
  const min = Math.min(0, ...pts);
  const max = Math.max(0, ...pts);
  const span = max - min || 1;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * h;
  return pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
}

/**
 * BT-63: a headline figure against the previous period: "▲ +R$ 20,00 vs previous" (percentages in points). Null when
 * there is no previous figure to compare with.
 */
export function vsText(
  g: { money: HeadlineGroup['money']; units: boolean; summary: Summary; previous?: Summary | null },
  k: 'net' | 'roi' | 'winRate' | 'bets',
): { text: string; title: string; tone: string } | null {
  const p = g.previous;
  if (!p) return null;
  const pick = (s: Summary) => (k === 'net' ? s.netProfit : k === 'roi' ? s.roi : k === 'winRate' ? s.winRate : s.betCount);
  const now = pick(g.summary);
  const before = pick(p);
  if (now == null || before == null) return null;
  const d = now - before;
  const money = (n: number, signed = false) => (g.units ? formatUnits(n, signed) : formatMoney(n, g.money, signed));
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const delta = k === 'net' ? money(d, true) : k === 'bets' ? `${d > 0 ? '+' : ''}${d}` : `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)} pp`;
  const was = k === 'net' ? money(before) : k === 'bets' ? String(before) : pct(before);
  const arrow = Math.abs(d) < 1e-9 ? '=' : d > 0 ? '▲' : '▼';
  const tone = k === 'bets' || Math.abs(d) < 1e-9 ? 'text-zinc-500' : d > 0 ? 'text-emerald-400/80' : 'text-red-400/80';
  return { text: `${arrow} ${delta} vs previous`, title: `Previous period: ${was}`, tone };
}
