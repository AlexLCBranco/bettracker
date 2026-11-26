// BT-26: the Bets page's tabs and keyboard selection.
import { describe, expect, it } from 'vitest';
import { moveKey, nextKey, parseTab, rowKeys, tabBets, tabDays } from '@/lib/view';
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

  it('Upcoming: pending rows with no bet due yet, soonest game first, under the game date', () => {
    const later = bet({ placedDate: '2026-11-22', gameDate: '2026-11-30' });
    const days = tabDays([later, ...bets], 'upcoming', TODAY);
    expect(days.map((d) => d.date)).toEqual(['2026-11-25', '2026-11-30']);
    expect(rowKeys(days)).toEqual([`bet:${future.id}`, `bet:${later.id}`]);
  });

  it('To settle, Upcoming and Banked never share a row, and together hold every open row', () => {
    const shot = [bet({ rolloverId: 'r1', banked: true, result: 'won' })];
    const all = [...bets, ...shot];
    const keys = (['settle', 'upcoming', 'banked'] as const).flatMap((t) => rowKeys(tabDays(all, t, TODAY, false)));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual([`bet:${future.id}`, 'dutch:d', `bet:${old.id}`, 'rollover:r1'].sort());
  });

  it('a dutch with one split due is on To settle only, even if another split is later', () => {
    const a = bet({ dutchId: 'x', gameDate: '2026-11-22' });
    const b = bet({ dutchId: 'x', gameDate: '2026-11-28' });
    expect(rowKeys(tabDays([a, b], 'settle', TODAY))).toEqual(['dutch:x']);
    expect(rowKeys(tabDays([a, b], 'upcoming', TODAY))).toEqual([]);
  });

  it('the old ?tab=pending opens Upcoming', () => {
    expect(parseTab('pending')).toBe('upcoming');
    expect(parseTab('settle')).toBe('settle');
    expect(parseTab('nope')).toBe('all');
    expect(parseTab(null)).toBe('all');
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

describe('a cash-out never vanishes from the To settle / Upcoming tabs', () => {
  // the app's day starts at 05:00 local; noon UTC is the same day in every zone the tests run in
  const now = `${TODAY}T12:00:00.000Z`;
  const cashed = bet({ result: 'cash-out', cashout: 111, stake: 100, updatedAt: now });
  const older = bet({ result: 'cash-out', cashout: 50, updatedAt: '2026-11-10T12:00:00.000Z' });
  const won = bet({ result: 'won', updatedAt: now });
  const open = bet();
  const soon = bet({ gameDate: '2026-11-28' });
  const cashedSoon = bet({ gameDate: '2026-11-28', result: 'cash-out', cashout: 111, stake: 100, updatedAt: now });
  const bets = [cashed, older, won, open, soon, cashedSoon];
  const ids = (tab: 'upcoming' | 'settle', keep?: boolean) => tabBets(tabDays(bets, tab, TODAY, keep)).map((b) => b.id).sort();

  it('keeps a bet cashed out today on its own tab (by game date), not older cash-outs or other results', () => {
    expect(ids('settle')).toEqual([cashed.id, open.id].sort());
    expect(ids('upcoming')).toEqual([soon.id, cashedSoon.id].sort());
  });
  it('the tab counts still count only what is pending', () => {
    expect(ids('settle', false)).toEqual([open.id]);
    expect(ids('upcoming', false)).toEqual([soon.id]);
  });
  it('a dutch with a split cashed out today stays on To settle', () => {
    const a = bet({ dutchId: 'd1', result: 'cash-out', cashout: 111, updatedAt: now });
    const b = bet({ dutchId: 'd1', result: 'lost', updatedAt: now });
    expect(tabBets(tabDays([a, b], 'settle', TODAY)).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  });
  it('leaves both tabs once its woulda won / lost is set', () => {
    const done = bet({ result: 'cash-out', cashout: 111, stake: 100, updatedAt: now, wouldHave: 'lost' });
    expect(tabBets(tabDays([done, soon], 'upcoming', TODAY)).map((x) => x.id)).toEqual([soon.id]);
    expect(tabBets(tabDays([done, open], 'settle', TODAY)).map((x) => x.id)).toEqual([open.id]);
  });
  it('a settled shot whose cash-out has its woulda set leaves Upcoming', () => {
    const b1 = bet({ rolloverId: 'r1', result: 'won', updatedAt: now });
    const b2 = bet({ rolloverId: 'r1', result: 'cash-out', cashout: 185, updatedAt: now, wouldHave: 'lost' });
    expect(tabBets(tabDays([b1, b2], 'upcoming', TODAY))).toEqual([]);
  });
});
