'use client';

// BT-55: the Bets page's headline tiles: Net (with a sparkline and the small figures under it), Bankroll, Open.

import type { ReactNode } from 'react';
import { sparkPath, type HeadlineGroup } from '@/lib/headline';
import { formatMoney } from '@/lib/money';
import { formatPercent } from '@/lib/stats';
import { formatUnits } from '@/lib/units';
import { BankrollBar } from './Bankroll';

const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-100');
const fmtOf = (g: HeadlineGroup) => (n: number, signed = false) => (g.units ? formatUnits(n, signed) : formatMoney(n, g.money, signed));

export function Tile({ label, children, testId, className = '', right }: { label: string; children: ReactNode; testId: string; className?: string; right?: ReactNode }) {
  return (
    <section className={`rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 ${className}`} data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const last = values.at(-1)!;
  return (
    <svg viewBox="0 0 120 32" className="h-8 w-28 shrink-0" aria-hidden data-testid="net-spark">
      <path d={sparkPath(values, 120, 32)} fill="none" stroke={last >= 0 ? '#34d399' : '#f87171'} strokeWidth={1.5} />
    </svg>
  );
}

/** One money group's Net: the big figure, the sparkline, then ROI, win rate, wagered and bonus as small text. */
function NetGroup({ g, many }: { g: HeadlineGroup; many: boolean }) {
  const s = g.summary;
  const fmt = fmtOf(g);
  return (
    <div className="min-w-0" data-testid={`stat-net-${g.money}`}>
      <div className="flex items-end gap-3">
        <span className={`text-3xl font-bold tabular-nums leading-none ${tone(s.netProfit)}`} data-testid={many ? `stat-net-${g.money}-value` : 'stat-net-value'}>
          {fmt(s.netProfit, true)}
        </span>
        <Spark values={g.curve} />
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-400">
        <span data-testid={many ? undefined : 'stat-roi'}>
          ROI{' '}
          <b className={`font-semibold tabular-nums ${tone(s.roi ?? 0)}`} data-testid={many ? undefined : 'stat-roi-value'}>
            {formatPercent(s.roi, true)}
          </b>
        </span>
        <span data-testid={many ? undefined : 'stat-winrate'}>
          Win{' '}
          <b className="font-semibold tabular-nums text-zinc-200" data-testid={many ? undefined : 'stat-winrate-value'}>
            {formatPercent(s.winRate)}
          </b>{' '}
          <span className="text-zinc-500">
            {s.wins}W / {s.losses}L
          </span>
        </span>
        <span data-testid={many ? undefined : 'stat-wagered-line'}>
          Wagered{' '}
          <b className="font-semibold tabular-nums text-zinc-200" data-testid={many ? undefined : 'stat-wagered-value'}>
            {fmt(s.totalWagered)}
          </b>
        </span>
        {/* BT-33: bonus spent and the real money it turned into, as short labels */}
        {(s.bonusSpent > 0 || s.bonusPending > 0) && (
          <span className="text-amber-300/90" data-testid="stat-bonus" title="Bonus spent on settled bets · real money won from it · won / spent · bonus in pending bets">
            Bonus {formatMoney(s.bonusSpent, 'bonus')} · won {formatMoney(s.bonusWon, 'real')} · {formatPercent(s.bonusConverted)}
            {s.bonusPending > 0 && ` · ${formatMoney(s.bonusPending, 'bonus')} pend.`}
          </span>
        )}
      </div>
    </div>
  );
}

export interface HeadlineProps {
  groups: HeadlineGroup[];
  /** Bets counted (a dutch once) and the bets in this money scope. */
  betCount: number;
  totalCount: number;
  /** Rows on the To settle tab. */
  toSettle: number;
  openSettle(): void;
  unitsView: boolean;
  /** In the Net tile's corner: BT-56's period switch. */
  period?: ReactNode;
}

export function Headline({ groups, betCount, totalCount, toSettle, openSettle, unitsView, period }: HeadlineProps) {
  const many = groups.length > 1;
  const allUnits = groups.every((g) => g.units);
  const pending = groups.reduce((n, g) => n + g.summary.pendingCount, 0);
  return (
    <div
      className="flex flex-wrap items-stretch gap-3"
      data-testid="stats"
      data-units={allUnits ? 'true' : undefined}
      title={unitsView && !allUnits ? 'Shown in money: some of these bets have no unit size, or money types are mixed' : undefined}
    >
      <Tile label="Net" testId="stat-net" className="min-w-[22rem] flex-[2]" right={period}>
        <div className={`mt-1 flex ${many ? 'gap-8' : ''}`}>
          {groups.map((g) => (
            <NetGroup key={g.money} g={g} many={many} />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500" data-testid="stat-wagered">
          {betCount} of {totalCount} {totalCount === 1 ? 'bet' : 'bets'}
        </p>
      </Tile>
      <Tile label="Bankroll" testId="stat-bankroll" className="flex-1">
        <div className="mt-1">
          <BankrollBar tile />
        </div>
      </Tile>
      <Tile label="Open" testId="stat-pending" className="flex-1">
        <div className="mt-1 flex gap-6">
          {groups.map((g) => (
            <span key={g.money} className="text-2xl font-bold tabular-nums leading-none text-zinc-100" data-testid={many ? `stat-open-${g.money}` : 'stat-open-amount'} title="Stake in pending bets">
              {fmtOf(g)(g.summary.pendingAmount)}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          <span data-testid="stat-pending-value">{pending}</span> pending ·{' '}
          <button className={`hover:underline ${toSettle > 0 ? 'font-semibold text-amber-300' : ''}`} onClick={openSettle} title="Open the To settle tab" data-testid="stat-to-settle">
            {toSettle} to settle
          </button>
        </p>
      </Tile>
    </div>
  );
}
