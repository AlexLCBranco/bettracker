// A combo PP shot in the database: an old pp_legs table (no parts column) gets it on first use, legs from before read
// as single selections, and a combo's parts are saved and read back.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-ppcombo-'));
const url = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

// the table as v0.76.0 made it, with one leg in it
const old = createClient({ url });
await old.execute(`CREATE TABLE pp_legs (id TEXT NOT NULL, batch_id TEXT NOT NULL, position INTEGER NOT NULL, sport TEXT NOT NULL DEFAULT '', game TEXT NOT NULL DEFAULT '', market TEXT NOT NULL DEFAULT '', selection TEXT NOT NULL DEFAULT '', odds REAL NOT NULL, tier TEXT NOT NULL, result TEXT NOT NULL DEFAULT 'pending', actual TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', PRIMARY KEY (batch_id, id))`);
await old.execute(`INSERT INTO pp_legs (id, batch_id, position, odds, tier) VALUES ('l-old', 'b-old', 0, 2, 'shot')`);
old.close();

const db = await import('@/lib/server/db');
const { validateBatch } = await import('@/lib/pp');

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('combo legs in the database', () => {
  it('adds the column to an old table and keeps a combo’s parts', async () => {
    const v = validateBatch({
      placedDate: '2026-11-27',
      stake: 0.5,
      legs: [
        { id: 'c', selection: 'A + B', odds: 3.5, tier: 'shot', parts: [{ game: 'G1', selection: 'A', odds: 1.5 }, { game: 'G2', selection: 'B', odds: 2.2 }] },
        { id: 's', selection: 'S', odds: 3, tier: 'shot' },
      ],
      tickets: [],
    });
    if (!v.ok) throw new Error(v.error);
    const b = await db.saveBatch(v.value);
    const read = (await db.getBatch(b.id))!;
    expect(read.legs.map((l) => [l.id, l.odds, l.parts.map((x) => x.selection)])).toEqual([['c', 3.5, ['A', 'B']], ['s', 3, []]]);
    const c = createClient({ url });
    const row = (await c.execute(`SELECT parts FROM pp_legs WHERE id = 'l-old'`)).rows[0]!;
    c.close();
    expect(row.parts).toBe('[]');
  });
});
