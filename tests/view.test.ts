// BT-26: the Bets page's tabs and keyboard selection.
import { describe, expect, it } from 'vitest';
import { moveKey, nextKey, rowKeys, tabBets, tabDays } from '@/lib/view';
import type { Bet } from '@/lib/types';

let n = 0;
const bet = (over: Partial<Bet> = {}): Bet => ({
  id: `b${++n}`,
  book: '',
  placedDate: '2026-11-20',
  gameDate: '2026-11-20',
  type: 'solo',
  situation: 'pregame',
  stake: 10,
  odds: 2,
  result: 'pending',
  cashout: null,
  preAnalysis: '',
  postAnalysis: '',
  betText: '',
  legs: [],
  money: 'real',
  label: '',
  dutchId: null,
  rolloverId: null,
  banked: false,
  ladder: null,
  createdAt: `2026-11-20T00:00:${String(n).padStart(2, '0')}Z`,
  updatedAt: '',
  ...over,
});
const TODAY = '2026-11-23';

describe('tabs', () => {
  // newest first, as the app loads them
  const future = bet({ placedDate: '2026-11-22', gameDate: '2026-11-25' });
  const d1 = bet({ placedDate: '2026-11-21', gameDate: '2026-11-21', dutchId: 'd', result: 'won' });
  const d2 = bet({ placedDate: '2026-11-21', gameDate: '2026-11-21', dutchId: 'd' });
  const won = bet({ placedDate: '2026-11-20', result: 'won' });
  const old = bet({ placedDate: '2026-11-19', gameDate: '2026-11-19' });
  const bets = [future, d1, d2, won, old];

  it('All: every row under its bet date, newest first', () => {
    const days = tabDays(bets, 'all', TODAY);
    expect(days.map((d) => d.date)).toEqual(['2026-11-22', '2026-11-21', '2026-11-20', '2026-11-19']);
    expect(rowKeys(days)).toEqual([`bet:${future.id}`, 'dutch:d', `bet:${won.id}`, `bet:${old.id}`]);
  });

  it('Pending: bets and dutches with a pending bet (the whole dutch)', () => {
    const days = tabDays(bets, 'pending', TODAY);
    expect(rowKeys(days)).toEqual([`bet:${future.id}`, 'dutch:d', `bet:${old.id}`]);
    expect(tabBets(days).map((b) => b.id)).toEqual([future.id, d1.id, d2.id, old.id]);
  });

  it('To settle: game date today or earlier, oldest first, under the game date', () => {
    const days = tabDays(bets, 'settle', TODAY);
    expect(days.map((d) => d.date)).toEqual(['2026-11-19', '2026-11-21']);
    expect(rowKeys(days)).toEqual([`bet:${old.id}`, 'dutch:d']);
  });
});

describe('selection', () => {
  const keys = ['a', 'b', 'c'];
  it('arrows move inside the list; nothing selected starts at the first row', () => {
    expect(moveKey(keys, null, 1)).toBe('a');
    expect(moveKey(keys, 'a', 1)).toBe('b');
    expect(moveKey(keys, 'c', 1)).toBe('c');
    expect(moveKey(keys, 'a', -1)).toBe('a');
    expect(moveKey([], 'a', 1)).toBeNull();
  });
  it('after settling, the row below (the one above for the last)', () => {
    expect(nextKey(keys, 'a')).toBe('b');
    expect(nextKey(keys, 'c')).toBe('b');
    expect(nextKey(['a'], 'a')).toBeNull();
  });
});
