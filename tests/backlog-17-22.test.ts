// BT-17 … BT-22: one-leg combos, combo leg counts, consistent text, odds shown as paid, team twice on one day.
import { describe, expect, it } from 'vitest';
import { buildIndex, suggest } from '@/lib/autocomplete';
import { clashText, teamClashes } from '@/lib/clash';
import { comboHits, hitsText } from '@/lib/hits';
import { formatOdds, profit } from '@/lib/money';
import { quickAddLegs } from '@/lib/quickadd';
import { bestSpelling, gameTeams, nameCasing, tidyBet, tidyGame, tidyNames, tidyText, tidyUnits } from '@/lib/tidy';
import { validateBet } from '@/lib/validate';
import { bet, leg } from './helpers';

const raw = (over: Record<string, unknown>) => ({ stake: 10, odds: 2, result: 'pending', placedDate: '2026-11-22', legs: [], ...over });

describe('BT-17: a combination with one leg is a solo bet', () => {
  it('saved as a solo, its leg mirroring the bet', () => {
    const v = validateBet(raw({ type: 'combination', odds: 1.9, legs: [{ sport: 'NBA', game: 'Celtics @ Warriors', selection: 'Tatum 25+ PTS', odds: 1.5 }] }));
    expect(v).toMatchObject({ ok: true, value: { type: 'solo', legs: [{ sport: 'NBA', game: 'Celtics vs Warriors', selection: 'Tatum 25+ pts', odds: 1.9, result: 'pending' }] } });
  });

  it('two legs, or no legs with an "a + b" text, stay a combination (BT-25: no legs otherwise is a solo)', () => {
    expect(validateBet(raw({ type: 'combination', betText: 'a + b' }))).toMatchObject({ ok: true, value: { type: 'combination', legs: [] } });
    expect(validateBet(raw({ type: 'combination' }))).toMatchObject({ ok: true, value: { type: 'solo' } });
    expect(validateBet(raw({ type: 'combination', legs: [{ selection: 'A' }, { selection: 'B' }] }))).toMatchObject({ ok: true, value: { type: 'combination' } });
  });

  it('quick-add: "a + b" is a combination with those legs, anything else a solo', () => {
    expect(quickAddLegs('lakers ml + celtics -5')).toEqual(['lakers ml', 'celtics -5']);
    expect(quickAddLegs('lakers ml')).toBeNull();
    expect(quickAddLegs('over 2+ goals')).toBeNull();
  });

  it('a combination’s legs as a hit count, like a dutch', () => {
    const b = bet({ type: 'combination', result: 'lost', legs: [leg({ result: 'won' }), leg({ result: 'lost', selection: 'Knicks' }), leg({ result: 'won' })] });
    const h = comboHits(b)!;
    expect([hitsText(h), h.tone, h.misses.map((m) => m.name)]).toEqual(['2/3', 'some', ['Knicks']]);
    expect(hitsText(comboHits(bet({ type: 'combination', legs: [leg({ result: 'won' }), leg()] }))!)).toBe('1/1 · 1 pending');
    expect(comboHits(bet({ type: 'combination', legs: [] }))).toBeNull();
    expect(comboHits(bet())).toBeNull();
  });
});

describe('BT-20: consistent text', () => {
  it('one game format', () => {
    expect(['Celtics @ Warriors', 'Celtics vs Knicks', 'Celtics vs. Knicks', 'Celtics v Knicks', 'Flamengo x Palmeiras', ' A  @  B '].map(tidyGame)).toEqual([
      'Celtics vs Warriors',
      'Celtics vs Knicks',
      'Celtics vs Knicks',
      'Celtics vs Knicks',
      'Flamengo vs Palmeiras',
      'A vs B',
    ]);
    expect(tidyGame('Saxony')).toBe('Saxony');
    expect(gameTeams('Celtics @ Warriors')).toEqual(['Celtics', 'Warriors']);
    expect(gameTeams('Celtics')).toEqual([]);
  });

  it('stat units in one form', () => {
    expect(tidyUnits('Tatum 25+ PTS')).toBe('Tatum 25+ pts');
    expect(tidyUnits('10 REB, 5 Ast, 3PM over')).toBe('10 reb, 5 ast, 3pm over');
    expect(tidyUnits('Pistons ML')).toBe('Pistons ML'); // not a unit
    expect(tidyUnits('Postseason')).toBe('Postseason'); // inside a word: untouched
  });

  it('known proper names keep their casing', () => {
    const names = nameCasing(['McCain 25 pts', 'LeBron 30', 'Lakers ML']);
    expect(tidyNames('Mccain 20 pts', names)).toBe('McCain 20 pts');
    expect(tidyNames('mccain and lebron', names)).toBe('McCain and LeBron');
    expect(tidyText('MCCAIN 20 PTS', names)).toBe('McCain 20 pts');
    expect(bestSpelling(['Mccain', 'McCain', 'mccain'], 'mccain')).toBe('McCain');
    expect(bestSpelling(['lakers ml', 'Lakers ML'], 'lakers ml')).toBe('Lakers ML');
  });

  it('tidyBet: games, units and names', () => {
    const t = tidyBet({ betText: 'mccain 25 PTS', legs: [{ game: 'CLE @ BOS', market: 'PTS', selection: 'Mccain 25 PTS' }] }, nameCasing(['McCain']));
    expect(t).toEqual({ betText: 'McCain 25 pts', legs: [{ game: 'CLE vs BOS', market: 'pts', selection: 'McCain 25 pts' }] });
  });

  it('autocomplete suggests the proper spelling even when a later bet typed it otherwise', () => {
    const idx = buildIndex([
      bet({ createdAt: '2026-11-01T00:00:00Z', legs: [leg({ selection: 'McCain 25 pts', game: 'CLE @ BOS' })] }),
      bet({ createdAt: '2026-11-20T00:00:00Z', legs: [leg({ selection: 'Mccain 25 PTS', game: 'CLE vs BOS' })] }),
    ]);
    expect(suggest(idx, 'selection', 'mcc')).toEqual(['McCain 25 pts']);
    expect(suggest(idx, 'game', 'cle')).toEqual(['CLE vs BOS']);
  });

  it('odds shown match the payout', () => {
    const b = { stake: 100, odds: 1.9924, result: 'won' as const, cashout: null };
    expect(profit(b)).toBe(99.24);
    expect(formatOdds(b.odds)).toBe('1.9924');
    expect([2, 2.1, 1.88, 1.875, 1.877193].map((n) => formatOdds(n))).toEqual(['2.00', '2.10', '1.88', '1.875', '1.8772']);
    expect(formatOdds(1.8772, 2)).toBe('1.88');
    expect(formatOdds(null)).toBe('');
  });
});

describe('BT-22: a team twice on one day', () => {
  const others = [bet({ gameDate: '2026-11-22', legs: [leg({ game: 'Celtics vs Knicks' })] }), bet({ gameDate: '2026-11-23', legs: [leg({ game: 'Celtics vs Nets' })] })];

  it('warns when the bet’s game puts a team in a second game that day', () => {
    const c = teamClashes(['Celtics @ Warriors'], '2026-11-22', others);
    expect(c).toEqual([{ team: 'Celtics', date: '2026-11-22', games: ['Celtics vs Warriors', 'Celtics vs Knicks'] }]);
    expect(clashText(c[0]!)).toBe('Celtics play twice on 22/11/2026: Celtics vs Warriors and Celtics vs Knicks. Check the game or the date.');
  });

  it('within the bet itself too (two legs)', () => {
    expect(teamClashes(['Lakers vs Nets', 'Suns vs Lakers'], '2026-11-01', []).map((c) => c.team)).toEqual(['Lakers']);
  });

  it('no warning: same game written another way, other days, other teams, games without two sides', () => {
    expect(teamClashes(['celtics @ knicks'], '2026-11-22', others)).toEqual([]);
    expect(teamClashes(['Celtics vs Warriors'], '2026-11-21', others)).toEqual([]);
    expect(teamClashes(['Lakers vs Suns'], '2026-11-22', others)).toEqual([]);
    expect(teamClashes(['Celtics'], '2026-11-22', others)).toEqual([]);
    expect(teamClashes([''], '2026-11-22', others)).toEqual([]);
  });

  it('other bets clashing among themselves are not this bet’s warning', () => {
    const two = [...others, bet({ gameDate: '2026-11-22', legs: [leg({ game: 'Celtics vs Heat' })] })];
    expect(teamClashes(['Lakers vs Suns'], '2026-11-22', two)).toEqual([]);
  });
});
