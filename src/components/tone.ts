import type { Tone } from '@/lib/tone';

/** Badge (result label) colours per tone (BT-13). */
export const TONE_BADGE: Record<Tone, string> = {
  win: 'bg-emerald-500/15 text-emerald-400',
  loss: 'bg-red-500/15 text-red-400',
  partial: 'bg-amber-500/15 text-amber-300',
  neutral: 'bg-zinc-500/15 text-zinc-300',
  pending: 'bg-zinc-700/40 text-zinc-300',
};

/** Left edge of a table row per tone. */
export const TONE_EDGE: Record<Tone, string> = {
  win: 'border-l-4 border-l-emerald-500',
  loss: 'border-l-4 border-l-red-500',
  partial: 'border-l-4 border-l-amber-400',
  neutral: 'border-l-4 border-l-zinc-600',
  pending: 'border-l-4 border-l-zinc-800',
};

/** Faint row background per tone (settled rows only). */
export const TONE_TINT: Record<Tone, string> = {
  win: 'bg-emerald-500/[0.06]',
  loss: 'bg-red-500/[0.07]',
  partial: 'bg-amber-500/[0.05]',
  neutral: '',
  pending: '',
};

/** Text colour per tone (signs, profits, leg names). */
export const TONE_TEXT: Record<Tone, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  partial: 'text-amber-300',
  neutral: 'text-zinc-400',
  pending: 'text-zinc-500',
};
