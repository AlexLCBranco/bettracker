'use client';

// BT-55: the Bets page's headline tiles: Net (with a sparkline and the small figures under it), Bankroll, Open.

import type { ReactNode } from 'react';
import { sparkPath, type HeadlineGroup } from '@/lib/headline';
import { formatMoney } from '@/lib/money';
import { formatPercent } from '@/lib/stats';
import { formatUnits } from '@/lib/units';
import { BankrollBar } from './Bankroll';
import { segmentText, type Segment } from '@/lib/bestWorst';

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

/** Bets that count toward neither the wins, the losses nor the pending. */
const other = (s: HeadlineGroup['summary']) => s.betCount - s.wins - s.losses - s.pendingCount;

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
          <span className="text-zinc-500" data-testid={many ? undefined : 'stat-record'}>
            {s.wins}W / {s.losses}L
            {s.pendingCount > 0 && ` · ${s.pendingCount} pending`}
            {other(s) > 0 && (
              <span title="Settled as neither a win nor a loss: void, cash-out, half won or lost, or a dutch that broke even">
                {` · ${other(s)} other`}
              </span>
            )}
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
            <span key={g.money} className="text-2xl font-bold tabular-nums leading-none text-zinc-100" data-testid={many ? `stat-open-${g.money}` : 'stat-open-amount'} title="Stake riding on pending bets (a shot at what it has grown to)">
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

/** BT-62: one money group's figures for the Analytics headline. */
export interface AnalyticsGroup {
  money: HeadlineGroup['money'];
  units: boolean;
  summary: HeadlineGroup['summary'];
  best: Segment | null;
  worst: Segment | null;
  /** BT-63: the same figures over the previous period; null on All or when that period has no settled bets. */
  previous?: HeadlineGroup['summary'] | null;
}

/** BT-62: Analytics' headline row: Net, ROI, Win rate, Bets, then the best and worst segment. */
export function AnalyticsHeadline({ groups, vs }: { groups: AnalyticsGroup[]; vs?: (g: AnalyticsGroup, k: 'net' | 'roi' | 'winRate' | 'bets') => ReactNode }) {
  const many = groups.length > 1;
  const id = (base: string, g: AnalyticsGroup) => (many ? `${base}-${g.money}-value` : `${base}-value`);
  const each = (render: (g: AnalyticsGroup, fmt: ReturnType<typeof fmtOf>) => ReactNode) => (
    <div className={`mt-1 flex ${many ? 'gap-6' : ''}`}>
      {groups.map((g) => (
        <div key={g.money} className="min-w-0">
          {render(g, fmtOf({ money: g.money, units: g.units, summary: g.summary, curve: [] }))}
        </div>
      ))}
    </div>
  );
  const big = 'text-2xl font-bold tabular-nums leading-none';
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="analytics-headline">
      <Tile label="Net" testId="an-net">
        {each((g, fmt) => (
          <>
            <span className={`${big} ${tone(g.summary.netProfit)}`} data-testid={id('an-net', g)}>
              {fmt(g.summary.netProfit, true)}
            </span>
            {vs?.(g, 'net')}
          </>
        ))}
      </Tile>
      <Tile label="ROI" testId="an-roi">
        {each((g) => (
          <>
            <span className={`${big} ${tone(g.summary.roi ?? 0)}`} data-testid={id('an-roi', g)}>
              {formatPercent(g.summary.roi, true)}
            </span>
            {vs?.(g, 'roi')}
          </>
        ))}
      </Tile>
      <Tile label="Win rate" testId="an-winrate">
        {each((g) => (
          <>
            <span className={`${big} text-zinc-100`} data-testid={id('an-winrate', g)}>
              {formatPercent(g.summary.winRate)}
            </span>
            <p className="mt-1 text-xs text-zinc-500">
              {g.summary.wins}W / {g.summary.losses}L
            </p>
            {vs?.(g, 'winRate')}
          </>
        ))}
      </Tile>
      <Tile label="Bets" testId="an-bets">
        {each((g) => (
          <>
            <span className={`${big} text-zinc-100`} data-testid={id('an-bets', g)}>
              {g.summary.betCount}
            </span>
            {g.summary.pendingCount > 0 && <p className="mt-1 text-xs text-zinc-500">{g.summary.pendingCount} pending</p>}
            {vs?.(g, 'bets')}
          </>
        ))}
      </Tile>
      {(['best', 'worst'] as const).map((k) => (
        <Tile key={k} label={k === 'best' ? 'Best' : 'Worst'} testId={`an-${k}`}>
          {each((g, fmt) => {
            const s = g[k];
            return s ? (
              <div title={`The ${k} row of the sport, market, book, type and situation breakdowns (small samples left out)`}>
                <p className="truncate text-sm font-semibold text-zinc-100" data-testid={id(`an-${k}`, g)}>
                  {segmentText(s)}
                </p>
                <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone(s.profit)}`}>{fmt(s.profit, true)}</p>
              </div>
            ) : (
              <span className={`${big} text-zinc-500`} data-testid={id(`an-${k}`, g)} title="Needs two rows with 10 settled bets or more">
                -
              </span>
            );
          })}
        </Tile>
      ))}
    </div>
  );
}
