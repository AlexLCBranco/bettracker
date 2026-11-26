import { describe, expect, it } from 'vitest';
import { emptyLeg, formToBet, legsOdds, newForm, overridesLegs, withLegs, type BetForm } from '@/lib/form';

const D = { book: 'Betano', sport: 'NBA', situation: 'pregame', type: 'combination' } as const;
const leg = (odds: string) => ({ ...emptyLeg('NBA'), odds });
const combo = (over: Partial<BetForm> = {}): BetForm => ({ ...newForm(D, '2026-11-26'), stake: '100', ...over });

describe('combination total odds from its legs', () => {
  it('multiplies every leg, to 2 decimals; null without 2+ legs that all read', () => {
    expect(legsOdds([leg('1.33'), leg('1.45')])).toBe(1.93);
    expect(legsOdds([leg('2'), leg('+100'), leg('3/2')])).toBe(10);
    expect(legsOdds([leg('1.33')])).toBeNull();
    expect(legsOdds([leg('1.33'), leg('')])).toBeNull();
    expect(legsOdds([leg('1.33'), leg('abc')])).toBeNull();
  });

  it('an empty total fills in as the legs get their odds, and follows later changes', () => {
    let f = withLegs(combo(), [leg('1.33'), leg('')], false);
    expect(f.odds).toBe('');
    f = withLegs(f, [leg('1.33'), leg('1.45')], false);
    expect(f.odds).toBe('1.93');
    f = withLegs(f, [leg('1.33'), leg('1.5')], false);
    expect(f.odds).toBe('2');
    f = withLegs(f, [leg('1.33'), leg('1.5'), leg('2')], false);
    expect(f.odds).toBe('3.99');
    const v = formToBet(f, '2026-11-26');
    expect(v.ok && v.value.odds).toBe(3.99);
    // a leg removed: no estimate, the old one blanks
    expect(withLegs(f, [leg('1.33')], false).odds).toBe('');
  });

  it('a total typed before the legs are complete (the first leg odds) still follows them', () => {
    // the owner's case: total 1.33 typed, leg 1 1.33, then leg 2 1.45 → 1.93, not 1.33
    expect(overridesLegs('1.33', [leg('1.33'), leg('')])).toBe(false);
    let f = withLegs(combo({ odds: '1.33' }), [leg('1.33'), leg('')], false);
    expect(f.odds).toBe('1.33');
    f = withLegs(f, [leg('1.33'), leg('1.45')], false);
    expect(f.odds).toBe('1.93');
  });

  it("the book's price, typed while every leg has odds, is kept when legs change", () => {
    const legs = [leg('1.33'), leg('1.45')];
    expect(overridesLegs('1.90', legs)).toBe(true);
    expect(overridesLegs('1.93', legs)).toBe(false);
    expect(overridesLegs('', legs)).toBe(false);
    const f = withLegs(combo({ odds: '1.90', legs }), [leg('1.33'), leg('1.6')], true);
    expect(f.odds).toBe('1.90');
  });

  it('a solo bet never gets odds from legs', () => {
    expect(withLegs(combo({ type: 'solo' }), [leg('2'), leg('2')], false).odds).toBe('');
  });
});
