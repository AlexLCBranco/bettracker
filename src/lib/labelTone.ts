// Label tones (owner, 2026-11-27): a label is negative (red, the default: "my bad", "lost by one"), positive (green:
// "nailed it") or neutral (grey). The tone belongs to the label's name, not to one bet, so every bet with that label
// shows the same colour. Stored as { key: 'positive' | 'neutral' }; anything not listed is negative.

import { normalize } from './autocomplete';

export type LabelTone = 'positive' | 'negative' | 'neutral';
export type LabelTones = Record<string, 'positive' | 'neutral'>;

/** The order a chip click goes through. */
export const TONES: LabelTone[] = ['negative', 'positive', 'neutral'];
export const nextTone = (t: LabelTone): LabelTone => TONES[(TONES.indexOf(t) + 1) % TONES.length]!;
export const TONE_COLOUR: Record<LabelTone, string> = { negative: 'red', positive: 'green', neutral: 'grey' };

export const DEFAULT_TONE = 'negative' as const;

/** The key a label's tone is kept under: case, accents and spacing do not matter. */
export const labelKey = (label: string) => normalize(label.replace(/\s+/g, ' ').trim());

export const toneOf = (tones: LabelTones, label: string): LabelTone => (tones[labelKey(label)] ?? DEFAULT_TONE);

/** The map with one label's tone set (negative drops its entry). */
export function withTone(tones: LabelTones, label: string, tone: LabelTone): LabelTones {
  const key = labelKey(label);
  if (!key) return tones;
  const next = { ...tones };
  if (tone === DEFAULT_TONE) delete next[key];
  else next[key] = tone;
  return next;
}

/** A stored or sent map, cleaned: only non-empty keys marked positive or neutral. */
export function readLabelTones(raw: unknown): LabelTones {
  const out: LabelTones = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = labelKey(k).slice(0, 60);
    if (key && (v === 'positive' || v === 'neutral')) out[key] = v;
  }
  return out;
}

/** The chip's colours per tone. */
export const TONE_CHIP: Record<LabelTone, string> = {
  positive: 'bg-emerald-500/20 text-emerald-300',
  negative: 'bg-red-500/20 text-red-300',
  neutral: 'bg-zinc-500/25 text-zinc-300',
};
