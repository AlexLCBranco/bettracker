// BT-25: one game editor for every row type, and a legless "combination" detected as the solo it is.
import { describe, expect, it } from 'vitest';
import { applyGames, asSolo, gameFields, isReallySolo } from '@/lib/games';
import { validateBet } from '@/lib/validate';
import type { Bet, Leg } from '@/lib/types';

let n = 0;
const leg = (over: Partial<Leg> = {}): Leg => ({ id: `l${++n}`, sport: '', game: '', market: '', selection: 'x', odds: null, result: 'pending', actual: '', ...over });
const bet = (over: Partial<Bet> = {}): Bet => ({
  id: `b${++n}`,
  noBrainer: false,
  book: '',
  placedDate: '2026-11-23',
  gameDate: '2026-11-23',
  type: 'solo',
  situation: 'pregame',
  stake: 10,
  odds: 2,
  result: 'pending',
  cashout: null,
  preAnalysis: '',
  postAnalysis: '',
  betText: '',
  legs: [leg()],
  money: 'real',
  label: '',
  dutchId: null,
  rolloverId: null,
  banked: false,
  wouldHave: null,
  unitSize: null,
  ladder: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});
const raw = (over: Record<string, unknown>) => ({ stake: 10, odds: 2, result: 'pending', placedDate: '2026-11-23', legs: [], ...over });

describe('a "combination" with no legs is a solo (owner: "Jokic 6 4Q pts")', () => {
  it('is detected unless its text joins 2+ selections with " + "', () => {
    expect(isReallySolo('combination', [], 'Jokic 6 4Q pts')).toBe(true);
    expect(isReallySolo('combination', [], '')).toBe(true);
    expect(isReallySolo('combination', [], 'lakers ml + celtics -5')).toBe(false);
    expect(isReallySolo('combination', [{}, {}], 'x')).toBe(false);
    expect(isReallySolo('solo', [], 'x')).toBe(false);
  });

  it('is saved as a solo', () => {
    expect(validateBet(raw({ type: 'combination', betText: 'Jokic 6 4Q pts', situation: 'live' }))).toMatchObject({
      ok: true,
      value: { type: 'solo', legs: [{ game: '', selection: '', odds: 2, result: 'pending' }] },
    });
    expect(validateBet(raw({ type: 'combination', betText: 'a + b' }))).toMatchObject({ ok: true, value: { type: 'combination', legs: [] } });
  });

  it('an old one reads as a solo with one empty leg', () => {
    const b = asSolo(bet({ type: 'combination', legs: [], betText: 'Jokic 6 4Q pts', odds: 3, result: 'won' }));
    expect(b).toMatchObject({ type: 'solo', legs: [{ game: '', odds: 3, result: 'won' }] });
    const kept = bet({ type: 'combination', legs: [], betText: 'a + b' });
    expect(asSolo(kept)).toBe(kept);
  });
});

describe('game editor boxes', () => {
  it('no game: one box, for every leg', () => {
    const b = bet();
    const f = gameFields([b])!;
    expect(f).toEqual([{ covers: ['', ''], label: 'Game', value: '', legs: 1 }]);
    expect(applyGames([b], f, ['Nuggets @ Lakers'])).toEqual([{ id: b.id, patch: { legs: [expect.objectContaining({ game: 'Nuggets @ Lakers' })] } }]);
  });

  it('one game: one box, applied to the legs with that game and the legs with none', () => {
    const b = bet({ type: 'combination', legs: [leg({ game: 'Celtics vs Warriors' }), leg(), leg({ game: 'Celtics vs Warriors' })] });
    const f = gameFields([b])!;
    expect(f).toHaveLength(1);
    expect(f[0]!.value).toBe('Celtics @ Warriors');
    const [p] = applyGames([b], f, ['Lakers @ Nets']);
    expect(p!.patch.legs.map((l) => l.game)).toEqual(['Lakers @ Nets', 'Lakers @ Nets', 'Lakers @ Nets']);
    expect(p!.patch.legs[0]).not.toHaveProperty('id');
  });

  it('several games: one box per game plus one for the legs with no game; unchanged boxes change nothing', () => {
    const a = bet({ dutchId: 'd', legs: [leg({ game: 'A vs B' })] });
    const b = bet({ dutchId: 'd', type: 'combination', legs: [leg({ game: 'C vs D' }), leg()] });
    const f = gameFields([a, b])!;
    expect(f.map((x) => [x.label, x.value, x.legs])).toEqual([
      ['Game 1', 'A @ B', 1],
      ['Game 2', 'C @ D', 1],
      ['Legs with no game', '', 1],
    ]);
    expect(applyGames([a, b], f, ['A @ B', 'C @ D', ''])).toEqual([]);
    const out = applyGames([a, b], f, ['A @ B', 'C @ D', 'E @ F']);
    expect(out.map((o) => [o.id, o.patch.legs.map((l) => l.game)])).toEqual([[b.id, ['C vs D', 'E @ F']]]);
  });

  it('a combination whose legs were not entered has no box (its legs go in the full form)', () => {
    expect(gameFields([bet({ type: 'combination', legs: [], betText: 'a + b' })])).toBeNull();
  });
});
