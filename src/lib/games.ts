// BT-25: the game of a logged bet, set or changed from the table in one step, on every row type.

import { isReallySolo } from './quickadd';
import { displayGame } from './table';
import type { NameCasing } from './tidy';
import type { Bet, BetInput, Leg } from './types';

export { isReallySolo };

/** A bet as read from the database, a legless "combination" shown as the solo it is (with its one empty leg). */
export function asSolo(b: Bet): Bet {
  if (!isReallySolo(b.type, b.legs, b.betText)) return b;
  const leg: Leg = b.legs[0] ?? { id: `${b.id}-leg`, sport: '', game: '', market: '', selection: '', odds: b.odds, result: b.result };
  return { ...b, type: 'solo', legs: [{ ...leg, odds: b.odds, result: b.result }] };
}

/** One box of the game editor: the legs whose game is one of `covers` ("" = no game) get `value`. */
export interface GameField {
  covers: string[];
  label: string;
  /** The game as shown ("Celtics @ Warriors"), "" for none. */
  value: string;
  /** Legs it changes. */
  legs: number;
}

const key = (l: Pick<Leg, 'game'>) => l.game.trim();

/**
 * The game editor's boxes for a row (one bet, or a dutch's bets). One game or none: one box, for every leg with that
 * game or none. Several games: one box per game, plus one for the legs with no game. Null when a bet has no legs to
 * hold a game (a combination whose legs were not entered: its legs are added in the full form).
 */
export function gameFields(bets: Bet[], names: NameCasing = new Map()): GameField[] | null {
  if (bets.some((b) => b.legs.length === 0)) return null;
  const legs = bets.flatMap((b) => b.legs);
  const games = [...new Set(legs.map(key).filter(Boolean))];
  const none = legs.filter((l) => !key(l)).length;
  const count = (g: string) => legs.filter((l) => key(l) === g).length;
  if (games.length <= 1) return [{ covers: [games[0] ?? '', ''], label: 'Game', value: games[0] ? displayGame(games[0], names) : '', legs: legs.length }];
  const fields: GameField[] = games.map((g, i) => ({ covers: [g], label: `Game ${i + 1}`, value: displayGame(g, names), legs: count(g) }));
  if (none) fields.push({ covers: [''], label: 'Legs with no game', value: '', legs: none });
  return fields;
}

/** The leg patches for the boxes as typed (`values[i]` for `fields[i]`): only bets whose legs change. */
export function applyGames(bets: Bet[], fields: GameField[], values: string[]): { id: string; patch: Pick<BetInput, 'legs'> }[] {
  const out: { id: string; patch: Pick<BetInput, 'legs'> }[] = [];
  for (const b of bets) {
    let changed = false;
    const legs = b.legs.map(({ sport, game, market, selection, odds, result, actual }) => {
      const l = { sport, game, market, selection, odds, result, actual };
      const i = fields.findIndex((f) => f.covers.includes(key(l)));
      const v = values[i]?.trim();
      if (i < 0 || v == null || v === fields[i]!.value.trim()) return l;
      changed = true;
      return { ...l, game: v };
    });
    if (changed) out.push({ id: b.id, patch: { legs } });
  }
  return out;
}
