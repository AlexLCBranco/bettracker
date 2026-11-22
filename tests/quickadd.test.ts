import { describe, expect, it } from 'vitest';
import { parseQuickAdd, splitQuickAddText } from '@/lib/quickadd';

describe('parseQuickAdd: valid', () => {
  it('stake, @odds, text', () => expect(parseQuickAdd('150 @2.10 lakers ml')).toEqual({ ok: true, stake: 150, odds: 2.1, betText: 'lakers ml' }));
  it('comma decimals', () => expect(parseQuickAdd('50,5 @1,85 over 2.5 goals')).toEqual({ ok: true, stake: 50.5, odds: 1.85, betText: 'over 2.5 goals' }));
  it('odds before stake', () => expect(parseQuickAdd('@1.90 100 flamengo')).toEqual({ ok: true, stake: 100, odds: 1.9, betText: 'flamengo' }));
  it('text first: first standalone number is the stake', () => expect(parseQuickAdd('lakers ml 150 @2.10')).toEqual({ ok: true, stake: 150, odds: 2.1, betText: 'lakers ml' }));
  it('"@ 2.10" with a space', () => expect(parseQuickAdd('150 @ 2.10 lakers')).toEqual({ ok: true, stake: 150, odds: 2.1, betText: 'lakers' }));
  it('R$ prefix', () => expect(parseQuickAdd('R$150 @2 x')).toEqual({ ok: true, stake: 150, odds: 2, betText: 'x' }));
  it('numbers in the text stay in the text', () => expect(parseQuickAdd('20 @1.5 over 220.5 points')).toMatchObject({ ok: true, stake: 20, betText: 'over 220.5 points' }));
  it('extra spaces', () => expect(parseQuickAdd('  150   @2.10   lakers   ml ')).toMatchObject({ ok: true, betText: 'lakers ml' }));
  it('no text is fine', () => expect(parseQuickAdd('150 @2.10')).toEqual({ ok: true, stake: 150, odds: 2.1, betText: '' }));
});

describe('parseQuickAdd: invalid opens the form prefilled', () => {
  it('no odds', () => expect(parseQuickAdd('150 lakers ml')).toEqual({ ok: false, stake: 150, odds: null, betText: 'lakers ml', reason: 'No @odds found' }));
  it('no stake', () => expect(parseQuickAdd('@2.10 lakers ml')).toEqual({ ok: false, stake: null, odds: 2.1, betText: 'lakers ml', reason: 'No stake found' }));
  it('odds not above 1', () => expect(parseQuickAdd('150 @1 lakers')).toMatchObject({ ok: false, stake: 150, odds: null }));
  it('zero stake', () => expect(parseQuickAdd('0 @2 lakers')).toMatchObject({ ok: false, stake: null }));
  it('text only', () => expect(parseQuickAdd('lakers ml')).toMatchObject({ ok: false, stake: null, odds: null, betText: 'lakers ml' }));
  it('empty', () => expect(parseQuickAdd('')).toMatchObject({ ok: false }));
  it('"@abc" is text, not odds', () => expect(parseQuickAdd('150 @abc')).toMatchObject({ ok: false, odds: null, betText: '@abc' }));
});

describe('splitQuickAddText (autocomplete on the text part)', () => {
  it('splits the leading numbers from the text', () => expect(splitQuickAddText('150 @2.10 lak')).toEqual({ prefix: '150 @2.10 ', text: 'lak' }));
  it('only numbers so far', () => expect(splitQuickAddText('150 @2,1 ')).toEqual({ prefix: '150 @2,1 ', text: '' }));
  it('text only', () => expect(splitQuickAddText('lakers')).toEqual({ prefix: '', text: 'lakers' }));
});
