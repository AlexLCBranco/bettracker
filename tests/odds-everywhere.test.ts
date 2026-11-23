// BT-16: every odds box takes any format and turns it into decimal odds.
import { describe, expect, it } from 'vitest';
import { emptyLeg, formToBet, newForm } from '@/lib/form';
import { normalizeOddsText, oddsFromText, oddsHint } from '@/lib/money';
import { parseQuickAdd, splitQuickAddText } from '@/lib/quickadd';

const D = { book: 'Betano', sport: 'Football', situation: 'pregame', type: 'solo' } as const;
const TODAY = '2026-11-22';

describe('oddsFromText', () => {
  it('reads every format as decimal (converted formats rounded to 2 decimals)', () => {
    expect(oddsFromText('-114')).toBe(1.88);
    expect(oddsFromText('+220')).toBe(3.2);
    expect(oddsFromText('5/2')).toBe(3.5);
    expect(oddsFromText('1,3')).toBe(1.3);
    expect(oddsFromText('2.10')).toBe(2.1);
    expect(oddsFromText('40%')).toBe(2.5);
    expect(oddsFromText('1.875')).toBe(1.875); // plain decimal keeps its exact value
  });
  it('null for unreadable or not above 1', () => {
    expect(oddsFromText('abc')).toBeNull();
    expect(oddsFromText('1')).toBeNull();
    expect(oddsFromText('')).toBeNull();
  });
  it('normalizes the box text on blur; hint while typing another format', () => {
    expect(normalizeOddsText('-114')).toBe('1.88');
    expect(normalizeOddsText('1,3')).toBe('1.3');
    expect(normalizeOddsText('+220')).toBe('3.20');
    expect(normalizeOddsText('abc')).toBe('abc');
    expect(oddsHint('-114')).toBe('-114 → 1.88 (American)');
    expect(oddsHint('2.10')).toBeNull();
    expect(oddsHint('')).toBeNull();
    expect(oddsHint('abc')).toBe('Cannot read these odds');
  });
});

describe('full form: total odds and leg odds in any format', () => {
  it('total odds "-114" saves 1.88, "+220" saves 3.2, "5/2" saves 3.5', () => {
    for (const [text, dec] of [['-114', 1.88], ['+220', 3.2], ['5/2', 3.5], ['1,3', 1.3]] as const) {
      const v = formToBet({ ...newForm(D, TODAY), stake: '10', odds: text }, TODAY);
      expect(v.ok && v.value.odds, text).toBe(dec);
      expect(v.ok && v.value.legs[0]!.odds, text).toBe(dec);
    }
  });
  it('combination leg odds in any format', () => {
    const f = { ...newForm({ ...D, type: 'combination' as const }, TODAY), stake: '10', odds: '+300' };
    f.legs = [{ ...emptyLeg('Football'), selection: 'A', odds: '-150' }, { ...emptyLeg('Football'), selection: 'B', odds: '6/4' }];
    const v = formToBet(f, TODAY);
    expect(v.ok && v.value.odds).toBe(4);
    expect(v.ok && v.value.legs.map((l) => l.odds)).toEqual([1.67, 2.5]);
  });
  it('unreadable odds: a clear error', () => {
    expect(formToBet({ ...newForm(D, TODAY), stake: '10', odds: 'abc' }, TODAY)).toMatchObject({ ok: false, error: expect.stringContaining('cannot read') });
  });
});

describe('quick-add: @odds in any format', () => {
  it('@-114, @+220, @5/2, @1,3', () => {
    expect(parseQuickAdd('150 @-114 lakers ml')).toEqual({ ok: true, stake: 150, odds: 1.88, betText: 'lakers ml' });
    expect(parseQuickAdd('50 @+220 celtics')).toEqual({ ok: true, stake: 50, odds: 3.2, betText: 'celtics' });
    expect(parseQuickAdd('20 @5/2 draw')).toEqual({ ok: true, stake: 20, odds: 3.5, betText: 'draw' });
    expect(parseQuickAdd('20 @1,3 over')).toEqual({ ok: true, stake: 20, odds: 1.3, betText: 'over' });
  });
  it('the odds part stays out of the autocomplete text', () => {
    expect(splitQuickAddText('150 @-114 lak')).toEqual({ prefix: '150 @-114 ', text: 'lak' });
    expect(splitQuickAddText('150 @5/2 x')).toEqual({ prefix: '150 @5/2 ', text: 'x' });
  });
});
