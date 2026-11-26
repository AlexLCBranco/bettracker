import { describe, expect, it } from 'vitest';
import { breakdown, isSmallSample, SMALL_SAMPLE } from '@/lib/analytics';
import { bet } from './helpers';

describe('BT-65 small samples', () => {
  it('fewer than 10 settled (won + lost) is small; 10 is not', () => {
    expect(SMALL_SAMPLE).toBe(10);
    expect(isSmallSample({ wins: 5, losses: 4 })).toBe(true);
    expect(isSmallSample({ wins: 5, losses: 5 })).toBe(false);
  });

  it('pending, void and half results do not make a sample bigger; a dutch counts once', () => {
    const settled = Array.from({ length: 9 }, (_, i) => bet({ book: 'A', result: i % 2 ? 'won' : 'lost' }));
    const extra = [bet({ book: 'A' }), bet({ book: 'A', result: 'void' }), bet({ book: 'A', result: 'half-won' })];
    const [nine] = breakdown([...settled, ...extra], 'book');
    expect(isSmallSample(nine!)).toBe(true);
    // a won dutch of two bets adds one settled bet: 10
    const [ten] = breakdown([...settled, bet({ book: 'A', dutchId: 'd', result: 'won', odds: 3 }), bet({ book: 'A', dutchId: 'd', result: 'lost' })], 'book');
    expect(ten!.wins + ten!.losses).toBe(10);
    expect(isSmallSample(ten!)).toBe(false);
  });
});
