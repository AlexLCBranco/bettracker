// BT-54: a dutch placed as the next leg of a rollover shot. Owner's case: H$ 100 @ 1.30 won and banked (H$ 130), then
// the whole 130 dutched across two selections @ 2.00 and @ 2.20.
import { describe, expect, it } from 'vitest';
import { bet } from './helpers';
import { chainDutchIds, countBets, draftToBets, groupRows, newDutchDraft, rowKeyOf } from '@/lib/dutch';
import { dutch } from '@/lib/dutching';
import { bankAgainNeeds, bankedItems, canBank, chainLegs, chainSummary, collapseRollovers } from '@/lib/rollover';
import { summarize } from '@/lib/stats';
import type { Bet } from '@/lib/types';

const at = (i: number) => `2026-11-25T12:00:0${i}.000Z`;
const split = dutch(130, [2, 2.2]) as { stakes: number[] };
const [sA, sB] = split.stakes as [number, number];

function shot(a: Bet['result'], b: Bet['result'], over: { banked?: 'A' | 'B'; money?: Bet['money'] } = {}): Bet[] {
  const money = over.money ?? 'hypothetical';
  return [
    bet({ id: 'F', rolloverId: 'ro-1', stake: 100, odds: 1.3, result: 'won', banked: true, money, createdAt: at(0) }),
    bet({ id: 'A', rolloverId: 'ro-1', dutchId: 'dl', stake: sA, odds: 2, result: a, banked: over.banked === 'A', money, createdAt: at(1) }),
    bet({ id: 'B', rolloverId: 'ro-1', dutchId: 'dl', stake: sB, odds: 2.2, result: b, banked: over.banked === 'B', money, createdAt: at(2) }),
  ];
}

describe('BT-54: a dutch as a rollover leg', () => {
  it('the splits add up to the banked payout', () => {
    expect(Math.round((sA + sB) * 100)).toBe(13000);
  });

  it('is one leg of the chain', () => {
    const legs = chainLegs(shot('pending', 'pending'));
    expect(legs.map((l) => l.map((b) => b.id))).toEqual([['F'], ['A', 'B']]);
  });

  it('pending: the shot is pending at 1.30 × the dutch combined odds, one bet, one row, no dutch row', () => {
    const c = shot('pending', 'pending');
    const s = chainSummary(c);
    expect(s.outcome).toBe('pending');
    expect(s.odds).toBeCloseTo(1.3 / (1 / 2 + 1 / 2.2), 10);
    expect(countBets(c)).toEqual({ count: 1, pending: 1, wins: 0, losses: 0 });
    const rows = groupRows(c);
    expect(rows.map((r) => r.kind)).toEqual(['rollover']);
    expect(chainDutchIds(c)).toEqual(new Set(['dl']));
    expect(rowKeyOf(c[1]!, chainDutchIds(c))).toBe('rollover:ro-1');
  });

  it('one split lost while the other is pending is still pending, not lost', () => {
    expect(chainSummary(shot('lost', 'pending')).outcome).toBe('pending');
  });

  it('one split won: the shot wins with what the dutch returned; money counted once on the first stake', () => {
    const c = shot('won', 'lost');
    const s = chainSummary(c);
    const ret = Math.round(sA * 2 * 100) / 100;
    expect(s.outcome).toBe('won');
    expect(s.odds).toBeCloseTo(1.3 * (ret / 130), 10);
    expect(s.profit).toBe(Math.round((ret - 100) * 100) / 100);
    expect(countBets(c)).toEqual({ count: 1, pending: 0, wins: 1, losses: 0 });
    const money = collapseRollovers(c);
    expect(money).toHaveLength(1);
    const sum = summarize(c);
    expect(sum.netProfit).toBe(s.profit);
  });

  it('every split lost: the shot lost its first stake', () => {
    const c = shot('lost', 'lost');
    const s = chainSummary(c);
    expect(s.outcome).toBe('lost');
    expect(s.profit).toBe(-100);
    expect(countBets(c)).toEqual({ count: 1, pending: 0, wins: 0, losses: 1 });
    expect(collapseRollovers(c)[0]!.result).toBe('lost');
  });

  it('a won dutch can be banked again from any of its splits, and then rolls on its whole return', () => {
    const c = shot('lost', 'won');
    expect(canBank(c[1]!, c)).toBe(true); // the lost split banks the whole dutch
    expect(canBank(c[2]!, c)).toBe(true);
    expect(canBank(c[0]!, c)).toBe(false);
    expect(bankAgainNeeds(c)).toBe(1.33); // 1.30 × the dutch's ~1.05 = 1.36: needs 1.33+ to be a Shot
    const open = shot('lost', 'won', { banked: 'A' });
    const s = chainSummary(open);
    expect(s.outcome).toBe('open');
    expect(s.banked).toBe(Math.round(sB * 2.2 * 100) / 100);
    expect(canBank(open[2]!, open)).toBe(false); // already banked
    const [item] = bankedItems(open);
    expect(item).toMatchObject({ rolloverId: 'ro-1', legs: 2, amount: s.banked });
  });

  it('a dutch that returned less than its stake ends the shot (cannot be banked)', () => {
    const c = [
      bet({ id: 'F', rolloverId: 'ro-2', stake: 100, odds: 1.3, result: 'won', banked: true, createdAt: at(0) }),
      bet({ id: 'A', rolloverId: 'ro-2', dutchId: 'd2', stake: 100, odds: 1.2, result: 'won', createdAt: at(1) }),
      bet({ id: 'B', rolloverId: 'ro-2', dutchId: 'd2', stake: 30, odds: 5, result: 'lost', createdAt: at(2) }),
    ];
    const s = chainSummary(c);
    expect(s.outcome).toBe('won');
    expect(s.profit).toBe(20);
    expect(canBank(c[1]!, c)).toBe(false);
    expect(collapseRollovers(c)[0]).toMatchObject({ result: 'won' });
  });

  it('BT-39 still holds: a shot banked from one split of an outside dutch keeps its dutch row', () => {
    const A = bet({ id: 'A', dutchId: 'd9', rolloverId: 'ro-9', banked: true, stake: 46.62, odds: 3, result: 'won', createdAt: at(0) });
    const B = bet({ id: 'B', dutchId: 'd9', stake: 53.38, odds: 1.8, result: 'lost', createdAt: at(1) });
    expect(chainDutchIds([A, B]).size).toBe(0);
    expect(groupRows([A, B]).map((r) => r.kind)).toEqual(['dutch', 'rollover']);
    expect(countBets([A, B]).count).toBe(1);
  });

  it('a draft with the shot id saves every split into the shot', () => {
    const d = { ...newDutchDraft([{ selection: 'X', odds: 2, stake: sA }, { selection: 'Y', odds: 2.2, stake: sB }], { sport: 'NBA', situation: 'pregame', money: 'hypothetical' }), rolloverId: 'ro-1' };
    const v = draftToBets(d, 'Book', 'dl');
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.value.map((b) => [b.rolloverId, b.dutchId, b.money])).toEqual([['ro-1', 'dl', 'hypothetical'], ['ro-1', 'dl', 'hypothetical']]);
  });
});
