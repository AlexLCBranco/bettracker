// BT-23: the bet table's day groups, result sub-lines and game text.
import { describe, expect, it } from 'vitest';
import { groupRows } from '@/lib/dutch';
import { betResultLine, betsText, dayGroups, displayGame, dutchResultLine, legGames } from '@/lib/table';
import { bet, dutchBets, leg } from './helpers';

describe('day groups', () => {
  it('a header per day, a dutch counted once, net per money scope (pending left out)', () => {
    const bets = [
      bet({ placedDate: '2026-11-22', result: 'won', stake: 100, odds: 2 }),
      bet({ placedDate: '2026-11-22', result: 'lost', stake: 30, money: 'hypothetical' }),
      bet({ placedDate: '2026-11-22', result: 'pending', stake: 500 }),
      ...dutchBets('d1', [
        { placedDate: '2026-11-22', result: 'won', stake: 50, odds: 3 },
        { placedDate: '2026-11-22', result: 'lost', stake: 50, odds: 3 },
      ]),
      bet({ placedDate: '2026-11-21', result: 'pending' }),
    ];
    const days = dayGroups(groupRows(bets));
    expect(days.map((d) => [d.date, d.count])).toEqual([
      ['2026-11-22', 4],
      ['2026-11-21', 1],
    ]);
    // 100 + (100 - 50) real; -30 H$
    expect(days[0]!.nets).toEqual([
      { money: 'real', value: 150 },
      { money: 'hypothetical', value: -30 },
    ]);
    expect(days[1]!.nets).toEqual([]);
  });
  it('"1 bet", "5 bets"', () => {
    expect(betsText(1)).toBe('1 bet');
    expect(betsText(5)).toBe('5 bets');
  });
});

describe('result sub-line', () => {
  const combo = (result: string, legs: string[], extra = {}) =>
    bet({ type: 'combination', result: result as never, legs: legs.map((r, i) => leg({ selection: ['Celtics', 'Lakers', 'Nets'][i], market: i === 0 ? 'ML' : '', result: r as never })), ...extra });

  it('a lost combination names the leg that lost it, with its market', () => {
    expect(betResultLine(combo('lost', ['lost', 'won']))).toBe('lost by Celtics ML');
    expect(betResultLine(combo('lost', ['won', 'lost', 'lost']))).toBe('lost by Lakers, Nets');
  });
  it('the market is not repeated when the selection says it', () => {
    const b = bet({ type: 'combination', result: 'lost', legs: [leg({ selection: 'McCain 25 pts', market: 'pts', result: 'lost' }), leg({ result: 'won' })] });
    expect(betResultLine(b)).toBe('lost by McCain 25 pts');
  });
  it('won or pending combination: legs hit, once one is settled', () => {
    expect(betResultLine(combo('won', ['won', 'won']))).toBe('2 of 2 legs hit');
    expect(betResultLine(combo('pending', ['won', 'pending', 'pending']))).toBe('1 of 3 legs hit');
    expect(betResultLine(combo('pending', ['pending', 'pending']))).toBeNull();
  });
  it('nothing for a solo', () => {
    expect(betResultLine(bet({ result: 'lost' }))).toBeNull();
  });
  it('dutch: "1 of 2 splits hit"', () => {
    expect(dutchResultLine(dutchBets('d', [{ result: 'won' }, { result: 'lost' }]))).toBe('1 of 2 splits hit');
    expect(dutchResultLine(dutchBets('d', [{ result: 'won' }, { result: 'pending' }]))).toBe('1 of 2 splits hit');
    expect(dutchResultLine(dutchBets('d', [{ result: 'lost' }, { result: 'lost' }]))).toBe('0 of 2 splits hit');
    expect(dutchResultLine(dutchBets('d', [{ result: 'pending' }, { result: 'pending' }]))).toBeNull();
  });
});

describe('games', () => {
  it('"Away @ Home" with spaces, whatever way it was typed', () => {
    expect(displayGame('Celtics vs Warriors')).toBe('Celtics @ Warriors');
    expect(displayGame('Celtics@Warriors')).toBe('Celtics @ Warriors');
    expect(displayGame('Flamengo x Palmeiras')).toBe('Flamengo @ Palmeiras');
    expect(legGames([leg({ game: 'A vs B' }), leg({ game: 'A @ B' }), leg({ game: 'C vs D' }), leg({ game: '' })])).toEqual(['A @ B', 'C @ D']);
  });
});
