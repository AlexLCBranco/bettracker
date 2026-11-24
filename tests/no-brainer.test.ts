// BT-44: the "no brainer" mark.
import { describe, expect, it } from 'vitest';
import { parseQuickAdd } from '@/lib/quickadd';
import { buildExport, parseImport, toCSV } from '@/lib/transfer';
import { validateBet } from '@/lib/validate';
import { formFromBet, formToBet, newForm } from '@/lib/form';
import { bet } from './helpers';

describe('quick-add #nb', () => {
  it('"#nb" at the end marks a no brainer and is not part of the bet text', () => {
    expect(parseQuickAdd('150 @2.10 lakers ml #nb')).toMatchObject({ ok: true, stake: 150, odds: 2.1, betText: 'lakers ml', noBrainer: true });
    expect(parseQuickAdd('150 @2.10 lakers ml #NB')).toMatchObject({ noBrainer: true, betText: 'lakers ml' });
  });
  it('without it, or glued to a word, there is no mark', () => {
    expect(parseQuickAdd('150 @2.10 lakers ml').noBrainer).toBeUndefined();
    expect(parseQuickAdd('150 @2.10 lakers#nb').noBrainer).toBeUndefined();
  });
  it('still marks a line that opens the form', () => {
    expect(parseQuickAdd('150 lakers ml #nb')).toMatchObject({ ok: false, noBrainer: true, betText: 'lakers ml' });
  });
});

describe('saving and import', () => {
  it('validated bets keep the mark; missing = off', () => {
    const base = { book: 'x', placedDate: '2026-11-24', gameDate: '2026-11-24', type: 'solo', situation: 'pregame', stake: 10, odds: 2, result: 'pending', legs: [{ selection: 'a', odds: 2 }] };
    const on = validateBet({ ...base, noBrainer: true });
    const off = validateBet(base);
    expect(on.ok && on.value.noBrainer).toBe(true);
    expect(off.ok && off.value.noBrainer).toBe(false);
  });
  it('an export round-trips the mark; an older file without it imports as off', () => {
    const file = buildExport([bet({ noBrainer: true }), bet()], '0.39.0');
    const back = parseImport(JSON.parse(JSON.stringify(file)));
    expect(back.ok && back.bets.map((b) => b.input.noBrainer)).toEqual([true, false]);
    const old = JSON.parse(JSON.stringify(file));
    for (const b of old.bets) delete b.noBrainer;
    const oldBack = parseImport(old);
    expect(oldBack.ok && oldBack.bets.map((b) => b.input.noBrainer)).toEqual([false, false]);
    expect(toCSV([bet({ noBrainer: true })]).split('\r\n')[0]).toContain('no_brainer');
  });
  it('the form carries it', () => {
    const f = { ...newForm({ book: '', sport: '', situation: 'pregame', type: 'solo' }), stake: '10', odds: '2', noBrainer: true };
    const v = formToBet(f);
    expect(v.ok && v.value.noBrainer).toBe(true);
    expect(formFromBet(bet({ noBrainer: true })).noBrainer).toBe(true);
  });
});
