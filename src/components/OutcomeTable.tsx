'use client';

import type { OutcomeRow } from '@/lib/dutching';
import { formatBRL } from '@/lib/money';
import { formatPercent } from '@/lib/stats';

const tone = (n: number) => (n > 0 ? 'text-emerald-400' : n < 0 ? 'text-red-400' : 'text-zinc-400');

function Range({ lo, hi, same, fmt }: { lo: number; hi: number; same: boolean; fmt(n: number): string }) {
  if (same) return <span className={tone(lo)}>{fmt(lo)}</span>;
  return (
    <>
      <span className={tone(lo)}>{fmt(lo)}</span>
      <span className="text-zinc-500"> – </span>
      <span className={tone(hi)}>{fmt(hi)}</span>
    </>
  );
}

/** "If this many win": returns, profit and ROI for 0, 1, 2 … every selection winning (BT-7). */
export function OutcomeTable({ rows, compact }: { rows: OutcomeRow[]; compact?: boolean }) {
  const pad = compact ? 'py-1' : 'py-2';
  const be = rows.find((r) => r.breakEven);
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'} data-testid="outcome-table">
      <div className="flex items-baseline justify-between">
        <h3 className={`font-semibold ${compact ? 'text-xs text-zinc-400' : 'text-sm'}`}>If this many win</h3>
        <span className="text-xs text-zinc-500" data-testid="outcome-break-even">
          {be ? `break-even from ${be.wins} win${be.wins === 1 ? '' : 's'}` : 'no count is sure to profit'}
        </span>
      </div>
      <table className={`w-full ${compact ? 'text-xs' : 'text-sm'}`} aria-label="If this many win">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
            <th className={`${pad} pl-2 pr-3 font-medium`}>Wins</th>
            <th className={`${pad} px-3 text-right font-medium`}>Returns</th>
            <th className={`${pad} px-3 text-right font-medium`}>Profit</th>
            <th className={`${pad} pl-3 text-right font-medium`}>ROI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={String(r.wins)}
              className={`border-b border-zinc-900 ${r.breakEven ? 'border-l-2 border-l-emerald-500 bg-emerald-500/5' : 'border-l-2 border-l-transparent'}`}
              data-testid="outcome-row"
              data-break-even={r.breakEven || undefined}
            >
              <td className={`${pad} pl-2 pr-3 text-zinc-200`}>{r.wins === 'shared' ? 'Shared leg loses' : r.wins}</td>
              <td className={`${pad} px-3 text-right tabular-nums`} data-testid="outcome-returns">
                {r.minReturn === r.maxReturn ? formatBRL(r.minReturn) : `${formatBRL(r.minReturn)} – ${formatBRL(r.maxReturn)}`}
              </td>
              <td className={`${pad} px-3 text-right tabular-nums`} data-testid="outcome-profit">
                <Range same={r.minProfit === r.maxProfit} lo={r.minProfit} hi={r.maxProfit} fmt={(n) => formatBRL(n, true)} />
              </td>
              <td className={`${pad} pl-3 text-right tabular-nums`}>
                <Range same={r.minProfit === r.maxProfit} lo={r.minRoi} hi={r.maxRoi} fmt={(n) => formatPercent(n, true)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
