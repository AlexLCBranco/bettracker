import { groupOutcome, type GroupOutcome } from '@/lib/dutch';
import { comboHits, dutchHits, hitsText, missesText, missesTitle, type DutchHits, type HitTone, type SplitMark } from '@/lib/hits';
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

/**
 * On a table row, a settled group where nothing hit says nothing the Lost badge does not (BT-19): no badge then (its
 * misses go in the Lost badge's tooltip, see `lostTitle`).
 */
export const hitBadgeShown = (h: DutchHits | null) => !!h && h.tone !== 'none';

/** "1/2" splits that hit, coloured, with the distinct missed legs under it (named in the tooltip). */
export function HitBadge({ bets, row }: { bets: Bet[]; row?: boolean }) {
  const h = dutchHits(bets);
  if (row && !hitBadgeShown(h)) return null;
  return <Count h={h} outcome={groupOutcome(bets)} testId="hit" />;
}

/** BT-17: a combination's legs that hit ("2/3"), like a dutch's splits. */
export function ComboHitBadge({ bet }: { bet: Bet }) {
  const h = comboHits(bet);
  if (!h || !hitBadgeShown(h)) return null;
  const outcome: GroupOutcome = bet.result === 'pending' ? 'pending' : bet.result === 'won' || bet.result === 'half-won' ? 'won' : bet.result === 'void' ? 'even' : 'lost';
  return <Count h={h} outcome={outcome} testId="leg-hit" noun="legs" />;
}

/** Tooltip for a group's result badge when its hit badge is hidden: what missed. */
export const lostTitle = (h: DutchHits | null) => (h && !hitBadgeShown(h) ? missesTitle(h) : undefined);

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
