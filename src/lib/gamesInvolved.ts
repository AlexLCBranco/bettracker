// BT-50: "Games involved": the games a day's bets were placed on, one row per game instead of one per bet. A game
// counts when any bet of the day has it (a solo's game, any combination leg's, any dutch split's). PPs live in their
// own tables and never reach here. Games are matched by their tidied text (BT-20), case and accents ignored, and
// "A vs B" equals "B vs A"; games typed differently beyond that stay two rows.

import { normalize } from './autocomplete';
import { rowBets, type BetRow } from './dutch';
import { linksFor, type GameLink } from './gameLinks';
import { profit, profitMoney } from './money';
import { collapseRollovers } from './rollover';
import { dayGroups, displayGame, type DayGroup } from './table';
import { gameTeams, tidyGame, type NameCasing } from './tidy';
import type { Bet, Money } from './types';

/** The key a game is matched by: tidied, case and accents ignored, its two sides in a fixed order. "" for no game. */
export function gameMatchKey(game: string): string {
  const t = tidyGame(game);
  if (!t) return '';
  const teams = gameTeams(t);
  if (teams.length === 2) return teams.map(normalize).sort().join(' vs ');
  return normalize(t);
}

const hasGame = (b: Pick<Bet, 'legs'>, key: string) => b.legs.some((l) => gameMatchKey(l.game) === key);

/** Does a table row (a bet, a dutch, a rollover) include this game? */
export const rowHasGame = (r: BetRow, key: string) => rowBets(r).some((b) => hasGame(b, key));

export interface DayGame {
  key: string;
  /** As shown: "Celtics @ Warriors" (the first spelling met). */
  game: string;
  sports: string[];
  /** Table rows (bets) that include it: a dutch or a rollover counts once. */
  count: number;
  /** Their stake added up (a rollover: its first stake, the rolled stakes are the same money). */
  stake: number;
  /** Net profit of the settled ones. */
  profit: number;
  /** How many of them are still pending (an open shot too). */
  pending: number;
  /** The money of the first bet on it: the amounts are written in it. */
  money: Money;
  links: GameLink[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The games of a day's rows, in the order first met. */
export function dayGames(rows: BetRow[], names: NameCasing = new Map(), links: GameLink[] = []): DayGame[] {
  const out = new Map<string, DayGame & { date: string; linkGames: Set<string> }>();
  for (const r of rows) {
    const bets = rowBets(r);
    // the row's games, each once
    const keys = new Map<string, { raw: string; sport: string; date: string }[]>();
    for (const b of bets)
      for (const l of b.legs) {
        const k = gameMatchKey(l.game);
        if (!k) continue;
        keys.set(k, [...(keys.get(k) ?? []), { raw: l.game, sport: l.sport.trim(), date: b.gameDate }]);
      }
    // money as the table counts it: a rollover chain is one bet
    const money = collapseRollovers(bets);
    for (const [k, seen] of keys) {
      const counted = r.kind === 'rollover' ? money : money.filter((b) => hasGame(b, k));
      let g = out.get(k);
      if (!g) {
        g = { key: k, game: displayGame(seen[0]!.raw, names), sports: [], count: 0, stake: 0, profit: 0, pending: 0, money: bets[0]!.money, links: [], date: seen[0]!.date, linkGames: new Set() };
        out.set(k, g);
      }
      for (const s of seen) {
        if (s.sport && !g.sports.includes(s.sport)) g.sports.push(s.sport);
        g.linkGames.add(`${s.date}|${s.raw.trim()}`);
      }
      g.count++;
      g.stake = round2(g.stake + counted.reduce((t, b) => t + b.stake, 0));
      if (counted.some((b) => b.result === 'pending')) g.pending++;
      g.profit = round2(g.profit + counted.reduce((t, b) => t + (b.result === 'pending' || profitMoney(b.money) !== profitMoney(g!.money) ? 0 : profit(b)), 0));
    }
  }
  return [...out.values()].map(({ linkGames, ...rest }) => {
    const { date: _date, ...g } = rest;
    void _date;
    const seen = new Set<string>();
    const ls: GameLink[] = [];
    for (const lg of linkGames) {
      const [date, raw] = [lg.slice(0, 10), lg.slice(11)];
      for (const l of linksFor(links, raw, date)) {
        if (seen.has(l.site)) continue;
        seen.add(l.site);
        ls.push(l);
      }
    }
    return { ...g, links: ls };
  });
}

/** The days with only the rows that include a game (days left empty go); each day's count and nets recomputed. */
export function daysWithGame(days: DayGroup[], key: string): DayGroup[] {
  const dateOf = new Map<BetRow, string>();
  const rows: BetRow[] = [];
  for (const d of days)
    for (const r of d.rows)
      if (rowHasGame(r, key)) {
        dateOf.set(r, d.date);
        rows.push(r);
      }
  return dayGroups(rows, (r) => dateOf.get(r)!);
}
