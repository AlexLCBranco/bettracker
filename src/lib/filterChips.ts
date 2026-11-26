// BT-57: every filter in use shows as a removable chip beside the Filters button, so nothing is hidden silently.

import { NO_FILTERS, type Filters } from './filters';
import { RESULT_LABEL } from './types';

/** A chip: what it clears (a Filters key, the typed dates, or the game filter) and its text. */
export interface FilterChip {
  key: keyof Filters | 'game';
  label: string;
}

const TYPE_LABEL: Record<string, string> = { solo: 'Solo', combination: 'Combination', dutch: 'Dutch' };
const SITUATION_LABEL: Record<string, string> = { pregame: 'Pregame', live: 'Live' };

/**
 * The chips for the filters in use, in the panel's order. `from` / `to` are the typed date texts (shown as typed);
 * Search is not a chip (its box is always on screen).
 */
export function filterChips(f: Filters, dates: { from: string; to: string }, game: string | null): FilterChip[] {
  const out: FilterChip[] = [];
  if (dates.from.trim()) out.push({ key: 'from', label: `From: ${dates.from.trim()}` });
  if (dates.to.trim()) out.push({ key: 'to', label: `To: ${dates.to.trim()}` });
  if (f.book.trim()) out.push({ key: 'book', label: `Book: ${f.book.trim()}` });
  if (f.sport.trim()) out.push({ key: 'sport', label: `Sport: ${f.sport.trim()}` });
  if (f.type) out.push({ key: 'type', label: `Type: ${TYPE_LABEL[f.type] ?? f.type}` });
  if (f.situation) out.push({ key: 'situation', label: `Situation: ${SITUATION_LABEL[f.situation] ?? f.situation}` });
  if (f.result) out.push({ key: 'result', label: `Result: ${RESULT_LABEL[f.result]}` });
  if (game) out.push({ key: 'game', label: `Game: ${game}` });
  return out;
}

/** The filters with one chip's filter cleared (dates and game are cleared by the caller). */
export const withoutChip = (f: Filters, key: FilterChip['key']): Filters => (key === 'game' || key === 'from' || key === 'to' ? f : { ...f, [key]: NO_FILTERS[key] });
