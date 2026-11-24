// Undo history (Ctrl+Z): steps, groups, the edit revert patch, and taking a bet out of a ladder or rollover.
import { describe, expect, it } from 'vitest';
import { chainSummary, detachPlan } from '@/lib/rollover';
import type { Bet, Ladder } from '@/lib/types';
import { isUndoKey, revertPatch, UNDO_LIMIT, UndoHistory } from '@/lib/undo';
import { bet, leg } from './helpers';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('UndoHistory', () => {
  it('undoes the last step first, and says when there is nothing left', async () => {
    const done: string[] = [];
    const h = new UndoHistory();
    h.record({ label: 'Added: a', key: 'bet:a', revert: () => done.push('a') });
    h.record({ label: 'Added: b', key: 'bet:b', revert: () => done.push('b') });
    expect(h.peek()?.label).toBe('Added: b');
    expect(h.undo()?.key).toBe('bet:b');
    expect(h.undo()?.key).toBe('bet:a');
    expect(h.undo()).toBeUndefined();
    await tick();
    expect(done).toEqual(['b', 'a']);
  });

  it(`keeps the last ${UNDO_LIMIT} steps`, () => {
    const h = new UndoHistory();
    for (let i = 0; i < UNDO_LIMIT + 5; i++) h.record({ label: `s${i}`, revert: () => {} });
    expect(h.size).toBe(UNDO_LIMIT);
    expect(h.peek()?.label).toBe(`s${UNDO_LIMIT + 4}`);
  });

  it('a group is ONE step, undone in reverse order, with its own label', async () => {
    const done: string[] = [];
    const h = new UndoHistory();
    await h.group('Dutch edited', 'dutch:d1', async () => {
      h.record({ label: 'Edited: x', key: 'bet:x', revert: () => done.push('edit') });
      await tick();
      h.record({ label: 'Added 2 bets', revert: () => done.push('add') });
      h.record({ label: 'Deleted: y', revert: () => done.push('delete') });
    });
    expect(h.size).toBe(1);
    expect(h.peek()).toMatchObject({ label: 'Dutch edited', key: 'dutch:d1' });
    h.undo();
    await tick();
    expect(done).toEqual(['delete', 'add', 'edit']);
  });

  it('a group of one step keeps that step, relabelled; an empty group records nothing; a failing one keeps what it did', async () => {
    const h = new UndoHistory();
    await h.group('Games edited', undefined, async () => h.record({ label: 'Edited: x', key: 'bet:x', revert: () => {} }));
    expect(h.peek()).toMatchObject({ label: 'Games edited', key: 'bet:x' });
    await h.group('nothing', undefined, async () => {});
    expect(h.size).toBe(1);
    await expect(
      h.group('half', undefined, async () => {
        h.record({ label: 'one', revert: () => {} });
        throw new Error('server said no');
      }),
    ).rejects.toThrow('server said no');
    expect(h.size).toBe(2);
  });

  it('a revert that throws does not break the history', async () => {
    const h = new UndoHistory();
    h.record({ label: 'ok', revert: () => {} });
    h.record({ label: 'bad', revert: () => Promise.reject(new Error('offline')) });
    expect(h.undo()?.label).toBe('bad');
    await tick();
    expect(h.peek()?.label).toBe('ok');
  });

  it('records when a step was added (a toast right after it offers Undo); a step inside a group counts when the group ends', async () => {
    const h = new UndoHistory();
    expect(h.recordedAt).toBe(0);
    await h.group('g', undefined, async () => {
      h.record({ label: 'in', revert: () => {} });
      expect(h.recordedAt).toBe(0);
    });
    expect(h.recordedAt).toBeGreaterThan(0);
  });
});

describe('revertPatch', () => {
  it('gives back the old value of each field the edit changed, and only those', () => {
    const b = bet({ stake: 50, odds: 2.1, betText: 'old', label: '' });
    expect(revertPatch(b, { stake: 80, betText: 'new' })).toEqual({ stake: 50, betText: 'old' });
  });
  it('legs come back without their ids; a missing value comes back as null', () => {
    const b = bet({ legs: [leg({ id: 'L1', selection: 'Flamengo' })], cashout: null });
    const back = revertPatch(b, { legs: [{ ...leg(), selection: 'Palmeiras' }], cashout: 140 });
    expect(back.cashout).toBeNull();
    expect(back.legs).toEqual([expect.objectContaining({ selection: 'Flamengo' })]);
    expect(back.legs![0]).not.toHaveProperty('id');
  });
});

describe('isUndoKey', () => {
  const k = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });
  it('Ctrl+Z and Cmd+Z (either case); not Z alone, Ctrl+Shift+Z or Ctrl+Alt+Z', () => {
    expect(isUndoKey(k('z', { ctrlKey: true }))).toBe(true);
    expect(isUndoKey(k('Z', { metaKey: true }))).toBe(true);
    expect(isUndoKey(k('z'))).toBe(false);
    expect(isUndoKey(k('Z', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isUndoKey(k('z', { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe('detachPlan: take a bet out of its ladder or rollover', () => {
  const L = (o: Partial<Ladder> = {}): Ladder => ({ goalRungs: 5, goalAmount: null, taken: false, ...o });
  const rungs = (over: Partial<Bet>[]) => over.map((o, i) => bet({ id: `r${i + 1}`, rolloverId: 'lad', ladder: L(), createdAt: `2026-11-20T12:00:0${i}Z`, ...o }));

  it('a rung added by mistake becomes a plain bet (its money kept); the ladder is open again on the rung before', () => {
    const chain = rungs([
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 1.5, result: 'pending', money: 'bonus' },
    ]);
    const plan = detachPlan(chain, chain[1]!);
    expect(plan).toEqual([{ id: 'r2', patch: { rolloverId: null, banked: false, ladder: null } }]);
    // the bet's own fields (stake, odds, money, result) are not touched
    expect(Object.keys(plan[0]!.patch)).not.toContain('money');
    const after = chain.map((b) => ({ ...b, ...(plan.find((p) => p.id === b.id)?.patch ?? {}) }));
    expect(chainSummary(after.filter((b) => b.rolloverId === 'lad'))).toMatchObject({ outcome: 'open', banked: 200 });
  });

  it('taking out the rung that carried "taken" moves it to the rung now last', () => {
    const chain = rungs([
      { stake: 100, odds: 2, result: 'won' },
      { stake: 200, odds: 2, result: 'won', ladder: L({ taken: true }) },
    ]);
    expect(detachPlan(chain, chain[1]!)).toEqual([
      { id: 'r2', patch: { rolloverId: null, banked: false, ladder: null } },
      { id: 'r1', patch: { ladder: L({ taken: true }) } },
    ]);
  });

  it('a rollover shot leg comes out the same way; a bet in no chain gives nothing', () => {
    const shot = [bet({ id: 's1', rolloverId: 'ro', banked: true, result: 'won', createdAt: '2026-11-20T12:00:00Z' }), bet({ id: 's2', rolloverId: 'ro', createdAt: '2026-11-20T12:00:01Z' })];
    expect(detachPlan(shot, shot[1]!)).toEqual([{ id: 's2', patch: { rolloverId: null, banked: false, ladder: null } }]);
    expect(detachPlan([bet()], bet())).toEqual([]);
  });
});
