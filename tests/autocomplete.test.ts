import { describe, expect, it } from 'vitest';
import { buildIndex, lastUsed, stakePresets, suggest } from '@/lib/autocomplete';
import { bet, leg } from './helpers';

const NOW = Date.parse('2026-11-22T12:00:00Z');
const at = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

describe('suggest', () => {
  const bets = [
    bet({ book: 'Bet365', createdAt: at(10) }),
    bet({ book: 'Betano', createdAt: at(1) }),
    bet({ book: 'Pinnacle', createdAt: at(5) }),
    bet({ book: 'Bet365', createdAt: at(8) }),
  ];
  const idx = buildIndex(bets);

  it('empty query: most recent first', () => expect(suggest(idx, 'book', '', { now: NOW })).toEqual(['Betano', 'Pinnacle', 'Bet365']));

  it('filters anywhere in the text, case-insensitive', () => {
    expect(suggest(idx, 'book', 'NN', { now: NOW })).toEqual(['Pinnacle']);
    expect(suggest(idx, 'book', 'bet', { now: NOW }).sort()).toEqual(['Bet365', 'Betano']);
  });

  it('typed query: used more often ranks first when recency is similar', () => {
    // Bet365: 2 uses 8–10 days ago beats Betano: 1 use yesterday? frecency: 2×~0.8 > 1×~0.98
    expect(suggest(idx, 'book', 'bet', { now: NOW })).toEqual(['Bet365', 'Betano']);
  });

  it('typed query: a recent value beats an old one used the same number of times', () => {
    const i = buildIndex([bet({ book: 'Old Book', createdAt: at(200) }), bet({ book: 'New Book', createdAt: at(2) })]);
    expect(suggest(i, 'book', 'book', { now: NOW })).toEqual(['New Book', 'Old Book']);
  });

  it('accent-insensitive and keeps the latest spelling', () => {
    const i = buildIndex([bet({ betText: 'são paulo ml', createdAt: at(3) }), bet({ betText: 'São Paulo ML', createdAt: at(1) })]);
    expect(suggest(i, 'betText', 'sao', { now: NOW })).toEqual(['São Paulo ML']);
  });

  it('no match: empty list (a new value can still be typed)', () => expect(suggest(idx, 'book', 'zzz', { now: NOW })).toEqual([]));

  it('respects the limit', () => {
    const many = buildIndex(Array.from({ length: 20 }, (_, i) => bet({ book: `Book ${i}`, createdAt: at(i) })));
    expect(suggest(many, 'book', '', { now: NOW })).toHaveLength(8);
  });
});

describe('sport-aware suggestions', () => {
  const idx = buildIndex([
    bet({ legs: [leg({ sport: 'Basketball', game: 'Lakers vs Celtics', market: 'Moneyline' })], createdAt: at(1) }),
    bet({ legs: [leg({ sport: 'Football', game: 'Flamengo vs Palmeiras', market: 'Moneyline 1X2' })], createdAt: at(2) }),
  ]);

  it('choosing a sport narrows game suggestions to that sport', () => {
    expect(suggest(idx, 'game', '', { sport: 'football', now: NOW })).toEqual(['Flamengo vs Palmeiras']);
    expect(suggest(idx, 'market', 'money', { sport: 'Basketball', now: NOW })).toEqual(['Moneyline']);
  });

  it('falls back to all sports when the sport has nothing matching', () => {
    expect(suggest(idx, 'game', 'flamengo', { sport: 'Basketball', now: NOW })).toEqual(['Flamengo vs Palmeiras']);
    expect(suggest(idx, 'game', '', { sport: 'Tennis', now: NOW })).toEqual(['Lakers vs Celtics', 'Flamengo vs Palmeiras']);
  });

  it('book and bet text ignore the sport', () => expect(suggest(idx, 'book', '', { sport: 'Tennis', now: NOW })).toEqual(['Bet365']));
});

describe('stake presets and last-used defaults', () => {
  it('most-used stakes first, ties by recency', () => {
    const bets = [bet({ stake: 50, createdAt: at(5) }), bet({ stake: 100, createdAt: at(4) }), bet({ stake: 50, createdAt: at(3) }), bet({ stake: 20, createdAt: at(1) })];
    expect(stakePresets(bets)).toEqual([50, 20, 100]);
  });
  it('defaults come from the most recently entered bet', () => {
    const d = lastUsed([
      bet({ book: 'Old', createdAt: at(5) }),
      bet({ book: 'Betano', situation: 'live', type: 'combination', legs: [leg({ sport: 'Football' })], createdAt: at(1) }),
    ]);
    expect(d).toEqual({ book: 'Betano', sport: 'Football', situation: 'live', type: 'combination' });
  });
  it('no bets: empty defaults', () => expect(lastUsed([])).toEqual({ book: '', sport: '', situation: 'pregame', type: 'solo' }));
});
