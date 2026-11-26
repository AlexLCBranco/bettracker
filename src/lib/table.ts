// BT-23: what the bet table shows, as plain data (tested without a browser): rows grouped by day with a total per
// day, the Result column's one sub-line, and games written "Away @ Home".

import { countBets, groupRows, type BetRow } from './dutch';
import { comboHits, dutchHits } from './hits';
import { profit, profitMoney } from './money';
import { collapseRollovers } from './rollover';
import { tidyGame, tidyNames, type NameCasing } from './tidy';
import type { Bet, Leg, Money } from './types';
import { asUnitBets } from './units';

/** The day a table row sits under: a bet's date, a dutch's earliest, a rollover's latest (it sits where its newest bet is). */
export const rowDate = (r: BetRow): string =>
  r.kind === 'bet' ? r.bet.placedDate : r.kind === 'dutch' ? r.bets.map((b) => b.placedDate).sort()[0]! : r.bets.map((b) => b.placedDate).sort().at(-1)!;

export interface DayNet {
  money: Money;
  value: number;
  /** BT-38: the same net in units, when every bet of that money that day has a unit size (else null). */
  units: number | null;
}

export interface DayGroup {
  date: string;
  rows: BetRow[];
  /** Bets, a dutch counted once. */
  count: number;
  /** Net profit of the settled bets, per money scope present (real first); none while nothing is settled. */
  nets: DayNet[];
  /** BT-58: won / lost / pending, a dutch, rollover or ladder counted once (as summarize counts). */
  record: DayRecord;
}

export interface DayRecord {
  wins: number;
  losses: number;
  pending: number;
}

/** BT-58: a week's subtotal (Monday to Sunday, owner 2026-11-26), shown after its last day on the All tab. */
export interface WeekTotal {
  /** Monday and Sunday of the week. */
  from: string;
  to: string;
  count: number;
  record: DayRecord;
  nets: DayNet[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Rows cut into runs of one day, in the order given (a new header whenever the date changes); by bet date unless told. */
export function dayGroups(rows: BetRow[], dateOf: (r: BetRow) => string = rowDate): DayGroup[] {
  const out: DayGroup[] = [];
  for (const r of rows) {
    const date = dateOf(r);
    let g = out[out.length - 1];
    if (!g || g.date !== date) out.push((g = { date, rows: [], count: 0, nets: [], record: { wins: 0, losses: 0, pending: 0 } }));
    g.rows.push(r);
    g.count++;
  }
  for (const g of out) {
    const bets = g.rows.flatMap((r) => (r.kind === 'bet' ? [r.bet] : r.bets));
    g.nets = netsOf(bets);
    g.record = recordOf(bets);
  }
  return out;
}

/** Net profit of the settled bets per money present (real first), with units when every bet of that money has a unit size. */
function netsOf(all: Bet[]): DayNet[] {
  const sums = new Map<Money, number>();
  for (const b of collapseRollovers(all)) if (b.result !== 'pending') sums.set(profitMoney(b.money), (sums.get(profitMoney(b.money)) ?? 0) + profit(b));
  return (['real', 'hypothetical'] as Money[])
    .filter((m) => sums.has(m))
    .map((money) => {
      const ub = asUnitBets(all.filter((b) => profitMoney(b.money) === money));
      const units = ub ? round2(collapseRollovers(ub).reduce((t, b) => t + (b.result === 'pending' ? 0 : profit(b)), 0)) : null;
      return { money, value: round2(sums.get(money)!), units };
    });
}

const recordOf = (bets: Bet[]): DayRecord => {
  const c = countBets(bets);
  return { wins: c.wins, losses: c.losses, pending: c.pending };
};

/** "3W 1L", with "2 pending" when any; "" when nothing is settled or pending. */
export function recordText(r: DayRecord): string {
  const parts = [r.wins + r.losses > 0 ? `${r.wins}W ${r.losses}L` : '', r.pending > 0 ? `${r.pending} pending` : ''];
  return parts.filter(Boolean).join(' · ');
}

/** The Monday of a date's week (local calendar arithmetic). */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d, 12);
  const back = (dt.getDay() + 6) % 7; // Monday 0 … Sunday 6
  dt.setDate(dt.getDate() - back);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/**
 * BT-58: one subtotal per week, keyed by the index of the week's last day in the order shown (the table puts it after
 * that day). Days of one week are contiguous on the All tab (newest first).
 */
export function weekTotals(days: DayGroup[]): Map<number, WeekTotal> {
  const out = new Map<number, WeekTotal>();
  let i = 0;
  while (i < days.length) {
    const from = weekStart(days[i]!.date);
    let j = i;
    while (j + 1 < days.length && weekStart(days[j + 1]!.date) === from) j++;
    const week = days.slice(i, j + 1);
    const bets = [...new Map(week.flatMap((d) => d.rows.flatMap((r) => (r.kind === 'bet' ? [r.bet] : r.bets))).map((b) => [b.id, b])).values()];
    const [y, m, d] = from.split('-').map(Number) as [number, number, number];
    const sun = new Date(y, m - 1, d + 6, 12);
    out.set(j, {
      from,
      to: `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`,
      count: week.reduce((n, x) => n + x.count, 0),
      record: recordOf(bets),
      nets: netsOf(bets),
    });
    i = j + 1;
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

/**
 * A bet row's muted result text: a won / pending combination's legs that hit ("2 of 3 legs hit", once a leg is
 * settled). A lost combination has none: its losing legs are listed on their own line instead (BT-27, losingLegs).
 */
export function betResultLine(b: Bet): string | null {
  if (b.type !== 'combination') return null;
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
