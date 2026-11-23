// BT-28 rule 5: a database from before BT-28 gets its settled combinations' legs repaired on first use, once.
import { createClient } from '@libsql/client';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-repair-'));
const url = `file:${join(dir, 'old.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('one-time leg repair', () => {
  it('a won combination logged with pending legs reads with every leg won; the pass runs only once', async () => {
    const old = createClient({ url });
    const bet = (id: string, result: string) =>
      `INSERT INTO bets (id, placed_date, game_date, type, situation, stake, odds, result, created_at, updated_at)
        VALUES ('${id}', '2026-11-01', '2026-11-01', 'combination', 'pregame', 10, 4, '${result}', '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`;
    const leg = (id: string, betId: string, pos: number, result: string) =>
      `INSERT INTO legs (id, bet_id, position, selection, result) VALUES ('${id}', '${betId}', ${pos}, 'Pick ${pos}', '${result}')`;
    await old.batch(
      [
        `CREATE TABLE bets (id TEXT PRIMARY KEY, book TEXT NOT NULL DEFAULT '', placed_date TEXT NOT NULL, game_date TEXT NOT NULL,
          type TEXT NOT NULL, situation TEXT NOT NULL, stake REAL NOT NULL, odds REAL NOT NULL, result TEXT NOT NULL, cashout REAL,
          pre_analysis TEXT NOT NULL DEFAULT '', post_analysis TEXT NOT NULL DEFAULT '', bet_text TEXT NOT NULL DEFAULT '',
          dutch_id TEXT, money TEXT NOT NULL DEFAULT 'real', label TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
        `CREATE TABLE legs (id TEXT PRIMARY KEY, bet_id TEXT NOT NULL, position INTEGER NOT NULL, sport TEXT NOT NULL DEFAULT '',
          game TEXT NOT NULL DEFAULT '', market TEXT NOT NULL DEFAULT '', selection TEXT NOT NULL DEFAULT '', odds REAL,
          result TEXT NOT NULL DEFAULT 'pending', actual TEXT NOT NULL DEFAULT '')`,
        bet('won-1', 'won'),
        leg('w1', 'won-1', 0, 'pending'),
        leg('w2', 'won-1', 1, 'pending'),
        bet('pend-1', 'pending'),
        leg('p1', 'pend-1', 0, 'pending'),
        leg('p2', 'pend-1', 1, 'pending'),
      ],
      'write',
    );

    const db = await import('@/lib/server/db');
    const bets = await db.listBets();
    expect(bets.find((b) => b.id === 'won-1')!.legs.map((l) => l.result)).toEqual(['won', 'won']);
    expect(bets.find((b) => b.id === 'pend-1')!.legs.map((l) => l.result)).toEqual(['pending', 'pending']);

    const meta = await old.execute("SELECT key FROM meta WHERE key = 'bt28-legs'");
    expect(meta.rows).toHaveLength(1);
    old.close();
  });
});
