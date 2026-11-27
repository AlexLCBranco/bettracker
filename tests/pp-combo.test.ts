// Owner, 2026-11-27: a PP shot can be a combo: one pool leg made of several selections at the book's combo price.
// It goes on PPs as one leg, settles as one, and the same-game rule counts every part's game.
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS, partsOdds, validateBatch, type PPLeg, type PPLegPart } from '@/lib/pp';
import { gameKeys, generate, sameGame, type PPScheme } from '@/lib/ppBuilder';

const leg = (id: string, tier: string, odds: number, game: string, parts: PPLegPart[] = []): PPLeg => ({ id, sport: '', game, market: '', selection: id, odds, tier, result: 'pending', actual: '', note: '', parts });
const part = (selection: string, odds: number, game: string): PPLegPart => ({ game, market: '', selection, odds });
const scheme = (over: Partial<PPScheme> = {}): PPScheme => ({ count: 12, target: 20, bandMin: 8, bandMax: 60, majorsPerPP: [1], shotCount: 3, shotAuto: false, avoidPairs: false, seed: 1, ...over });

describe('combo legs', () => {
  it('the estimate is the parts multiplied, to the cent', () => {
    expect(partsOdds([{ odds: 1.5 }, { odds: 2.2 }])).toBe(3.3);
    expect(partsOdds([{ odds: 1.33 }, { odds: 1.77 }, { odds: 2.1 }])).toBe(4.94);
  });
  it('validation keeps the parts; a part needs odds above 1; one part is not a combo', () => {
    const raw = (parts: unknown[]) => ({ placedDate: '2026-11-27', stake: 0.5, legs: [{ id: 'c', selection: 'A + B', odds: 3.5, tier: 'shot', parts }], tickets: [] });
    const v = validateBatch(raw([{ game: 'G1', selection: 'A', odds: 1.5 }, { game: 'G2', market: 'ML', selection: 'B', odds: 2.2 }]));
    expect(v.ok && v.value.legs[0]!.parts).toEqual([part('A', 1.5, 'G1'), { game: 'G2', market: 'ML', selection: 'B', odds: 2.2 }]);
    expect(v.ok && v.value.legs[0]!.odds).toBe(3.5); // the book's price, never forced to the parts multiplied
    expect(validateBatch(raw([{ selection: 'A', odds: 1 }, { selection: 'B', odds: 2 }]))).toEqual({ ok: false, error: 'Leg 1, part 1: odds must be above 1' });
    expect(validateBatch(raw([{ selection: 'A', odds: 1.5 }]))).toEqual({ ok: false, error: 'Leg 1: a combo needs two parts or more' });
    const single = validateBatch({ placedDate: '2026-11-27', stake: 0.5, legs: [{ id: 's', odds: 2, tier: 'shot' }], tickets: [] });
    expect(single.ok && single.value.legs[0]!.parts).toEqual([]);
  });
  it('a combo is from every game of its parts', () => {
    const c = leg('c', 'shot', 3.3, 'G1 / G2', [part('A', 1.5, 'G1'), part('B', 2.2, 'g2 ')]);
    expect(gameKeys(c)).toEqual(['g:g1', 'g:g2']);
    expect(sameGame(c, leg('x', 'major', 2, 'G2'))).toBe(true);
    expect(sameGame(leg('x', 'major', 2, 'G2'), c)).toBe(true);
    expect(sameGame(c, leg('y', 'major', 2, 'G3'))).toBe(false);
    // parts with no game typed are games of their own
    const blank = leg('b', 'shot', 3, '', [part('A', 1.5, ''), part('B', 2, '')]);
    expect(gameKeys(blank)).toHaveLength(2);
    expect(sameGame(blank, leg('z', 'major', 2, ''))).toBe(false);
  });
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: the generator never puts a combo with a leg from one of its parts’ games`, () => {
      const legs = [
        leg('mm', 'mm', 1.5, 'MMgame'),
        leg('m1', 'major', 2, 'G1'),
        leg('m2', 'major', 2.1, 'G2'),
        leg('m3', 'major', 2.2, 'G3'),
        leg('c1', 'shot', 3.3, '', [part('A', 1.5, 'G1'), part('B', 2.2, 'G9')]),
        leg('c2', 'shot', 4, '', [part('C', 2, 'MMgame'), part('D', 2, 'G8')]),
        leg('s1', 'shot', 3, 'G7'),
        leg('s2', 'shot', 3.5, 'G6'),
      ];
      const g = generate({ legs, tiers: DEFAULT_TIERS }, scheme({ seed }));
      expect(g.tickets.length).toBeGreaterThan(0);
      for (const t of g.tickets) {
        expect(t.legIds).not.toContain('c2'); // shares the Major-major's game: never on any PP
        if (t.legIds.includes('c1')) expect(t.legIds).not.toContain('m1');
      }
      expect(g.tickets.some((t) => t.legIds.includes('c1'))).toBe(true);
    });
  }
});
