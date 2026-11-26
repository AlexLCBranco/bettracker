import { describe, expect, it } from 'vitest';
import { emptyLeg, formToBet, legsOdds, newForm, oddsFollowLegs, withLegs, type BetForm } from '@/lib/form';

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
    let f = withLegs(combo(), [leg('1.33'), leg('')]);
    expect(f.odds).toBe('');
    f = withLegs(f, [leg('1.33'), leg('1.45')]);
    expect(f.odds).toBe('1.93');
    expect(oddsFollowLegs(f)).toBe(true);
    f = withLegs(f, [leg('1.33'), leg('1.5')]);
    expect(f.odds).toBe('2');
    f = withLegs(f, [leg('1.33'), leg('1.5'), leg('2')]);
    expect(f.odds).toBe('3.99');
    const v = formToBet(f, '2026-11-26');
    expect(v.ok && v.value.odds).toBe(3.99);
  });

  it("the book's typed price is kept when legs change", () => {
    let f = withLegs(combo({ odds: '1.90' }), [leg('1.33'), leg('1.45')]);
    expect(f.odds).toBe('1.90');
    expect(oddsFollowLegs(f)).toBe(false);
    f = withLegs(f, [leg('1.33'), leg('1.6')]);
    expect(f.odds).toBe('1.90');
  });

  it('a solo bet never gets odds from legs', () => {
    expect(withLegs(combo({ type: 'solo' }), [leg('2'), leg('2')]).odds).toBe('');
  });
});
