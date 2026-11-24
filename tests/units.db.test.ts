// BT-37 / BT-38: an older database gets the would_have and unit_size columns; unit sizes are stored, a new bet keeps
// the unit size in force, and the first unit size can be given to the older bets of its money type.
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-units-'));
const url = `file:${join(dir, 'v033.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('unit sizes and would-have, stored', () => {
  it('migrates, stores unit sizes, fills new bets, applies to older ones once, keeps a would-have', async () => {
    const old = createClient({ url });
    await old.batch(
      [
        `CREATE TABLE bets (id TEXT PRIMARY KEY, book TEXT NOT NULL DEFAULT '', placed_date TEXT NOT NULL, game_date TEXT NOT NULL,
          type TEXT NOT NULL, situation TEXT NOT NULL, stake REAL NOT NULL, odds REAL NOT NULL, result TEXT NOT NULL, cashout REAL,
          pre_analysis TEXT NOT NULL DEFAULT '', post_analysis TEXT NOT NULL DEFAULT '', bet_text TEXT NOT NULL DEFAULT '',
          dutch_id TEXT, money TEXT NOT NULL DEFAULT 'real', label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        `INSERT INTO bets (id, placed_date, game_date, type, situation, stake, odds, result, money, created_at, updated_at)
          VALUES ('old-r', '2026-11-01', '2026-11-01', 'solo', 'pregame', 100, 1.6, 'won', 'real', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z'),
                 ('old-h', '2026-11-01', '2026-11-01', 'solo', 'pregame', 100, 1.6, 'won', 'hypothetical', '2026-11-01T00:00:01Z', '2026-11-01T00:00:01Z')`,
      ],
      'write',
    );
    old.close();

    const db = await import('@/lib/server/db');
    const { validateBet } = await import('@/lib/validate');
    expect(await db.getBet('old-r')).toMatchObject({ unitSize: null, wouldHave: null });
    expect(await db.getUnitSettings()).toEqual({ unitSizes: { real: null, bonus: null, hypothetical: null }, offered: [] });

    expect(await db.saveUnitSettings({ unitSizes: { real: 100, bonus: null, hypothetical: null }, offered: [] })).toEqual({ unitSizes: { real: 100, bonus: null, hypothetical: null }, offered: [] });
    expect((await db.getUnitSettings()).unitSizes.real).toBe(100);

    // the older real bet gets it; the hypothetical one keeps none
    expect(await db.applyUnitSize('real', 100)).toBe(1);
    expect(await db.getBet('old-r')).toMatchObject({ unitSize: 100 });
    expect(await db.getBet('old-h')).toMatchObject({ unitSize: null });
    expect(await db.applyUnitSize('real', 200)).toBe(0);

    // a new bet stores its unit size; changing the setting later does not rewrite it
    const v = validateBet({ stake: 150, odds: 2, result: 'cash-out', cashout: 180, wouldHave: 'lost', unitSize: 100, placedDate: '2026-11-24', legs: [] });
    if (!v.ok) throw new Error(v.error);
    const [made] = await db.createBets([v.value]);
    await db.saveUnitSettings({ unitSizes: { real: 200, bonus: null, hypothetical: null }, offered: ['real'] });
    expect(await db.getBet(made!.id)).toMatchObject({ unitSize: 100, wouldHave: 'lost' });
    expect(await db.getUnitSettings()).toMatchObject({ offered: ['real'] });
  });
});
