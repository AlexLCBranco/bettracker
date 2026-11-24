// BT-37: woulda won / woulda lost on a cashed-out bet.
import { describe, expect, it } from 'vitest';
import { bet } from './helpers';
import { validateBet } from '@/lib/validate';
import { cashoutVerdict, nextWouldHave, wouldaFigure } from '@/lib/woulda';

// owner's example: stake 100 @ 1.88 cashed out for 145
const co = (over = {}) => bet({ stake: 100, odds: 1.88, result: 'cash-out', cashout: 145, ...over });

describe('left / saved', () => {
  it('woulda won: left = 88 − 45 = 43 (hypothetical and real alike)', () => {
    expect(wouldaFigure(co({ wouldHave: 'won', money: 'hypothetical' }))).toEqual({ kind: 'won', amount: 43 });
    expect(wouldaFigure(co({ wouldHave: 'won' }))).toEqual({ kind: 'won', amount: 43 });
  });

  it('woulda lost: saved = 45 − (−100) = 145', () => {
    expect(wouldaFigure(co({ wouldHave: 'lost', money: 'hypothetical' }))).toEqual({ kind: 'lost', amount: 145 });
  });

  it('bonus money: a loss costs nothing, so the cash-out only saved its real winnings', () => {
    expect(wouldaFigure(co({ wouldHave: 'won', money: 'bonus' }))).toEqual({ kind: 'won', amount: 43 });
    expect(wouldaFigure(co({ wouldHave: 'lost', money: 'bonus' }))).toEqual({ kind: 'lost', amount: 45 });
  });

  it('nothing without a would-have, or on a bet that is not a cash-out', () => {
    expect(wouldaFigure(co())).toBeNull();
    expect(wouldaFigure(bet({ result: 'won', wouldHave: 'won' }))).toBeNull();
  });

  it('the same key again clears it', () => {
    expect(nextWouldHave(null, 'won')).toBe('won');
    expect(nextWouldHave('won', 'won')).toBeNull();
    expect(nextWouldHave('won', 'lost')).toBe('lost');
  });
});

describe('validation', () => {
  const base = { book: 'b', placedDate: '2026-11-24', type: 'solo', situation: 'pregame', stake: 100, odds: 1.88, legs: [] };
  it('kept on a cash-out, cleared on any other result, refused when not won / lost', () => {
    expect(validateBet({ ...base, result: 'cash-out', cashout: 145, wouldHave: 'won' })).toMatchObject({ ok: true, value: { wouldHave: 'won' } });
    expect(validateBet({ ...base, result: 'won', cashout: null, wouldHave: 'won' })).toMatchObject({ ok: true, value: { wouldHave: null } });
    expect(validateBet({ ...base, result: 'cash-out', cashout: 145 })).toMatchObject({ ok: true, value: { wouldHave: null } });
    expect(validateBet({ ...base, result: 'cash-out', cashout: 145, wouldHave: 'maybe' }).ok).toBe(false);
  });
});

describe('Cash-out verdict', () => {
  it('saved − left over the cash-outs, with the counts', () => {
    const v = cashoutVerdict([co({ wouldHave: 'won' }), co({ wouldHave: 'lost' }), co({ wouldHave: 'lost' }), co(), bet({ result: 'won' })]);
    expect(v).toEqual({ net: 247, left: 43, saved: 290, wouldaWon: 1, wouldaLost: 2, notSet: 1 });
  });

  it('no cash-out with a would-have → net null ("-")', () => {
    expect(cashoutVerdict([co(), bet({ result: 'lost' })]).net).toBeNull();
    expect(cashoutVerdict([]).net).toBeNull();
  });
});
