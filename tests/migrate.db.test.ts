// A database created by an older version (no dutch_id column) gets the column on first use; its bets read as
// "not a dutch", and new dutch bets can be stored next to them.
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-migrate-'));
const url = `file:${join(dir, 'old.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('schema migration', () => {
  it('adds dutch_id to an existing bets table, keeps its rows, and stores dutches', async () => {
    // the v0.4.0 schema, with one bet in it
    const old = createClient({ url });
    await old.batch(
      [
        `CREATE TABLE bets (id TEXT PRIMARY KEY, book TEXT NOT NULL DEFAULT '', placed_date TEXT NOT NULL, game_date TEXT NOT NULL,
          type TEXT NOT NULL, situation TEXT NOT NULL, stake REAL NOT NULL, odds REAL NOT NULL, result TEXT NOT NULL, cashout REAL,
          pre_analysis TEXT NOT NULL DEFAULT '', post_analysis TEXT NOT NULL DEFAULT '', bet_text TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        `INSERT INTO bets (id, placed_date, game_date, type, situation, stake, odds, result, bet_text, created_at, updated_at)
          VALUES ('old-1', '2026-11-01', '2026-11-01', 'solo', 'pregame', 10, 2, 'won', 'old bet', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
      ],
      'write',
    );
    old.close();

    const db = await import('@/lib/server/db');
    const { validateBet } = await import('@/lib/validate');
    const bets = await db.listBets();
    expect(bets).toHaveLength(1);
    expect(bets[0]).toMatchObject({ id: 'old-1', betText: 'old bet', dutchId: null, legs: [] });

    const input = (selection: string) => {
      const v = validateBet({ stake: 5, odds: 3, result: 'pending', placedDate: '2026-11-22', dutchId: 'g1', legs: [{ selection }] });
      if (!v.ok) throw new Error(v.error);
      return v.value;
    };
    const made = await db.createBets([input('A'), input('B')]);
    expect(made.map((b) => b.dutchId)).toEqual(['g1', 'g1']);
    expect(made[0]!.createdAt < made[1]!.createdAt).toBe(true);
    const stored = (await db.listBets()).filter((b) => b.dutchId === 'g1');
    expect(stored.map((b) => b.legs[0]!.selection).sort()).toEqual(['A', 'B']);

    // editing a bet of a dutch keeps it in the dutch
    const updated = await db.updateBet(stored[0]!, { ...input('A'), result: 'won' });
    expect(updated).toMatchObject({ result: 'won', dutchId: 'g1' });

    expect(await db.deleteDutch('g1')).toBe(2);
    expect((await db.listBets()).map((b) => b.id)).toEqual(['old-1']);
    expect(await db.deleteDutch('g1')).toBe(0);
  });
});
