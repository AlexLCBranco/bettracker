import { dutchHits, hitsText, missesText, missesTitle, type HitTone, type SplitMark } from '@/lib/hits';
import type { Bet } from '@/lib/types';

export const HIT_TONE_CLASS: Record<HitTone, string> = {
  all: 'bg-emerald-500 text-black',
  some: 'bg-amber-500/25 text-amber-300',
  none: 'bg-red-500/25 text-red-300',
  pending: 'bg-zinc-700/60 text-zinc-300',
  void: 'bg-zinc-700/60 text-zinc-300',
};

/** "1/2" splits that hit, coloured, with the distinct missed legs under it (named in the tooltip). */
export function HitBadge({ bets }: { bets: Bet[] }) {
  const h = dutchHits(bets);
  const misses = missesText(h);
  return (
    <span className="inline-flex flex-col items-start leading-tight" title={missesTitle(h)} data-testid="hit-badge">
      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${HIT_TONE_CLASS[h.tone]}`} data-testid="hit-count" data-tone={h.tone}>
        {hitsText(h)}
      </span>
      {misses && (
        <span className="mt-0.5 max-w-36 truncate text-[11px] text-zinc-400" data-testid="hit-misses">
          {misses}
        </span>
      )}
    </span>
  );
}

const MARK: Record<SplitMark, { text: string; cls: string }> = {
  hit: { text: '✓ hit', cls: 'text-emerald-400' },
  miss: { text: '✕ miss', cls: 'text-red-400' },
  void: { text: '– void', cls: 'text-zinc-400' },
  pending: { text: '… pending', cls: 'text-zinc-500' },
};

/** Small hit / miss / void / pending mark on a split of an expanded dutch. */
export function SplitMarkTag({ mark }: { mark: SplitMark }) {
  const m = MARK[mark];
  return (
    <span className={`text-[10px] font-semibold uppercase ${m.cls}`} data-testid="split-mark" data-mark={mark}>
      {m.text}
    </span>
  );
}
