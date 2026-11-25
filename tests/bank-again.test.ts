// BT-53: a finished shot under 1.80 can be banked again; it says the tier and the minimum odds its next bet needs.
import { describe, expect, it } from 'vitest';
import { bet } from './helpers';
import { bankAgainNeeds, canBank, chainSummary, neededOdds, needsText } from '@/lib/rollover';

const at = (i: number) => `2026-11-25T12:00:0${i}.000Z`;

/** The owner's screenshot: Bet 1 won @ 1.53 (banked), Bet 2 cashed out R$ 170 on R$ 153: a 1.70 shot. */
const screenshot = () => [
  bet({ rolloverId: 'r', stake: 100, odds: 1.53, result: 'won', banked: true, createdAt: at(0) }),
  bet({ rolloverId: 'r', stake: 153, odds: 1.5, result: 'cash-out', cashout: 170, createdAt: at(1) }),
];

describe('needed odds (rounded up so hitting them always reaches 1.80)', () => {
  it('1.80 / 1.70 = 1.0588… → 1.06', () => expect(neededOdds(1.7)).toBe(1.06));
  it('rounds up, never down', () => {
    // 1.80 / 1.50 = 1.2 exactly; 1.80 / 1.49 = 1.2080… → 1.21
    expect(neededOdds(1.5)).toBe(1.2);
    expect(neededOdds(1.49)).toBe(1.21);
    for (const o of [1.11, 1.23, 1.37, 1.44, 1.59, 1.66, 1.79]) expect(o * neededOdds(o)!).toBeGreaterThanOrEqual(1.8 - 1e-9);
  });
  it('already a shot: nothing needed', () => expect(neededOdds(1.8)).toBeNull());
});

describe('needs text', () => {
  it('names the tier the needed odds fall in', () => {
    expect(needsText({ needs: 1.21 })).toBe('needs a Mini · 1.21+');
    expect(needsText({ needs: 1.4 })).toBe('needs a Semi · 1.40+');
    expect(needsText({ needs: 1.6 })).toBe('needs a Pepsi · 1.60+');
  });
  it('under the Mini range: just the number', () => expect(needsText({ needs: 1.06 })).toBe('needs 1.06+'));
  it('already 1.80+', () => expect(needsText({ needs: null })).toBe('already 1.80+ (Shot)'));
});

describe('bank again', () => {
  it('the screenshot case: finished @ 1.70, bankable, needs 1.06+', () => {
    const c = screenshot();
    expect(chainSummary(c).outcome).toBe('won');
    expect(chainSummary(c).odds).toBeCloseTo(1.7, 10);
    expect(canBank(c[1]!, c)).toBe(true);
    expect(bankAgainNeeds(c)).toBe(1.06);
    expect(needsText({ needs: bankAgainNeeds(c) })).toBe('needs 1.06+');
  });
  it('banked again: open, still needs 1.06+', () => {
    const c = screenshot();
    c[1] = { ...c[1]!, banked: true };
    const s = chainSummary(c);
    expect(s.outcome).toBe('open');
    expect(s.banked).toBe(170);
    expect(s.needs).toBe(1.06);
    expect(bankAgainNeeds(c)).toBeNull(); // open: the shot line says it, not the bank-again line
  });
  it('any depth: a third bet won, still under 1.80', () => {
    const c = [...screenshot().map((b) => ({ ...b, banked: true })), bet({ rolloverId: 'r', stake: 170, odds: 1.02, result: 'won', createdAt: at(2) })];
    expect(bankAgainNeeds(c)).toBe(1.04);
  });
  it('nothing for a chain at 1.80+, a lost one, or a ladder', () => {
    expect(bankAgainNeeds([bet({ rolloverId: 'r', odds: 1.5, result: 'won', banked: true, createdAt: at(0) }), bet({ rolloverId: 'r', stake: 150, odds: 1.3, result: 'won', createdAt: at(1) })])).toBeNull();
    expect(bankAgainNeeds([bet({ rolloverId: 'r', odds: 1.5, result: 'won', banked: true, createdAt: at(0) }), bet({ rolloverId: 'r', stake: 150, odds: 1.1, result: 'lost', createdAt: at(1) })])).toBeNull();
    const ladder = { goalRungs: null, goalAmount: null, taken: true };
    expect(bankAgainNeeds([bet({ rolloverId: 'r', odds: 1.2, result: 'won', ladder, createdAt: at(0) })])).toBeNull();
  });
});
