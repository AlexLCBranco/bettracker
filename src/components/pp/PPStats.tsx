'use client';

// BT-32: PP stats, per batch (the batch's Stats tab) and across batches (top of the PP page, with a date range).

import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateField } from '@/components/BetFormModal';
import { MONEY_TEXT } from '@/components/moneyStyle';
import { formatDate, formatShortDate, parseDateInput } from '@/lib/dates';
import { formatMoney, profitMoney } from '@/lib/money';
import { batchSummary, type PPBatch } from '@/lib/pp';
import { batchesBetween, legBreakdown, lostByOne, tierHitOverTime, tierStats, type HitRow } from '@/lib/ppStats';
import { formatPercent } from '@/lib/stats';

/** Won-lost, hit rate, and next to it what the odds implied: do the confidence tiers beat the price? */
export function HitTable({ rows, first, testId }: { rows: HitRow[]; first: string; testId: string }) {
  if (!rows.length) return <p className="text-sm text-zinc-500">No legs yet.</p>;
  return (
    <table className="w-full text-sm" data-testid={testId}>
      <thead>
        <tr className="text-left text-[11px] text-zinc-500">
          <th className="px-2 py-1.5 font-medium">{first}</th>
          <th className="px-2 py-1.5 text-right font-medium">Won–lost</th>
          <th className="px-2 py-1.5 text-right font-medium" title="Won / (won + lost)">Hit rate</th>
          <th className="px-2 py-1.5 text-right font-medium" title="The average of 1 / odds over the same legs: what the price said">Odds implied</th>
          <th className="px-2 py-1.5 text-right font-medium" title="Hit rate − implied: above 0, the tier beat the price">Edge</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const edge = r.hitRate != null && r.implied != null ? r.hitRate - r.implied : null;
          return (
            <tr key={r.key} className="border-t border-zinc-900" data-testid="hit-row">
              <td className="px-2 py-1 text-zinc-200 [overflow-wrap:anywhere]">{r.label}</td>
              <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-zinc-300">
                {r.won}–{r.lost}
                {r.pending > 0 && <span className="text-zinc-500"> · {r.pending} pending</span>}
              </td>
              <td className="px-2 py-1 text-right font-semibold tabular-nums text-zinc-100" data-testid="hit-rate">
                {formatPercent(r.hitRate)}
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-zinc-400">{formatPercent(r.implied)}</td>
              <td className={`px-2 py-1 text-right tabular-nums ${edge == null ? 'text-zinc-500' : edge > 0 ? 'text-emerald-400' : edge < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{formatPercent(edge, true)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function BatchStats({ batch }: { batch: PPBatch }) {
  const s = batchSummary(batch);
  const tiers = tierStats([batch]);
  const byOne = lostByOne(batch);
  const pm = profitMoney(batch.money);
  return (
    <div className="space-y-3" data-testid="batch-stats">
      <section className="card grid grid-cols-2 gap-3 p-4 text-sm md:grid-cols-6">
        <Fig label="Won" value={<span className="text-emerald-400">{s.won}</span>} />
        <Fig label="Dead" value={<span className="text-red-400">{s.dead}</span>} />
        <Fig label="Alive" value={s.alive} />
        <Fig label="Staked" value={<span className={MONEY_TEXT[batch.money]}>{formatMoney(s.staked, batch.money)}</span>} />
        <Fig label="Returned" value={formatMoney(s.returned, pm)} />
        <Fig label="Profit" value={<span className={s.profit > 0 ? 'text-emerald-400' : s.profit < 0 ? 'text-red-400' : ''}>{formatMoney(s.profit, pm, true)}</span>} />
      </section>
      <section className="card p-3">
        <h2 className="mb-2 text-sm font-semibold">Per tier</h2>
        <HitTable rows={tiers} first="Tier" testId="tier-stats" />
      </section>
      <section className="card p-3" data-testid="lost-by-one">
        <h2 className="mb-2 text-sm font-semibold">Lost by one</h2>
        {byOne.length === 0 ? (
          <p className="text-sm text-zinc-500">No PP has lost by one leg (yet).</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {byOne.map((x) => (
              <li key={x.leg.id} data-testid="lost-by-one-row">
                <b className="text-red-300">{x.leg.selection}</b>
                {x.leg.actual && <span className="text-zinc-400"> → {x.leg.actual}</span>} killed <b>{x.count}</b> {x.count === 1 ? 'PP that was' : 'PPs that were'} otherwise complete
                <span className="text-zinc-500"> (PP {x.numbers.join(', ')})</span>
                {x.leg.note && <div className="pl-3 text-xs italic text-zinc-400">{x.leg.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Fig({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="font-semibold tabular-nums text-zinc-100">{value}</div>
    </div>
  );
}

const COLORS = ['#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa', '#f87171', '#2dd4bf'];
const AXIS = '#a1a1aa';

/** The research over all batches in a date range. */
export function AcrossBatches({ batches }: { batches: PPBatch[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const shown = useMemo(() => batchesBetween(batches, parseDateInput(from) ?? '', parseDateInput(to) ?? ''), [batches, from, to]);
  const tiers = useMemo(() => tierStats(shown), [shown]);
  const over = useMemo(() => tierHitOverTime(shown), [shown]);
  const sports = useMemo(() => legBreakdown(shown, 'sport'), [shown]);
  const markets = useMemo(() => legBreakdown(shown, 'market'), [shown]);
  const data = over.points.map((p) => ({ name: p.name, date: p.date, ...Object.fromEntries(Object.entries(p.rates).map(([k, v]) => [k, v == null ? null : Math.round(v * 1000) / 10])) }));
  if (!batches.length) return null;
  return (
    <section className="card space-y-3 p-4" data-testid="across-batches">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-semibold">
          Across batches <span className="text-sm font-normal text-zinc-500">· {shown.length} {shown.length === 1 ? 'batch' : 'batches'}</span>
        </h2>
        <div className="flex items-end gap-2">
          <label className="flex w-28 flex-col gap-0.5">
            <span className="text-[11px] text-zinc-500">From</span>
            <DateField value={from} onChange={setFrom} aria-label="Stats from" />
          </label>
          <label className="flex w-28 flex-col gap-0.5">
            <span className="text-[11px] text-zinc-500">To</span>
            <DateField value={to} onChange={setTo} aria-label="Stats to" />
          </label>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm text-zinc-300">Per tier</h3>
          <HitTable rows={tiers} first="Tier" testId="across-tier-stats" />
        </div>
        <div>
          <h3 className="mb-1 text-sm text-zinc-300">Hit rate per tier over time</h3>
          {data.length < 1 || tiers.every((t) => t.hitRate == null) ? (
            <p className="grid h-48 place-items-center text-sm text-zinc-500">Settle some legs to see it.</p>
          ) : (
            <div className="h-56" data-testid="tier-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} />
                  <YAxis domain={[0, 100]} stroke={AXIS} tick={{ fill: AXIS, fontSize: 11 }} tickLine={false} width={40} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip
                    contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#f4f4f5' }}
                    labelFormatter={(d, p) => `${(p?.[0]?.payload as { name?: string } | undefined)?.name ?? ''} · ${formatDate(String(d))}`}
                    formatter={(v, name) => [v == null ? '-' : `${v}%`, String(name)]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: AXIS }} />
                  {over.tiers.map((t, i) => (
                    <Line key={t} type="linear" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-sm text-zinc-300">Leg hit rate by sport</h3>
          <HitTable rows={sports} first="Sport" testId="by-sport" />
        </div>
        <div>
          <h3 className="mb-1 text-sm text-zinc-300">Leg hit rate by market</h3>
          <HitTable rows={markets} first="Market" testId="by-market" />
        </div>
      </div>
    </section>
  );
}
