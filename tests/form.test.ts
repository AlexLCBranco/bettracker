import { describe, expect, it } from 'vitest';
import { duplicateForm, emptyLeg, formFromBet, formToBet, newForm, nextForm } from '@/lib/form';
import { filterBets, NO_FILTERS } from '@/lib/filters';
import { validateBet } from '@/lib/validate';
import { bet, leg } from './helpers';

const D = { book: 'Betano', sport: 'Football', situation: 'pregame', type: 'solo' } as const;
const TODAY = '2026-11-22';

describe('bet form', () => {
  it('new form: dates today, last-used defaults', () => {
    const f = newForm(D, TODAY);
    expect(f).toMatchObject({ placedDate: '22/11/2026', gameDate: '22/11/2026', book: 'Betano', sport: 'Football', result: 'pending' });
  });

  it('requires stake and odds; pending result allowed; everything else optional', () => {
    expect(formToBet({ ...newForm(D, TODAY), odds: '2' }, TODAY)).toMatchObject({ ok: false, error: 'Stake is required' });
    expect(formToBet({ ...newForm(D, TODAY), stake: '10' }, TODAY)).toMatchObject({ ok: false, error: 'Odds are required' });
    const v = formToBet({ ...newForm({ book: '', sport: '', situation: 'pregame', type: 'solo' }, TODAY), stake: '10', odds: '2,5' }, TODAY);
    expect(v.ok && v.value).toMatchObject({ stake: 10, odds: 2.5, result: 'pending', placedDate: TODAY, gameDate: TODAY });
  });

  it('solo: one leg that mirrors the bet odds and result', () => {
    const v = formToBet({ ...newForm(D, TODAY), stake: '10', odds: '1.8', result: 'won', game: 'Fla vs Pal' }, TODAY);
    expect(v.ok && v.value.legs).toEqual([{ sport: 'Football', game: 'Fla vs Pal', market: '', selection: '', odds: 1.8, result: 'won', actual: '' }]);
  });

  it('combination: total odds as entered, never the product of the legs', () => {
    const f = { ...newForm({ ...D, type: 'combination' as const }, TODAY), stake: '10', odds: '3.2' };
    f.legs = [{ ...emptyLeg('Football'), selection: 'A', odds: '2', result: 'won' }, { ...emptyLeg('Football'), selection: 'B', odds: '2', result: 'lost' }];
    const v = formToBet(f, TODAY);
    expect(v.ok && v.value.odds).toBe(3.2);
    expect(v.ok && v.value.legs.map((l) => l.result)).toEqual(['won', 'lost']);
  });

  it('combination: legs optional with an "a + b" text; one leg or none otherwise is saved as a solo bet (BT-17, BT-25)', () => {
    const f = { ...newForm({ ...D, type: 'combination' as const }, TODAY), stake: '10', odds: '3.2' };
    expect(formToBet(f, TODAY)).toMatchObject({ ok: true, value: { type: 'solo' } });
    expect(formToBet({ ...f, betText: 'a + b' }, TODAY)).toMatchObject({ ok: true, value: { type: 'combination', legs: [] } });
    const one = formToBet({ ...f, legs: [{ ...emptyLeg('NBA'), game: 'A vs B', selection: 'A', odds: '1.5', result: 'won' }] }, TODAY);
    expect(one).toMatchObject({ ok: true, value: { type: 'solo', result: 'pending', legs: [{ sport: 'NBA', game: 'A vs B', selection: 'A', odds: 3.2, result: 'pending' }] } });
    const two = formToBet({ ...f, legs: [{ ...emptyLeg(), selection: 'A' }, { ...emptyLeg(), selection: 'B' }] }, TODAY);
    expect(two).toMatchObject({ ok: true, value: { type: 'combination' } });
  });

  it('cash-out needs the amount', () => {
    const f = { ...newForm(D, TODAY), stake: '10', odds: '2', result: 'cash-out' as const };
    expect(formToBet(f, TODAY)).toMatchObject({ ok: false });
    expect(formToBet({ ...f, cashout: '14,5' }, TODAY)).toMatchObject({ ok: true, value: { cashout: 14.5 } });
  });

  it('bad date is an error, not a silent shift', () => {
    expect(formToBet({ ...newForm(D, TODAY), stake: '1', odds: '2', gameDate: '31/02/2026' }, TODAY)).toMatchObject({ ok: false });
  });

  it('"Save and add another" keeps book, sport, dates, type and situation', () => {
    const f = { ...newForm(D, TODAY), stake: '10', odds: '2', betText: 'x', gameDate: '23/11/2026', situation: 'live' as const };
    expect(nextForm(f)).toMatchObject({ stake: '', odds: '', betText: '', book: 'Betano', sport: 'Football', gameDate: '23/11/2026', placedDate: '22/11/2026', situation: 'live' });
  });

  it('duplicate: same bet, pending, dated today', () => {
    const b = bet({ result: 'won', placedDate: '2026-10-01', gameDate: '2026-10-02', postAnalysis: 'meh', betText: 'over 2.5' });
    expect(duplicateForm(b, TODAY)).toMatchObject({ result: 'pending', placedDate: '22/11/2026', gameDate: '22/11/2026', postAnalysis: '', betText: 'over 2.5', stake: '100', odds: '2.00' });
  });

  it('edit round trip: form from a bet saves the same bet', () => {
    const b = bet({ type: 'combination', odds: 4.5, legs: [leg({ odds: 2.1 }), leg({ odds: 2.3, result: 'won' })] });
    const v = formToBet(formFromBet(b), TODAY);
    expect(v.ok && v.value.legs.map((l) => [l.odds, l.result])).toEqual([[2.1, 'pending'], [2.3, 'won']]);
    expect(v.ok && v.value.placedDate).toBe(b.placedDate);
  });
});

describe('validateBet (server side)', () => {
  it('rejects bad input', () => {
    expect(validateBet(null).ok).toBe(false);
    expect(validateBet({ stake: -1, odds: 2, result: 'won', placedDate: TODAY }).ok).toBe(false);
    expect(validateBet({ stake: 1, odds: 1, result: 'won', placedDate: TODAY }).ok).toBe(false);
    expect(validateBet({ stake: 1, odds: 2, result: 'maybe', placedDate: TODAY }).ok).toBe(false);
    expect(validateBet({ stake: 1, odds: 2, result: 'won', placedDate: '22/11/2026' }).ok).toBe(false);
  });
  it('game date defaults to placed date', () => {
    expect(validateBet({ stake: 1, odds: 2, result: 'won', placedDate: TODAY })).toMatchObject({ ok: true, value: { gameDate: TODAY } });
  });
});

describe('history filters', () => {
  const bets = [
    bet({ book: 'Betano', placedDate: '2026-11-01', result: 'won', legs: [leg({ sport: 'Football' })] }),
    bet({ book: 'Bet365', placedDate: '2026-11-10', situation: 'live', legs: [leg({ sport: 'Basketball', selection: 'Lakers' })] }),
    bet({ book: 'Bet365', placedDate: '2026-11-20', type: 'combination', legs: [] }),
  ];
  it('filters by each field', () => {
    expect(filterBets(bets, { ...NO_FILTERS, from: '2026-11-05', to: '2026-11-15' })).toEqual([bets[1]]);
    expect(filterBets(bets, { ...NO_FILTERS, book: 'bet365' })).toHaveLength(2);
    expect(filterBets(bets, { ...NO_FILTERS, sport: 'football' })).toEqual([bets[0]]);
    expect(filterBets(bets, { ...NO_FILTERS, type: 'combination' })).toEqual([bets[2]]);
    expect(filterBets(bets, { ...NO_FILTERS, situation: 'live' })).toEqual([bets[1]]);
    expect(filterBets(bets, { ...NO_FILTERS, result: 'won' })).toEqual([bets[0]]);
    expect(filterBets(bets, { ...NO_FILTERS, text: 'LAK' })).toHaveLength(3); // helpers' default bet text is "lakers ml"
    expect(filterBets(bets, NO_FILTERS)).toHaveLength(3);
  });
});
