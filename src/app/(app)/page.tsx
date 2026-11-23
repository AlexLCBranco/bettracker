'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import { useApp } from '@/components/AppProvider';
import { BetTable } from '@/components/BetTable';
import { ProfitChart } from '@/components/ProfitChart';
import { formatMoney } from '@/lib/money';
import { byMoney } from '@/lib/scope';
import { MoneyScopeSwitch, useMoneyScope } from '@/components/Money';
import { formatPercent, summarize } from '@/lib/stats';

const RECENT = 20;

export default function Dashboard() {
  const { bets, loaded } = useApp();
  // BT-14: stats and chart count one money (Real by default); the recent bets list shows every bet, each in its own money
  const [scope, setScope] = useMoneyScope();
  const counted = useMemo(() => byMoney(bets, scope), [bets, scope]);
  const s = useMemo(() => summarize(counted), [counted]);
  const fmt = (n: number, signed = false) => formatMoney(n, scope, signed);
  const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-white');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Bet Tracker</h1>
          <p className="text-sm text-zinc-400">
            Monitor your betting performance and history. Press <kbd>N</kbd> for a new bet.
          </p>
        </div>
        <MoneyScopeSwitch scope={scope} onChange={setScope} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" data-testid="stats">
        <Stat label="Net Profit/Loss" testId="stat-net" value={<span className={tone(s.netProfit)}>{fmt(s.netProfit, true)}</span>} sub={`on ${fmt(s.settledStake)} settled`} />
        <Stat label="ROI %" testId="stat-roi" value={<span className={tone(s.roi ?? 0)}>{formatPercent(s.roi, true)}</span>} sub="net profit / settled stake" />
        <Stat label="Total Wagered" testId="stat-wagered" value={fmt(s.totalWagered)} sub={`${s.betCount} ${s.betCount === 1 ? 'bet' : 'bets'}`} />
        <Stat label="Win Rate" testId="stat-winrate" value={formatPercent(s.winRate)} sub={`${s.wins}W / ${s.losses}L`} />
        <Stat
          label="Pending Bets"
          testId="stat-pending"
          value={
            <Link href="/settle" className="hover:underline">
              {s.pendingCount}
            </Link>
          }
          sub={fmt(s.pendingAmount)}
        />
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-semibold">Performance Over Time</h2>
        <ProfitChart bets={counted} money={scope} />
      </section>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Bet History</h2>
          {bets.length > RECENT && (
            <Link href="/history" className="text-sm text-emerald-400 hover:underline">
              All bets →
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
