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


/** Text colour per tone (signs, profits, leg names). */
export const TONE_TEXT: Record<Tone, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  partial: 'text-amber-300',
  neutral: 'text-zinc-400',
  pending: 'text-zinc-500',
};
