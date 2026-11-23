// BT-13: one colour scheme for results everywhere. Green = won / profit, red = lost / loss, amber = partial
// (half-won, half-lost, some splits hit), grey = pending or void. Every tone also has a sign, so it reads without
// colour (screenshots, greyscale).

import type { GroupOutcome } from './dutch';
import { profit } from './money';
import type { Bet, Result } from './types';

export type Tone = 'win' | 'loss' | 'partial' | 'neutral' | 'pending';

/** A bet's tone; a cash-out by the sign of its profit. */
export function betTone(b: Pick<Bet, 'result' | 'stake' | 'odds' | 'cashout'>): Tone {
  if (b.result === 'cash-out') {
    const p = Math.round(profit(b) * 100);
    return p > 0 ? 'win' : p < 0 ? 'loss' : 'neutral';
  }
  return resultTone(b.result);
}

/** A result's tone (legs, and bets other than cash-outs). */
export function resultTone(r: Result): Tone {
  switch (r) {
    case 'won':
      return 'win';
    case 'lost':
      return 'loss';
    case 'half-won':
    case 'half-lost':
      return 'partial';
    case 'pending':
      return 'pending';
    case 'void':
    case 'cash-out':
      return 'neutral';
  }
}

/** A dutch's tone: by its net profit (even = neutral). */
export function groupTone(o: GroupOutcome): Tone {
  return o === 'won' ? 'win' : o === 'lost' ? 'loss' : o === 'even' ? 'neutral' : 'pending';
}

/** The sign shown next to a result, so it reads without colour. */
export const TONE_SIGN: Record<Tone, string> = { win: '✓', loss: '✕', partial: '½', neutral: '–', pending: '…' };

/** Legs of a lost combination that lost (the leg that killed it), by name. */
export function losingLegs(b: Pick<Bet, 'legs' | 'type'>): string[] {
  if (b.type !== 'combination') return [];
  return b.legs.filter((l) => l.result === 'lost' || l.result === 'half-lost').map((l) => l.selection || l.game || 'leg');
}
