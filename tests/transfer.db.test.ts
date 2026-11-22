// Export → import round trip against a throwaway SQLite file (same libSQL client as Turso in production).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'bettracker-transfer-'));
process.env.TURSO_DATABASE_URL = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;

const db = await import('@/lib/server/db');
const { validateBet } = await import('@/lib/validate');
const { buildExport, parseImport } = await import('@/lib/transfer');

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows may still hold the file open
  }
});

const input = (over: Record<string, unknown>) => {
  const v = validateBet({ stake: 50, odds: 2, result: 'pending', placedDate: '2026-11-01', ...over });
  if (!v.ok) throw new Error(v.error);
  return v.value;
};

describe('export and import', () => {
  it('round trip: export, import into an empty database, everything comes back identical', async () => {
    await db.createBet(input({ book: 'Betano', betText: 'solo, "quoted", ç', legs: [{ sport: 'Basketball', game: 'LAL x BOS', market: 'Moneyline', selection: 'Lakers' }], result: 'won' }));
    await db.createBet(input({ type: 'combination', odds: 6.2, result: 'lost', situation: 'live', preAnalysis: 'line 1\nline 2', legs: [{ selection: 'A', odds: 2, result: 'won' }, { selection: 'B', result: 'lost' }] }));
    await db.createBet(input({ type: 'combination', odds: 3, legs: [] }));
    await db.createBet(input({ result: 'cash-out', cashout: 72.5, gameDate: '2026-11-03' }));
    const before = await db.listBets();
    expect(before).toHaveLength(4);

    const file = JSON.parse(JSON.stringify(buildExport(before, '0.0.0'))) as unknown; // as written to and read from disk
    for (const b of before) await db.deleteBet(b.id);
    expect(await db.listBets()).toEqual([]);

    const parsed = parseImport(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await db.importBets(parsed.bets)).toEqual({ added: 4, skipped: 0 });
    expect(await db.listBets()).toEqual(before);
  });

  it('importing again adds nothing and changes nothing (existing ids are skipped, never overwritten)', async () => {
    const before = await db.listBets();
    const file = JSON.parse(JSON.stringify(buildExport(before.map((b) => ({ ...b, book: 'CHANGED' })), '0.0.0'))) as unknown;
    const parsed = parseImport(file);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(await db.importBets(parsed.bets)).toEqual({ added: 0, skipped: before.length });
    expect(await db.listBets()).toEqual(before);
  });
});
