import { describe, expect, it } from 'vitest';
import { moveCursor, settleAt, settleDutchAt, settleQueue, undoLast, type QueueItem, type SettleChange, type SettleState } from '@/lib/settle';
import type { Bet } from '@/lib/types';
import { bet, dutchBets } from './helpers';

const TODAY = '2026-11-22';
const keys = (q: QueueItem[]) => q.map((x) => x.key);

describe('settleQueue', () => {
  it('pending bets with game date today or earlier, oldest first', () => {
    const a = bet({ gameDate: '2026-11-22' });
    const b = bet({ gameDate: '2026-11-18' });
    const future = bet({ gameDate: '2026-11-23' });
    const settled = bet({ gameDate: '2026-11-10', result: 'won' });
    const c = bet({ gameDate: '2026-11-20' });
    expect(keys(settleQueue([a, b, future, settled, c], TODAY))).toEqual([b.id, c.id, a.id]);
  });

  it('a dutch is one item, in date order, holding its pending bets', () => {
    const early = bet({ gameDate: '2026-11-18' });
    const d = dutchBets('d1', [{ gameDate: '2026-11-19' }, { gameDate: '2026-11-19' }, { gameDate: '2026-11-19', result: 'lost' }]);
    const late = bet({ gameDate: '2026-11-21' });
    const q = settleQueue([late, ...d, early], TODAY);
    expect(keys(q)).toEqual([early.id, 'd1', late.id]);
    const item = q[1]!;
    expect(item.kind === 'dutch' && item.pending.map((b) => b.id)).toEqual([d[0]!.id, d[1]!.id]);
  });

  it('a dutch leaves the queue once none of its bets is pending, and waits for its game date', () => {
    expect(settleQueue(dutchBets('d2', [{ result: 'won' }, { result: 'lost' }]), TODAY)).toEqual([]);
    expect(settleQueue(dutchBets('d3', [{ gameDate: '2026-11-25' }, { gameDate: '2026-11-25' }]), TODAY)).toEqual([]);
  });
});

/** Applies settle changes to a list, like the app does after saving. */
function applyChanges(bets: Bet[], cs: SettleChange[]) {
  return bets.map((b) => {
    const c = cs.find((x) => x.id === b.id);
    return c ? { ...b, result: c.result, cashout: c.cashout } : b;
  });
}

describe('settle actions and undo', () => {
  const start = () => [bet({ gameDate: '2026-11-18' }), bet({ gameDate: '2026-11-19' }), bet({ gameDate: '2026-11-20' })];

  it('W settles the bet under the cursor; the cursor stays and shows the next one', () => {
    let bets = start();
    const q = settleQueue(bets, TODAY);
    const r = settleAt(q, { cursor: 0, undo: [] }, 'won')!;
    expect(r.changes).toEqual([{ id: q[0]!.key, result: 'won', cashout: null }]);
    bets = applyChanges(bets, r.changes);
    const q2 = settleQueue(bets, TODAY);
    expect(q2).toHaveLength(2);
    expect(q2[r.state.cursor]!.key).toBe(q[1]!.key);
  });

  it('settling the last row moves the cursor up', () => {
    const q = settleQueue(start(), TODAY);
    const r = settleAt(q, { cursor: 2, undo: [] }, 'lost')!;
    expect(r.state.cursor).toBe(1);
  });

  it('cash-out needs an amount', () => {
    const q = settleQueue(start(), TODAY);
    expect(settleAt(q, { cursor: 0, undo: [] }, 'cash-out')).toBeNull();
    expect(settleAt(q, { cursor: 0, undo: [] }, 'cash-out', 80)!.changes[0]).toMatchObject({ result: 'cash-out', cashout: 80 });
  });

  it('half-won, half-lost and void', () => {
    const q = settleQueue(start(), TODAY);
    for (const r of ['half-won', 'half-lost', 'void'] as const) expect(settleAt(q, { cursor: 0, undo: [] }, r)!.changes[0]!.result).toBe(r);
  });

  it('Z undoes the last settle: the bet is pending again and the cursor is back on it', () => {
    let bets = start();
    let state: SettleState = { cursor: 1, undo: [] };
    let q = settleQueue(bets, TODAY);
    const target = q[1]!.key;
    const s1 = settleAt(q, state, 'won')!;
    bets = applyChanges(bets, s1.changes);
    state = s1.state;
    q = settleQueue(bets, TODAY);
    const s2 = settleAt(q, state, 'lost')!;
    bets = applyChanges(bets, s2.changes);
    state = s2.state;

    const u1 = undoLast(state)!;
    expect(u1.changes).toEqual([{ id: s2.changes[0]!.id, result: 'pending', cashout: null }]);
    bets = applyChanges(bets, u1.changes);
    state = u1.state;
    const u2 = undoLast(state)!;
    expect(u2.changes).toEqual([{ id: target, result: 'pending', cashout: null }]);
    bets = applyChanges(bets, u2.changes);
    state = u2.state;
    q = settleQueue(bets, TODAY);
    expect(q).toHaveLength(3);
    expect(q[state.cursor]!.key).toBe(target);
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

describe('settling a dutch', () => {
  const s0: SettleState = { cursor: 0, undo: [] };
  const make = () => dutchBets('dx', [{ odds: 2 }, { odds: 3 }, { odds: 6 }]);

  it('a number picks the bet that won: it becomes won, the others lost', () => {
    const bets = make();
    const r = settleDutchAt(settleQueue(bets, TODAY), s0, 1)!;
    expect(r.changes).toEqual([
      { id: bets[0]!.id, result: 'lost', cashout: null },
      { id: bets[1]!.id, result: 'won', cashout: null },
      { id: bets[2]!.id, result: 'lost', cashout: null },
    ]);
    expect(settleQueue(applyChanges(bets, r.changes), TODAY)).toEqual([]);
  });

  it('0 = none won (all lost), V = void all; a number past the last bet does nothing', () => {
    const q = settleQueue(make(), TODAY);
    expect(settleDutchAt(q, s0, 'none')!.changes.map((c) => c.result)).toEqual(['lost', 'lost', 'lost']);
    expect(settleDutchAt(q, s0, 'void')!.changes.map((c) => c.result)).toEqual(['void', 'void', 'void']);
    expect(settleDutchAt(q, s0, 3)).toBeNull();
  });

  it('bets already settled one by one are left as they are', () => {
    const bets = dutchBets('dy', [{}, { result: 'void' }, {}]);
    const r = settleDutchAt(settleQueue(bets, TODAY), s0, 1)!; // the second PENDING bet
    expect(r.changes).toEqual([
      { id: bets[0]!.id, result: 'lost', cashout: null },
      { id: bets[2]!.id, result: 'won', cashout: null },
    ]);
  });

  it('plain-bet keys do nothing on a dutch, and dutch keys nothing on a plain bet', () => {
    expect(settleAt(settleQueue(make(), TODAY), s0, 'won')).toBeNull();
    expect(settleDutchAt(settleQueue([bet()], TODAY), s0, 0)).toBeNull();
  });

  it('Z undoes the whole dutch in one step', () => {
    let bets = [bet({ gameDate: '2026-11-01' }), ...make()];
    let q = settleQueue(bets, TODAY);
    const r = settleDutchAt(q, { cursor: 1, undo: [] }, 0)!;
    bets = applyChanges(bets, r.changes);
    expect(settleQueue(bets, TODAY)).toHaveLength(1);
    const u = undoLast(r.state)!;
    expect(u.changes).toHaveLength(3);
    expect(u.changes.every((c) => c.result === 'pending')).toBe(true);
    bets = applyChanges(bets, u.changes);
    q = settleQueue(bets, TODAY);
    expect(q[u.state.cursor]!.key).toBe('dx');
    expect(undoLast(u.state)).toBeNull();
  });
});
