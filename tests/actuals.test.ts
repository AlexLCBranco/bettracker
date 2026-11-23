// BT-27: label and actual results, and every losing leg listed.
import { describe, expect, it } from 'vitest';
import { distinctLegs, inferLegResult, knownLegResults, losingLegs, lossText, parseSoloLine, planActuals, sharedLabel, soloLine } from '@/lib/actuals';
import { settleDutchRow } from '@/lib/settle';
import { validateBet } from '@/lib/validate';
import { toCSV } from '@/lib/transfer';
import { bet, leg } from './helpers';
import type { Bet } from '@/lib/types';

const combo = (over: Partial<Bet>, legs: Parameters<typeof leg>[0][]) => bet({ type: 'combination', ...over, legs: legs.map((l) => leg(l)) });

describe('solo one-line editor', () => {
  it('plain text is the actual, text after # the label', () => {
    expect(parseSoloLine('24 pts #lost by one')).toEqual({ actual: '24 pts', label: 'lost by one' });
    expect(parseSoloLine('24 pts')).toEqual({ actual: '24 pts', label: '' });
    expect(parseSoloLine('#bad beat')).toEqual({ actual: '', label: 'bad beat' });
    expect(soloLine(bet({ label: 'lost by one', legs: [leg({ actual: '24 pts' })] }))).toBe('24 pts #lost by one');
  });
});

describe('leg result from a stat line', () => {
  it('N+, over, under; a score or no number tells nothing', () => {
    expect(inferLegResult('Jokic 12+ ass', '11')).toBe('lost');
    expect(inferLegResult('Jokic 12+ ass', '12 ass')).toBe('won');
    expect(inferLegResult('McCain over 24.5 pts', '24')).toBe('lost');
    expect(inferLegResult('McCain under 24.5 pts', '24')).toBe('won');
    expect(inferLegResult('Celtics ML', '111-112')).toBeNull();
    expect(inferLegResult('Over 2.5 goals', '2-1')).toBeNull();
    expect(inferLegResult('Jokic 12+ ass', 'injured')).toBeNull();
  });
});

describe('losing legs (the "lost by" bugs seen on the live site)', () => {
  it('names the selection only, never the market glued on', () => {
    const b = combo({ result: 'lost' }, [{ selection: 'Celtics ML', market: 'ML / pts / ASS', result: 'lost' }, { selection: 'Jokic 12+ ass', result: 'won' }]);
    expect(lossText(losingLegs(b))).toBe('✗ Celtics ML');
  });

  it('lists every losing leg, each with its actual', () => {
    const b = combo({ result: 'lost' }, [
      { selection: 'Jokic 12+ ass', result: 'lost', actual: '11' },
      { selection: 'Celtics ML', result: 'lost', actual: '111-112' },
      { selection: 'Lakers ML', result: 'won' },
    ]);
    expect(lossText(losingLegs(b))).toBe('✗ Jokic 12+ ass 11 · ✗ Celtics ML 111-112');
  });

  it('a lost split whose legs were left pending: the shared leg that won on another split, so its own leg lost', () => {
    const d = [
      combo({ id: 's1', dutchId: 'd', result: 'won' }, [{ selection: 'Mitchell 30 pts' }, { selection: 'Celtics ML' }]),
      combo({ id: 's2', dutchId: 'd', result: 'lost' }, [{ selection: 'Garland 20 pts' }, { selection: 'Celtics ML' }]),
    ];
    expect(knownLegResults(d[1]!, d)).toEqual(['lost', 'won']);
    expect(lossText(losingLegs(d[1]!, d))).toBe('✗ Garland 20 pts');
  });

  it('a leg marked lost on one split counts on the other splits that have it', () => {
    const d = [
      combo({ id: 's1', dutchId: 'd', result: 'lost' }, [{ selection: 'A 10+ pts', actual: '9' }, { selection: 'Celtics ML', result: 'lost' }]),
      combo({ id: 's2', dutchId: 'd', result: 'lost' }, [{ selection: 'B 5+ reb' }, { selection: 'Celtics ML' }]),
    ];
    expect(lossText(losingLegs(d[0]!, d))).toBe('✗ A 10+ pts 9 · ✗ Celtics ML');
    expect(lossText(losingLegs(d[1]!, d))).toBe('✗ Celtics ML');
  });
});

describe('settling fills in the legs it can', () => {
  it('a dutch settled with one winner marks the lost split’s own leg lost when the shared leg won', () => {
    const d = [
      combo({ dutchId: 'd' }, [{ selection: 'Mitchell 30 pts' }, { selection: 'Celtics ML' }]),
      combo({ dutchId: 'd' }, [{ selection: 'Garland 20 pts' }, { selection: 'Celtics ML' }]),
    ];
    const step = settleDutchRow('d', d, [0])!;
    expect(step.changes[1]!.legs!.map((l) => l.result)).toEqual(['lost', 'won']);
  });
});

describe('saving the editor', () => {
  it('a shared leg typed once fills the same leg on the other splits; a label on the dutch row goes to every split', () => {
    const d = [
      combo({ id: 's1', dutchId: 'd', result: 'lost' }, [{ selection: 'Jokic 12+ ass' }, { selection: 'Celtics ML', game: 'Celtics vs Knicks' }]),
      combo({ id: 's2', dutchId: 'd', result: 'lost' }, [{ selection: 'Mitchell 30 pts' }, { selection: 'celtics ml', game: 'Celtics vs Knicks' }]),
    ];
    const plan = planActuals(d, { labelFor: ['s1', 's2'], label: 'lost by one', legs: [{ betId: 's1', index: 1, actual: '111-112', result: 'lost' }] });
    expect(plan.map((p) => p.id)).toEqual(['s1', 's2']);
    for (const p of plan) {
      expect(p.patch.label).toBe('lost by one');
      expect(p.patch.legs![1]).toMatchObject({ actual: '111-112', result: 'lost' });
    }
  });

  it('an actual that settles a stat line sets the leg result; nothing changed = no patch', () => {
    const b = combo({ id: 'c', result: 'lost' }, [{ selection: 'Jokic 12+ ass' }, { selection: 'Celtics ML', result: 'won' }]);
    const [p] = planActuals([b], { legs: [{ betId: 'c', index: 0, actual: '11' }] });
    expect(p!.patch.legs![0]).toMatchObject({ actual: '11', result: 'lost' });
    const settled = combo({ id: 'k', result: 'lost' }, [{ selection: 'A', result: 'lost' }, { selection: 'B', result: 'won' }]);
    expect(planActuals([settled], { labelFor: ['k'], label: '' })).toEqual([]);
  });

  it('distinct legs of a dutch: a shared leg once', () => {
    const d = [
      combo({ id: 's1' }, [{ selection: 'A' }, { selection: 'Celtics ML' }]),
      combo({ id: 's2' }, [{ selection: 'B' }, { selection: 'Celtics ML' }]),
    ];
    expect(distinctLegs(d).map((x) => x.leg.selection)).toEqual(['A', 'Celtics ML', 'B']);
  });

  it('sharedLabel: the label when every split has it', () => {
    expect(sharedLabel([bet({ label: 'Bad beat' }), bet({ label: 'bad beat' })])).toBe('Bad beat');
    expect(sharedLabel([bet({ label: 'Bad beat' }), bet({ label: '' })])).toBe('');
  });
});

describe('data', () => {
  it('validate keeps label and leg actuals; old bets without them get empty values', () => {
    const v = validateBet({ stake: 10, odds: 2, result: 'lost', placedDate: '2026-11-23', label: '  lost  by one ', legs: [{ selection: 'x', actual: ' 24 pts ' }] });
    expect(v.ok && v.value.label).toBe('lost by one');
    expect(v.ok && v.value.legs[0]!.actual).toBe('24 pts');
    const old = validateBet({ stake: 10, odds: 2, result: 'lost', placedDate: '2026-11-23', legs: [{ selection: 'x' }] });
    expect(old.ok && [old.value.label, old.value.legs[0]!.actual]).toEqual(['', '']);
  });

  it('CSV has label and actual columns', () => {
    const csv = toCSV([combo({ label: 'Bad beat', result: 'lost' }, [{ actual: '11' }, { actual: '111-112' }])]);
    expect(csv.split('\r\n')[1]!.endsWith(',Bad beat,11 | 111-112,,0')).toBe(true);
  });
});
