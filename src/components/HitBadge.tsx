import { groupOutcome, type GroupOutcome } from '@/lib/dutch';
import { dutchHits, hitsText, missesText, missesTitle, type DutchHits, type HitTone } from '@/lib/hits';
import type { Bet } from '@/lib/types';

export const HIT_TONE_CLASS: Record<HitTone, string> = {
  all: 'bg-emerald-500 text-black',
  some: 'bg-amber-500/25 text-amber-300',
  none: 'bg-red-500/25 text-red-300',
  pending: 'bg-zinc-700/60 text-zinc-300',
  void: 'bg-zinc-700/60 text-zinc-300',
};

/**
 * BT-19: some splits hit is no warning on a dutch that won (green) and plain grey otherwise; amber is for half
 * results only.
 */
function countClass(h: DutchHits, outcome: GroupOutcome): string {
  if (h.tone === 'some') return outcome === 'won' ? 'bg-emerald-500/15 text-emerald-300' : HIT_TONE_CLASS.pending;
  return HIT_TONE_CLASS[h.tone];
}

/** "1/2" splits that hit, coloured, with the distinct missed legs under it (named in the tooltip). Settle queue. */
export function HitBadge({ bets }: { bets: Bet[] }) {
  return <Count h={dutchHits(bets)} outcome={groupOutcome(bets)} testId="hit" />;
}

function Count({ h, outcome, testId, noun }: { h: DutchHits; outcome: GroupOutcome; testId: string; noun?: string }) {
  const misses = missesText(h);
  return (
    <span className="inline-flex flex-col items-start leading-tight" title={`${noun ? `${noun}: ` : ''}${missesTitle(h)}`} data-testid={`${testId}-badge`}>
      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${countClass(h, outcome)}`} data-testid={`${testId}-count`} data-tone={h.tone}>
        {hitsText(h)}
      </span>
      {misses && (
        <span className="mt-0.5 max-w-36 truncate text-[11px] text-zinc-400" data-testid={`${testId}-misses`}>
          {misses}
        </span>
      )}
    </span>
  );
}

