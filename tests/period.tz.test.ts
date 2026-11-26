import { describe, expect, it } from 'vitest';
import { todayISO } from '@/lib/dates';
import { periodRange, previousRange } from '@/lib/period';

// local times: the app's day ends at 05:00 (BT-43)
const at = (y: number, m: number, d: number, h: number, min = 0) => todayISO(new Date(y, m - 1, d, h, min));

describe('BT-56 period ranges', () => {
  it('today follows the 05:00 boundary', () => {
    expect(periodRange('today', at(2026, 11, 25, 4, 59))).toEqual({ from: '2026-11-24', to: '2026-11-24' });
    expect(periodRange('today', at(2026, 11, 25, 5, 0))).toEqual({ from: '2026-11-25', to: '2026-11-25' });
  });

  it('7d and 30d include today', () => {
    expect(periodRange('7d', '2026-11-25')).toEqual({ from: '2026-11-19', to: '2026-11-25' });
    expect(periodRange('30d', '2026-03-01')).toEqual({ from: '2026-01-31', to: '2026-03-01' });
  });

  it('month is the calendar month of the app day, ends included', () => {
    // 1 Nov at 04:59 is still 31 Oct
    expect(periodRange('month', at(2026, 11, 1, 4, 59))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('month', at(2026, 11, 1, 5))).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('all has no bounds', () => {
    expect(periodRange('all', '2026-11-25')).toEqual({ from: '', to: '' });
  });
});

describe('BT-63 previous period', () => {
  it('the same length right before', () => {
    expect(previousRange('today', '2026-11-25')).toEqual({ from: '2026-11-24', to: '2026-11-24' });
    expect(previousRange('7d', '2026-11-25')).toEqual({ from: '2026-11-12', to: '2026-11-18' });
    expect(previousRange('30d', '2026-11-25')).toEqual({ from: '2026-09-27', to: '2026-10-26' });
  });

  it('month: the previous calendar month, whatever its length', () => {
    expect(previousRange('month', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(previousRange('month', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    // 1 Dec at 03:00 is still November: the previous month is October
    expect(previousRange('month', at(2026, 12, 1, 3))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('none for all', () => {
    expect(previousRange('all', '2026-11-25')).toBeNull();
  });
});
