// BT-10: one-click settle buttons on a dutch row reuse the Settle page's functions on a one-item queue.
import { describe, expect, it } from 'vitest';
import { settleDutchRow, undoLast, type SettleChange } from '@/lib/settle';
import type { Bet } from '@/lib/types';
import { bet, dutchBets, leg } from './helpers';

const results = (changes: SettleChange[]) => changes.map((c) => c.result);
const legResults = (c: SettleChange) => c.legs?.map((l) => l.result);

/** Owner's example: McCain 25 / Mitchell 30 (/ Garland 20), each + Celtics W. */
const combos = (n: 2 | 3): Bet[] =>
  ['McCain 25 pts', 'Mitchell 30 pts', 'Garland 20 pts'].slice(0, n).map((own, i) =>
    bet({
      dutchId: 'dc',
      type: 'combination',
      betText: `${own} + Celtics W`,
      odds: 4,
      stake: 50,
      createdAt: `2026-11-20T12:00:00.00${i}Z`,
      legs: [leg({ selection: own, odds: 3.2 }), leg({ selection: 'Celtics W', odds: 1.3 })],
    }),
  );

describe.each([2, 3] as const)('dutch row with %i splits', (n) => {
  const solos = () => dutchBets('ds', Array.from({ length: n }, (_, i) => ({ odds: 2 + i })));

  it('0 W: every split lost; All W: every split won; V: every split void', () => {
    expect(results(settleDutchRow('ds', solos(), 'none')!.changes)).toEqual(Array(n).fill('lost'));
    expect(results(settleDutchRow('ds', solos(), 'all')!.changes)).toEqual(Array(n).fill('won'));
    expect(results(settleDutchRow('ds', solos(), 'void')!.changes)).toEqual(Array(n).fill('void'));
  });

  it('Pick W: the picked splits won, the rest lost; none picked = none won', () => {
    const r = settleDutchRow('ds', solos(), [1])!.changes;
    expect(results(r)).toEqual(['lost', 'won', 'lost'].slice(0, n));
    expect(results(settleDutchRow('ds', solos(), [])!.changes)).toEqual(Array(n).fill('lost'));
  });

  it('All W on combinations marks every leg won', () => {
    const r = settleDutchRow('dc', combos(n), 'all')!.changes;
    expect(r.map(legResults)).toEqual(Array(n).fill(['won', 'won']));
  });

  it('Shared ✕: every split lost, the shared leg marked lost on each; not available without a shared leg', () => {
    const r = settleDutchRow('dc', combos(n), 'shared')!.changes;
    expect(results(r)).toEqual(Array(n).fill('lost'));
    expect(r.map(legResults)).toEqual(Array(n).fill(['pending', 'lost']));
    expect(settleDutchRow('ds', solos(), 'shared')).toBeNull();
  });

  it('undo puts every bet (and its legs) back as it was', () => {
    const bets = combos(n);
    const step = settleDutchRow('dc', bets, [0])!;
    const u = undoLast(step.state)!;
    expect(u.changes.map((c) => [c.id, c.result, c.cashout])).toEqual(bets.map((b) => [b.id, 'pending', null]));
    // the won split had its legs changed: they come back pending
    expect(legResults(u.changes[0]!)).toEqual(['pending', 'pending']);
  });
});

describe('dutch row: partly settled and settled', () => {
  it('only the pending splits are settled, and the picked index is among them', () => {
    const bets = dutchBets('dp', [{ odds: 2, result: 'lost' }, { odds: 3 }, { odds: 4 }]);
    const r = settleDutchRow('dp', bets, [0])!.changes;
    expect(r.map((c) => [c.id, c.result])).toEqual([
      [bets[1]!.id, 'won'],
      [bets[2]!.id, 'lost'],
    ]);
  });

  it('a settled dutch has nothing to settle', () => {
    const bets = dutchBets('dz', [
      { odds: 2, result: 'won' },
      { odds: 3, result: 'lost' },
    ]);
    expect(settleDutchRow('dz', bets, 'all')).toBeNull();
  });
});
