// BT-13: one tone per result, the same everywhere.
import { describe, expect, it } from 'vitest';
import { betTone, groupTone, losingLegs, resultTone, TONE_SIGN } from '@/lib/tone';
import { bet, leg } from './helpers';

describe('tones', () => {
  it('green won, red lost, amber half, grey pending and void', () => {
    expect(resultTone('won')).toBe('win');
    expect(resultTone('lost')).toBe('loss');
    expect(resultTone('half-won')).toBe('partial');
    expect(resultTone('half-lost')).toBe('partial');
    expect(resultTone('pending')).toBe('pending');
    expect(resultTone('void')).toBe('neutral');
  });
  it('a cash-out by the sign of its profit', () => {
    expect(betTone(bet({ stake: 10, result: 'cash-out', cashout: 15 }))).toBe('win');
    expect(betTone(bet({ stake: 10, result: 'cash-out', cashout: 4 }))).toBe('loss');
    expect(betTone(bet({ stake: 10, result: 'cash-out', cashout: 10 }))).toBe('neutral');
  });
  it('a dutch by its net outcome', () => {
    expect(groupTone('won')).toBe('win');
    expect(groupTone('lost')).toBe('loss');
    expect(groupTone('even')).toBe('neutral');
    expect(groupTone('pending')).toBe('pending');
  });
  it('every tone has a sign, so it reads without colour', () => {
    expect(TONE_SIGN).toEqual({ win: '✓', loss: '✕', partial: '½', neutral: '–', pending: '…' });
  });
  it('the leg that killed a combination', () => {
    const b = bet({ type: 'combination', result: 'lost', legs: [leg({ selection: 'Lakers', result: 'won' }), leg({ selection: 'Celtics', result: 'lost' })] });
    expect(losingLegs(b)).toEqual(['Celtics']);
    expect(losingLegs(bet({ type: 'solo', result: 'lost' }))).toEqual([]);
  });
});
