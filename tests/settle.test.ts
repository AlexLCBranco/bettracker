import { describe, expect, it } from 'vitest';
import { moveCursor, settleAt, settleQueue, undoLast, type SettleState } from '@/lib/settle';
import type { Bet } from '@/lib/types';
import { bet } from './helpers';

const TODAY = '2026-11-22';

describe('settleQueue', () => {
  it('pending bets with game date today or earlier, oldest first', () => {
    const a = bet({ gameDate: '2026-11-22' });
    const b = bet({ gameDate: '2026-11-18' });
    const future = bet({ gameDate: '2026-11-23' });
    const settled = bet({ gameDate: '2026-11-10', result: 'won' });
    const c = bet({ gameDate: '2026-11-20' });
    expect(settleQueue([a, b, future, settled, c], TODAY).map((x) => x.id)).toEqual([b.id, c.id, a.id]);
  });
});

/** Applies settle changes to a list, like the app does after saving. */
function applyChange(bets: Bet[], c: { id: string; result: Bet['result']; cashout: number | null }) {
  return bets.map((b) => (b.id === c.id ? { ...b, result: c.result, cashout: c.cashout } : b));
}

describe('settle actions and undo', () => {
  const start = () => [bet({ gameDate: '2026-11-18' }), bet({ gameDate: '2026-11-19' }), bet({ gameDate: '2026-11-20' })];

  it('W settles the bet under the cursor; the cursor stays and shows the next one', () => {
    let bets = start();
    const q = settleQueue(bets, TODAY);
    const r = settleAt(q, { cursor: 0, undo: [] }, 'won')!;
    expect(r.change).toEqual({ id: q[0]!.id, result: 'won', cashout: null });
    bets = applyChange(bets, r.change);
    const q2 = settleQueue(bets, TODAY);
    expect(q2).toHaveLength(2);
    expect(q2[r.state.cursor]!.id).toBe(q[1]!.id);
  });

  it('settling the last row moves the cursor up', () => {
    const q = settleQueue(start(), TODAY);
    const r = settleAt(q, { cursor: 2, undo: [] }, 'lost')!;
    expect(r.state.cursor).toBe(1);
  });

  it('cash-out needs an amount', () => {
    const q = settleQueue(start(), TODAY);
    expect(settleAt(q, { cursor: 0, undo: [] }, 'cash-out')).toBeNull();
    expect(settleAt(q, { cursor: 0, undo: [] }, 'cash-out', 80)!.change).toMatchObject({ result: 'cash-out', cashout: 80 });
  });

  it('half-won, half-lost and void', () => {
    const q = settleQueue(start(), TODAY);
    for (const r of ['half-won', 'half-lost', 'void'] as const) expect(settleAt(q, { cursor: 0, undo: [] }, r)!.change.result).toBe(r);
  });

  it('Z undoes the last settle: the bet is pending again and the cursor is back on it', () => {
    let bets = start();
    let state: SettleState = { cursor: 1, undo: [] };
    let q = settleQueue(bets, TODAY);
    const target = q[1]!.id;
    const s1 = settleAt(q, state, 'won')!;
    bets = applyChange(bets, s1.change);
    state = s1.state;
    q = settleQueue(bets, TODAY);
    const s2 = settleAt(q, state, 'lost')!;
    bets = applyChange(bets, s2.change);
    state = s2.state;

    const u1 = undoLast(state)!;
    expect(u1.change).toEqual({ id: s2.change.id, result: 'pending', cashout: null });
    bets = applyChange(bets, u1.change);
    state = u1.state;
    const u2 = undoLast(state)!;
    expect(u2.change).toEqual({ id: target, result: 'pending', cashout: null });
    bets = applyChange(bets, u2.change);
    state = u2.state;
    q = settleQueue(bets, TODAY);
    expect(q).toHaveLength(3);
    expect(q[state.cursor]!.id).toBe(target);
    expect(undoLast(state)).toBeNull();
  });

  it('nothing to settle: no change', () => expect(settleAt([], { cursor: 0, undo: [] }, 'won')).toBeNull());

  it('arrows move within bounds', () => {
    const q = settleQueue(start(), TODAY);
    expect(moveCursor(q, { cursor: 0, undo: [] }, -1).cursor).toBe(0);
    expect(moveCursor(q, { cursor: 0, undo: [] }, 1).cursor).toBe(1);
    expect(moveCursor(q, { cursor: 2, undo: [] }, 1).cursor).toBe(2);
  });
});
