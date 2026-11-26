import { describe, expect, it } from 'vitest';
import { groupRows } from '@/lib/dutch';
import { dayGroups, recordText, weekStart, weekTotals } from '@/lib/table';
import { bet } from './helpers';

describe('BT-58 day record', () => {
  it('counts a dutch once, pending shown when any', () => {
    const d = [bet({ dutchId: 'd1', result: 'won', odds: 3, stake: 10 }), bet({ dutchId: 'd1', result: 'lost', stake: 10 })];
    const [day] = dayGroups(groupRows([bet({ result: 'won' }), bet({ result: 'lost' }), bet(), ...d]));
    expect(day!.record).toEqual({ wins: 2, losses: 1, pending: 1 });
    expect(recordText(day!.record)).toBe('2W 1L · 1 pending');
  });

  it('nothing settled or pending: no text; only pending: just that', () => {
    expect(recordText({ wins: 0, losses: 0, pending: 0 })).toBe('');
    expect(recordText({ wins: 0, losses: 0, pending: 3 })).toBe('3 pending');
  });
});

describe('BT-58 weeks (Monday to Sunday)', () => {
  it('weekStart is the Monday', () => {
    expect(weekStart('2026-11-23')).toBe('2026-11-23'); // Mon
    expect(weekStart('2026-11-29')).toBe('2026-11-23'); // Sun
    expect(weekStart('2026-11-22')).toBe('2026-11-16'); // Sun before
    expect(weekStart('2027-01-01')).toBe('2026-12-28'); // across a year
  });

  it('one subtotal after the last day of each week shown, newest first', () => {
    const bets = [
      bet({ placedDate: '2026-11-25', result: 'won', stake: 100, odds: 2 }),
      bet({ placedDate: '2026-11-23', result: 'lost', stake: 30 }),
      bet({ placedDate: '2026-11-22', result: 'won', stake: 10, odds: 3, money: 'hypothetical' }),
      bet({ placedDate: '2026-11-22' }),
    ].sort((a, b) => b.placedDate.localeCompare(a.placedDate));
    const days = dayGroups(groupRows(bets));
    expect(days.map((d) => d.date)).toEqual(['2026-11-25', '2026-11-23', '2026-11-22']);
    const w = weekTotals(days);
    expect([...w.keys()]).toEqual([1, 2]);
    expect(w.get(1)).toMatchObject({ from: '2026-11-23', to: '2026-11-29', count: 2, record: { wins: 1, losses: 1, pending: 0 }, nets: [{ money: 'real', value: 70 }] });
    expect(w.get(2)).toMatchObject({ from: '2026-11-16', to: '2026-11-22', count: 2, record: { wins: 1, losses: 0, pending: 1 }, nets: [{ money: 'hypothetical', value: 20 }] });
  });
});
