// BT-47 / BT-52: a bet's notes seen in the Bets table without opening the form. Three slots, as on calendarkit's Slate:
// Pre (before the game), Live (during it) and Post (after it). Pre and Post are BT-47's "Before" / "After" texts, kept
// in the same fields (preAnalysis / postAnalysis); Live is new (liveAnalysis).

import type { Bet } from './types';

export const SLOTS = ['pre', 'live', 'post'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { pre: 'Pre', live: 'Live', post: 'Post' };
export const SLOT_FIELD = { pre: 'preAnalysis', live: 'liveAnalysis', post: 'postAnalysis' } as const satisfies Record<Slot, keyof Bet>;
export const nextSlot = (s: Slot): Slot => SLOTS[(SLOTS.indexOf(s) + 1) % SLOTS.length]!;

export type Texts = Pick<Bet, 'preAnalysis' | 'liveAnalysis' | 'postAnalysis'>;

/**
 * A bet's three notes from what it holds. Bets saved before BT-52 (or an older export) have only Before / After: the
 * Before text is Pre, the After text is Post, Live is empty. Nothing is lost.
 */
export function notesOf(b: Partial<Texts>): Texts {
  return { preAnalysis: b.preAnalysis ?? '', liveAnalysis: b.liveAnalysis ?? '', postAnalysis: b.postAnalysis ?? '' };
}

const text = (b: Partial<Texts>, s: Slot) => (notesOf(b)[SLOT_FIELD[s]] ?? '').trim();

export const hasDescription = (b: Partial<Texts>) => SLOTS.some((s) => text(b, s) !== '');

/** A plain row, or a dutch / rollover / ladder row: any of its bets has a note. */
export const rowHasDescription = (bets: Partial<Texts>[]) => bets.some(hasDescription);

/** The slots that hold text on any of the bets, in order. */
export const filledSlots = (bets: Partial<Texts>[]): Slot[] => SLOTS.filter((s) => bets.some((b) => text(b, s)));

/** Where an opened row starts: its last filled slot (Post before Live before Pre), Pre when it has none. */
export const startSlot = (bets: Partial<Texts>[]): Slot => filledSlots(bets).at(-1) ?? 'pre';

/** The slots that have text, Pre, Live then Post. */
export function descriptionParts(b: Partial<Texts>): { label: string; slot: Slot; text: string }[] {
  return SLOTS.filter((s) => text(b, s)).map((s) => ({ label: SLOT_LABEL[s], slot: s, text: text(b, s) }));
}

/**
 * Whether a row's notes are open: with the "Descriptions" switch on, every row that has one is open; `flipped` holds
 * the rows opened or closed by hand against that.
 */
export const isDescriptionOpen = (key: string, has: boolean, switchOn: boolean, flipped: ReadonlySet<string>) => (switchOn && has) !== flipped.has(key);

/** The bets whose notes changed (trimmed text compared), with the patch to save. */
export function descriptionChanges(bets: (Partial<Texts> & { id: string })[], drafts: Record<string, Texts>): { id: string; patch: Texts }[] {
  return bets.flatMap((b) => {
    const d = drafts[b.id];
    if (!d) return [];
    const was = notesOf(b);
    const patch = { preAnalysis: d.preAnalysis.trim(), liveAnalysis: d.liveAnalysis.trim(), postAnalysis: d.postAnalysis.trim() };
    return SLOTS.every((s) => patch[SLOT_FIELD[s]] === was[SLOT_FIELD[s]].trim()) ? [] : [{ id: b.id, patch }];
  });
}

/** A note cut into plain text and web addresses (http / https), so the addresses can be links. */
export function linkParts(note: string): { text: string; url?: string }[] {
  const out: { text: string; url?: string }[] = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let at = 0;
  for (const m of note.matchAll(re)) {
    // a sentence's closing punctuation is not part of the address
    const url = m[0].replace(/[.,;:!?)\]]+$/, '');
    const i = m.index!;
    if (i > at) out.push({ text: note.slice(at, i) });
    out.push({ text: url, url });
    at = i + url.length;
  }
  if (at < note.length) out.push({ text: note.slice(at) });
  return out;
}
