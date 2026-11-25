// BT-50: the games a day's bets were placed on, one row per game.
import { describe, expect, it } from 'vitest';
import { bet, leg } from './helpers';
import { groupRows } from '@/lib/dutch';
import { dayGames, daysWithGame, gameMatchKey } from '@/lib/gamesInvolved';
import { dayGroups } from '@/lib/table';

const solo = (game: string, over = {}) => bet({ legs: [leg({ game })], ...over });

describe('matching', () => {
  it('"A vs B" equals "B vs A", any separator, case and accents ignored', () => {
    const k = gameMatchKey('Celtics vs Warriors');
    expect(gameMatchKey('Warriors @ Celtics')).toBe(k);
    expect(gameMatchKey('  celtics x WARRIORS ')).toBe(k);
    expect(gameMatchKey('Grêmio vs São Paulo')).toBe(gameMatchKey('sao paulo v gremio'));
  });
  it('different spellings stay different; no game is ""', () => {
    expect(gameMatchKey('Celtics vs Warriors')).not.toBe(gameMatchKey('Boston vs Warriors'));
    expect(gameMatchKey('  ')).toBe('');
  });
});

describe('a day\'s games', () => {
  it('one row per game; a bet on it counted once, stakes added, A vs B / B vs A together', () => {
    const rows = groupRows([solo('Celtics vs Warriors', { stake: 10, result: 'won', odds: 2 }), solo('Warriors @ Celtics', { stake: 20, result: 'lost' }), solo('Lakers vs Suns', { stake: 5 })]);
    const g = dayGames(rows);
    expect(g.map((x) => x.game)).toEqual(['Celtics @ Warriors', 'Lakers @ Suns']);
    expect(g[0]).toMatchObject({ count: 2, stake: 30, profit: -10, pending: 0, sports: ['Basketball'] });
    expect(g[1]).toMatchObject({ count: 1, stake: 5, pending: 1 });
  });
  it("a combination lists every leg's game; its stake counts on each", () => {
    const combo = bet({ type: 'combination', stake: 10, legs: [leg({ game: 'A vs B' }), leg({ game: 'C vs D' }), leg({ game: 'B vs A' })] });
    const g = dayGames(groupRows([combo]));
    expect(g.map((x) => [x.game, x.count, x.stake])).toEqual([
      ['A @ B', 1, 10],
      ['C @ D', 1, 10],
    ]);
  });
  it("a dutch counts once; each split's game", () => {
    const d = [bet({ dutchId: 'd', stake: 60, legs: [leg({ game: 'X vs Y', selection: 'X' })] }), bet({ dutchId: 'd', stake: 40, legs: [leg({ game: 'Y vs X', selection: 'Y' })] }), bet({ dutchId: 'd', stake: 10, legs: [leg({ game: 'Z vs W', selection: 'Draw' })] })];
    const g = dayGames(groupRows(d));
    expect(g.map((x) => [x.game, x.count, x.stake])).toEqual([
      ['X @ Y', 1, 100],
      ['Z @ W', 1, 10],
    ]);
  });
  it('bets with no game add nothing; PPs are never bets, so never here', () => {
    expect(dayGames(groupRows([solo('')]))).toEqual([]);
  });
});

describe('filtering by a game', () => {
  it('keeps only the rows that include it, days without it go, counts recomputed', () => {
    const a = solo('Celtics vs Warriors', { placedDate: '2026-11-25', gameDate: '2026-11-25' });
    const b = solo('Lakers vs Suns', { placedDate: '2026-11-25', gameDate: '2026-11-25' });
    const c = solo('Lakers vs Suns', { placedDate: '2026-11-24', gameDate: '2026-11-24' });
    const days = dayGroups(groupRows([a, b, c]));
    const f = daysWithGame(days, gameMatchKey('Warriors @ Celtics'));
    expect(f.map((d) => [d.date, d.count])).toEqual([['2026-11-25', 1]]);
    expect(daysWithGame(days, gameMatchKey('suns vs lakers')).map((d) => [d.date, d.count])).toEqual([
      ['2026-11-25', 1],
      ['2026-11-24', 1],
    ]);
  });
});
