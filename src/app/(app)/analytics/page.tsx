'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { ProfitText } from '@/components/BetTable';
import { breakdown, comboReport, DIMENSION_LABEL, DIMENSIONS, type Dimension, type Row } from '@/lib/analytics';
import { formatDate } from '@/lib/dates';
import { formatBRL, formatOdds } from '@/lib/money';
import { formatPercent } from '@/lib/stats';

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
  const { bets, loaded } = useApp();
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

  if (!loaded) return <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-sm text-zinc-400">Where your profit comes from. Profit, ROI and win rate count settled bets only.</p>
      </div>

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
                  <BreakdownRow key={r.key} r={r} maxAbsProfit={maxAbsProfit} />
                ))}
              </tbody>
            </table>
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
                sub={`${formatBRL(combos.lostByOneStake)} staked${combos.lostUnknown ? ` · ${combos.lostUnknown} lost without leg results` : ''}`}
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
                        @{formatOdds(bet.odds)} · {formatBRL(bet.stake)}
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

function BreakdownRow({ r, maxAbsProfit }: { r: Row; maxAbsProfit: number }) {
  const width = maxAbsProfit > 0 ? (Math.abs(r.profit) / maxAbsProfit) * 100 : 0;
  return (
    <tr className="border-b border-zinc-900" data-testid="analytics-row">
      <td className="py-2 pr-3 text-zinc-100">{r.label}</td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-bets">
        {r.bets}
        {r.pending > 0 && <span className="ml-1 text-xs text-amber-400/80" title={`${r.pending} pending`}>({r.pending}p)</span>}
      </td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-wagered">{formatBRL(r.wagered)}</td>
      <td className="px-3 py-2 text-right tabular-nums" data-testid="cell-profit">
        <ProfitText value={r.profit} />
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

function SortButton({ active, arrow = true, onClick, children }: { active: boolean; arrow?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`hover:text-white ${active ? 'text-white' : ''}`} onClick={onClick} aria-pressed={active}>
      {children}
      {active && arrow && ' ↓'}
    </button>
  );
}

function Tile({ label, value, sub, testId }: { label: string; value: string; sub: string; testId: string }) {
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
