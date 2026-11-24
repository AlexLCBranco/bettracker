'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { ProfitText } from '@/components/BetTable';
import { breakdown, comboReport, DIMENSION_LABEL, DIMENSIONS, type Dimension, type Row } from '@/lib/analytics';
import { formatDate } from '@/lib/dates';
import { dutchHitReport } from '@/lib/hits';
import { dutchStats } from '@/lib/dutchStats';
import { ladderReport } from '@/lib/rollover';
import { formatMoney, formatOdds, type MoneyScope } from '@/lib/money';
import { byMoney } from '@/lib/scope';
import { useMoneyScope, useUnitsView } from '@/components/Money';
import { asUnitBets, formatUnits } from '@/lib/units';
import { ProfitChart } from '@/components/ProfitChart';
import { formatPercent } from '@/lib/stats';
import { cashoutVerdict } from '@/lib/woulda';

type SortKey = 'natural' | 'bets' | 'wagered' | 'profit' | 'roi' | 'winRate';

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: 'bets', label: 'Bets' },
  { key: 'wagered', label: 'Wagered', title: 'Total stake, pending included' },
  { key: 'profit', label: 'Profit', title: 'Settled bets only' },
  { key: 'roi', label: 'ROI', title: 'Profit / settled stake' },
  { key: 'winRate', label: 'Win rate', title: 'Won / (won + lost)' },
];

const tone = (n: number | null) => (n == null || n === 0 ? 'text-zinc-400' : n > 0 ? 'text-emerald-400' : 'text-red-400');

export default function AnalyticsPage() {
  const { bets: all, loaded } = useApp();
  // BT-14: real and hypothetical money never mix unless "Both" is picked
  const [scope] = useMoneyScope();
  const money = useMemo(() => byMoney(all, scope), [all, scope]);
  // BT-38: the units view counts every amount in units (ROI and win rate do not change), when all bets have a unit size
  const [unitsView] = useUnitsView();
  const unitBets = useMemo(() => (unitsView ? asUnitBets(money) : null), [unitsView, money]);
  const bets = unitBets ?? money;
  const fmt = (n: number, signed = false, m: MoneyScope = scope) => (unitBets ? formatUnits(n, signed) : formatMoney(n, m, signed));
  const [dim, setDim] = useState<Dimension>('sport');
  const [sort, setSort] = useState<SortKey>('natural');

  const rows = useMemo(() => breakdown(bets, dim), [bets, dim]);
  const sorted = useMemo(() => {
    if (sort === 'natural') return rows;
    // missing ROI / win rate ("-") always last
    return [...rows].sort((a, b) => (b[sort] ?? -Infinity) - (a[sort] ?? -Infinity));
  }, [rows, sort]);
  const maxAbsProfit = Math.max(...rows.map((r) => Math.abs(r.profit)), 0);
  const combos = useMemo(() => comboReport(bets), [bets]);
  const hits = useMemo(() => dutchHitReport(bets), [bets]);
  const dutches = useMemo(() => dutchStats(bets), [bets]);
  const ladders = useMemo(() => ladderReport(bets), [bets]);
  const verdict = useMemo(() => cashoutVerdict(bets), [bets]);
  const profitScope: MoneyScope = scope === 'bonus' ? 'real' : scope;

  if (!loaded) return <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-zinc-400">Where your profit comes from. Profit, ROI and win rate count settled bets only.</p>
        </div>
      </div>

      {/* BT-26: moved here from the dashboard */}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Performance Over Time</h2>
        <ProfitChart bets={money} money={scope} />
      </section>

      {/* BT-37: what cashing out did, by the would-haves set on cash-outs (W / L on a cashed-out bet) */}
      <section className="card p-5" data-testid="cashout-verdict">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Tile
            label="Cash-out verdict"
            value={verdict.net == null ? '-' : <span className={tone(verdict.net)}>{fmt(verdict.net, true, profitScope)}</span>}
            sub={`${verdict.wouldaWon} woulda won · ${verdict.wouldaLost} woulda lost · ${verdict.notSet} not set`}
            testId="cashout-verdict-net"
          />
          <p className="self-center text-xs text-zinc-500 sm:col-span-1 xl:col-span-3">
            Saved by cashing out (it would have lost) minus left on the table (it would have won). Above 0: cashing out paid.
            {verdict.net != null && ` Saved ${fmt(verdict.saved, false, profitScope)}, left ${fmt(verdict.left, false, profitScope)}.`}
          </p>
        </div>
      </section>

      <section className="card p-5">
        <div role="tablist" aria-label="Break down by" className="mb-4 flex flex-wrap gap-2">
          {DIMENSIONS.map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={dim === d}
              className={`chip text-sm ${dim === d ? 'border-emerald-500 bg-emerald-500/15 text-white' : ''}`}
              onClick={() => {
                setDim(d);
                setSort('natural');
              }}
            >
              {DIMENSION_LABEL[d]}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No bets yet. Stats appear here once you log some.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label={`By ${DIMENSION_LABEL[dim].toLowerCase()}`}>
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                  <th className="py-2 pr-3 font-medium">
                    <SortButton active={sort === 'natural'} arrow={false} onClick={() => setSort('natural')}>
                      {DIMENSION_LABEL[dim]}
                    </SortButton>
                  </th>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-right font-medium" title={c.title}>
                      <SortButton active={sort === c.key} onClick={() => setSort(c.key)}>
                        {c.label}
                      </SortButton>
                    </th>
                  ))}
                  <th className="w-[22%] py-2 pl-3 font-medium" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <BreakdownRow key={r.key} r={r} maxAbsProfit={maxAbsProfit} scope={scope} fmt={fmt} units={!!unitBets} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* BT-35: ladders, next to the Rollover group */}
        {dim === 'type' && ladders.started > 0 && (
          <div className="mt-6" data-testid="ladder-report">
            <h3 className="mb-1 text-sm font-medium text-zinc-300">Ladders</h3>
            <p className="mb-3 text-xs text-zinc-500">Each ladder is one bet: its first stake in, its final payout out. Rungs climbed = rungs that did not lose.</p>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <Tile label="Ladders started" value={String(ladders.started)} sub="each counted as one bet" testId="ladders-started" />
              <Tile label="Average rungs climbed" value={ladders.avgRungs == null ? '-' : ladders.avgRungs.toFixed(1)} sub="per ladder" testId="ladders-rungs" />
              <Tile label="Best ladder" value={ladders.best ? fmt(ladders.best.profit, true) : '-'} sub={ladders.best ? `${ladders.best.rungs} ${ladders.best.rungs === 1 ? 'rung' : 'rungs'}` : 'none closed yet'} testId="ladders-best" />
              <Tile label="Reached their goal" value={String(ladders.reachedGoal)} sub={`of ${ladders.withGoal} with a goal`} testId="ladders-goal" />
              <Tile label="Net profit" value={fmt(ladders.netProfit, true)} sub="closed ladders" testId="ladders-net" />
            </div>
          </div>
        )}
      </section>

      {/* BT-41: dutches as a whole and which of their splits hit; the BT-6 hit tiles live here */}
      <section className="card p-5" data-testid="dutches">
        <h2 className="font-semibold">Dutches</h2>
        <p className="mb-4 text-sm text-zinc-400">Each dutch is one bet: a win when its net profit is above 0. Money figures count settled dutches only.</p>
        {dutches.settled === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500" data-testid="dutches-empty">
            No settled dutches yet.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
              <Tile label="Dutches" value={String(dutches.settled)} sub={dutches.pending ? `settled · ${dutches.pending} pending` : 'settled'} testId="dutches-count" />
              <Tile label="Wagered" value={fmt(dutches.wagered)} sub="settled dutches" testId="dutches-wagered" />
              <Tile label="Net profit" value={<span className={tone(dutches.profit)}>{fmt(dutches.profit, true, profitScope)}</span>} sub="settled dutches" testId="dutches-profit" />
              <Tile label="ROI" value={<span className={tone(dutches.roi)}>{formatPercent(dutches.roi, true)}</span>} sub="profit / wagered" testId="dutches-roi" />
              <Tile label="Win rate" value={formatPercent(dutches.winRate)} sub={`${dutches.wins}W / ${dutches.losses}L`} testId="dutches-winrate" />
              <Tile label="Average combined odds" value={dutches.averageOdds == null ? '-' : formatOdds(dutches.averageOdds, 2)} sub="1 / Σ(1 / split odds)" testId="dutches-odds" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6" data-testid="dutch-hits">
              <Tile
                label="Splits hit"
                value={`${dutches.splitHits}/${dutches.splitHits + dutches.splitMisses}`}
                sub={`${formatPercent(dutches.splitHitRate)} hit rate · void left out`}
                testId="dutches-splits"
              />
              <Tile label="All hit" value={String(hits.allHit)} sub={`of ${hits.settled} settled dutches`} testId="hits-all" />
              <Tile label="Some hit" value={String(hits.someHit)} sub={hits.settled ? formatPercent(hits.someHit / hits.settled) : '-'} testId="hits-some" />
              <Tile label="None hit" value={String(hits.noneHit)} sub={hits.settled ? formatPercent(hits.noneHit / hits.settled) : '-'} testId="hits-none" />
              <Tile
                label="Sunk by a shared leg alone"
                value={String(hits.sunkByShared)}
                sub={hits.noneHit ? `of the ${hits.noneHit} none-hit` : 'no none-hit dutches'}
                testId="hits-shared"
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-300">Which split hits</h3>
                <table className="w-full text-sm" aria-label="Which split hits">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                      <th className="py-2 pr-3 font-medium">Position by odds</th>
                      <th className="px-3 py-2 text-right font-medium">Splits</th>
                      <th className="px-3 py-2 text-right font-medium">Hit</th>
                      <th className="px-3 py-2 text-right font-medium">Hit rate</th>
                      <th className="px-3 py-2 text-right font-medium">Avg odds</th>
                      <th className="py-2 pl-3 text-right font-medium" title="Net profit of the dutches where a split in this position hit">
                        Profit when hit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dutches.positions.map((p) => (
                      <tr key={p.key} className="border-b border-zinc-900" data-testid="position-row">
                        <td className="whitespace-nowrap py-2 pr-3 text-zinc-100">{p.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.splits}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.hit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(p.hitRate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.averageOdds == null ? '-' : formatOdds(p.averageOdds, 2)}</td>
                        <td className={`whitespace-nowrap py-2 pl-3 text-right tabular-nums ${tone(p.profitWhenHit)}`}>{fmt(p.profitWhenHit, true, profitScope)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DutchTable label="By number of splits" rows={dutches.bySplits} scope={scope} fmt={fmt} units={!!unitBets} />
              <DutchTable label="By combined odds" rows={dutches.byOdds} scope={scope} fmt={fmt} units={!!unitBets} />
            </div>
          </div>
        )}
      </section>

      <section className="card p-5" data-testid="combos">
        <h2 className="font-semibold">Combinations: which leg lost</h2>
        <p className="mb-4 text-sm text-zinc-400">Settled combinations with their legs entered. Mark each leg&apos;s result to see what sinks them.</p>
        {combos.settled === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">No settled combinations with legs yet.</p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Tile label="Settled combinations" value={String(combos.settled)} sub={`${combos.won}W / ${combos.lost}L`} testId="combo-settled" />
              <Tile
                label="Lost by one leg"
                value={String(combos.lostByOne)}
                sub={`${fmt(combos.lostByOneStake)} staked${combos.lostUnknown ? ` · ${combos.lostUnknown} lost without leg results` : ''}`}
                testId="combo-lost-by-one"
              />
            </div>

            {combos.legsByMarket.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-300">Leg record by market</h3>
                <table className="w-full max-w-2xl text-sm" aria-label="Leg record by market">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                      <th className="py-2 pr-3 font-medium">Market</th>
                      <th className="px-3 py-2 text-right font-medium">Legs won</th>
                      <th className="px-3 py-2 text-right font-medium">Legs lost</th>
                      <th className="px-3 py-2 text-right font-medium">Leg win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combos.legsByMarket.map((m) => (
                      <tr key={m.key} className="border-b border-zinc-900">
                        <td className="py-2 pr-3">{m.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-400">{m.won}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-red-400">{m.lost}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPercent(m.winRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {combos.oneLegAway.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-300">One leg away</h3>
                <ul className="divide-y divide-zinc-900 text-sm" aria-label="One leg away">
                  {combos.oneLegAway.map(({ bet, leg }) => (
                    <li key={bet.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                      <span className="tabular-nums text-zinc-500">{formatDate(bet.gameDate || bet.placedDate)}</span>
                      <span className="text-zinc-200">{bet.betText || `${bet.legs.length} legs`}</span>
                      <span className="text-zinc-500">
                        @{formatOdds(bet.odds)} · {fmt(bet.stake, false, bet.money)}
                      </span>
                      <span className="ml-auto text-red-400">
                        lost: {[leg.game, leg.market, leg.selection].filter(Boolean).join(' · ') || 'leg'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function BreakdownRow({ r, maxAbsProfit, scope, fmt, units }: { r: Row; maxAbsProfit: number; scope: MoneyScope; fmt(n: number): string; units: boolean }) {
  const width = maxAbsProfit > 0 ? (Math.abs(r.profit) / maxAbsProfit) * 100 : 0;
  return (
    <tr className="border-b border-zinc-900" data-testid="analytics-row">
      <td className="py-2 pr-3 text-zinc-100">{r.label}</td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-bets">
        {r.bets}
        {r.pending > 0 && <span className="ml-1 text-xs text-zinc-500" title={`${r.pending} pending`}>({r.pending}p)</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-wagered">{fmt(r.wagered)}</td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-profit">
        <ProfitText value={r.profit} money={scope} units={units ? r.profit : null} />
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${tone(r.roi)}`} data-testid="cell-roi">{formatPercent(r.roi, true)}</td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-winrate">
        {formatPercent(r.winRate)} <span className="text-xs text-zinc-500">{r.wins}W/{r.losses}L</span>
      </td>
      <td className="py-2 pl-3" aria-hidden>
        <div className="h-2 w-full rounded-full bg-zinc-900">
          <div className={`h-2 rounded-full ${r.profit >= 0 ? 'bg-emerald-500/70' : 'bg-red-500/70'}`} style={{ width: `${width}%` }} />
        </div>
      </td>
    </tr>
  );
}

/** BT-41: a dutch breakdown, same columns as the page's breakdown table (a dutch as one bet). */
function DutchTable({ label, rows, scope, fmt, units }: { label: string; rows: Row[]; scope: MoneyScope; fmt(n: number): string; units: boolean }) {
  const maxAbsProfit = Math.max(...rows.map((r) => Math.abs(r.profit)), 0);
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-zinc-300">{label}</h3>
      <table className="w-full text-sm" aria-label={label}>
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            <th className="py-2 pr-3 font-medium">{label.replace(/^By /, '').replace(/^./, (c) => c.toUpperCase())}</th>
            {COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium" title={c.title}>
                {c.label === 'Bets' ? 'Dutches' : c.label}
              </th>
            ))}
            <th className="w-[18%] py-2 pl-3 font-medium" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <BreakdownRow key={r.key} r={r} maxAbsProfit={maxAbsProfit} scope={scope} fmt={fmt} units={units} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortButton({ active, arrow = true, onClick, children }: { active: boolean; arrow?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`hover:text-white ${active ? 'text-white' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
      {active && arrow && ' ↓'}
    </button>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: ReactNode; sub: string; testId: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-4" data-testid={testId}>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}
