import { describe, expect, it } from 'vitest';
import { keyHints, type KeyHint } from '@/lib/keyHints';
import { bet } from './helpers';

const line = (g: KeyHint[][]) => g.map((x) => x.map((k) => `${k.keys} ${k.label}`).join(' ')).join(' · ');

describe('BT-59 key hints', () => {
  it('nothing selected: none', () => {
    expect(keyHints(null, [])).toEqual([]);
  });

  it('a pending bet', () => {
    const b = bet();
    expect(line(keyHints(`bet:${b.id}`, [b]))).toBe('W won L lost V void C cash-out · H half-won J half-lost · T label D description X no brainer');
  });

  it('a won bet can be banked; a bonus one cannot', () => {
    const b = bet({ result: 'won' });
    expect(line(keyHints(`bet:${b.id}`, [b]))).toBe('B bank · T label D description X no brainer');
    const bonus = bet({ result: 'won', money: 'bonus' });
    expect(line(keyHints(`bet:${bonus.id}`, [bonus]))).toBe('T label D description X no brainer');
  });

  it('a cash-out: woulda won / lost', () => {
    const b = bet({ result: 'cash-out', cashout: 50 });
    expect(line(keyHints(`bet:${b.id}`, [b]))).toMatch(/^W woulda won L woulda lost · /);
  });

  it('a pending dutch: 1-9 is shown but not pressable', () => {
    const d = [bet({ dutchId: 'd' }), bet({ dutchId: 'd' })];
    const g = keyHints('dutch:d', d);
    expect(line(g)).toBe('1-9 toggle Enter confirm 0 none V void S shared leg · T label D description X no brainer');
    expect(g[0]![0]!.press).toBeUndefined();
    expect(g[0]![1]!.press).toBe('Enter');
  });

  it('an open shot: add leg, what if, close', () => {
    const shot = [bet({ result: 'won', rolloverId: 'r', banked: true })];
    expect(line(keyHints('rollover:r', shot))).toBe('A add leg I what if B close · T label D description X no brainer');
  });

  it('a shot with a bet in play: settle keys', () => {
    const shot = [bet({ result: 'won', rolloverId: 'r', banked: true, placedDate: '2026-11-19' }), bet({ rolloverId: 'r', stake: 200 })];
    expect(line(keyHints('rollover:r', shot))).toMatch(/^W won L lost V void C cash-out · T/);
  });
});
