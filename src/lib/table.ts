// BT-23: what the bet table shows, as plain data (tested without a browser): rows grouped by day with a total per
// day, the Result column's one sub-line, and games written "Away @ Home".

import { groupRows, type BetRow } from './dutch';
import { comboHits, dutchHits } from './hits';
import { profit } from './money';
import { tidyGame, tidyNames, type NameCasing } from './tidy';
import type { Bet, Leg, Money } from './types';

/** The day a table row sits under: a bet's date, a dutch's earliest. */
export const rowDate = (r: BetRow): string => (r.kind === 'bet' ? r.bet.placedDate : r.bets.map((b) => b.placedDate).sort()[0]!);

export interface DayNet {
  money: Money;
  value: number;
}

export interface DayGroup {
  date: string;
  rows: BetRow[];
  /** Bets, a dutch counted once. */
  count: number;
  /** Net profit of the settled bets, per money scope present (real first); none while nothing is settled. */
  nets: DayNet[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rows cut into runs of one day, in the order given (a new header whenever the date changes). */
export function dayGroups(rows: BetRow[]): DayGroup[] {
  const out: DayGroup[] = [];
  for (const r of rows) {
    const date = rowDate(r);
    let g = out[out.length - 1];
    if (!g || g.date !== date) out.push((g = { date, rows: [], count: 0, nets: [] }));
    g.rows.push(r);
    g.count++;
  }
  for (const g of out) {
    const sums = new Map<Money, number>();
    for (const b of g.rows.flatMap((r) => (r.kind === 'bet' ? [r.bet] : r.bets)))
      if (b.result !== 'pending') sums.set(b.money, (sums.get(b.money) ?? 0) + profit(b));
    g.nets = (['real', 'hypothetical'] as Money[]).filter((m) => sums.has(m)).map((money) => ({ money, value: round2(sums.get(money)!) }));
  }
  return out;
}

/** Bets grouped for the table, `limit` rows at most (a dutch is one row). */
export const tableDays = (bets: Bet[], limit?: number) => dayGroups(groupRows(bets).slice(0, limit));

export const betsText = (n: number) => `${n} ${n === 1 ? 'bet' : 'bets'}`;

/** A game as shown: "Celtics @ Warriors" (saved "Celtics vs Warriors"), names cased properly. */
export const displayGame = (game: string, names: NameCasing = new Map()) => tidyNames(tidyGame(game), names).replace(/ vs /g, ' @ ').replace(/\s*@\s*/g, ' @ ');

/** The distinct games of some legs, as shown. */
export const legGames = (legs: Pick<Leg, 'game'>[], names: NameCasing = new Map()) => [...new Set(legs.map((l) => displayGame(l.game, names)).filter(Boolean))];
export const legMarkets = (legs: Pick<Leg, 'market'>[]) => [...new Set(legs.map((l) => l.market.trim()).filter(Boolean))];

/** A leg named for "lost by": its selection, with its market when the selection does not already say it. */
function legName(l: Pick<Leg, 'selection' | 'market' | 'game'>): string {
  const sel = l.selection.trim();
  const market = l.market.trim();
  if (!sel) return displayGame(l.game) || 'leg';
  return market && !sel.toLowerCase().includes(market.toLowerCase()) ? `${sel} ${market}` : sel;
}

const lost = (r: Bet['result']) => r === 'lost' || r === 'half-lost';

/**
 * A bet row's one muted line under its result pill: a lost combination's killer legs ("lost by Celtics ML"), or a
 * won / pending combination's legs that hit ("2 of 3 legs hit", once a leg is settled). Null otherwise.
 */
export function betResultLine(b: Bet): string | null {
  if (b.type !== 'combination') return null;
  if (lost(b.result)) {
    const killers = b.legs.filter((l) => lost(l.result)).map(legName);
    return killers.length ? `lost by ${killers.join(', ')}` : null;
  }
  if (b.result !== 'won' && b.result !== 'half-won' && b.result !== 'pending') return null;
  const h = comboHits(b);
  if (!h || h.splits === 0) return null;
  return `${h.hits} of ${h.splits + h.pending} legs hit`;
}

/** A dutch row's line under its pill: "1 of 2 splits hit", once a split is settled (void splits left out). */
export function dutchResultLine(bets: Bet[]): string | null {
  const h = dutchHits(bets);
  if (h.splits === 0) return null;
  return `${h.hits} of ${h.splits + h.pending} splits hit`;
}
