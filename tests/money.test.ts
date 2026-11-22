import { describe, expect, it } from 'vitest';
import { formatBRL, formatOdds, parseNumber, potentialReturn, profitOf } from '@/lib/money';

describe('profit for every result type', () => {
  it('won = stake * (odds - 1)', () => expect(profitOf(150, 2.1, 'won', null)).toBe(165));
  it('lost = -stake', () => expect(profitOf(150, 2.1, 'lost', null)).toBe(-150));
  it('void = 0', () => expect(profitOf(150, 2.1, 'void', null)).toBe(0));
  it('pending = 0', () => expect(profitOf(150, 2.1, 'pending', null)).toBe(0));
  it('cash-out = amount - stake (gain)', () => expect(profitOf(100, 3, 'cash-out', 140)).toBe(40));
  it('cash-out = amount - stake (loss)', () => expect(profitOf(100, 3, 'cash-out', 60)).toBe(-40));
  it('half-won = (stake / 2) * (odds - 1)', () => expect(profitOf(100, 1.9, 'half-won', null)).toBe(45));
  it('half-lost = -stake / 2', () => expect(profitOf(100, 1.9, 'half-lost', null)).toBe(-50));
  it('rounds to cents, no float noise', () => expect(profitOf(10, 1.1, 'won', null)).toBe(1));
});

describe('money helpers', () => {
  it('potential return = stake * odds', () => {
    expect(potentialReturn(150, 2.1)).toBe(315);
    expect(potentialReturn(0, 2)).toBe(0);
  });
  it('formats BRL', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(-10)).toBe('-R$ 10,00');
    expect(formatBRL(10, true)).toBe('+R$ 10,00');
    expect(formatBRL(0, true)).toBe('R$ 0,00');
  });
  it('formats odds with two decimals', () => {
    expect(formatOdds(2.1)).toBe('2.10');
    expect(formatOdds(null)).toBe('');
  });
  it('parses comma and dot decimals', () => {
    expect(parseNumber('2,10')).toBe(2.1);
    expect(parseNumber('2.10')).toBe(2.1);
    expect(parseNumber('R$ 150')).toBe(150);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});
