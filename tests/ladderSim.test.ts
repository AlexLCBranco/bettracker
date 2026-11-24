// BT-36: the ladder simulator's maths.
import { describe, expect, it } from 'vitest';
import { addPlay, DEFAULT_PLAN, formatChance, formatTotal, oneIn, planFromLadder, playOnce, readPlan, rungOdds, simulate, type SimPlan } from '@/lib/ladderSim';
import type { Ladder } from '@/lib/types';
import { bet } from './helpers';

const plan = (over: Partial<SimPlan> = {}): SimPlan => ({ ...DEFAULT_PLAN, ...over });

describe('the ladder table', () => {
  it('100 @ 2.00 × 10 rungs: R$ 102.400 at ×1024, chance 1 in 1024', () => {
    const s = simulate(plan());
    expect(s.rows).toHaveLength(11);
    expect(s.rows[0]).toMatchObject({ rung: 0, stakeIn: 100, pays: 100, totalOdds: 1, chance: 1 });
    expect(s.rows[1]).toMatchObject({ rung: 1, odds: 2, stakeIn: 100, pays: 200, profit: 100, totalOdds: 2, chance: 0.5 });
    expect(s.rows[10]).toMatchObject({ stakeIn: 51200, pays: 102400, profit: 102300, totalOdds: 1024 });
    expect(s.chance).toBeCloseTo(1 / 1024);
    expect(s.end).toBe(102400);
  });
  it('one rung typed over changes the rungs after it and the totals; the top odds never wipe it', () => {
    const s = simulate(plan({ rungs: 3, overrides: { 2: 3 } }));
    expect(s.rows.map((r) => [r.odds, r.override, r.pays])).toEqual([
      [1, false, 100],
      [2, false, 200],
      [3, true, 600],
      [2, false, 1200],
    ]);
    expect(s.totalOdds).toBe(12);
    expect(s.chance).toBeCloseTo(1 / 12);
    const s2 = simulate(plan({ rungs: 3, odds: 1.5, overrides: { 2: 3 } }));
    expect(s2.rows[2]!.odds).toBe(3);
    expect(s2.rows[1]!.odds).toBe(1.5);
  });
  it('money rounded to 2 decimals (the baseline showed 3)', () => {
    const s = simulate(plan({ start: 193, odds: 1.9, rungs: 3 }));
    expect(s.rows[1]!.pays).toBe(366.7);
    expect(s.rows[3]!.pays).toBe(1323.79);
    expect(formatTotal(s.rows[3]!.totalOdds)).toBe('×6.86');
  });
  it('target: the first rung that reaches it; rungs after it are dimmed; odds needed per rung (Nth root)', () => {
    const s = simulate(plan({ target: 1500 }));
    expect(s.targetRung).toBe(4);
    expect(s.rows[4]!.afterTarget).toBe(false);
    expect(s.rows[5]!.afterTarget).toBe(true);
    expect(s.needed).toBeCloseTo(Math.pow(15, 1 / 10));
    expect(simulate(plan({ target: 102400 })).needed).toBeCloseTo(2);
    expect(simulate(plan({ target: 1e9 })).targetRung).toBeNull();
    expect(simulate(plan({ target: null })).needed).toBeNull();
  });
  it('rungs kept between 1 and 30', () => {
    expect(simulate(plan({ rungs: 0 })).rows).toHaveLength(2);
    expect(simulate(plan({ rungs: 99 })).rows).toHaveLength(31);
  });
});

describe('formatting', () => {
  it('chance', () => {
    expect(formatChance(0.146)).toBe('14.6%');
    expect(formatChance(1 / 1024)).toBe('0.10%');
    expect(formatChance(1e-7)).toBe('<0.01%');
    expect(oneIn(1 / 613)).toBe('1 in 613');
    expect(oneIn(0.5)).toBeNull();
    expect(oneIn(1 / 1024)).toBe('1 in 1,024');
  });
  it('total odds', () => {
    expect(formatTotal(1024)).toBe('×1024');
    expect(formatTotal(6.859)).toBe('×6.86');
  });
});

describe('Try it', () => {
  it('W until the first L, at the fair chances', () => {
    const s = simulate(plan({ rungs: 5 }));
    const seq = [0.1, 0.2, 0.9];
    let i = 0;
    expect(playOnce(s, () => seq[i++]!)).toEqual({ won: 2, lostAt: 3 });
    expect(playOnce(s, () => 0)).toEqual({ won: 5, lostAt: null });
  });
  it('the running tally: tries, best rung, goal reached', () => {
    const s = simulate(plan({ rungs: 5, target: 400 }));
    let t = { tries: 0, best: 0, reachedGoal: 0 };
    t = addPlay(t, { won: 1, lostAt: 2 }, s);
    t = addPlay(t, { won: 3, lostAt: 4 }, s);
    expect(t).toEqual({ tries: 2, best: 3, reachedGoal: 1 });
  });
});

describe('saved plan and Open in sim', () => {
  it('a broken saved plan falls back to the defaults', () => {
    expect(readPlan(null)).toEqual(DEFAULT_PLAN);
    expect(readPlan({ start: -5, odds: 0.5, rungs: 500, overrides: { 2: 3, x: 4, 3: 0.5 }, notes: { 1: 'hi' } })).toMatchObject({ start: 100, odds: 2, rungs: 30, overrides: { 2: 3 }, notes: { 1: 'hi' } });
  });
  it('a real ladder: its rungs locked (won certain), its goal as the plan', () => {
    const L: Ladder = { goalRungs: 5, goalAmount: null, taken: false };
    const chain = [
      bet({ rolloverId: 'r1', ladder: L, stake: 100, odds: 2, result: 'won', betText: 'one', createdAt: '2026-11-20T00:00:01Z' }),
      bet({ rolloverId: 'r1', ladder: L, stake: 200, odds: 1.5, result: 'pending', betText: 'two', createdAt: '2026-11-20T00:00:02Z' }),
    ];
    const p = planFromLadder(chain, DEFAULT_PLAN);
    expect(p).toMatchObject({ start: 100, rungs: 5, fromLadder: 'r1', notes: { 1: 'one', 2: 'two' } });
    expect(rungOdds(p, 1)).toEqual({ odds: 2, override: false, locked: 'won' });
    expect(rungOdds(p, 2)).toEqual({ odds: 1.5, override: false, locked: 'pending' });
    const s = simulate(p);
    expect(s.rows[1]!.chance).toBe(1);
    expect(s.rows[2]!.chance).toBeCloseTo(1 / 1.5);
    expect(s.rows[2]!.pays).toBe(300);
  });
});
