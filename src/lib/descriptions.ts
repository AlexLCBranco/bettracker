// BT-47: a bet's written description (its "before" and "after" texts, preAnalysis / postAnalysis), seen in the Bets
// table without opening the form.

import type { Bet } from './types';

type Texts = Pick<Bet, 'preAnalysis' | 'postAnalysis'>;

export const hasDescription = (b: Texts) => b.preAnalysis.trim() !== '' || b.postAnalysis.trim() !== '';

/** A plain row, or a dutch / rollover / ladder row: any of its bets has a description. */
export const rowHasDescription = (bets: Texts[]) => bets.some(hasDescription);

/** The parts that have text, "Before" then "After". */
export function descriptionParts(b: Texts): { label: 'Before' | 'After'; text: string }[] {
  const out: { label: 'Before' | 'After'; text: string }[] = [];
  if (b.preAnalysis.trim()) out.push({ label: 'Before', text: b.preAnalysis.trim() });
  if (b.postAnalysis.trim()) out.push({ label: 'After', text: b.postAnalysis.trim() });
  return out;
}

/**
 * Whether a row's description is open: with the "Descriptions" switch on, every row that has one is open; `flipped`
 * holds the rows opened or closed by hand against that.
 */
export const isDescriptionOpen = (key: string, has: boolean, switchOn: boolean, flipped: ReadonlySet<string>) => (switchOn && has) !== flipped.has(key);

/** The bets whose texts changed (trimmed text compared), with the patch to save. */
export function descriptionChanges(bets: (Texts & { id: string })[], drafts: Record<string, Texts>): { id: string; patch: Texts }[] {
  return bets.flatMap((b) => {
    const d = drafts[b.id];
    if (!d) return [];
    const patch = { preAnalysis: d.preAnalysis.trim(), postAnalysis: d.postAnalysis.trim() };
    return patch.preAnalysis === b.preAnalysis.trim() && patch.postAnalysis === b.postAnalysis.trim() ? [] : [{ id: b.id, patch }];
  });
}
