import { normalize } from './autocomplete';
import type { Bet, BetType, Result, Situation } from './types';

export interface Filters {
  /** Placed-date range, "YYYY-MM-DD" or "". */
  from: string;
  to: string;
  book: string;
  sport: string;
  type: BetType | '';
  situation: Situation | '';
  result: Result | '';
  /** Free text over bet text, game, market, selection. */
  text: string;
}

export const NO_FILTERS: Filters = { from: '', to: '', book: '', sport: '', type: '', situation: '', result: '', text: '' };

export function filterBets(bets: Bet[], f: Filters): Bet[] {
  const book = normalize(f.book);
  const sport = normalize(f.sport);
  const text = normalize(f.text);
  return bets.filter(
    (b) =>
      (!f.from || b.placedDate >= f.from) &&
      (!f.to || b.placedDate <= f.to) &&
      (!book || normalize(b.book) === book) &&
      (!sport || b.legs.some((l) => normalize(l.sport) === sport)) &&
      (!f.type || b.type === f.type) &&
      (!f.situation || b.situation === f.situation) &&
      (!f.result || b.result === f.result) &&
      (!text || [b.betText, ...b.legs.flatMap((l) => [l.game, l.market, l.selection])].some((s) => normalize(s).includes(text))),
  );
}
