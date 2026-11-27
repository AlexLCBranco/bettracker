// BT-31: the proposal maths and the generator's hard rules, with fixed seeds.
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS, type PPLeg, type PPTier } from '@/lib/pp';
import { appearances, gameKey, generate, mmFor, mmGroups, shotPlan, typicalShotOdds, majorLevels, placeLine, preview, propose, rng, roles, startingScheme, type PPScheme } from '@/lib/ppBuilder';

const leg = (id: string, tier: string, odds: number, game = `${id} game`): PPLeg => ({ id, sport: '', game, market: '', selection: id, odds, tier, result: 'pending', actual: '', note: '' });
const scheme = (over: Partial<PPScheme> = {}): PPScheme => ({ count: 20, target: 20, bandMin: 15, bandMax: 30, majorsPerPP: [1], shotCount: 2, avoidPairs: false, seed: 7, ...over });

// the owner's shape: one major-major around 2, majors, PP shots
const pool = [
  leg('mm', 'mm', 2),
  ...['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id, i) => leg(id, 'major', 1.6 + i * 0.1)),
  ...['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'].map((id, i) => leg(id, 'shot', 2.5 + (i % 4) * 0.5)),
];
const batch = { legs: pool, tiers: DEFAULT_TIERS, stake: 5 };

describe('roles and starting scheme', () => {
  it('first tier on every PP, last tier fixed, the ones between are Major levels', () => {
    const tiers: PPTier[] = [...DEFAULT_TIERS.slice(0, 2), { id: 'm2', name: 'Major 2' }, DEFAULT_TIERS[2]!];
    expect([...roles(tiers).entries()]).toEqual([
      ['mm', { role: 'every', level: 0 }],
      ['major', { role: 'share', level: 0 }],
      ['m2', { role: 'share', level: 1 }],
      ['shot', { role: 'fixed', level: 0 }],
    ]);
    expect(majorLevels(tiers)).toBe(2);
  });
  it('defaults: one Major per PP (owner, 2026-11-27), PP shots on 2 PPs each', () => {
    expect(startingScheme({ tiers: DEFAULT_TIERS, targetOdds: 20, scheme: null }, null)).toMatchObject({ majorsPerPP: [1], shotCount: 2, target: 20, bandMin: 15, bandMax: 30, avoidPairs: false });
  });
  it('the last batch’s scheme is the start of the next one (fitted to its levels, its own target)', () => {
    const last = { count: 30, majorsPerPP: [2], shotCount: 3, bandMin: 12, bandMax: 40, target: 25 };
    const tiers: PPTier[] = [...DEFAULT_TIERS.slice(0, 2), { id: 'm2', name: 'Major 2' }, DEFAULT_TIERS[2]!];
    expect(startingScheme({ tiers, targetOdds: 18, scheme: null }, last)).toMatchObject({ count: 30, majorsPerPP: [2, 2], shotCount: 3, bandMin: 12, bandMax: 40, target: 18 });
  });
  it('a scheme from before (a % share per Major level) starts again at one Major per PP', () => {
    expect(startingScheme({ tiers: DEFAULT_TIERS, targetOdds: 20, scheme: null }, { count: 20, majorShares: [50] }).majorsPerPP).toEqual([1]);
  });
  it('appearances per leg: a level’s places (PPs × per PP) shared evenly over its Majors', () => {
    const a = appearances(pool, DEFAULT_TIERS, scheme({ count: 20 }));
    // 20 places over 6 Majors: 4, 4, 3, 3, 3, 3
    expect([a.get('mm'), a.get('m1'), a.get('m2'), a.get('m3'), a.get('s1')]).toEqual([20, 4, 4, 3, 2]);
    expect(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].reduce((x, id) => x + a.get(id)!, 0)).toBe(20);
    const two = appearances(pool, DEFAULT_TIERS, scheme({ count: 20, majorsPerPP: [2] }));
    expect(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].reduce((x, id) => x + two.get(id)!, 0)).toBe(40);
  });
});

describe('proposal', () => {
  const avg = (legs: PPLeg[]) => Math.exp(legs.reduce((a, l) => a + Math.log(l.odds), 0) / legs.length);
  it('about one PP shot per PP, one Major per PP: what the average PP comes to', () => {
    const p = propose(batch, scheme());
    expect(p.scheme.count).toBe(20); // 2 × 10 shot legs
    const majors = pool.filter((l) => l.tier === 'major');
    const shots = pool.filter((l) => l.tier === 'shot');
    expect(p.average).toBeCloseTo(2 * avg(majors) * avg(shots), 6);
    expect(p.message).toContain('20 PPs (PP shots on 2 each: about 1.0 per PP), 1 Major per PP: the average PP is');
  });
  it('says so when the average PP is under the band, and what to do', () => {
    const p = propose({ legs: [leg('mm', 'mm', 1.5), leg('m1', 'major', 1.3)], tiers: DEFAULT_TIERS }, scheme());
    expect(p.short).toBe(true);
    expect(p.message).toMatch(/average PP is 1\.95, under the band from 15\. Add PP shots/);
  });
  it('says so when it is over the band', () => {
    const p = propose({ legs: [leg('mm', 'mm', 25), leg('m1', 'major', 1.5)], tiers: DEFAULT_TIERS }, scheme());
    expect(p.message).toContain('37.50, over the band to 30');
  });
  it('an empty pool', () => expect(propose({ legs: [], tiers: DEFAULT_TIERS }, scheme()).short).toBe(true));
});

describe('generator hard rules (fixed seeds)', () => {
  for (const seed of [1, 2, 3, 42, 999]) {
    it(`seed ${seed}: major-majors on every PP, exactly one Major, a leg at most once, no identical PPs, band respected`, () => {
      const g = generate(batch, scheme({ seed }));
      expect(g.tickets).toHaveLength(20 - g.dropped);
      const keys = new Set<string>();
      for (const t of g.tickets) {
        expect(t.legIds[0]).toBe('mm');
        expect(t.legIds.filter((id) => id.startsWith('m') && id !== 'mm')).toHaveLength(1);
        expect(new Set(t.legIds).size).toBe(t.legIds.length);
        const key = [...t.legIds].sort().join(',');
        expect(keys.has(key)).toBe(false);
        keys.add(key);
        const odds = t.legIds.reduce((p, id) => p * pool.find((l) => l.id === id)!.odds, 1);
        expect(odds).toBeLessThanOrEqual(30 + 1e-9);
        expect(t.placed).toBe(false);
      }
      expect(g.tickets.map((t) => t.number)).toEqual(g.tickets.map((_, i) => i + 1));
    });
  }
  it('the Majors take turns evenly', () => {
    const g = generate(batch, scheme({ seed: 4 }));
    const on = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((id) => g.tickets.filter((t) => t.legIds.includes(id)).length);
    expect(on.reduce((a, b) => a + b, 0)).toBe(g.tickets.length);
    expect(Math.max(...on) - Math.min(...on)).toBeLessThanOrEqual(1 + g.dropped);
  });
  it('two Majors per PP when asked, never two from the same game', () => {
    const legs = [...pool.filter((l) => l.tier !== 'major'), leg('m1', 'major', 1.6, 'A'), leg('m2', 'major', 1.7, 'A'), leg('m3', 'major', 1.8, 'B'), leg('m4', 'major', 1.9, 'C')];
    const g = generate({ legs, tiers: DEFAULT_TIERS }, scheme({ seed: 2, majorsPerPP: [2], bandMax: 40 }));
    for (const t of g.tickets) {
      const majors = t.legIds.filter((id) => /^m\d/.test(id));
      expect(majors).toHaveLength(2);
      expect(majors.includes('m1') && majors.includes('m2')).toBe(false);
    }
  });
  it('the same seed gives the same PPs; another seed others', () => {
    expect(generate(batch, scheme({ seed: 5 })).tickets).toEqual(generate(batch, scheme({ seed: 5 })).tickets);
    expect(generate(batch, scheme({ seed: 5 })).tickets).not.toEqual(generate(batch, scheme({ seed: 6 })).tickets);
  });
  it('every leg reaches its appearances where the numbers allow; the PP shots do', () => {
    const g = generate(batch, scheme({ seed: 3 }));
    expect(g.shortfalls.filter((x) => x.legId.startsWith('s'))).toEqual([]);
  });
  it('reports the legs that fell short', () => {
    // every shot wanted on all 20 PPs cannot fit under a band top of 30
    const g = generate(batch, scheme({ seed: 3, shotCount: 20 }));
    expect(g.shortfalls.length).toBeGreaterThan(0);
    for (const x of g.shortfalls) expect(x.got).toBeLessThan(x.wanted);
  });
  it('no two identical PPs: a tiny pool drops what it cannot make different', () => {
    const tiny = { legs: [leg('mm', 'mm', 2), leg('a', 'major', 8), leg('b', 'major', 9)], tiers: DEFAULT_TIERS };
    const g = generate(tiny, scheme({ count: 10, shotCount: 0, seed: 1 }));
    expect(g.tickets.length).toBe(2);
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
      const g = generate({ legs: sameGameLegs, tiers: DEFAULT_TIERS }, scheme({ count: 12, bandMin: 8, bandMax: 40, seed }));
      expect(g.tickets.length).toBeGreaterThan(0);
      for (const t of g.tickets) {
        const games = t.legIds.map((id) => gameKey(sameGameLegs.find((l) => l.id === id)!));
        expect(new Set(games).size).toBe(games.length);
      }
    });
  }
  it('Major-majors from one game take turns: exactly one on every PP, split evenly', () => {
    const g = generate({ legs: sameGameLegs, tiers: DEFAULT_TIERS }, scheme({ count: 12, bandMin: 8, bandMax: 40, seed: 4 }));
    const on = (id: string) => g.tickets.filter((t) => t.legIds.includes(id)).length;
    for (const t of g.tickets) {
      expect(t.legIds.filter((id) => id === 'mmA' || id === 'mmB')).toHaveLength(1);
      expect(t.legIds).toContain('mmC');
    }
    expect(Math.abs(on('mmA') - on('mmB'))).toBeLessThanOrEqual(1);
    const a = appearances(sameGameLegs, DEFAULT_TIERS, scheme({ count: 12 }));
    expect([a.get('mmA'), a.get('mmB'), a.get('mmC')]).toEqual([6, 6, 12]);
    expect(on('mmA') + on('mmB')).toBe(g.tickets.length);
  });
  it('turns count through every combination of two same-game pairs', () => {
    const legs = [leg('a1', 'mm', 2, 'A'), leg('a2', 'mm', 2, 'A'), leg('b1', 'mm', 2, 'B'), leg('b2', 'mm', 2, 'B')];
    const groups = mmGroups(legs, DEFAULT_TIERS);
    expect(groups.map((g) => g.map((l) => l.id))).toEqual([['a1', 'a2'], ['b1', 'b2']]);
    expect([0, 1, 2, 3].map((n) => mmFor(groups, n).map((l) => l.id).join('+'))).toEqual(['a1+b1', 'a2+b1', 'a1+b2', 'a2+b2']);
  });
  it('legs with no game typed are each a game of their own', () => {
    expect(gameKey(leg('p', 'mm', 2, ''))).not.toBe(gameKey(leg('q', 'mm', 2, '')));
    expect(mmGroups([leg('p', 'mm', 2, ''), leg('q', 'mm', 2, ' ')], DEFAULT_TIERS)).toHaveLength(2);
  });
  it('the proposal counts same-game Major-majors once, at their average', () => {
    const turns = propose({ legs: [leg('mm', 'mm', 2, 'A'), leg('mm2', 'mm', 8, 'A'), leg('m1', 'major', 1.5)], tiers: DEFAULT_TIERS }, scheme());
    expect(turns.average).toBeCloseTo(6, 6); // (2 and 8 at their average: 4) × 1.5
  });
  it('toggle: avoid repeating the same pair of legs (fewer repeated pairs than without it)', () => {
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
    expect(repeats(true)).toBeLessThan(repeats(false));
  });
});

describe('preview and place line', () => {
  it('legs and odds per PP, outside the band, appearances, totals', () => {
    const s = scheme({ seed: 2 });
    const g = generate(batch, s);
    const p = preview(batch, s, g);
    expect(p.legs.min).toBeGreaterThanOrEqual(2);
    expect(p.odds.max).toBeLessThanOrEqual(30 + 1e-9);
    // each PP its own stake: the longest gets the batch's 5 (the minimum), all pay the same
    expect(Math.min(...p.stakes)).toBe(5);
    expect(p.totalStake).toBeCloseTo(p.stakes.reduce((a, x) => a + x, 0), 6);
    expect(p.totalStake).toBeGreaterThan(g.tickets.length * 5);
    expect(p.appearances.find((a) => a.leg.id === 'mm')).toMatchObject({ wanted: 20, got: g.tickets.length });
    expect(p.outside).toBe(g.tickets.filter((t) => t.legIds.reduce((x, id) => x * pool.find((l) => l.id === id)!.odds, 1) < 15).length);
  });
  it('an empty generation has zeros, never NaN', () => {
    const p = preview(batch, scheme({ count: 0 }), { tickets: [], shortfalls: [], dropped: 0 });
    expect(p).toMatchObject({ legs: { min: 0, avg: 0, max: 0 }, odds: { min: 0, avg: 0, max: 0 }, outside: 0, totalStake: 0, totalPotential: 0 });
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

// owner, 2026-11-27: "with 1 Major-major and 4 Majors, how many PP shots do I need?"
describe('shot plan', () => {
  const pool = [leg('mm', 'mm', 2), ...[1, 2, 3, 4].map((i) => leg(`m${i}`, 'major', 1.7))];
  it('his example: 1 MM at 2.00, 4 Majors at 1.70, one Major per PP, target 20, 20 PPs, shots at 3.00 on 2 PPs each', () => {
    const p = shotPlan({ legs: pool, tiers: DEFAULT_TIERS }, scheme({ count: 20, target: 20, shotCount: 2 }), 3);
    expect(p).toMatchObject({ hasShotTier: true, mm: 1, majors: 4, needed: 17, have: 0, missing: 17 });
    expect(p.base).toBeCloseTo(3.4, 6); // 2 × 1.7: one Major per PP
    expect(p.perPP).toBeCloseTo(Math.log(20 / 3.4) / Math.log(3), 6);
  });
  it('his batch of 2026-11-27: 3 Major-majors, 4 Majors, one Major per PP (not 26.83)', () => {
    const legs = [
      leg('blazers', 'mm', 1.33, 'Warriors@Blazers'),
      leg('chelsea', 'mm', 1.23, 'Chelsea vs Forest'),
      leg('palmeiras', 'mm', 1.2, 'Palmeiras vs Estudiantes'),
      leg('maxeyPts', 'major', 3.3, '76ers@Pacers'),
      leg('maxeyAst', 'major', 4.9, '76ers@Pacers'),
      leg('scottiePts', 'major', 3, 'Nets vs Raptors'),
      leg('scottieAst', 'major', 3.85, 'Nets vs Raptors'),
    ];
    const p = shotPlan({ legs, tiers: DEFAULT_TIERS }, scheme({ count: 20, target: 20, shotCount: 2 }), 3);
    const base = 1.33 * 1.23 * 1.2 * Math.pow(3.3 * 4.9 * 3 * 3.85, 1 / 4);
    expect(p.base).toBeCloseTo(base, 6); // ≈ 7.26
    expect(p.base).toBeLessThan(8);
    expect(p.needed).toBe(Math.ceil((20 * (Math.log(20 / base) / Math.log(3))) / 2)); // 10
    // and the generator puts exactly one of the four on each PP
    const g = generate({ legs: [...legs, ...[3, 3, 3, 3, 3, 3, 3, 3, 3, 3].map((o, i) => leg(`s${i}`, 'shot', o, `H${i}`))], tiers: DEFAULT_TIERS }, scheme({ count: 10, seed: 1 }));
    for (const t of g.tickets) expect(t.legIds.filter((id) => id.startsWith('maxey') || id.startsWith('scottie'))).toHaveLength(1);
  });
  it('counts the shots already in the pool', () => {
    const legs = [...pool, leg('s1', 'shot', 3), leg('s2', 'shot', 3), leg('s3', 'shot', 3)];
    expect(shotPlan({ legs, tiers: DEFAULT_TIERS }, scheme(), 3)).toMatchObject({ needed: 17, have: 3, missing: 14 });
    expect(shotPlan({ legs, tiers: DEFAULT_TIERS }, scheme({ count: 3 }), 3)).toMatchObject({ needed: 3, have: 3, missing: 0 });
  });
  it('none needed when the MMs and Majors already reach the target; none when shots are on 0 PPs', () => {
    expect(shotPlan({ legs: pool, tiers: DEFAULT_TIERS }, scheme({ target: 3 }), 3)).toMatchObject({ perPP: 0, needed: 0 });
    expect(shotPlan({ legs: pool, tiers: DEFAULT_TIERS }, scheme({ shotCount: 0 }), 3).needed).toBe(0);
  });
  it('same-game Major-majors count once, at their average (they take turns)', () => {
    const turns = [leg('a', 'mm', 2, 'A'), leg('b', 'mm', 8, 'A')];
    expect(shotPlan({ legs: turns, tiers: DEFAULT_TIERS }, scheme(), 3).base).toBeCloseTo(4, 6);
  });
  it('no shot tier with only two tiers', () => {
    expect(shotPlan({ legs: pool, tiers: DEFAULT_TIERS.slice(0, 2) }, scheme(), 3).hasShotTier).toBe(false);
  });
  it('typical shot odds: the pool’s shots at their geometric average, else 3.00', () => {
    expect(typicalShotOdds({ legs: pool, tiers: DEFAULT_TIERS })).toBe(3);
    expect(typicalShotOdds({ legs: [leg('s1', 'shot', 2), leg('s2', 'shot', 8)], tiers: DEFAULT_TIERS })).toBe(4);
  });
});
