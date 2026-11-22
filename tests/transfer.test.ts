import { describe, expect, it } from 'vitest';
import { buildExport, parseImport, toCSV } from '@/lib/transfer';
import { bet, leg } from './helpers';

const file = (bets: unknown[], over: Record<string, unknown> = {}) => ({ format: 'bettracker-export', formatVersion: 1, appVersion: '0.4.0', exportedAt: '2026-11-22T00:00:00Z', bets, ...over });

describe('parseImport', () => {
  it('keeps ids, timestamps and leg ids from the file', () => {
    const b = bet({ type: 'combination', legs: [leg({ id: 'leg-a' }), leg({ id: 'leg-b' })] });
    const r = parseImport(buildExport([b], '0.4.0'));
    if (!r.ok) throw new Error(r.error);
    expect(r.bets[0]).toMatchObject({ id: b.id, createdAt: b.createdAt, updatedAt: b.updatedAt, legIds: ['leg-a', 'leg-b'] });
    expect(r.bets[0]!.input.legs).toHaveLength(2);
  });

  it('gives new ids and timestamps where the file has none or bad ones', () => {
    const r = parseImport(file([{ ...bet(), id: 'bad id!', createdAt: 'yesterday', legs: [{ id: 3 }] }]), '2026-11-22T10:00:00.000Z');
    if (!r.ok) throw new Error(r.error);
    expect(r.bets[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.bets[0]!.createdAt).toBe('2026-11-22T10:00:00.000Z');
    expect(r.bets[0]!.legIds).toEqual([null]);
  });

  it('rejects other files, newer formats, duplicate ids and any invalid bet (naming which one)', () => {
    expect(parseImport({ bets: [] })).toEqual({ ok: false, error: 'This is not a BetTracker export file' });
    expect(parseImport(null)).toMatchObject({ ok: false });
    expect(parseImport(file([], { formatVersion: 2 }))).toEqual({ ok: false, error: 'This export comes from a newer BetTracker version' });
    expect(parseImport(file([bet({ id: 'x' }), bet({ id: 'x' })]))).toEqual({ ok: false, error: 'Bet 2: the id x appears twice' });
    expect(parseImport(file([bet(), { ...bet(), stake: -5 }]))).toEqual({ ok: false, error: 'Bet 2: Stake must be a number above 0' });
  });
});

describe('toCSV', () => {
  it('one row per bet with a header, BOM, quoted text, joined legs, and profit only when settled', () => {
    const csv = toCSV([
      bet({ id: 'b1', betText: 'say "hi", ok', stake: 100, odds: 2.5, result: 'won', legs: [leg({ sport: 'Football', game: 'A x B', market: 'Moneyline', selection: 'A' })] }),
      bet({ id: 'b2', type: 'combination', result: 'pending', preAnalysis: 'two\nlines', legs: [leg({ sport: 'Football' }), leg({ sport: 'Tennis' })] }),
    ]);
    expect(csv.startsWith('﻿placed_date,game_date,book,')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(4); // header, 2 rows, trailing empty
    expect(lines[1]).toContain(',Football,A x B,Moneyline,A,"say ""hi"", ok",100,2.5,won,,150,1,');
    expect(lines[2]).toContain(',Football | Tennis,');
    expect(lines[2]).toContain(',pending,,,2,"two\nlines",');
  });
});
