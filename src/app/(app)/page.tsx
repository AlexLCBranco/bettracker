'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { BetTable } from '@/components/BetTable';
import { ProfitChart } from '@/components/ProfitChart';
import { formatBRL } from '@/lib/money';
import { formatPercent, summarize } from '@/lib/stats';

const RECENT = 20;

export default function Dashboard() {
  const { bets, loaded } = useApp();
  const s = useMemo(() => summarize(bets), [bets]);
  const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Bet Tracker</h1>
        <p className="text-sm text-zinc-400">
          Monitor your betting performance and history. Press <kbd>N</kbd> for a new bet.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="stats">
        <Stat label="Net Profit/Loss" testId="stat-net" value={<span className={tone(s.netProfit)}>{formatBRL(s.netProfit, true)}</span>} sub={`on ${formatBRL(s.settledStake)} settled`} />
        <Stat label="ROI %" testId="stat-roi" value={<span className={tone(s.roi ?? 0)}>{formatPercent(s.roi, true)}</span>} sub="net profit / settled stake" />
        <Stat label="Total Wagered" testId="stat-wagered" value={formatBRL(s.totalWagered)} sub={`${s.betCount} ${s.betCount === 1 ? 'bet' : 'bets'}`} />
        <Stat label="Win Rate" testId="stat-winrate" value={formatPercent(s.winRate)} sub={`${s.wins}W / ${s.losses}L`} />
        <Stat
          label="Pending Bets"
          testId="stat-pending"
          value={
            <Link href="/settle" className="hover:underline">
              {s.pendingCount}
            </Link>
          }
          sub={formatBRL(s.pendingAmount)}
        />
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Performance Over Time</h2>
        <ProfitChart bets={bets} />
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Bet History</h2>
          {s.betCount > RECENT && (
            <Link href="/history" className="text-sm text-emerald-400 hover:underline">
              All {s.betCount} bets →
            </Link>
          )}
        </div>
        {loaded ? <BetTable bets={bets} limit={RECENT} /> : <p className="py-10 text-center text-sm text-zinc-500">Loading…</p>}
      </section>
    </div>
  );
}

function Stat({ label, value, sub, testId }: { label: string; value: ReactNode; sub: string; testId: string }) {
  return (
    <div className="card p-4" data-testid={testId}>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" data-testid={`${testId}-value`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
    </div>
  );
}
