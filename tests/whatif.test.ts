// BT-49: "what if" on a banked shot. Owner's example: banked @ 1.55, a mini @ 1.20 → final 1.86 (Shot).
import { describe, expect, it } from 'vitest';
import { oddsFromText } from '@/lib/money';
import { bankedItems, splitOddsList, whatIf, whatIfLines } from '@/lib/rollover';
import { bet } from './helpers';

// R$ 100 @ 1.55 won and banked: R$ 155 waiting for its next leg
const shot = { odds: 1.55, banked: 155, stake: 100 };

describe('what if', () => {
  it("owner's example: 1.55 banked × 1.20 = 1.86 Shot, pays 186, +86 on the first stake", () => {
    const r = whatIf(shot, 1.2);
    expect(r.odds).toBeCloseTo(1.86, 10);
    expect(r.tier).toBe('Shot');
    expect(r.payout).toBe(186);
    expect(r.profit).toBe(86);
  });

  it('reads US odds: -500 is 1.20, +120 is 2.20', () => {
    expect(whatIf(shot, oddsFromText('-500')!).tier).toBe('Shot');
    expect(whatIf(shot, oddsFromText('-500')!).payout).toBe(186);
    expect(whatIf(shot, oddsFromText('+120')!).payout).toBe(341);
  });

  it('rounds money to cents and judges the tier at 2 decimals, as shown', () => {
    // 1.55 × 1.16 = 1.798 → shown 1.80 → Shot; 155 × 1.16 = 179.80
    const a = whatIf(shot, 1.16);
    expect(a.tier).toBe('Shot');
    expect(a.payout).toBe(179.8);
    expect(a.profit).toBe(79.8);
    // 1.55 × 1.15 = 1.7825 → 1.78 → Pepsi
    expect(whatIf(shot, 1.15).tier).toBe('Pepsi');
    expect(whatIf({ odds: 1.234, banked: 123.4, stake: 100 }, 1.111).payout).toBe(137.1);
  });

  it('splits several odds by ";" and new lines, keeping decimal commas', () => {
    expect(splitOddsList('1,15; 1,2; 1,3')).toEqual(['1,15', '1,2', '1,3']);
    expect(splitOddsList('1.15\n1.2\r\n-500')).toEqual(['1.15', '1.2', '-500']);
    expect(splitOddsList('1.15, 1.2,1.3')).toEqual(['1.15', '1.2', '1.3']);
    expect(splitOddsList('1,2')).toEqual(['1,2']);
    expect(splitOddsList('  ;  \n')).toEqual([]);
  });

  it('one line per entry; an unreadable one says so (null)', () => {
    const lines = whatIfLines('1,2; abc; -500', shot, oddsFromText);
    expect(lines.map((l) => l.text)).toEqual(['1,2', 'abc', '-500']);
    expect(lines[0]!.result!.payout).toBe(186);
    expect(lines[1]!.result).toBeNull();
    expect(lines[2]!.result!.next).toBe(1.2);
  });

  it('the Banked list knows each shot\'s first stake and unit size', () => {
    const b = bet({ rolloverId: 'r1', stake: 100, odds: 1.55, result: 'won', banked: true, unitSize: 50 });
    const [it] = bankedItems([b]);
    expect(it).toMatchObject({ amount: 155, stake: 100, unitSize: 50 });
    expect(whatIf({ odds: it!.odds, banked: it!.amount, stake: it!.stake }, 1.2).profit).toBe(86);
  });
});
