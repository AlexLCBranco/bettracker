// BT-26: the Bets page's tabs and keyboard selection.
import { describe, expect, it } from 'vitest';
import { moveKey, nextKey, rowKeys, tabBets, tabDays } from '@/lib/view';
import type { Bet } from '@/lib/types';

let n = 0;
const bet = (over: Partial<Bet> = {}): Bet => ({
  id: `b${++n}`,
  noBrainer: false,
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
    liveAnalysis: '',
  postAnalysis: '',
  betText: '',
  legs: [],
  money: 'real',
  label: '',
  dutchId: null,
  rolloverId: null,
  banked: false,
  wouldHave: null,
  unitSize: null,
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

describe('a cash-out never vanishes from the Pending / To settle tabs', () => {
  // the app's day starts at 05:00 local; noon UTC is the same day in every zone the tests run in
  const now = `${TODAY}T12:00:00.000Z`;
  const cashed = bet({ result: 'cash-out', cashout: 111, stake: 100, updatedAt: now });
  const older = bet({ result: 'cash-out', cashout: 50, updatedAt: '2026-11-10T12:00:00.000Z' });
  const won = bet({ result: 'won', updatedAt: now });
  const open = bet();
  const bets = [cashed, older, won, open];
  const ids = (tab: 'pending' | 'settle', keep?: boolean) => tabBets(tabDays(bets, tab, TODAY, keep)).map((b) => b.id).sort();

  it('keeps a bet cashed out today on both tabs, not older cash-outs or other results', () => {
    expect(ids('pending')).toEqual([cashed.id, open.id].sort());
    expect(ids('settle')).toEqual([cashed.id, open.id].sort());
  });
  it('the tab counts still count only what is pending', () => {
    expect(ids('pending', false)).toEqual([open.id]);
  });
  it('a dutch with a split cashed out today stays on To settle', () => {
    const a = bet({ dutchId: 'd1', result: 'cash-out', cashout: 111, updatedAt: now });
    const b = bet({ dutchId: 'd1', result: 'lost', updatedAt: now });
    expect(tabBets(tabDays([a, b], 'settle', TODAY)).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
  it('leaves both tabs once its woulda won / lost is set', () => {
    const done = bet({ result: 'cash-out', cashout: 111, stake: 100, updatedAt: now, wouldHave: 'lost' });
    expect(tabBets(tabDays([done, open], 'pending', TODAY)).map((x) => x.id)).toEqual([open.id]);
    expect(tabBets(tabDays([done, open], 'settle', TODAY)).map((x) => x.id)).toEqual([open.id]);
  });
  it('a settled shot whose cash-out has its woulda set leaves Pending', () => {
    const b1 = bet({ rolloverId: 'r1', result: 'won', updatedAt: now });
    const b2 = bet({ rolloverId: 'r1', result: 'cash-out', cashout: 185, updatedAt: now, wouldHave: 'lost' });
    expect(tabBets(tabDays([b1, b2], 'pending', TODAY))).toEqual([]);
  });
});
