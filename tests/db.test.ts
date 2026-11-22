// The database layer against a throwaway SQLite file (same libSQL client as Turso in production).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;

const db = await import('@/lib/server/db');
const { validateBet } = await import('@/lib/validate');

beforeAll(async () => {
  await db.db();
});
afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open; the OS temp folder is cleaned later
  }
});

const input = (over: Record<string, unknown> = {}) => {
  const v = validateBet({ stake: 150, odds: 2.1, result: 'pending', placedDate: '2026-11-22', book: 'Betano', betText: 'lakers ml', legs: [{ sport: 'Basketball', game: 'LAL x BOS' }], ...over });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

describe('db', () => {
  it('creates, lists, updates and deletes a bet with its legs', async () => {
    const created = await db.createBet(input());
    expect(created.id).toBeTruthy();
    expect(created.legs[0]).toMatchObject({ sport: 'Basketball', odds: 2.1, result: 'pending' });

    const listed = (await db.listBets()).find((b) => b.id === created.id)!;
    expect(listed).toEqual(created);

    const updated = await db.updateBet(created, input({ result: 'won', legs: listed.legs }));
    expect(updated.result).toBe('won');
    expect(updated.legs[0]!.result).toBe('won');
    expect(updated.legs[0]!.id).toBe(created.legs[0]!.id);
    expect(updated.createdAt).toBe(created.createdAt);

    expect(await db.deleteBet(created.id)).toBe(true);
    expect(await db.getBet(created.id)).toBeNull();
    expect(await db.deleteBet(created.id)).toBe(false);
  });

  it('keeps combination legs in order with their own results', async () => {
    const c = await db.createBet(
      input({ type: 'combination', odds: 5.5, legs: [{ selection: 'A', odds: 2, result: 'won' }, { selection: 'B', odds: 2.4, result: 'lost' }, { selection: 'C', result: 'won' }] }),
    );
    const got = (await db.getBet(c.id))!;
    expect(got.odds).toBe(5.5);
    expect(got.legs.map((l) => [l.selection, l.odds, l.result])).toEqual([['A', 2, 'won'], ['B', 2.4, 'lost'], ['C', null, 'won']]);
  });
});
