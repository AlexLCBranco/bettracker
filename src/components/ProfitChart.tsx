'use client';

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, formatShortDate } from '@/lib/dates';
import { formatBRL } from '@/lib/money';
import { cumulativeProfit } from '@/lib/stats';
import type { Bet } from '@/lib/types';

const AXIS = '#a1a1aa'; // zinc-400: readable on the dark card
const GRID = '#27272a';

/** Cumulative profit by game date. Dates stay strings ("YYYY-MM-DD"), formatted without Date parsing. */
export function ProfitChart({ bets }: { bets: Bet[] }) {
  const data = cumulativeProfit(bets);
  if (data.length === 0) return <p className="grid h-64 place-items-center text-sm text-zinc-500">Settle some bets to see your performance chart.</p>;
  const last = data[data.length - 1]!.cumulative;
  const color = last >= 0 ? '#34d399' : '#f87171';
  return (
    <div className="h-72" data-testid="profit-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatShortDate} stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} minTickGap={24} />
          <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} width={84} tickFormatter={(v: number) => formatBRL(v)} />
          <ReferenceLine y={0} stroke="#52525b" />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, color: '#f4f4f5' }}
            labelStyle={{ color: '#d4d4d8' }}
            labelFormatter={(d) => formatDate(String(d))}
            formatter={(v, name) => [formatBRL(Number(v), true), name === 'cumulative' ? 'Cumulative' : 'Day']}
          />
          <Area type="linear" dataKey="cumulative" stroke={color} strokeWidth={2} fill="url(#pfill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
