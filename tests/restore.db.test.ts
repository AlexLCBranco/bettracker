// Undo of a delete: POST /api/bets/restore puts the deleted bets back exactly as they were (ids, timestamps, legs).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-restore-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'r.db').replace(/\\/g, '/')}`;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

const post = async (body: unknown) => {
  const { POST } = await import('@/app/api/bets/restore/route');
  return POST(new Request('http://x/api/bets/restore', { method: 'POST', body: JSON.stringify(body) }));
};

describe('restore deleted bets', () => {
  it('a deleted combination comes back with the same id, created time and leg ids; one already there is left alone', async () => {
    const db = await import('@/lib/server/db');
    const { validateBet } = await import('@/lib/validate');
    const v = validateBet({
      book: 'Bet365', placedDate: '2026-11-20', gameDate: '2026-11-20', type: 'combination', situation: 'pregame', stake: 50, odds: 3.2,
      result: 'pending', money: 'real', betText: 'restore me', rolloverId: 'lad-1', ladder: { goalRungs: 3, goalAmount: null, taken: false },
      legs: [
        { sport: 'Football', game: 'A x B', market: 'ML', selection: 'A', odds: 1.6, result: 'pending', actual: '' },
        { sport: 'Football', game: 'C x D', market: 'ML', selection: 'C', odds: 2, result: 'pending', actual: '' },
      ],
    });
    if (!v.ok) throw new Error(v.error);
    const [made] = await db.createBets([v.value]);
    const keep = await db.createBet({ ...v.value, betText: 'stays' });
    expect(await db.deleteBet(made!.id)).toBe(true);
    expect(await db.getBet(made!.id)).toBeNull();

    const res = await post([made, { ...keep, betText: 'would overwrite' }]);
    expect(res.status).toBe(201);
    const back = (await db.getBet(made!.id))!;
    expect(back).toMatchObject({ id: made!.id, createdAt: made!.createdAt, betText: 'restore me', rolloverId: 'lad-1', ladder: { goalRungs: 3 } });
    expect(back.legs.map((l) => l.id)).toEqual(made!.legs.map((l) => l.id));
    expect((await db.getBet(keep.id))!.betText).toBe('stays');
  });

  it('refuses a body that is not a list of valid bets', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post([])).status).toBe(400);
    expect((await post([{ id: 'x', stake: -1 }])).status).toBe(400);
  });
});
