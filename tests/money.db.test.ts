// BT-14: a database from before hypothetical money gets the money column; old bets read as real money, and
// hypothetical bets are stored, updated and imported with their flag.
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-money-'));
const url = `file:${join(dir, 'v013.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('money column', () => {
  it('migrates a v0.13 database: old bets are real money; hypothetical bets keep their flag', async () => {
    const old = createClient({ url });
    await old.batch(
      [
        `CREATE TABLE bets (id TEXT PRIMARY KEY, book TEXT NOT NULL DEFAULT '', placed_date TEXT NOT NULL, game_date TEXT NOT NULL,
          type TEXT NOT NULL, situation TEXT NOT NULL, stake REAL NOT NULL, odds REAL NOT NULL, result TEXT NOT NULL, cashout REAL,
          pre_analysis TEXT NOT NULL DEFAULT '', post_analysis TEXT NOT NULL DEFAULT '', bet_text TEXT NOT NULL DEFAULT '',
          dutch_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        `INSERT INTO bets (id, placed_date, game_date, type, situation, stake, odds, result, bet_text, created_at, updated_at)
          VALUES ('old-1', '2026-11-01', '2026-11-01', 'solo', 'pregame', 10, 2, 'won', 'old bet', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
      ],
      'write',
    );
    old.close();

    const db = await import('@/lib/server/db');
    const { validateBet } = await import('@/lib/validate');
    const { buildExport, parseImport } = await import('@/lib/transfer');
    expect((await db.listBets())[0]).toMatchObject({ id: 'old-1', money: 'real' });

    const v = validateBet({ stake: 50, odds: 2, result: 'pending', placedDate: '2026-11-22', money: 'hypothetical', legs: [] });
    if (!v.ok) throw new Error(v.error);
    const [h] = await db.createBets([v.value]);
    expect(h).toMatchObject({ money: 'hypothetical' });
    expect((await db.getBet(h!.id))!.money).toBe('hypothetical');

    // a later edit keeps it hypothetical; switching it to real is stored
    expect(await db.updateBet((await db.getBet(h!.id))!, { ...v.value, result: 'won' })).toMatchObject({ result: 'won', money: 'hypothetical' });
    expect(await db.updateBet((await db.getBet(h!.id))!, { ...v.value, money: 'real' })).toMatchObject({ money: 'real' });
    await db.updateBet((await db.getBet(h!.id))!, { ...v.value, money: 'hypothetical' });

    // export and import keep the flag
    const file = JSON.parse(JSON.stringify(buildExport(await db.listBets(), 'test')));
    await db.deleteBet(h!.id);
    const parsed = parseImport(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await db.importBets(parsed.bets)).toEqual({ added: 1, skipped: 1 });
    expect((await db.getBet(h!.id))!.money).toBe('hypothetical');
  });
});
