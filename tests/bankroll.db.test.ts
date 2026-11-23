// BT-33: money entries in the database, the bonus money type, and both in export / import.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-bankroll-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;

const db = await import('@/lib/server/db');
const { validateEntry } = await import('@/lib/bankroll');
const { validateBet } = await import('@/lib/validate');
const { buildExport, parseImport } = await import('@/lib/transfer');

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

const entry = (over: Record<string, unknown>) => {
  const v = validateEntry({ money: 'bonus', direction: 'in', amount: 50, book: 'Bet365', date: '2026-11-01', note: 'welcome', expiry: '2026-12-01', ...over });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

describe('money entries', () => {
  it('creates, reads, updates and deletes; a deleted entry is restored with its id', async () => {
    const e = await db.createEntry(entry({}));
    expect(await db.listEntries()).toEqual([e]);
    const u = await db.updateEntry(e, { ...entry({}), amount: 75 });
    expect((await db.getEntry(e.id))?.amount).toBe(75);
    expect(await db.deleteEntry(e.id)).toBe(true);
    expect(await db.listEntries()).toEqual([]);
    const back = await db.createEntry(entry({ amount: 75 }), { id: e.id, createdAt: e.createdAt });
    expect(back).toMatchObject({ id: e.id, createdAt: e.createdAt, amount: 75, expiry: '2026-12-01', money: 'bonus' });
    expect(u.id).toBe(e.id);
    await db.deleteEntry(e.id);
  });

  it('a bonus bet is stored as bonus money', async () => {
    const v = validateBet({ stake: 10, odds: 20, result: 'won', placedDate: '2026-11-05', money: 'bonus', betText: 'long shot' });
    if (!v.ok) throw new Error(v.error);
    const b = await db.createBet(v.value);
    expect((await db.getBet(b.id))?.money).toBe('bonus');
    await db.deleteBet(b.id);
  });

  it('export → import round trip keeps the entries; existing ids are skipped', async () => {
    const e = await db.createEntry(entry({ money: 'real', expiry: null, amount: 500 }));
    const file = JSON.parse(JSON.stringify(buildExport([], '0.0.0', undefined, await db.listEntries())));
    const parsed = parseImport(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.entries).toHaveLength(1);
    expect(await db.importEntries(parsed.entries)).toEqual({ added: 0, skipped: 1 });
    await db.deleteEntry(e.id);
    expect(await db.importEntries(parsed.entries)).toEqual({ added: 1, skipped: 0 });
    expect((await db.listEntries())[0]).toMatchObject({ id: e.id, amount: 500, money: 'real' });
  });

  it('an import with a bad entry is refused; an old file without entries is fine', () => {
    const bad = parseImport({ format: 'bettracker-export', formatVersion: 1, bets: [], moneyEntries: [{ money: 'real', amount: -1, book: 'x', date: '2026-11-01' }] });
    expect(bad).toMatchObject({ ok: false });
    expect(parseImport({ format: 'bettracker-export', formatVersion: 1, bets: [] })).toMatchObject({ ok: true, entries: [] });
  });
});
