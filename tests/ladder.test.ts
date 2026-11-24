// BT-35: ladders on the rollover chain: outcomes per rung, goal progress, take, counts, the Analytics group; shots unchanged.
import { describe, expect, it } from 'vitest';
import { breakdown } from '@/lib/analytics';
import { countBets } from '@/lib/dutch';
import { formatMoney } from '@/lib/money';
import { parseQuickAdd } from '@/lib/quickadd';
import { canBank, canStartLadder, chainSummary, goalText, isLadder, ladderOf, ladderProgress, ladderReport, ladderStrip, needsText } from '@/lib/rollover';
import { summarize } from '@/lib/stats';
import type { Bet, Ladder } from '@/lib/types';
import { validateBet } from '@/lib/validate';
import { bet } from './helpers';

const L = (over: Partial<Ladder> = {}): Ladder => ({ goalRungs: null, goalAmount: null, taken: false, ...over });
let n = 0;
/** Rungs of one ladder, each staking the previous payout. */
function ladder(id: string, rungs: Partial<Bet>[], lad: Partial<Ladder> = {}): Bet[] {
  return rungs.map((over, i) => bet({ rolloverId: id, ladder: L(lad), createdAt: `2026-11-20T12:00:0${i}.${++n}Z`, betText: `rung ${i + 1}`, ...over }));
}
const fmt = (x: number) => formatMoney(x, 'real');

describe('ladder outcomes', () => {
  it('100 → 200 → 400: open after each win, the whole payout banked for the next rung', () => {
    const b = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'won' },
    ]);
    expect(chainSummary(b)).toMatchObject({ outcome: 'open', banked: 400, stake: 100, odds: 4 });
    expect(ladderStrip(b, fmt)).toBe('R$ 100,00 → R$ 200,00 → R$ 400,00 → next rung: R$ 400,00');
  });
  it('a pending rung: pending, strip shows "next: 800 @ 2.00"', () => {
    const b = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'won' },
      { stake: 400, odds: 2, result: 'pending' },
    ]);
    expect(chainSummary(b).outcome).toBe('pending');
    expect(ladderStrip(b, fmt)).toBe('R$ 100,00 → R$ 200,00 → R$ 400,00 → next: R$ 800,00 @ 2.00');
  });
  it('a lost rung ends it: the loss is the first stake only', () => {
    const b = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'lost' },
    ]);
    expect(chainSummary(b)).toMatchObject({ outcome: 'lost', profit: -100 });
  });
  it('take: closed as won at that amount', () => {
    const b = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'won', ladder: L({ taken: true }) },
    ]);
    expect(chainSummary(b)).toMatchObject({ outcome: 'won', profit: 300 });
  });
  it('void and cash-out rungs keep it alive with what they returned', () => {
    const v = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 3, result: 'void' },
    ]);
    expect(chainSummary(v)).toMatchObject({ outcome: 'open', banked: 200 });
    const c = ladder('l2', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 3, result: 'cash-out', cashout: 350 },
    ]);
    expect(chainSummary(c)).toMatchObject({ outcome: 'open', banked: 350 });
    expect(chainSummary(c).odds).toBeCloseTo(3.5);
    const after = [...c, bet({ rolloverId: 'l2', ladder: L(), stake: 350, odds: 2, result: 'won', createdAt: '2026-11-20T12:00:09Z' })];
    expect(chainSummary(after)).toMatchObject({ outcome: 'open', banked: 700 });
  });
  it('taken at a void-only ladder is even', () => {
    const b = ladder('l1', [{ stake: 100, odds: 2, result: 'void', ladder: L({ taken: true }) }]);
    expect(chainSummary(b)).toMatchObject({ outcome: 'even', profit: 0 });
  });
});

describe('goal progress', () => {
  it('rungs: "rung 3 of 5"; reached once enough rungs climbed', () => {
    const b = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'won' },
      { stake: 400, odds: 2, result: 'pending' },
    ], { goalRungs: 5 });
    const p = ladderProgress(b);
    expect(goalText(p, fmt)).toBe('rung 3 of 5');
    expect(p).toMatchObject({ climbed: 2, reached: false, amount: 400 });
    expect(ladderProgress(ladder('l2', [{ result: 'won' }, { result: 'won' }], { goalRungs: 2 })).reached).toBe(true);
  });
  it('amount: "R$ 400,00 of R$ 1.600,00"', () => {
    const b = ladder('l1', [
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'won' },
    ], { goalAmount: 1600 });
    expect(goalText(ladderProgress(b), fmt)).toBe('R$ 400,00 of R$ 1.600,00');
  });
  it('no goal: "rung 3" (open: the next rung to place)', () => {
    const b = ladder('l1', [{ stake: 100, odds: 2, result: 'won' }, { stake: 200, odds: 2, result: 'won' }]);
    expect(goalText(ladderProgress(b), fmt)).toBe('rung 3');
  });
});

describe('counting and Analytics', () => {
  const won = ladder('a', [{ stake: 100, odds: 2, result: 'won' }, { stake: 200, odds: 2, result: 'won', ladder: L({ taken: true, goalRungs: 2 }) }], { goalRungs: 2 });
  const lost = ladder('b', [{ stake: 50, odds: 2, result: 'won' }, { stake: 100, odds: 2, result: 'lost' }]);
  const open = ladder('c', [{ stake: 10, odds: 3, result: 'won' }]);
  const all = [...won, ...lost, ...open, bet({ stake: 20, result: 'won' })];
  it('one bet each in counts and win rate: won when closed above the first stake, lost when a rung loses, pending while open', () => {
    expect(countBets(all)).toMatchObject({ count: 4, pending: 1, wins: 2, losses: 1 });
    expect(summarize(all)).toMatchObject({ totalWagered: 180, netProfit: 300 - 50 + 20, pendingAmount: 10 });
  });
  it('the Ladder group: started, average rungs, best, goals reached, net profit', () => {
    const r = ladderReport(all);
    expect(r).toMatchObject({ started: 3, withGoal: 1, reachedGoal: 1, netProfit: 250, best: { rolloverId: 'a', profit: 300, rungs: 2 } });
    expect(r.avgRungs).toBeCloseTo((2 + 1 + 1) / 3);
    expect(ladderReport([]).avgRungs).toBeNull();
    expect(breakdown(all, 'type').map((x) => x.label)).toContain('Ladder');
  });
});

describe('shots unaffected', () => {
  it('a shot chain still needs Bank and shows its target', () => {
    const shot = [bet({ rolloverId: 's', stake: 100, odds: 1.6, result: 'won', banked: true })];
    expect(isLadder(shot)).toBe(false);
    expect(chainSummary(shot)).toMatchObject({ outcome: 'open', banked: 160 });
    expect(needsText(chainSummary(shot))).toContain('to reach 1.80');
    const notBanked = [bet({ rolloverId: 's', stake: 100, odds: 1.6, result: 'won' }), bet({ rolloverId: 's', stake: 160, odds: 1.2, result: 'won', createdAt: '2026-11-21T00:00:00Z' })];
    expect(chainSummary(notBanked).outcome).toBe('won');
  });
  it('rungs are never banked; a won plain bet can start a ladder (not bonus, not in a dutch or chain)', () => {
    const r = ladder('x', [{ result: 'won' }]);
    expect(canBank(r[0]!, r)).toBe(false);
    expect(canStartLadder(bet({ result: 'won' }))).toBe(true);
    expect(canStartLadder(bet({ result: 'won', money: 'bonus' }))).toBe(false);
    expect(canStartLadder(bet({ result: 'pending' }))).toBe(false);
    expect(canStartLadder(bet({ result: 'won', dutchId: 'd' }))).toBe(false);
  });
  it('ladderOf reads the goal and taken from the rungs', () => {
    expect(ladderOf(ladder('x', [{}, { ladder: L({ taken: true }) }], { goalAmount: 500 }))).toEqual({ goalRungs: null, goalAmount: 500, taken: true });
  });
});

describe('input', () => {
  it('validation: a ladder needs its chain id; goals checked', () => {
    const base = { stake: 10, odds: 2, result: 'pending', placedDate: '2026-11-20' };
    expect(validateBet({ ...base, ladder: L() }).ok).toBe(false);
    expect(validateBet({ ...base, rolloverId: 'ro-1', ladder: L({ goalRungs: 5 }) })).toMatchObject({ ok: true, value: { ladder: { goalRungs: 5, goalAmount: null, taken: false } } });
    expect(validateBet({ ...base, rolloverId: 'ro-1', ladder: L({ goalRungs: 0 }) }).ok).toBe(false);
    expect(validateBet({ ...base, rolloverId: 'ro-1', ladder: L({ goalAmount: -1 }) }).ok).toBe(false);
    expect(validateBet(base)).toMatchObject({ ok: true, value: { ladder: null } });
  });
  it('quick-add: "ladder", "ladder:5" (rungs), "ladder:R$1600" (amount)', () => {
    expect(parseQuickAdd('100 @2 lakers ml ladder')).toMatchObject({ ok: true, betText: 'lakers ml', ladder: { goalRungs: null, goalAmount: null } });
    expect(parseQuickAdd('100 @2 ladder:5 lakers ml')).toMatchObject({ ok: true, betText: 'lakers ml', ladder: { goalRungs: 5, goalAmount: null } });
    expect(parseQuickAdd('100 @2 lakers ml ladder:R$1600')).toMatchObject({ ladder: { goalRungs: null, goalAmount: 1600 } });
    expect(parseQuickAdd('100 @2 ladderman props')).not.toHaveProperty('ladder');
  });
});
