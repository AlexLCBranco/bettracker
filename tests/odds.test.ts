import { describe, expect, it } from 'vitest';
import { parseOdds, type OddsFormat } from '@/lib/money';

const dec = (text: string, format?: OddsFormat) => parseOdds(text, format)?.decimal ?? null;

describe('parseOdds: Auto', () => {
  it('fractional when it contains "/"', () => {
    expect(dec('5/2')).toBe(3.5);
    expect(dec('1/2')).toBe(1.5);
    expect(parseOdds('5/2')?.label).toBe('Fractional');
  });

  it('implied probability when it ends with "%" (above 0, below 100)', () => {
    expect(dec('40%')).toBe(2.5);
    expect(dec('40,5%')).toBeCloseTo(100 / 40.5);
    expect(parseOdds('40%')?.label).toBe('Probability %');
  });

  it('American with a sign and 100 or more', () => {
    expect(dec('+220')).toBeCloseTo(3.2);
    expect(dec('-150')).toBeCloseTo(1 + 100 / 150);
    expect(parseOdds('-150')?.label).toBe('American');
  });

  it('Indonesian / Malay with a sign and below 100', () => {
    expect(dec('+1.50')).toBeCloseTo(2.5);
    expect(dec('-1.25')).toBeCloseTo(1.8);
    expect(dec('-0.80')).toBeCloseTo(2.25);
    expect(dec('-0,80')).toBeCloseTo(2.25);
    expect(parseOdds('-0.80')?.label).toBe('Indonesian / Malay');
  });

  it('Hong Kong / Malay positive without a sign, above 0 up to 1', () => {
    expect(dec('0.85')).toBeCloseTo(1.85);
    expect(dec('0,85')).toBeCloseTo(1.85);
    expect(parseOdds('0.85')?.label).toBe('Hong Kong / Malay');
  });

  it('decimal without a sign above 1, as before; comma or dot', () => {
    expect(parseOdds('2.10')).toEqual({ decimal: 2.1, label: 'Decimal', plain: true });
    expect(dec('1,3')).toBeCloseTo(1.3);
    expect(dec('220')).toBe(220); // stays decimal 220 on Auto
  });

  it('boundaries', () => {
    expect(dec('+100')).toBe(2); // American
    expect(dec('-100')).toBe(2); // American
    expect(dec('+99')).toBe(100); // Indonesian / Malay
    expect(parseOdds('+99')?.label).toBe('Indonesian / Malay');
    expect(dec('1')).toBe(2); // Hong Kong 1 = evens
    expect(parseOdds('1')?.label).toBe('Hong Kong / Malay');
    expect(dec('100%')).toBeNull(); // converts to 1
    expect(dec('0%')).toBeNull();
    expect(dec('5/0')).toBeNull();
  });

  it('unreadable or 1 or less is null', () => {
    for (const t of ['', ' ', 'abc', '2..1', '+', '-', '0', '+0', '-0', '1/2/3', '0/5', '%', '2,1,0', '1.2.3']) expect(dec(t), t).toBeNull();
  });

  it('marks only plain decimal text as plain', () => {
    expect(parseOdds('2,5')?.plain).toBe(true);
    expect(parseOdds('+220')?.plain).toBe(false);
    expect(parseOdds('0.85')?.plain).toBe(false);
  });
});

describe('parseOdds: picked format', () => {
  it('Decimal', () => {
    expect(dec('2,5', 'decimal')).toBe(2.5);
    expect(dec('+2', 'decimal')).toBeNull();
    expect(dec('1', 'decimal')).toBeNull();
    expect(dec('5/2', 'decimal')).toBeNull();
  });

  it('American: the sign is optional (220 = +220)', () => {
    expect(dec('220', 'american')).toBeCloseTo(3.2);
    expect(dec('+220', 'american')).toBeCloseTo(3.2);
    expect(dec('-150', 'american')).toBeCloseTo(1 + 100 / 150);
    expect(dec('0', 'american')).toBeNull();
  });

  it('Fractional, with a plain number read as x/1', () => {
    expect(dec('5/2', 'fractional')).toBe(3.5);
    expect(dec('2', 'fractional')).toBe(3);
    expect(dec('5/0', 'fractional')).toBeNull();
  });

  it('Hong Kong reads values above 1 too (2.20 = decimal 3.20, which Auto reads as decimal)', () => {
    expect(dec('2.20', 'hongkong')).toBeCloseTo(3.2);
    expect(dec('2.20')).toBeCloseTo(2.2);
    expect(dec('0,85', 'hongkong')).toBeCloseTo(1.85);
    expect(dec('-0.85', 'hongkong')).toBeNull();
  });

  it('Indonesian and Malay: sign optional (positive by default)', () => {
    expect(dec('1.50', 'indonesian')).toBeCloseTo(2.5);
    expect(dec('-1.25', 'indonesian')).toBeCloseTo(1.8);
    expect(dec('0.85', 'malay')).toBeCloseTo(1.85);
    expect(dec('-0.80', 'malay')).toBeCloseTo(2.25);
    expect(parseOdds('-0.80', 'malay')?.label).toBe('Malay');
  });

  it('Probability: the % is optional (40 = 40%)', () => {
    expect(dec('40', 'probability')).toBe(2.5);
    expect(dec('40%', 'probability')).toBe(2.5);
    expect(dec('100', 'probability')).toBeNull();
    expect(dec('0', 'probability')).toBeNull();
  });
});
