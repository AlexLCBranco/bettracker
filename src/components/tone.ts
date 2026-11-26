import type { Tone } from '@/lib/tone';

/** Badge (result label) colours per tone (BT-13). */
export const TONE_BADGE: Record<Tone, string> = {
  win: 'bg-emerald-500/15 text-emerald-400',
  loss: 'bg-red-500/15 text-red-400',
  partial: 'bg-amber-500/15 text-amber-300',
  neutral: 'bg-zinc-500/15 text-zinc-300',
  pending: 'bg-zinc-700/40 text-zinc-300',
};

/** Thin left edge of a table row per tone (BT-23: with the result pill and the coloured +/-, the row's only signal). */
export const TONE_EDGE: Record<Tone, string> = {
  win: 'border-l-[3px] border-l-emerald-500',
  loss: 'border-l-[3px] border-l-red-500',
  partial: 'border-l-[3px] border-l-amber-400',
  neutral: 'border-l-[3px] border-l-zinc-600',
  pending: 'border-l-[3px] border-l-zinc-800',
};

/**
 * A dutch's or rollover's rail: the group's tone down the left of its row and every row under it, so the bets that
 * belong together read as one block (a pending group's rail still shows).
 */
export const TONE_RAIL: Record<Tone, string> = { ...TONE_EDGE, pending: 'border-l-[3px] border-l-zinc-600' };

/** A bet's own tone inside a group: a thin edge where its indented cell starts (the outer edge is the group's). */
export const TONE_INNER: Record<Tone, string> = {
  win: 'border-l-2 border-l-emerald-500/70',
  loss: 'border-l-2 border-l-red-500/70',
  partial: 'border-l-2 border-l-amber-400/70',
  neutral: 'border-l-2 border-l-zinc-500/70',
  pending: 'border-l-2 border-l-zinc-700',
};


/** Text colour per tone (signs, profits, leg names). */
export const TONE_TEXT: Record<Tone, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  partial: 'text-amber-300',
  neutral: 'text-zinc-400',
  pending: 'text-zinc-500',
};
