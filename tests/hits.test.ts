// BT-6: dutch hit count and miss count.
import { describe, expect, it } from 'vitest';
import { dutchHitReport, dutchHits, hitsText, missesText, missesTitle, splitMark } from '@/lib/hits';
import type { Bet, Result } from '@/lib/types';
import { bet, leg } from './helpers';

let id = 0;
/** Owner's example: McCain 25 + Celtics W / Mitchell 30 + Celtics W, with each bet's and leg's results. */
function example(r: [Result, Result, Result][], dutchId = `d${++id}`): Bet[] {
  const own = ['McCain 25 pts', 'Mitchell 30 pts', 'Garland 20 pts'];
  return r.map(([result, ownLeg, shared], i) =>
    bet({
      dutchId,
      type: 'combination',
      betText: `${own[i]} + Celtics W`,
      odds: 4,
      stake: 50,
      result,
      createdAt: `2026-11-20T12:00:00.00${i}Z`,
      legs: [leg({ selection: own[i]!, result: ownLeg }), leg({ selection: i ? 'celtics w' : 'Celtics W', result: shared })],
    }),
  );
}

describe('dutchHits', () => {
  it('shared leg lost: 0/2 and ONE miss, marked shared', () => {
    const h = dutchHits(
      example([
        ['lost', 'won', 'lost'],
        ['lost', 'pending', 'lost'],
      ]),
    );
    expect(hitsText(h)).toBe('0/2');
    expect(h.tone).toBe('none');
    expect(h.misses).toEqual([{ name: 'Celtics W', shared: true, legNotSet: false }]);
    expect(missesText(h)).toBe('1 miss');
    expect(missesTitle(h)).toBe('0/2 hit · Missed: Celtics W (shared)');
  });

  it('every own leg lost, shared won: 0/2 and 2 misses', () => {
    const h = dutchHits(
      example([
        ['lost', 'lost', 'won'],
        ['lost', 'lost', 'won'],
      ]),
    );
    expect(hitsText(h)).toBe('0/2');
    expect(h.misses.map((m) => m.name)).toEqual(['McCain 25 pts', 'Mitchell 30 pts']);
    expect(missesText(h)).toBe('2 misses');
  });

  it('mixed: only McCain short = 1/2, 1 miss, some hit', () => {
    const h = dutchHits(
      example([
        ['lost', 'lost', 'won'],
        ['won', 'won', 'won'],
      ]),
    );
    expect(hitsText(h)).toBe('1/2');
    expect(h.tone).toBe('some');
    expect(h.misses.map((m) => m.name)).toEqual(['McCain 25 pts']);
  });

  it('all hit = 2/2, no misses', () => {
    const h = dutchHits(
      example([
        ['won', 'won', 'won'],
        ['won', 'won', 'won'],
      ]),
    );
    expect([hitsText(h), h.tone, missesText(h)]).toEqual(['2/2', 'all', '']);
  });

  it('a void split is left out of both numbers', () => {
    const h = dutchHits(
      example([
        ['void', 'pending', 'pending'],
        ['won', 'won', 'won'],
      ]),
    );
    expect([hitsText(h), h.tone]).toEqual(['1/1', 'all']);
    expect(
      dutchHits(
        example([
          ['void', 'pending', 'pending'],
          ['void', 'pending', 'pending'],
        ]),
      ).tone,
    ).toBe('void');
  });

  it('a pending split is left out until settled; grey while any is pending', () => {
    const h = dutchHits(
      example([
        ['won', 'won', 'won'],
        ['lost', 'lost', 'won'],
        ['pending', 'pending', 'pending'],
      ]),
    );
    expect(hitsText(h)).toBe('1/2 · 1 pending');
    expect(h.tone).toBe('pending');
  });

  it('a lost split with no leg results counts as one miss of its own, "leg not set"', () => {
    const h = dutchHits(
      example([
        ['lost', 'pending', 'pending'],
        ['lost', 'lost', 'won'],
      ]),
    );
    expect(h.misses).toEqual([
      { name: 'McCain 25 pts + Celtics W', shared: false, legNotSet: true },
      { name: 'Mitchell 30 pts', shared: false, legNotSet: false },
    ]);
    expect(missesTitle(h)).toContain('McCain 25 pts + Celtics W (leg not set)');
  });

  it('solo splits (a plain dutch): each lost selection is a miss', () => {
    const bets = ['Home', 'Draw', 'Away'].map((s, i) => bet({ dutchId: 'plain', betText: '', result: i === 1 ? 'won' : 'lost', legs: [leg({ selection: s, result: 'pending' })] }));
    const h = dutchHits(bets);
    expect(hitsText(h)).toBe('1/3');
    expect(h.misses.map((m) => m.name)).toEqual(['Home', 'Away']);
  });

  it('split marks: half results and cash-out by profit', () => {
    expect(splitMark(bet({ result: 'half-won' }))).toBe('hit');
    expect(splitMark(bet({ result: 'half-lost' }))).toBe('miss');
    expect(splitMark(bet({ result: 'cash-out', stake: 100, cashout: 120 }))).toBe('hit');
    expect(splitMark(bet({ result: 'cash-out', stake: 100, cashout: 80 }))).toBe('miss');
    expect(splitMark(bet({ result: 'cash-out', stake: 100, cashout: 100 }))).toBe('void');
  });
});

describe('dutchHitReport', () => {
  it('counts settled dutches by all / some / none hit, and the none-hit ones sunk by the shared leg alone', () => {
    const bets = [
      ...example([
        ['won', 'won', 'won'],
        ['won', 'won', 'won'],
      ]), // all
      ...example([
        ['lost', 'lost', 'won'],
        ['won', 'won', 'won'],
      ]), // some
      ...example([
        ['lost', 'won', 'lost'],
        ['lost', 'won', 'lost'],
      ]), // none, shared alone
      ...example([
        ['lost', 'lost', 'lost'],
        ['lost', 'won', 'lost'],
      ]), // none, shared + own
      ...example([
        ['lost', 'pending', 'pending'],
        ['lost', 'pending', 'pending'],
      ]), // none, legs not set
      ...example([
        ['pending', 'pending', 'pending'],
        ['won', 'won', 'won'],
      ]), // pending: left out
      ...example([
        ['void', 'pending', 'pending'],
        ['void', 'pending', 'pending'],
      ]), // all void: left out
      bet(), // not a dutch
    ];
    expect(dutchHitReport(bets)).toEqual({ settled: 5, allHit: 1, someHit: 1, noneHit: 3, sunkByShared: 1 });
  });
});
