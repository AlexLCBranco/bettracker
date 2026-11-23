// BT-23: day headers and game dates in words, by local calendar (São Paulo, New York, Tokyo).
import { describe, expect, it } from 'vitest';
import { formatDayHeader, formatDayMonth } from '@/lib/dates';

describe(`day headers in ${process.env.TZ}`, () => {
  it('"Sun, 22 Nov": the weekday never shifts by a day', () => {
    expect(formatDayHeader('2026-11-22', '2026-11-23')).toBe('Sun, 22 Nov');
    expect(formatDayHeader('2026-01-01', '2026-11-23')).toBe('Thu, 1 Jan');
    expect(formatDayHeader('2026-12-31', '2026-11-23')).toBe('Thu, 31 Dec');
  });
  it('the year only when it is not this year', () => {
    expect(formatDayHeader('2000-01-02', '2026-11-23')).toBe('Sun, 2 Jan 2000');
    expect(formatDayMonth('2026-11-23', '2026-11-23')).toBe('23 Nov');
    expect(formatDayMonth('2000-01-02', '2026-11-23')).toBe('2 Jan 2000');
    expect(formatDayMonth('bad', '2026-11-23')).toBe('');
  });
});
