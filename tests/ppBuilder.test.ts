// BT-31: the PP builder: roles, the scheme, the shot planner (even split, minimum), and the generator's hard rules,
// with fixed seeds. Owner, 2026-11-27: one Major per PP; every PP shot on EXACTLY the same number of PPs; the target is
// flexible a little, the minimum is not; two legs from the same game never on one PP.
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS, type PPLeg, type PPTier } from '@/lib/pp';
import { appearances, repeatText, shotPairRepeats, effectiveScheme, gameKey, generate, majorLevels, mmFor, mmGroups, placeLine, preview, propose, rng, roles, shotPlan, split, startingScheme, suggestedShots, typicalShotOdds, type PPScheme } from '@/lib/ppBuilder';

const leg = (id: string, tier: string, odds: number, game = `${id} game`): PPLeg => ({ id, sport: '', game, market: '', selection: id, odds, tier, result: 'pending', actual: '', note: '', parts: [] });
const scheme = (over: Partial<PPScheme> = {}): PPScheme => ({ count: 20, target: 20, bandMin: 8, bandMax: 30, majorsPerPP: [1], shotsPerPP: 1, shotsPerPPAuto: false, plannedShots: null, shotCount: 2, avoidPairs: false, seed: 7, ...over });

// the owner's shape: one major-major around 2, majors, PP shots (10 shots × 2 PPs each = 20 PPs × 1 shot)
const pool = [
  leg('mm', 'mm', 2),
  ...['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id, i) => leg(id, 'major', 1.6 + i * 0.1)),
  ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'].map((id, i) => leg(id, 'shot', 2.5 + (i % 4) * 0.5)),
];
const batch = { legs: pool, tiers: DEFAULT_TIERS, stake: 5 };
const oddsOf = (legs: PPLeg[], ids: string[]) => ids.reduce((p, id) => p * legs.find((l) => l.id === id)!.odds, 1);
const on = (g: { tickets: { legIds: string[] }[] }, id: string) => g.tickets.filter((t) => t.legIds.includes(id)).length;

// his batch of 2026-11-27 (screenshot): 3 Major-majors, 4 Majors (two games)
const his = [
  leg('blazers', 'mm', 1.33, 'Warriors@Blazers'),
  leg('chelsea', 'mm', 1.23, 'Chelsea vs Forest'),
  leg('palmeiras', 'mm', 1.2, 'Palmeiras vs Estudiantes'),
  leg('maxeyPts', 'major', 3.3, '76ers@Pacers'),
  leg('maxeyAst', 'major', 4.9, '76ers@Pacers'),
  leg('scottiePts', 'major', 3, 'Nets vs Raptors'),
  leg('scottieAst', 'major', 3.85, 'Nets vs Raptors'),
];
const shots = (n: number, odds = 3) => Array.from({ length: n }, (_, i) => leg(`s${i}`, 'shot', odds, `H${i}`));

describe('roles and starting scheme', () => {
  it('first tier on every PP, last tier the shots, the ones between are Major levels', () => {
    const tiers: PPTier[] = [...DEFAULT_TIERS.slice(0, 2), { id: 'm2', name: 'Major 2' }, DEFAULT_TIERS[2]!];
    expect([...roles(tiers).entries()]).toEqual([
      ['mm', { role: 'every', level: 0 }],
      ['major', { role: 'share', level: 0 }],
      ['m2', { role: 'share', level: 1 }],
      ['shot', { role: 'fixed', level: 0 }],
    ]);
    expect(majorLevels(tiers)).toBe(2);
  });
  it('defaults: one Major per PP, shots per PP worked out, shots to send suggested', () => {
    expect(startingScheme({ tiers: DEFAULT_TIERS, targetOdds: 20, scheme: null }, null)).toMatchObject({ majorsPerPP: [1], shotsPerPPAuto: true, plannedShots: null, target: 20, bandMin: 15, bandMax: 30, avoidPairs: false });
  });
  it('the last batch’s scheme is the start of the next one (fitted to its levels, its own target; the plan starts again)', () => {
    const last = { count: 30, majorsPerPP: [2], shotsPerPP: 2, shotsPerPPAuto: false, plannedShots: 12, bandMin: 12, bandMax: 40, target: 25 };
    const tiers: PPTier[] = [...DEFAULT_TIERS.slice(0, 2), { id: 'm2', name: 'Major 2' }, DEFAULT_TIERS[2]!];
    expect(startingScheme({ tiers, targetOdds: 18, scheme: null }, last)).toMatchObject({ count: 30, majorsPerPP: [2, 2], shotsPerPP: 2, shotsPerPPAuto: false, plannedShots: null, bandMin: 12, bandMax: 40, target: 18 });
  });
  it('a scheme from before (a % share per Major level) starts again at one Major per PP', () => {
    expect(startingScheme({ tiers: DEFAULT_TIERS, targetOdds: 20, scheme: null }, { count: 20, majorShares: [50] }).majorsPerPP).toEqual([1]);
  });
  it('appearances: a Major level’s places shared evenly; every shot exactly its PPs each', () => {
    const a = appearances(pool, DEFAULT_TIERS, scheme());
    expect([a.get('mm'), a.get('m1'), a.get('m2'), a.get('m3'), a.get('s1'), a.get('s10')]).toEqual([20, 4, 4, 3, 2, 2]);
  });
});

describe('even split (every shot the same weight)', () => {
  it('splits when PPs × shots per PP = shots × PPs each', () => {
    expect(split(20, 1, 10)).toMatchObject({ places: 20, each: 2 });
    expect(split(20, 2, 10)).toMatchObject({ places: 40, each: 4 });
  });
  it('7 shots over 20 PPs do not: the nearest that do, fewer or more shots, or PPs', () => {
    expect(split(20, 1, 7)).toEqual({ places: 20, shots: 7, each: null, fewer: { shots: 5, each: 4 }, more: { shots: 10, each: 2 }, fewerPPs: { count: 14, each: 2 }, morePPs: { count: 21, each: 3 } });
    // 2 shots per PP: 40 places
    expect(split(20, 2, 7)).toMatchObject({ each: null, fewer: { shots: 5, each: 8 }, more: { shots: 8, each: 5 }, fewerPPs: { count: 14, each: 4 }, morePPs: { count: 21, each: 6 } });
  });
  it('suggested shots: split evenly, each on about 2 PPs (fewer shots on a tie)', () => {
    expect(suggestedShots(20, 1)).toBe(10);
    expect(suggestedShots(20, 2)).toBe(20);
    expect(suggestedShots(21, 1)).toBe(7);
    expect(suggestedShots(0, 1)).toBe(0);
  });
});

describe('shot plan', () => {
  it('his batch: 7.26 before shots, 1 shot per PP, 10 shots suggested (2 PPs each)', () => {
    const p = shotPlan({ legs: his, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 }), 3);
    const base = 1.33 * 1.23 * 1.2 * Math.pow(3.3 * 4.9 * 3 * 3.85, 1 / 4);
    expect(p.base).toBeCloseTo(base, 6);
    expect(p).toMatchObject({ autoPerPP: 1, perPP: 1, planned: 10, have: 0 });
    expect(p.average).toBeCloseTo(base * 3, 6);
    expect(p.plannedSplit.each).toBe(2);
  });
  it('his pool: 10 shots split evenly, 7 do not (5 or 10, or 14 / 21 PPs)', () => {
    const ten = shotPlan({ legs: [...his, ...shots(10)], tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 }), 3);
    expect(ten.poolSplit).toMatchObject({ shots: 10, each: 2 });
    const seven = shotPlan({ legs: [...his, ...shots(7)], tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 }), 3);
    expect(seven.poolSplit).toMatchObject({ each: null, fewer: { shots: 5 }, more: { shots: 10 }, fewerPPs: { count: 14 }, morePPs: { count: 21 } });
  });
  it('shots per PP: the nearer to the target, never leaving the average PP under the minimum', () => {
    const legs = [leg('mm', 'mm', 5)];
    // need ln 4 / ln 3 = 1.26: 1 shot → 15, 2 → 45: 1 is nearer 20 and not under 15
    expect(shotPlan({ legs, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 }), 3).perPP).toBe(1);
    // the minimum 16: 1 shot leaves it under, so 2
    expect(shotPlan({ legs, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 16 }), 3).perPP).toBe(2);
    // 1 MM at 2, 4 Majors at 1.70: 3.40 before shots; 1 shot → 10.2 is under 15, so 2 (30.6)
    const four = [leg('mm', 'mm', 2), ...[1, 2, 3, 4].map((i) => leg(`m${i}`, 'major', 1.7))];
    expect(shotPlan({ legs: four, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 }), 3)).toMatchObject({ perPP: 2, planned: 20 });
  });
  it('typed shots per PP and typed shots to send are kept', () => {
    const p = shotPlan({ legs: his, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: false, shotsPerPP: 2, plannedShots: 7 }), 3);
    expect(p).toMatchObject({ perPP: 2, planned: 7 });
    expect(p.plannedSplit).toMatchObject({ places: 40, each: null, fewer: { shots: 5 }, more: { shots: 8 } });
  });
  it('none needed when the MMs and Majors already reach the target; no shot tier with two tiers', () => {
    expect(shotPlan({ legs: his, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, target: 5, bandMin: 3 }), 3)).toMatchObject({ need: 0, perPP: 0 });
    expect(shotPlan({ legs: his, tiers: DEFAULT_TIERS.slice(0, 2) }, scheme(), 3).hasShotTier).toBe(false);
  });
  it('same-game Major-majors count once, at their average (they take turns)', () => {
    expect(shotPlan({ legs: [leg('a', 'mm', 2, 'A'), leg('b', 'mm', 8, 'A')], tiers: DEFAULT_TIERS }, scheme(), 3).base).toBeCloseTo(4, 6);
  });
  it('typical shot odds: the pool’s shots at their geometric average, else 3.00', () => {
    expect(typicalShotOdds({ legs: his, tiers: DEFAULT_TIERS })).toBe(3);
    expect(typicalShotOdds({ legs: [leg('s1', 'shot', 2), leg('s2', 'shot', 8)], tiers: DEFAULT_TIERS })).toBe(4);
  });
  it('the generator’s scheme: shots per PP, and PPs each from the pool (0 when they do not split evenly)', () => {
    expect(effectiveScheme({ legs: [...his, ...shots(10)], tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 }))).toMatchObject({ shotsPerPP: 1, shotCount: 2 });
    expect(effectiveScheme({ legs: [...his, ...shots(7)], tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 })).shotCount).toBe(0);
  });
});

describe('average PP', () => {
  it('with its Majors and shots per PP', () => {
    const p = propose(batch, scheme({ bandMin: 8 }));
    const avg = (ls: PPLeg[]) => Math.exp(ls.reduce((a, l) => a + Math.log(l.odds), 0) / ls.length);
    expect(p.average).toBeCloseTo(2 * avg(pool.filter((l) => l.tier === 'major')) * avg(pool.filter((l) => l.tier === 'shot')), 6);
    expect(p.message).toContain('20 PPs, 1 Major per PP, 1 PP shot per PP: the average PP is');
    expect(p.scheme.count).toBe(20);
  });
  it('says so when it is under the minimum or over the top', () => {
    expect(propose({ legs: [leg('mm', 'mm', 1.5), leg('m1', 'major', 1.3)], tiers: DEFAULT_TIERS }, scheme({ bandMin: 15 })).message).toMatch(/average PP is 1\.95, under the band from 15/);
    expect(propose({ legs: [leg('mm', 'mm', 25), leg('m1', 'major', 1.5)], tiers: DEFAULT_TIERS }, scheme()).message).toContain('37.50, over the band to 30');
    expect(propose({ legs: [], tiers: DEFAULT_TIERS }, scheme()).short).toBe(true);
  });
});

describe('generator hard rules (fixed seeds)', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    it(`seed ${seed}: every shot on EXACTLY 2 PPs; MM, one Major and one shot on each PP; never under the minimum`, () => {
      const s = scheme({ seed, bandMin: 9.5 });
      const g = generate(batch, s);
      expect(g).toMatchObject({ notEven: false, underMin: 0 });
      // the shots are exact; a Major may be one PP off when the minimum needs a longer one
      expect(g.shortfalls.filter((x) => x.legId.startsWith('s'))).toEqual([]);
      for (const x of g.shortfalls) expect(x.wanted - x.got).toBeLessThanOrEqual(1);
      expect(g.tickets).toHaveLength(20);
      for (const id of ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10']) expect(on(g, id)).toBe(2);
      for (const t of g.tickets) {
        expect(t.legIds[0]).toBe('mm');
        expect(t.legIds.filter((id) => /^m\d/.test(id))).toHaveLength(1);
        expect(t.legIds.filter((id) => /^s\d/.test(id))).toHaveLength(1);
        expect(oddsOf(pool, t.legIds)).toBeGreaterThanOrEqual(9.5 - 1e-9);
        expect(t.placed).toBe(false);
      }
      expect(g.tickets.map((t) => t.number)).toEqual(g.tickets.map((_, i) => i + 1));
    });
  }
  it('his batch with 10 shots: each shot exactly 2 PPs, one Major per PP, none under 15', () => {
    const legs = [...his, ...[2.5, 3, 3.5, 4, 2.8, 3.2, 3, 2.6, 3.4, 3.6].map((o, i) => leg(`s${i}`, 'shot', o, `H${i}`))];
    const s = effectiveScheme({ legs, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15, bandMax: 40 }));
    const g = generate({ legs, tiers: DEFAULT_TIERS }, s);
    expect(g).toMatchObject({ notEven: false, underMin: 0 });
    for (let i = 0; i < 10; i++) expect(on(g, `s${i}`)).toBe(2);
    for (const t of g.tickets) {
      expect(t.legIds.filter((id) => id.startsWith('maxey') || id.startsWith('scottie'))).toHaveLength(1);
      expect(oddsOf(legs, t.legIds)).toBeGreaterThanOrEqual(15 - 1e-9);
    }
  });
  it('shots that do not split evenly: nothing generated', () => {
    const legs = [...his, ...shots(7)];
    const g = generate({ legs, tiers: DEFAULT_TIERS }, effectiveScheme({ legs, tiers: DEFAULT_TIERS }, scheme({ shotsPerPPAuto: true, bandMin: 15 })));
    expect(g).toMatchObject({ notEven: true, tickets: [] });
  });
  it('says how many PPs would be under the minimum when the legs cannot reach it', () => {
    // a 2.5 shot with the best Major (2.1) and the MM (2) is 10.5: under 11
    const g = generate(batch, scheme({ seed: 3, bandMin: 11 }));
    expect(g.underMin).toBeGreaterThan(0);
    expect(on(g, 's1')).toBe(2); // the equal weights are never given up
  });
  it('the Majors take turns evenly', () => {
    const g = generate(batch, scheme({ seed: 4 }));
    const counts = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => on(g, id));
    expect(counts.reduce((a, b) => a + b, 0)).toBe(20);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });
  it('two Majors per PP when asked, never two from the same game', () => {
    const legs = [...pool.filter((l) => l.tier !== 'major'), leg('m1', 'major', 1.6, 'A'), leg('m2', 'major', 1.7, 'A'), leg('m3', 'major', 1.8, 'B'), leg('m4', 'major', 1.9, 'C')];
    const g = generate({ legs, tiers: DEFAULT_TIERS }, scheme({ seed: 2, majorsPerPP: [2] }));
    for (const t of g.tickets) {
      const majors = t.legIds.filter((id) => /^m\d/.test(id));
      expect(majors).toHaveLength(2);
      expect(majors.includes('m1') && majors.includes('m2')).toBe(false);
    }
  });
  it('the same seed gives the same PPs', () => {
    expect(generate(batch, scheme({ seed: 5 })).tickets).toEqual(generate(batch, scheme({ seed: 5 })).tickets);
  });
  it('a shot from a Major-major’s game can never be placed: reported as short', () => {
    const legs = [leg('mm', 'mm', 2, 'G0'), leg('m1', 'major', 2), leg('a', 'shot', 3, 'G0'), leg('b', 'shot', 3, 'G1')];
    const g = generate({ legs, tiers: DEFAULT_TIERS }, scheme({ count: 4, shotCount: 2 }));
    expect(g.shortfalls.find((x) => x.legId === 'a')).toEqual({ legId: 'a', wanted: 2, got: 0 });
    expect(on(g, 'b')).toBe(2);
  });
  it('a tiny pool: the PPs that repeat another are counted', () => {
    const tiny = { legs: [leg('mm', 'mm', 2), leg('a', 'major', 8), leg('b', 'major', 9)], tiers: DEFAULT_TIERS };
    const g = generate(tiny, scheme({ count: 10, seed: 1 }));
    expect(g.tickets.length).toBe(10);
    expect(g.dropped).toBe(8);
  });
  // owner, 2026-11-27: always, every tier, no toggle
  const sameGameLegs = [
    leg('mmA', 'mm', 1.5, 'Lakers v Celtics'),
    leg('mmB', 'mm', 1.6, 'lakers  v celtics'),
    leg('mmC', 'mm', 1.4, 'G9'),
    leg('a', 'major', 2, 'G1'),
    leg('b', 'major', 2.2, 'G1'),
    leg('c', 'major', 2.4, 'G2'),
    leg('x', 'major', 2.1, 'Lakers v Celtics'),
    leg('d', 'shot', 3, 'G2'),
    leg('e', 'shot', 3, 'G3'),
    leg('f', 'shot', 3.5, 'G3'),
  ];
  for (const seed of [1, 2, 3, 9, 42]) {
    it(`seed ${seed}: never two legs from the same game on one PP, any tiers`, () => {
      const g = generate({ legs: sameGameLegs, tiers: DEFAULT_TIERS }, scheme({ count: 12, shotCount: 4, seed }));
      expect(g.tickets.length).toBe(12);
      for (const t of g.tickets) {
        const games = t.legIds.map((id) => gameKey(sameGameLegs.find((l) => l.id === id)!));
        expect(new Set(games).size).toBe(games.length);
      }
    });
  }
  it('Major-majors from one game take turns: exactly one on every PP, split evenly', () => {
    const g = generate({ legs: sameGameLegs, tiers: DEFAULT_TIERS }, scheme({ count: 12, shotCount: 4, seed: 4 }));
    for (const t of g.tickets) {
      expect(t.legIds.filter((id) => id === 'mmA' || id === 'mmB')).toHaveLength(1);
      expect(t.legIds).toContain('mmC');
    }
    expect([on(g, 'mmA'), on(g, 'mmB')]).toEqual([6, 6]);
    const a = appearances(sameGameLegs, DEFAULT_TIERS, scheme({ count: 12 }));
    expect([a.get('mmA'), a.get('mmB'), a.get('mmC')]).toEqual([6, 6, 12]);
  });
  it('turns count through every combination of two same-game pairs', () => {
    const legs = [leg('a1', 'mm', 2, 'A'), leg('a2', 'mm', 2, 'A'), leg('b1', 'mm', 2, 'B'), leg('b2', 'mm', 2, 'B')];
    const groups = mmGroups(legs, DEFAULT_TIERS);
    expect(groups.map((g) => g.map((l) => l.id))).toEqual([['a1', 'a2'], ['b1', 'b2']]);
    expect([0, 1, 2, 3].map((n) => mmFor(groups, n).map((l) => l.id).join('+'))).toEqual(['a1+b1', 'a2+b1', 'a1+b2', 'a2+b2']);
  });
  it('a combo Major-major takes turns with every Major-major sharing any of its parts’ games', () => {
    const part = (game: string) => ({ sport: '', date: '', game, market: '', selection: game, odds: 1.2 });
    // the combo's game text is its parts' games joined, so grouping by that text alone would miss the overlap
    const combo: PPLeg = { ...leg('c', 'mm', 1.7, 'A / B / C'), parts: [part('A'), part('B'), part('C')] };
    const legs = [leg('a', 'mm', 1.3, 'A'), leg('x', 'mm', 1.3, 'X'), combo, leg('b', 'mm', 1.3, 'B')];
    const groups = mmGroups(legs, DEFAULT_TIERS);
    expect(groups.map((g) => g.map((l) => l.id))).toEqual([['a', 'c', 'b'], ['x']]);
    const g = generate({ legs: [...legs, ...shots(4)], tiers: DEFAULT_TIERS }, scheme({ count: 6, majorsPerPP: [0], shotCount: 0, bandMin: 1 }));
    for (const t of g.tickets) {
      expect(t.legIds.filter((id) => ['a', 'b', 'c'].includes(id))).toHaveLength(1);
      expect(t.legIds).toContain('x');
    }
  });
  it('legs with no game typed are each a game of their own', () => {
    expect(gameKey(leg('p', 'mm', 2, ''))).not.toBe(gameKey(leg('q', 'mm', 2, '')));
    expect(mmGroups([leg('p', 'mm', 2, ''), leg('q', 'mm', 2, ' ')], DEFAULT_TIERS)).toHaveLength(2);
  });
  it('avoid repeating the same pair of legs: no more repeated pairs than without it', () => {
    const repeats = (avoidPairs: boolean) => {
      let n = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const g = generate(batch, scheme({ seed, avoidPairs }));
        const seen = new Map<string, number>();
        for (const t of g.tickets) for (const a of t.legIds) for (const b of t.legIds) if (a < b && a !== 'mm' && b !== 'mm') seen.set(`${a}|${b}`, (seen.get(`${a}|${b}`) ?? 0) + 1);
        n += [...seen.values()].reduce((x, c) => x + c - 1, 0);
      }
      return n;
    };
    expect(repeats(true)).toBeLessThanOrEqual(repeats(false));
  });
});

describe('preview and place line', () => {
  it('legs and odds per PP, under the minimum, appearances, totals', () => {
    const s = scheme({ seed: 2, bandMin: 9.5 });
    const g = generate(batch, s);
    const p = preview(batch, s, g);
    expect(p.legs.min).toBe(3);
    expect(p.under).toBe(0);
    // each PP its own stake: the longest gets the batch's 5 (the minimum), all pay the same
    expect(Math.min(...p.stakes)).toBe(5);
    expect(p.totalStake).toBeCloseTo(p.stakes.reduce((a, x) => a + x, 0), 6);
    expect(p.appearances.find((a) => a.leg.id === 'mm')).toMatchObject({ wanted: 20, got: 20 });
    expect(p.appearances.find((a) => a.leg.id === 's1')).toMatchObject({ wanted: 2, got: 2 });
    expect(p.outside).toBe(g.tickets.filter((t) => { const o = oddsOf(pool, t.legIds); return o < 9.5 || o > 30; }).length);
  });
  it('an empty generation has zeros, never NaN', () => {
    const p = preview(batch, scheme({ count: 0 }), { tickets: [], shortfalls: [], dropped: 0, notEven: false, underMin: 0, shotPairs: 'ok' });
    expect(p).toMatchObject({ legs: { min: 0, avg: 0, max: 0 }, odds: { min: 0, avg: 0, max: 0 }, outside: 0, under: 0, totalStake: 0, totalPotential: 0 });
  });
  it('copy-friendly line', () => expect(placeLine({ id: 't', number: 3, legIds: ['mm', 'm1'], placed: false, oddsOverride: null, stake: null }, pool, 3.2)).toBe('PP 3 · mm + m1 · 3.20'));
  it('rng is deterministic and in [0, 1)', () => {
    const a = rng(1);
    const xs = [a(), a(), a()];
    const b = rng(1);
    expect([b(), b(), b()]).toEqual(xs);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
});

// Owner, 2026-11-27 (Garland 21 pts and McDaniels 20 pts together on PP 8 and PP 18): two PP shots share ONE PP at most.
describe('two PP shots together on one PP at most', () => {
  const shotPool = (n: number) => [
    leg('mm', 'mm', 1.5),
    ...[1.6, 1.7, 1.8, 1.9].map((o, i) => leg(`m${i}`, 'major', o)),
    ...Array.from({ length: n }, (_, i) => leg(`s${i}`, 'shot', 2.5 + (i % 4) * 0.3)),
  ];
  const shotPairsTwice = (g: { tickets: { legIds: string[] }[] }) => {
    const seen = new Map<string, number>();
    for (const t of g.tickets) {
      const ss = t.legIds.filter((x) => x.startsWith('s'));
      for (const a of ss) for (const b of ss) if (a < b) seen.set(`${a}|${b}`, (seen.get(`${a}|${b}`) ?? 0) + 1);
    }
    return [...seen.values()].filter((c) => c > 1).length;
  };
  // PPs, shots per PP, shots: each shot on PPs × per PP ÷ shots
  for (const [count, perPP, shots] of [[10, 2, 10], [20, 2, 10], [12, 2, 6], [18, 2, 9], [24, 2, 12], [12, 3, 12], [16, 3, 12], [20, 3, 15]] as const) {
    it(`${count} PPs × ${perPP} shots from ${shots}: no pair twice, every shot on exactly its PPs (seeds 1-10)`, () => {
      const each = (count * perPP) / shots;
      for (let seed = 1; seed <= 10; seed++) {
        const legs = shotPool(shots);
        const g = generate({ legs, tiers: DEFAULT_TIERS }, scheme({ count, shotsPerPP: perPP, shotCount: each, bandMin: 1, bandMax: 999, seed }));
        expect(g.shotPairs).toBe('ok');
        expect(shotPairsTwice(g)).toBe(0);
        for (const l of legs.filter((x) => x.tier === 'shot')) expect(on(g, l.id)).toBe(each);
      }
    });
  }
  it('impossible when each shot needs more partners than there are shots: nothing generated', () => {
    // 5 shots on 4 PPs each, 2 per PP: 4 partners needed, 4 others: fine; 4 shots on 5 PPs each: 5 needed, 3 others
    expect(generate({ legs: shotPool(5), tiers: DEFAULT_TIERS }, scheme({ count: 10, shotsPerPP: 2, shotCount: 4, bandMin: 1 })).shotPairs).toBe('ok');
    const g = generate({ legs: shotPool(4), tiers: DEFAULT_TIERS }, scheme({ count: 10, shotsPerPP: 2, shotCount: 5, bandMin: 1 }));
    expect(g).toMatchObject({ shotPairs: 'impossible', tickets: [] });
  });
  it('one shot per PP: nothing to pair', () => expect(generate({ legs: shotPool(10), tiers: DEFAULT_TIERS }, scheme({ count: 20, shotsPerPP: 1, shotCount: 2 })).shotPairs).toBe('ok'));
  it('a shot layout keeps the same-game rule with the Major-majors and between shots', () => {
    const legs = [leg('mm', 'mm', 1.5, 'G'), leg('m0', 'major', 1.8), ...Array.from({ length: 8 }, (_, i) => leg(`s${i}`, 'shot', 3, i < 2 ? 'G' : i < 4 ? 'H' : `S${i}`))];
    const g = generate({ legs, tiers: DEFAULT_TIERS }, scheme({ count: 8, shotsPerPP: 2, shotCount: 2, bandMin: 1 }));
    expect(g.tickets.length).toBe(8);
    for (const t of g.tickets) expect(t.legIds.filter((id) => ['s0', 's1', 'mm'].includes(id))).toHaveLength(1);
  });
});

describe('shot pairs repeated on an existing batch', () => {
  const legs = [leg('blazers', 'mm', 1.3), leg('garland', 'shot', 3), leg('mcd', 'shot', 3), leg('maxey', 'shot', 3), leg('chelsea', 'major', 1.5)];
  const t = (number: number, legIds: string[]) => ({ id: `t${number}`, number, legIds, placed: false, oddsOverride: null, stake: null });
  const b = { legs, tiers: DEFAULT_TIERS, tickets: [t(18, ['blazers', 'garland', 'mcd']), t(8, ['blazers', 'chelsea', 'garland', 'mcd']), t(3, ['blazers', 'garland', 'maxey'])] };
  it('finds the shots together on more than one PP (Major-majors and Majors are not shots)', () => {
    const r = shotPairRepeats(b);
    expect(r.map((x) => [x.a.id, x.b.id, x.numbers])).toEqual([['garland', 'mcd', [8, 18]]]);
    expect(repeatText(r)).toBe('garland and mcd on PP 8, PP 18');
  });
});
