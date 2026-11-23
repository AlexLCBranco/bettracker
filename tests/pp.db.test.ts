// BT-30: PP batches in the database: whole-batch writes, one-leg settling, delete and restore, export / import.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-pp-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;

const db = await import('@/lib/server/db');
const { validateBatch, ticketView } = await import('@/lib/pp');
const { buildExport, parseImport } = await import('@/lib/transfer');

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

const input = () => {
  const v = validateBatch({
    name: 'Test batch',
    placedDate: '2026-11-23',
    book: 'Bet365',
    stake: 5,
    money: 'bonus',
    legs: [
      { id: 'l1', selection: 'Jokic 12+ ast', odds: 2, tier: 'mm' },
      { id: 'l2', selection: 'Celtics ML', odds: 3, tier: 'major', note: 'strong' },
    ],
    tickets: [
      { id: 't1', number: 1, legIds: ['l1', 'l2'], placed: true },
      { id: 't2', number: 2, legIds: ['l1'], placed: false, oddsOverride: 2.1 },
    ],
  });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

describe('pp tables', () => {
  it('saves and reads a whole batch', async () => {
    const b = await db.saveBatch(input());
    const read = await db.getBatch(b.id);
    expect(read).toMatchObject({ name: 'Test batch', money: 'bonus', stake: 5, tiers: [{ name: 'Major-major' }, { name: 'Major' }, { name: 'PP shot' }] });
    expect(read!.legs.map((l) => [l.id, l.odds, l.tier, l.note])).toEqual([['l1', 2, 'mm', ''], ['l2', 3, 'major', 'strong']]);
    expect(read!.tickets).toEqual([
      { id: 't1', number: 1, legIds: ['l1', 'l2'], placed: true, oddsOverride: null },
      { id: 't2', number: 2, legIds: ['l1'], placed: false, oddsOverride: 2.1 },
    ]);
    await db.deleteBatch(b.id);
  });

  it('settles one leg; the tickets follow', async () => {
    const b = await db.saveBatch(input());
    expect(await db.patchLeg(b.id, 'l1', { result: 'won', actual: '13' })).toBe(true);
    expect(await db.patchLeg(b.id, 'l2', { result: 'lost' })).toBe(true);
    expect(await db.patchLeg(b.id, 'nope', { result: 'lost' })).toBe(false);
    const read = (await db.getBatch(b.id))!;
    expect(read.legs[0]).toMatchObject({ result: 'won', actual: '13' });
    expect(read.tickets.map((t) => ticketView(t, read).status)).toEqual(['dead', 'won']);
    await db.deleteBatch(b.id);
  });

  it('replacing a batch replaces its legs and tickets; delete removes all; restore keeps the id', async () => {
    const b = await db.saveBatch(input());
    const smaller = { ...input(), legs: input().legs.slice(0, 1), tickets: [{ id: 't2', number: 2, legIds: ['l1'], placed: true, oddsOverride: null }] };
    await db.saveBatch(smaller, b.id);
    const read = (await db.getBatch(b.id))!;
    expect(read.legs).toHaveLength(1);
    expect(read.tickets).toHaveLength(1);
    expect(read.createdAt).toBe(b.createdAt);
    expect(await db.deleteBatch(b.id)).toBe(true);
    expect(await db.getBatch(b.id)).toBeNull();
    const back = await db.saveBatch(input(), b.id, b.createdAt);
    expect(back).toMatchObject({ id: b.id, createdAt: b.createdAt });
    await db.deleteBatch(b.id);
  });

  it('export → import round trip; existing batches are skipped', async () => {
    const b = await db.saveBatch(input());
    const file = JSON.parse(JSON.stringify(buildExport([], '0.0.0', undefined, [], await db.listBatches())));
    const parsed = parseImport(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.batches).toHaveLength(1);
    expect(await db.importBatches(parsed.batches)).toEqual({ added: 0, skipped: 1 });
    await db.deleteBatch(b.id);
    expect(await db.importBatches(parsed.batches)).toEqual({ added: 1, skipped: 0 });
    expect((await db.getBatch(b.id))!.tickets).toHaveLength(2);
  });
});
