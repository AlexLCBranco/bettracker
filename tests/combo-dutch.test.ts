// BT-5: dutch splits that are combinations (own legs + shared legs), and settling them.
import { describe, expect, it } from 'vitest';
import { betLabel, draftToBets, duplicateDutchDraft, newDutchDraft, sharedLegNames } from '@/lib/dutch';
import { settleDutchAt, settleQueue, settleSharedLostAt, sharedLegOf, undoLast, type QueueItem, type SettleState } from '@/lib/settle';
import { splitCalc, type LegText, type SplitText } from '@/lib/splits';
import type { Bet } from '@/lib/types';
import { bet, leg } from './helpers';

const row = (over: Partial<SplitText> = {}): SplitText => ({ id: 1, name: '', odds: '', format: 'auto', ...over });
const shared = (over: Partial<LegText> = {}): LegText => ({ id: 1, name: 'Celtics W', odds: '1,3', format: 'auto', ...over });

describe('splitCalc: total odds per split', () => {
  it('a split with no legs and no shared legs works as before (solo, its own odds)', () => {
    const c = splitCalc(row({ name: 'Home', odds: '+200' }), []);
    expect(c).toMatchObject({ combo: false, used: true, estimated: false, odds: 3 });
    expect(splitCalc(row({ name: 'Home', odds: '2' }), undefined).odds).toBe(2);
    expect(splitCalc(row({ name: 'Home' }), []).used).toBe(false);
  });

  it('a shared leg makes every split a combination: the total is prefilled as the product, mixed formats', () => {
    // owner's example: McCain 25 pts +220 (3.20) and Celtics W 1,3
    const c = splitCalc(row({ name: 'McCain 25 pts', odds: '+220' }), [shared()]);
    expect(c.combo).toBe(true);
    expect(c.estimated).toBe(true);
    expect(c.odds).toBeCloseTo(4.16, 10);
    expect(c.legs).toEqual([
      { name: 'McCain 25 pts', odds: 3.2 },
      { name: 'Celtics W', odds: 1.3 },
    ]);
    // fractional + Hong Kong + American leg
    const mixed = splitCalc(row({ odds: '5/2', legs: [{ id: 2, name: 'B', odds: '0.5', format: 'hongkong' }] }), [shared({ odds: '-200' })]);
    expect(mixed.odds).toBeCloseTo(3.5 * 1.5 * 1.5, 10);
  });

  it("typing over the total (the book's real price) wins and drops 'estimated'", () => {
    const c = splitCalc(row({ name: 'McCain', odds: '+220', total: '4,00' }), [shared()]);
    expect(c).toMatchObject({ estimated: false, odds: 4 });
    expect(c.estimate).toBeCloseTo(4.16, 10);
    // any format in the total box
    expect(splitCalc(row({ odds: '+220', total: '+300' }), [shared()]).odds).toBe(4);
    // blank total = back to the estimate
    expect(splitCalc(row({ odds: '+220', total: '  ' }), [shared()]).estimated).toBe(true);
    // unreadable total = invalid
    expect(splitCalc(row({ odds: '+220', total: 'abc' }), [shared()]).odds).toBeNaN();
  });

  it('a leg with no odds needs a typed total; an unreadable leg is invalid either way', () => {
    const noOdds = row({ name: 'A', odds: '2', legs: [{ id: 2, name: 'B', odds: '' }] });
    expect(splitCalc(noOdds, []).odds).toBeNaN();
    expect(splitCalc({ ...noOdds, total: '5' }, []).odds).toBe(5);
    expect(splitCalc({ ...noOdds, total: '5' }, []).legs[1]).toEqual({ name: 'B', odds: null });
    expect(splitCalc(row({ odds: '2', total: '5', legs: [{ id: 2, name: 'B', odds: 'x' }] }), []).odds).toBeNaN();
  });

  it('blank extra legs and blank shared legs are ignored', () => {
    const c = splitCalc(row({ name: 'A', odds: '2', legs: [{ id: 2, name: '', odds: '' }] }), [shared({ name: '', odds: '' })]);
    expect(c).toMatchObject({ combo: false, odds: 2 });
  });
});

describe('draftToBets: combination splits', () => {
  const draft = () =>
    newDutchDraft(
      [
        {
          selection: 'McCain 25 pts + Celtics W',
          odds: 4,
          stake: 50,
          legs: [
            { selection: 'McCain 25 pts', odds: 3.2 },
            { selection: 'Celtics W', odds: 1.3 },
          ],
        },
        { selection: 'Mitchell 30 pts', odds: 3.2, stake: 50, legs: [{ selection: 'Mitchell 30 pts', odds: 3.2 }] },
      ],
      { sport: 'Basketball', situation: 'pregame' },
      '2026-11-22',
    );
  const legNoPicks = (l: { selection: string; odds: number | null }) => ({ selection: l.selection, odds: l.odds });

  it('saves a 2+ leg split as a combination at its total odds, own legs then shared, bet text joined; one leg stays solo', () => {
    const d = { ...draft(), games: ['Celtics vs Cavs'], markets: ['Props'] };
    const r = draftToBets(d, 'Bet365', 'dx', '2026-11-22');
    if (!r.ok) throw new Error(r.error);
    const [combo, solo] = r.value;
    expect(combo).toMatchObject({ type: 'combination', odds: 4, stake: 50, betText: 'McCain 25 pts + Celtics W', dutchId: 'dx', result: 'pending' });
    expect(combo!.legs).toEqual([
      { sport: 'Basketball', game: 'Celtics vs Cavs', market: 'Props', selection: 'McCain 25 pts', odds: 3.2, result: 'pending', actual: '' },
      { sport: 'Basketball', game: 'Celtics vs Cavs', market: 'Props', selection: 'Celtics W', odds: 1.3, result: 'pending', actual: '' },
    ]);
    expect(solo).toMatchObject({ type: 'solo', odds: 3.2, betText: '', dutchId: 'dx' });
    expect(solo!.legs).toHaveLength(1);
    expect(solo!.legs[0]!.selection).toBe('Mitchell 30 pts');
  });

  it('Duplicate on a dutch of combinations keeps the legs', () => {
    const r = draftToBets(draft(), 'Bet365', 'dx', '2026-11-22');
    if (!r.ok) throw new Error(r.error);
    const bets = r.value.map((b, i) => ({ ...b, id: `b${i}`, createdAt: `2026-11-22T00:00:0${i}Z`, updatedAt: '', legs: b.legs.map((l, j) => ({ ...l, id: `l${i}${j}` })) }) as Bet);
    const dup = duplicateDutchDraft(bets, '2026-11-23');
    expect(dup.rows[0]).toMatchObject({ selection: 'McCain 25 pts + Celtics W', odds: 4 });
    expect(dup.rows[0]!.legs.map(legNoPicks)).toEqual([
      { selection: 'McCain 25 pts', odds: 3.2 },
      { selection: 'Celtics W', odds: 1.3 },
    ]);
    expect(dup.rows[1]!.legs.map(legNoPicks)).toEqual([{ selection: 'Mitchell 30 pts', odds: 3.2 }]);
    expect(dup.shared).toEqual([]);
    expect(betLabel(bets[0]!)).toBe('McCain 25 pts + Celtics W');
    expect(betLabel(bets[1]!)).toBe('Mitchell 30 pts');
  });
});

// ---- Settle ----

const TODAY = '2026-11-22';
const noIds = (b: Bet) => b.legs.map((l) => ({ sport: l.sport, game: l.game, market: l.market, selection: l.selection, odds: l.odds, result: l.result, actual: l.actual }));
const comboBet = (i: number, own: string, over: Partial<Bet> = {}) =>
  bet({
    dutchId: 'dc',
    type: 'combination',
    betText: `${own} + Celtics W`,
    odds: 4,
    stake: 50,
    createdAt: `2026-11-20T12:00:00.00${i}Z`,
    legs: [leg({ selection: own, odds: 3.2 }), leg({ selection: 'celtics w', odds: 1.3 })],
    ...over,
  });

function setup(): { queue: QueueItem[]; state: SettleState; bets: Bet[] } {
  const bets = [comboBet(0, 'McCain 25 pts'), comboBet(1, 'Mitchell 30 pts'), comboBet(2, 'Garland 20 pts')];
  // the shared leg was typed with a different case on the first bet
  bets[0]!.legs[1]!.selection = 'Celtics W';
  return { bets, queue: settleQueue(bets, TODAY), state: { cursor: 0, undo: [] } };
}

describe('settle: dutch with more than one winner', () => {
  it('toggled splits win (their legs marked won), the rest lose; BT-27: a lost split legs are filled in (shared leg won elsewhere, so its own leg lost); undo restores results and legs', () => {
    const { queue, state, bets } = setup();
    const r = settleDutchAt(queue, state, [0, 1])!;
    expect(r.changes.map((c) => c.result)).toEqual(['won', 'won', 'lost']);
    expect(r.changes[0]!.legs!.map((l) => l.result)).toEqual(['won', 'won']);
    expect(r.changes[1]!.legs!.map((l) => l.result)).toEqual(['won', 'won']);
    expect(r.changes[2]!.legs!.map((l) => l.result)).toEqual(['lost', 'won']);
    const u = undoLast(r.state)!;
    expect(u.changes).toEqual([
      { id: bets[0]!.id, result: 'pending', cashout: null, legs: noIds(bets[0]!) },
      { id: bets[1]!.id, result: 'pending', cashout: null, legs: noIds(bets[1]!) },
      { id: bets[2]!.id, result: 'pending', cashout: null, legs: noIds(bets[2]!) },
    ]);
    expect(u.state).toEqual({ cursor: 0, undo: [] });
  });

  it('a single number still works, no winners = all lost, an index out of range is refused', () => {
    const { queue, state } = setup();
    expect(settleDutchAt(queue, state, 2)!.changes.map((c) => c.result)).toEqual(['lost', 'lost', 'won']);
    expect(settleDutchAt(queue, state, []) === null).toBe(false);
    expect(settleDutchAt(queue, state, [])!.changes.map((c) => c.result)).toEqual(['lost', 'lost', 'lost']);
    expect(settleDutchAt(queue, state, [0, 3])).toBeNull();
  });

  it('solo dutch bets that win keep their single leg as before (no leg change sent)', () => {
    const bets = [bet({ dutchId: 'ds', betText: '' }), bet({ dutchId: 'ds', betText: '' })];
    const r = settleDutchAt(settleQueue(bets, TODAY), { cursor: 0, undo: [] }, [0, 1])!;
    expect(r.changes.every((c) => c.result === 'won' && c.legs === undefined)).toBe(true);
  });
});

describe('settle: S = shared leg lost', () => {
  it('finds the one shared leg (ignoring case), loses every split and marks only that leg lost; undo restores', () => {
    const { queue, state, bets } = setup();
    expect(sharedLegNames(bets)).toEqual(['Celtics W']);
    expect(sharedLegOf(queue[0])).toEqual({ name: 'Celtics W' });
    const r = settleSharedLostAt(queue, state)!;
    expect(r.changes.map((c) => c.result)).toEqual(['lost', 'lost', 'lost']);
    expect(r.changes.map((c) => c.legs!.map((l) => l.result))).toEqual([
      ['pending', 'lost'],
      ['pending', 'lost'],
      ['pending', 'lost'],
    ]);
    const u = undoLast(r.state)!;
    expect(u.changes.every((c) => c.result === 'pending' && c.legs!.every((l) => l.result === 'pending'))).toBe(true);
  });

  it('refused without a shared leg, with several, or on a plain bet', () => {
    const solo = [bet({ dutchId: 'x', betText: '' }), bet({ dutchId: 'x', betText: '' })];
    const q1 = settleQueue(solo, TODAY);
    expect(sharedLegOf(q1[0])).toEqual({ error: 'This dutch has no shared leg' });
    expect(settleSharedLostAt(q1, { cursor: 0, undo: [] })).toBeNull();

    const two = [0, 1].map((i) =>
      comboBet(i, `P${i}`, { dutchId: 'two', legs: [leg({ selection: `P${i}` }), leg({ selection: 'Celtics W' }), leg({ selection: 'Over 200' })] }),
    );
    const r = sharedLegOf(settleQueue(two, TODAY)[0]);
    expect('error' in r && r.error).toMatch(/2 shared legs/);

    expect(sharedLegOf(settleQueue([bet()], TODAY)[0])).toEqual({ error: 'S is for a dutch' });
  });
});
