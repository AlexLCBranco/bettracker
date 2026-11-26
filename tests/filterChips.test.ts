import { describe, expect, it } from 'vitest';
import { filterChips, withoutChip } from '@/lib/filterChips';
import { NO_FILTERS } from '@/lib/filters';

describe('BT-57 filter chips', () => {
  it('none when nothing is filtered; search is never a chip', () => {
    expect(filterChips({ ...NO_FILTERS, text: 'lakers' }, { from: '', to: '' }, null)).toEqual([]);
  });

  it('one chip per filter in use, in the panel order, game last', () => {
    const f = { ...NO_FILTERS, book: ' bet365 ', sport: 'NBA', type: 'dutch' as const, situation: 'live' as const, result: 'half-won' as const };
    expect(filterChips(f, { from: '01/11', to: '' }, 'Lakers @ Celtics').map((c) => c.label)).toEqual([
      'From: 01/11',
      'Book: bet365',
      'Sport: NBA',
      'Type: Dutch',
      'Situation: Live',
      'Result: Half-won',
      'Game: Lakers @ Celtics',
    ]);
  });

  it('× clears only its own filter', () => {
    const f = { ...NO_FILTERS, book: 'x', result: 'won' as const };
    expect(withoutChip(f, 'book')).toEqual({ ...NO_FILTERS, result: 'won' });
    expect(withoutChip(f, 'game')).toBe(f);
  });
});
