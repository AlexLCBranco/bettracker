// BT-14: hypothetical money (H$) never mixes into real totals.
import { describe, expect, it } from 'vitest';
import { draftToBets, editDutchDraft, newDutchDraft } from '@/lib/dutch';
import { filterBets, NO_FILTERS } from '@/lib/filters';
import { formFromBet, formToBet, newForm } from '@/lib/form';
import { formatMoney } from '@/lib/money';
import { parseQuickAdd } from '@/lib/quickadd';
import { byMoney } from '@/lib/scope';
import { summarize } from '@/lib/stats';
import { validateBet } from '@/lib/validate';
import { bet, dutchBets } from './helpers';

const TODAY = '2026-11-22';

describe('hypothetical money', () => {
  it('a bet is real money unless it says hypothetical; anything else is refused', () => {
    const base = { stake: 10, odds: 2, result: 'pending', placedDate: TODAY };
    expect(validateBet(base)).toMatchObject({ ok: true, value: { money: 'real' } });
    expect(validateBet({ ...base, money: 'hypothetical' })).toMatchObject({ ok: true, value: { money: 'hypothetical' } });
    expect(validateBet({ ...base, money: 'monopoly' })).toMatchObject({ ok: false });
  });

  it('H$ formatting', () => {
    expect(formatMoney(50, 'hypothetical')).toBe('H$ 50,00');
    expect(formatMoney(-12.5, 'hypothetical', true)).toBe('-H$ 12,50');
    expect(formatMoney(50, 'real')).toBe('R$ 50,00');
    expect(formatMoney(50, 'both')).toBe('R$+H$ 50,00');
  });

  it('totals count one money: Real by default never includes H$ bets', () => {
    const bets = [bet({ stake: 100, odds: 2, result: 'won' }), bet({ stake: 1000, odds: 3, result: 'won', money: 'hypothetical' }), bet({ stake: 50, result: 'lost', money: 'hypothetical' })];
    expect(summarize(byMoney(bets, 'real'))).toMatchObject({ netProfit: 100, totalWagered: 100, betCount: 1 });
    expect(summarize(byMoney(bets, 'hypothetical'))).toMatchObject({ netProfit: 1950, totalWagered: 1050, betCount: 2 });
    expect(summarize(byMoney(bets, 'both'))).toMatchObject({ netProfit: 2050, betCount: 3 });
  });

  it('History filter by money', () => {
    const bets = [bet({ id: 'r' }), bet({ id: 'h', money: 'hypothetical' })];
    expect(filterBets(bets, { ...NO_FILTERS, money: 'hypothetical' }).map((b) => b.id)).toEqual(['h']);
    expect(filterBets(bets, { ...NO_FILTERS, money: 'real' }).map((b) => b.id)).toEqual(['r']);
    expect(filterBets(bets, NO_FILTERS)).toHaveLength(2);
  });

  it('quick-add: "H$150" is hypothetical, "R$150" real, no prefix leaves it to the last-used money', () => {
    expect(parseQuickAdd('H$150 @2.10 lakers')).toEqual({ ok: true, stake: 150, odds: 2.1, betText: 'lakers', money: 'hypothetical' });
    expect(parseQuickAdd('h$50 @2 x')).toMatchObject({ ok: true, stake: 50, money: 'hypothetical' });
    expect(parseQuickAdd('150 @2 x')).not.toHaveProperty('money');
  });

  it('the full form: last-used money by default, kept when editing, saved', () => {
    const f = newForm({ book: '', sport: '', situation: 'pregame', type: 'solo', money: 'hypothetical' }, TODAY);
    expect(f.money).toBe('hypothetical');
    expect(formToBet({ ...f, stake: '10', odds: '2' }, TODAY)).toMatchObject({ ok: true, value: { money: 'hypothetical' } });
    expect(formFromBet(bet({ money: 'hypothetical' })).money).toBe('hypothetical');
  });

  it('a dutch: every bet in the draft money; editing keeps it', () => {
    const d = { ...newDutchDraft([{ selection: 'A', odds: 2, stake: 50 }, { selection: 'B', odds: 2, stake: 50 }], { sport: '', situation: 'pregame', money: 'hypothetical' }, TODAY) };
    const v = draftToBets(d, '', 'd1', TODAY);
    expect(v.ok && v.value.map((b) => b.money)).toEqual(['hypothetical', 'hypothetical']);
    expect(editDutchDraft(dutchBets('d2', [{ money: 'hypothetical' }, { money: 'hypothetical' }])).money).toBe('hypothetical');
  });
});
