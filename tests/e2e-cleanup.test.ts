// BT-11: what the e2e cleanup treats as a test bet, and that a failed delete is an error instead of being ignored.
import { describe, expect, it } from 'vitest';
import { deleteIds, e2eLeftovers, isE2eBet, type Requester, type SweepBet } from '../e2e/cleanup';

const bet = (over: Partial<SweepBet> = {}): SweepBet => ({
  id: 'b',
  betText: '',
  book: 'Betano',
  placedDate: '2026-11-22',
  gameDate: '2026-11-22',
  createdAt: '2026-11-23T01:00:00.000Z',
  legs: [{ selection: 'Lakers', game: 'LAL x BOS' }],
  ...over,
});

describe('isE2eBet', () => {
  it('the leftover the owner found: "e2e-mwskca2engub edit me", Old Book, 01/01/2000', () => {
    expect(isE2eBet(bet({ betText: 'e2e-mwskca2engub edit me', book: 'Old Book', placedDate: '2000-01-01', gameDate: '2000-01-01' }))).toBe(true);
  });
  it('a tag in the book, a leg, or only the 2000-01-0x dates is enough', () => {
    expect(isE2eBet(bet({ book: 'e2e-mwskca2engub BookA' }))).toBe(true);
    expect(isE2eBet(bet({ legs: [{ selection: 'e2e-mwskca2engub Celtics W', game: '' }] }))).toBe(true);
    expect(isE2eBet(bet({ legs: [{ selection: 'x', game: 'e2e-mwskca2engub CLE x BOS' }] }))).toBe(true);
    expect(isE2eBet(bet({ gameDate: '2000-01-02' }))).toBe(true);
  });
  it('real bets are left alone', () => {
    expect(isE2eBet(bet())).toBe(false);
    expect(isE2eBet(bet({ betText: 'some e2e- talk', placedDate: '2000-01-10', gameDate: '2020-01-01' }))).toBe(false);
  });
});

describe('e2eLeftovers', () => {
  it('splits this run’s leftovers (a leak) from older ones', () => {
    const old = bet({ id: 'old', betText: 'e2e-aaaaaaaa x', createdAt: '2026-11-23T01:04:23.000Z' });
    const leak = bet({ id: 'leak', betText: 'e2e-bbbbbbbb y', createdAt: '2026-11-23T02:00:01.000Z' });
    const real = bet({ id: 'real', createdAt: '2026-11-23T02:00:02.000Z' });
    const r = e2eLeftovers([old, leak, real], '2026-11-23T02:00:00.000Z');
    expect(r.all.map((b) => b.id)).toEqual(['old', 'leak']);
    expect(r.thisRun.map((b) => b.id)).toEqual(['leak']);
  });
});

describe('deleteIds', () => {
  const fake = (statuses: Record<string, number>) => {
    const deleted: string[] = [];
    const req: Requester = {
      get: async () => ({ ok: () => true, status: () => 200, json: async () => [] }),
      delete: async (url) => {
        const id = url.split('/').pop()!;
        deleted.push(id);
        return { status: () => statuses[id] ?? 200 };
      },
    };
    return { req, deleted };
  };

  it('deletes every id; already gone (404) is fine', async () => {
    const { req, deleted } = fake({ b: 404 });
    await deleteIds(req, ['a', 'b']);
    expect(deleted).toEqual(['a', 'b']);
  });

  it('a delete the server refuses is an error, after trying the rest (the old cleanup ignored it)', async () => {
    const { req, deleted } = fake({ a: 500 });
    await expect(deleteIds(req, ['a', 'b'])).rejects.toThrow('could not delete a (500)');
    expect(deleted).toEqual(['a', 'b']);
  });
});
