// BT-12: editing a logged dutch updates its bets in place.
import { describe, expect, it } from 'vitest';
import { editDutchDraft, planDutchEdit } from '@/lib/dutch';
import { bet, dutchBets, leg } from './helpers';

const TODAY = '2026-11-22';

describe('editDutchDraft', () => {
  it('prefills the saved dutch: selections, odds, stakes, books, games, markets, dates, and ties rows to bets', () => {
    const bets = dutchBets('d1', [
      { odds: 2.5, stake: 40, book: 'Betano', placedDate: '2026-11-20', gameDate: '2026-11-21', legs: [leg({ selection: 'Home', game: 'A x B', market: '1X2', sport: 'Football' })] },
      { odds: 3.2, stake: 31.25, book: 'Bet365', placedDate: '2026-11-20', gameDate: '2026-11-21', legs: [leg({ selection: 'Draw', game: 'A x B', market: '1X2', sport: 'Football' })] },
    ]);
    const d = editDutchDraft(bets);
    expect(d.rows.map((r) => [r.selection, r.odds, r.stake, r.book, r.betId])).toEqual([
      ['Home', 2.5, 40, 'Betano', bets[0]!.id],
      ['Draw', 3.2, 31.25, 'Bet365', bets[1]!.id],
    ]);
    expect(d).toMatchObject({ sport: 'Football', games: ['A x B'], markets: ['1X2'], placedDate: '20/11/2026', gameDate: '21/11/2026' });
  });
});

describe('planDutchEdit', () => {
  const bets = () =>
    dutchBets('d1', [
      { odds: 2, stake: 50, result: 'won', postAnalysis: 'nice', legs: [leg({ selection: 'Home', game: 'A x B', market: '1X2' })] },
      { odds: 4, stake: 25, result: 'lost', legs: [leg({ selection: 'Draw', game: 'A x B', market: '1X2' })] },
      { odds: 4, stake: 25, result: 'lost', legs: [leg({ selection: 'Away', game: 'A x B', market: '1X2' })] },
    ]);

  it('changed odds and stake update the bet in place, result and analysis kept, same dutch id', () => {
    const b = bets();
    const d = editDutchDraft(b);
    d.rows[0] = { ...d.rows[0]!, odds: 2.1, stake: 60 };
    const v = planDutchEdit(d, b, 'Bet365', 'd1', TODAY);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.plan.creates).toEqual([]);
    expect(v.plan.deletes).toEqual([]);
    expect(v.plan.updates).toHaveLength(3);
    expect(v.plan.updates[0]).toMatchObject({ id: b[0]!.id, patch: { odds: 2.1, stake: 60, result: 'won', postAnalysis: 'nice', dutchId: 'd1' } });
    expect(v.plan.updates[0]!.patch.legs[0]).toMatchObject({ selection: 'Home', odds: 2.1, result: 'won', game: 'A x B' });
    expect(v.plan.updates[1]).toMatchObject({ id: b[1]!.id, patch: { result: 'lost' } });
  });

  it('an added split is a new pending bet in the dutch; a removed split deletes its bet', () => {
    const b = bets();
    const d = editDutchDraft(b);
    d.rows.splice(2, 1);
    d.rows.push({ selection: 'Over 2.5', legs: [{ selection: 'Over 2.5', odds: null }], odds: 1.9, stake: 10, book: null });
    const v = planDutchEdit(d, b, 'Bet365', 'd1', TODAY);
    expect(v.ok && v.plan.deletes).toEqual([b[2]!.id]);
    expect(v.ok && v.plan.creates).toHaveLength(1);
    expect(v.ok && v.plan.creates[0]).toMatchObject({ dutchId: 'd1', result: 'pending', odds: 1.9, stake: 10, legs: [{ selection: 'Over 2.5', game: 'A x B', market: '1X2' }] });
    expect(v.ok && v.plan.updates.map((u) => u.id)).toEqual([b[0]!.id, b[1]!.id]);
  });

  it('combination splits keep the results of legs still there; a renamed leg is matched by position', () => {
    const shared = () => leg({ selection: 'Z win', odds: 1.5, result: 'won' });
    const b = [
      bet({ dutchId: 'd2', type: 'combination', odds: 3, stake: 20, result: 'won', betText: 'X + Z win', legs: [leg({ selection: 'X', odds: 2, result: 'won' }), shared()], createdAt: '2026-11-20T12:00:00.001Z' }),
      bet({ dutchId: 'd2', type: 'combination', odds: 4.5, stake: 13.33, result: 'lost', betText: 'Y + Z win', legs: [leg({ selection: 'Y', odds: 3, result: 'lost' }), shared()], createdAt: '2026-11-20T12:00:00.002Z' }),
    ];
    const d = editDutchDraft(b);
    expect(d.shared.map((l) => l.selection)).toEqual(['Z win']);
    d.rows[1]!.legs[0] = { ...d.rows[1]!.legs[0]!, selection: 'Y2' };
    const v = planDutchEdit(d, b, 'Bet365', 'd2', TODAY);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.plan.updates[0]!.patch.legs.map((l) => [l.selection, l.result])).toEqual([['X', 'won'], ['Z win', 'won']]);
    expect(v.plan.updates[1]!.patch.legs.map((l) => [l.selection, l.result])).toEqual([['Y2', 'lost'], ['Z win', 'won']]);
    expect(v.plan.updates[1]!.patch).toMatchObject({ result: 'lost', betText: 'Y2 + Z win' });
  });

  it('refuses fewer than two splits and unreadable odds or stake', () => {
    const b = bets();
    const one = editDutchDraft(b);
    one.rows = one.rows.slice(0, 1);
    expect(planDutchEdit(one, b, '', 'd1', TODAY)).toMatchObject({ ok: false, error: 'A dutch needs at least two selections' });
    const bad = editDutchDraft(b);
    bad.rows[0] = { ...bad.rows[0]!, odds: NaN };
    expect(planDutchEdit(bad, b, '', 'd1', TODAY).ok).toBe(false);
    const noStake = editDutchDraft(b);
    noStake.rows[1] = { ...noStake.rows[1]!, stake: NaN };
    expect(planDutchEdit(noStake, b, '', 'd1', TODAY).ok).toBe(false);
  });
});
