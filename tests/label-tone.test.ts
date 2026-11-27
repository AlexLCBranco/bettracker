// Label tones (2026-11-27): red (negative) by default, green (positive) when picked, kept per label name.
import { describe, expect, it } from 'vitest';
import { nextTone, readLabelTones, toneOf, withTone } from '@/lib/labelTone';

describe('label tones', () => {
  it('a label is negative (red) until made positive', () => {
    expect(toneOf({}, 'my bad')).toBe('negative');
    expect(toneOf({ 'nailed it': 'positive' }, 'nailed it')).toBe('positive');
  });
  it('the tone belongs to the name: case, accents and spacing do not matter', () => {
    const t = withTone({}, '  Nailed   ít ', 'positive');
    expect(t).toEqual({ 'nailed it': 'positive' });
    expect(toneOf(t, 'NAILED IT')).toBe('positive');
    expect(toneOf(t, 'my bad')).toBe('negative');
  });
  it('making a label negative again drops it; an empty label changes nothing', () => {
    const t = withTone({}, 'nailed it', 'positive');
    expect(withTone(t, 'Nailed it', 'negative')).toEqual({});
    expect(withTone(t, '  ', 'positive')).toBe(t);
  });
  it('neutral is kept too; a chip click goes red → green → grey → red', () => {
    expect(toneOf(withTone({}, 'push', 'neutral'), 'Push')).toBe('neutral');
    expect([nextTone('negative'), nextTone('positive'), nextTone('neutral')]).toEqual(['positive', 'neutral', 'negative']);
  });
  it('a stored map is cleaned', () => {
    expect(readLabelTones({ 'Nailed It': 'positive', P: 'neutral', x: 'negative', '': 'positive', y: 1 })).toEqual({ 'nailed it': 'positive', p: 'neutral' });
    expect(readLabelTones(null)).toEqual({});
    expect(readLabelTones(['positive'])).toEqual({});
  });
});
