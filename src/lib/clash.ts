// BT-22: a team in two different games on the same date is almost always a typo (wrong game or wrong date).
// Saving still works; the forms show a warning.

import { normalize } from './autocomplete';
import { formatDate } from './dates';
import { gameTeams, tidyGame } from './tidy';
import type { Bet } from './types';

export interface Clash {
  team: string;
  date: string;
  /** The two (or more) games, as written. */
  games: string[];
}

/**
 * Teams that play in two different games on `date`: among `games` (the bet being saved) and the games of `others` on
 * that date (every other bet; leave out the ones being edited).
 */
export function teamClashes(games: string[], date: string, others: Pick<Bet, 'gameDate' | 'legs'>[]): Clash[] {
  const mine = games.map(tidyGame).filter(Boolean);
  if (!mine.length) return [];
  const all = new Map<string, string>(); // game key → game as written
  for (const g of [...mine, ...others.filter((b) => b.gameDate === date).flatMap((b) => b.legs.map((l) => tidyGame(l.game)))]) {
    const k = normalize(g);
    if (k && !all.has(k)) all.set(k, g);
  }
  const mineKeys = new Set(mine.map(normalize));
  // team → games it plays in
  const byTeam = new Map<string, { team: string; games: Map<string, string> }>();
  for (const [k, g] of all) {
    for (const t of gameTeams(g)) {
      const tk = normalize(t);
      const e = byTeam.get(tk) ?? { team: t, games: new Map() };
      e.games.set(k, g);
      byTeam.set(tk, e);
    }
  }
  const out: Clash[] = [];
  for (const e of byTeam.values()) {
    // only clashes that involve a game of the bet being saved
    if (e.games.size >= 2 && [...e.games.keys()].some((k) => mineKeys.has(k))) out.push({ team: e.team, date, games: [...e.games.values()] });
  }
  return out;
}

/** "Celtics play twice on 22/11/2026: Celtics vs Warriors and Celtics vs Knicks." */
export function clashText(c: Clash): string {
  const games = c.games.length === 2 ? c.games.join(' and ') : c.games.join(', ');
  return `${c.team} play twice on ${formatDate(c.date)}: ${games}. Check the game or the date.`;
}
