// BT-8: game(s) and market(s) as chips, picked per leg. BT-9: the Betting Tool clears only after a successful save.
import { describe, expect, it, vi } from 'vitest';
import { draftToBets, duplicateDutchDraft, logDraft, newDutchDraft, resolvedPicks, type DutchDraft } from '@/lib/dutch';
import type { Bet, BetInput } from '@/lib/types';

const TODAY = '2026-11-22';
const ok = (d: DutchDraft) => {
  const r = draftToBets(d, 'Bet365', 'dx', TODAY);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const gm = (b: BetInput) => b.legs.map((l) => [l.selection, l.game, l.market]);

/** Owner's example: McCain 25 pts + Celtics W / Mitchell 30 pts + Celtics W, Celtics W shared. */
const owner = (): DutchDraft =>
  newDutchDraft(
    [
      { selection: 'McCain 25 pts + Celtics W', odds: 4, stake: 50, legs: [{ selection: 'McCain 25 pts', odds: 3.2 }] },
      { selection: 'Mitchell 30 pts + Celtics W', odds: 4, stake: 50, legs: [{ selection: 'Mitchell 30 pts', odds: 3.2 }] },
    ],
    { sport: 'Basketball', situation: 'pregame' },
    TODAY,
    [{ selection: 'Celtics W', odds: 1.3 }],
  );

const solos = (): DutchDraft =>
  newDutchDraft(
    [
      { selection: 'Home', odds: 2.5, stake: 40 },
      { selection: 'Draw', odds: 3.2, stake: 31.25 },
      { selection: 'Away', odds: 4, stake: 25 },
    ],
    { sport: 'Football', situation: 'pregame' },
    TODAY,
  );

describe('draftToBets: game and market per leg', () => {
  it('one game and one market: every leg (own and shared) gets them', () => {
    const bets = ok({ ...owner(), games: ['CLE vs BOS'], markets: ['pts'] });
    expect(bets.map(gm)).toEqual([
      [
        ['McCain 25 pts', 'CLE vs BOS', 'pts'],
        ['Celtics W', 'CLE vs BOS', 'pts'],
      ],
      [
        ['Mitchell 30 pts', 'CLE vs BOS', 'pts'],
        ['Celtics W', 'CLE vs BOS', 'pts'],
      ],
    ]);
  });

  it('no chips: legs are saved with no game or market', () => {
    expect(ok(solos()).map(gm)).toEqual([[['Home', '', '']], [['Draw', '', '']], [['Away', '', '']]]);
  });

  it('two of each: every leg gets its own; the shared leg is set once and copied to every bet', () => {
    const d = { ...owner(), games: ['CLE vs BOS', 'NYK vs MIA'], markets: ['ML', 'pts'] };
    d.rows[0]!.legs[0] = { ...d.rows[0]!.legs[0]!, game: 'CLE vs BOS', market: 'pts' };
    d.rows[1]!.legs[0] = { ...d.rows[1]!.legs[0]!, game: 'NYK vs MIA', market: 'pts' };
    d.shared[0] = { ...d.shared[0]!, game: 'CLE vs BOS', market: 'ML' };
    const bets = ok(d);
    expect(bets.map(gm)).toEqual([
      [
        ['McCain 25 pts', 'CLE vs BOS', 'pts'],
        ['Celtics W', 'CLE vs BOS', 'ML'],
      ],
      [
        ['Mitchell 30 pts', 'NYK vs MIA', 'pts'],
        ['Celtics W', 'CLE vs BOS', 'ML'],
      ],
    ]);
    expect(bets.every((b) => b.type === 'combination')).toBe(true);
  });

  it('a solo split uses its leg’s game and market', () => {
    const d = { ...solos(), games: ['A vs B', 'C vs D'], markets: ['1X2'] };
    d.rows[0]!.legs[0]!.game = 'A vs B';
    d.rows[2]!.legs[0]!.game = 'C vs D';
    expect(ok(d).map(gm)).toEqual([[['Home', 'A vs B', '1X2']], [['Draw', 'A vs B', '1X2']], [['Away', 'C vs D', '1X2']]]);
  });

  it('several chips and nothing picked on a leg: invalid', () => {
    expect(draftToBets({ ...owner(), games: ['G1', 'G2'], markets: ['pts'] }, '', 'x', TODAY)).toEqual({ ok: false, error: 'Pick the game for each leg' });
    const d = { ...owner(), games: ['G1'], markets: ['ML', 'pts'] };
    d.rows[0]!.legs[0]!.market = 'pts'; // fills Mitchell below, but the shared leg has nothing
    expect(draftToBets(d, '', 'x', TODAY)).toEqual({ ok: false, error: 'Pick the market for each leg' });
    d.shared[0]!.market = 'ML';
    expect(draftToBets(d, '', 'x', TODAY).ok).toBe(true);
  });

  it('quick fill: a pick is copied to the legs below that have none, until one is picked', () => {
    const d = { ...solos(), games: ['G1', 'G2'] };
    expect(resolvedPicks(d, 'game').rows.flat()).toEqual([
      { value: null, inherited: true },
      { value: null, inherited: true },
      { value: null, inherited: true },
    ]);
    d.rows[0]!.legs[0]!.game = 'G2';
    d.rows[2]!.legs[0]!.game = 'G1';
    expect(resolvedPicks(d, 'game').rows.flat()).toEqual([
      { value: 'G2', inherited: false },
      { value: 'G2', inherited: true },
      { value: 'G1', inherited: false },
    ]);
  });

  it('Duplicate: shared legs split out, each leg keeps its game and market, chips are the distinct values', () => {
    const d = { ...owner(), games: ['CLE vs BOS', 'NYK vs MIA'], markets: ['ML', 'pts'] };
    d.rows[0]!.legs[0] = { ...d.rows[0]!.legs[0]!, game: 'CLE vs BOS', market: 'pts' };
    d.rows[1]!.legs[0] = { ...d.rows[1]!.legs[0]!, game: 'NYK vs MIA', market: 'pts' };
    d.shared[0] = { ...d.shared[0]!, game: 'CLE vs BOS', market: 'ML' };
    const bets = ok(d).map((b, i) => ({ ...b, id: `b${i}`, createdAt: `2026-11-22T00:00:0${i}Z`, updatedAt: '', legs: b.legs.map((l, j) => ({ ...l, id: `l${i}${j}` })) }) as Bet);
    const dup = duplicateDutchDraft(bets, '2026-11-23');
    expect(dup.games).toEqual(['CLE vs BOS', 'NYK vs MIA']);
    expect(dup.markets).toEqual(['pts', 'ML']);
    expect(dup.shared).toEqual([{ selection: 'Celtics W', odds: 1.3, game: 'CLE vs BOS', market: 'ML' }]);
    expect(dup.rows.map((r) => r.legs)).toEqual([
      [{ selection: 'McCain 25 pts', odds: 3.2, game: 'CLE vs BOS', market: 'pts' }],
      [{ selection: 'Mitchell 30 pts', odds: 3.2, game: 'NYK vs MIA', market: 'pts' }],
    ]);
    // logging the duplicate gives the same legs again
    expect(ok({ ...dup, placedDate: '22/11/2026', gameDate: '22/11/2026' }).map(gm)).toEqual(ok(d).map(gm));
  });
});

describe('logDraft (BT-9: the tool clears only after a successful save)', () => {
  const made = [{ id: 'b1' }, { id: 'b2' }] as Bet[];

  it('saved: onSaved runs with the new bets', async () => {
    const onSaved = vi.fn();
    const create = vi.fn(async () => made);
    expect(await logDraft(solos(), 'Bet365', 'dx', create, onSaved)).toEqual({ ok: true, bets: made });
    expect(create).toHaveBeenCalledOnce();
    expect(onSaved).toHaveBeenCalledWith(made);
  });

  it('save failed: onSaved never runs, the error is returned', async () => {
    const onSaved = vi.fn();
    const r = await logDraft(solos(), 'Bet365', 'dx', () => Promise.reject(new Error('Request failed (500)')), onSaved);
    expect(r).toEqual({ ok: false, error: 'Request failed (500)' });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('draft refused: nothing is sent, onSaved never runs', async () => {
    const onSaved = vi.fn();
    const create = vi.fn(async () => made);
    const r = await logDraft({ ...solos(), games: ['G1', 'G2'] }, 'Bet365', 'dx', create, onSaved);
    expect(r).toEqual({ ok: false, error: 'Pick the game for each leg' });
    expect(create).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
