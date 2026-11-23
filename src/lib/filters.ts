import { normalize } from './autocomplete';
import { withWholeGroups } from './dutch';
import type { Bet, BetType, Money, Result, Situation } from './types';

/** "dutch" = bets logged as a dutch; "solo" = solo bets that are not part of one. */
export type TypeFilter = BetType | 'dutch' | '';

export interface Filters {
  /** Placed-date range, "YYYY-MM-DD" or "". */
  from: string;
  to: string;
  book: string;
  sport: string;
  type: TypeFilter;
  situation: Situation | '';
  result: Result | '';
  /** Free text over bet text, game, market, selection. */
  text: string;
  /** Real or hypothetical money only (BT-14); "" = both. */
  money: Money | '';
}

export const NO_FILTERS: Filters = { from: '', to: '', book: '', sport: '', type: '', situation: '', result: '', text: '', money: '' };

const typeOf = (b: Bet): TypeFilter => (b.dutchId ? 'dutch' : b.type);

/** The bets matching every filter. A dutch matches as a whole when any of its bets matches. */
export function filterBets(bets: Bet[], f: Filters): Bet[] {
  const book = normalize(f.book);
  const sport = normalize(f.sport);
  const text = normalize(f.text);
  const matched = bets.filter(
    (b) =>
      (!f.from || b.placedDate >= f.from) &&
      (!f.to || b.placedDate <= f.to) &&
      (!book || normalize(b.book) === book) &&
      (!sport || b.legs.some((l) => normalize(l.sport) === sport)) &&
      (!f.type || typeOf(b) === f.type) &&
      (!f.situation || b.situation === f.situation) &&
      (!f.result || b.result === f.result) &&
      (!f.money || b.money === f.money) &&
      (!text || [b.betText, ...b.legs.flatMap((l) => [l.game, l.market, l.selection])].some((s) => normalize(s).includes(text))),
  );
  return withWholeGroups(bets, matched);
}
