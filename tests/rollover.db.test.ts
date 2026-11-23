// BT-29: a database from before rollovers gets the rollover_id and banked columns; bank, add leg and close are stored.
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-rollover-'));
const url = `file:${join(dir, 'v020.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('rollover columns', () => {
  it('migrates a v0.20 database, then banks, adds a leg, closes and exports a chain', async () => {
    const old = createClient({ url });
    await old.batch(
      [
        `CREATE TABLE bets (id TEXT PRIMARY KEY, book TEXT NOT NULL DEFAULT '', placed_date TEXT NOT NULL, game_date TEXT NOT NULL,
          type TEXT NOT NULL, situation TEXT NOT NULL, stake REAL NOT NULL, odds REAL NOT NULL, result TEXT NOT NULL, cashout REAL,
          pre_analysis TEXT NOT NULL DEFAULT '', post_analysis TEXT NOT NULL DEFAULT '', bet_text TEXT NOT NULL DEFAULT '',
          dutch_id TEXT, money TEXT NOT NULL DEFAULT 'real', label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        `INSERT INTO bets (id, placed_date, game_date, type, situation, stake, odds, result, bet_text, created_at, updated_at)
          VALUES ('old-1', '2026-11-01', '2026-11-01', 'solo', 'pregame', 100, 1.6, 'won', 'old bet', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
      ],
      'write',
    );
    old.close();

    const db = await import('@/lib/server/db');
    const { validateBet } = await import('@/lib/validate');
    const { buildExport, parseImport } = await import('@/lib/transfer');
    const { chainSummary } = await import('@/lib/rollover');
    const first = (await db.getBet('old-1'))!;
    expect(first).toMatchObject({ rolloverId: null, banked: false });

    // bank: a partial patch, as the PATCH route merges it
    const patch = (b: typeof first, p: Record<string, unknown>) => {
      const v = validateBet({ ...b, ...p });
      if (!v.ok) throw new Error(v.error);
      return db.updateBet(b, v.value);
    };
    const banked = await patch(first, { rolloverId: 'ro-1', banked: true });
    expect(banked).toMatchObject({ rolloverId: 'ro-1', banked: true });

    // add leg: the whole payout, same money
    const v = validateBet({ stake: 160, odds: 1.2, result: 'pending', placedDate: '2026-11-02', rolloverId: 'ro-1', legs: [] });
    if (!v.ok) throw new Error(v.error);
    const [second] = await db.createBets([v.value]);
    expect(chainSummary((await db.listBets()).filter((b) => b.rolloverId === 'ro-1')).outcome).toBe('pending');
    await patch((await db.getBet(second!.id))!, { result: 'won' });
    const chain = (await db.listBets()).filter((b) => b.rolloverId === 'ro-1');
    expect(chainSummary(chain)).toMatchObject({ outcome: 'won', profit: 92 });

    // close a one-bet shot: a plain won bet again
    const lone = await patch((await db.getBet(second!.id))!, { rolloverId: 'ro-2', banked: true });
    expect(lone).toMatchObject({ rolloverId: 'ro-2', banked: true });
    expect(await patch(lone, { rolloverId: null, banked: false })).toMatchObject({ rolloverId: null, banked: false });

    // export and import keep them
    const file = JSON.parse(JSON.stringify(buildExport(await db.listBets(), 'test')));
    await db.deleteBet('old-1');
    const parsed = parseImport(file);
    if (!parsed.ok) throw new Error(parsed.error);
    await db.importBets(parsed.bets);
    expect(await db.getBet('old-1')).toMatchObject({ rolloverId: 'ro-1', banked: true });
  });
});
