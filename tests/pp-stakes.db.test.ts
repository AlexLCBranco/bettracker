// A PP's own stake in the database: an old pp_tickets table (no stake column) gets it on first use, PPs from before
// read as null (the batch's stake), and a PP's stake is saved and read back.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-ppstake-'));
const url = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;
process.env.TURSO_DATABASE_URL = url;

// the table as v0.73.0 made it, with one PP in it
const old = createClient({ url });
await old.execute(`CREATE TABLE pp_tickets (id TEXT NOT NULL, batch_id TEXT NOT NULL, number INTEGER NOT NULL, leg_ids TEXT NOT NULL, placed INTEGER NOT NULL DEFAULT 1, odds_override REAL, PRIMARY KEY (batch_id, id))`);
await old.execute(`INSERT INTO pp_tickets (id, batch_id, number, leg_ids) VALUES ('t-old', 'b-old', 1, '["l1"]')`);
old.close();

const db = await import('@/lib/server/db');
const { validateBatch, ticketStake } = await import('@/lib/pp');

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

describe('PP stakes in the database', () => {
  it('adds the column to an old table and keeps each PP’s stake', async () => {
    const v = validateBatch({
      placedDate: '2026-11-27',
      stake: 0.5,
      legs: [{ id: 'l1', odds: 2, tier: 'mm' }],
      tickets: [
        { id: 't1', number: 1, legIds: ['l1'], stake: 1.25 },
        { id: 't2', number: 2, legIds: ['l1'] },
      ],
    });
    if (!v.ok) throw new Error(v.error);
    const b = await db.saveBatch(v.value);
    const read = (await db.getBatch(b.id))!;
    expect(read.tickets.map((t) => t.stake)).toEqual([1.25, null]);
    expect(read.tickets.map((t) => ticketStake(t, read))).toEqual([1.25, 0.5]);
    const c = createClient({ url });
    const row = (await c.execute(`SELECT stake FROM pp_tickets WHERE id = 't-old'`)).rows[0]!;
    c.close();
    expect(row.stake).toBeNull();
  });
});
