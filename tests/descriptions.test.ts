// BT-47: a bet's description in the Bets table.
import { describe, expect, it } from 'vitest';
import { descriptionChanges, descriptionParts, hasDescription, isDescriptionOpen, rowHasDescription } from '@/lib/descriptions';
import { bet, dutchBets } from './helpers';

describe('has a description', () => {
  it('plain bet: either text, blank space does not count', () => {
    expect(hasDescription(bet())).toBe(false);
    expect(hasDescription(bet({ preAnalysis: '  \n ' }))).toBe(false);
    expect(hasDescription(bet({ preAnalysis: 'Jokic vs a weak front court' }))).toBe(true);
    expect(hasDescription(bet({ postAnalysis: 'lost by one' }))).toBe(true);
  });
  it('a dutch / rollover row: when any of its bets has one', () => {
    expect(rowHasDescription(dutchBets('d', [{}, {}]))).toBe(false);
    expect(rowHasDescription(dutchBets('d', [{}, { postAnalysis: 'x' }]))).toBe(true);
  });
  it('parts: only the ones with text, Before then After', () => {
    expect(descriptionParts(bet({ postAnalysis: ' after ' }))).toEqual([{ label: 'After', text: 'after' }]);
    expect(descriptionParts(bet({ preAnalysis: 'a', postAnalysis: 'b' })).map((p) => p.label)).toEqual(['Before', 'After']);
  });
});

describe('open rows and saving', () => {
  it('the switch opens every row with text; a hand toggle flips one row', () => {
    const none = new Set<string>();
    expect(isDescriptionOpen('bet:a', true, false, none)).toBe(false);
    expect(isDescriptionOpen('bet:a', true, true, none)).toBe(true);
    expect(isDescriptionOpen('bet:b', false, true, none)).toBe(false);
    expect(isDescriptionOpen('bet:b', false, true, new Set(['bet:b']))).toBe(true);
    expect(isDescriptionOpen('bet:a', true, true, new Set(['bet:a']))).toBe(false);
  });
  it('only changed texts are saved, trimmed', () => {
    const a = bet({ id: 'a', preAnalysis: 'old' });
    const b = bet({ id: 'b' });
    expect(descriptionChanges([a, b], { a: { preAnalysis: 'old ', postAnalysis: '' }, b: { preAnalysis: '', postAnalysis: ' new ' } })).toEqual([{ id: 'b', patch: { preAnalysis: '', postAnalysis: 'new' } }]);
  });
});
