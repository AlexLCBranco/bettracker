// Runs in São Paulo, New York and Tokyo (vitest.config.ts): local dates must never shift by a day.
import { describe, expect, it } from 'vitest';
import { addDays, formatDate, isValidISODate, parseDateInput, todayISO } from '@/lib/dates';

describe(`dates in ${process.env.TZ}`, () => {
  it("today is the local calendar date, even late at night (UTC already tomorrow)", () => {
    expect(todayISO(new Date(2026, 10, 22, 23, 30))).toBe('2026-11-22');
    expect(todayISO(new Date(2026, 10, 22, 5, 5))).toBe('2026-11-22');
  });

  it('BT-43: the day ends at 05:00, not midnight', () => {
    expect(todayISO(new Date(2026, 10, 25, 0, 0))).toBe('2026-11-24');
    expect(todayISO(new Date(2026, 10, 25, 4, 59, 59))).toBe('2026-11-24');
    expect(todayISO(new Date(2026, 10, 25, 5, 0))).toBe('2026-11-25');
    // the 1st of a month rolls back to the month before, 1 January to the year before
    expect(todayISO(new Date(2026, 11, 1, 2, 0))).toBe('2026-11-30');
    expect(todayISO(new Date(2026, 2, 1, 4, 30))).toBe('2026-02-28');
    expect(todayISO(new Date(2027, 0, 1, 0, 0))).toBe('2026-12-31');
    expect(todayISO(new Date(2027, 0, 1, 5, 0))).toBe('2027-01-01');
  });

  it('BT-43: typed "t" and "y" follow the app day', () => {
    const today = todayISO(new Date(2026, 10, 25, 1, 30));
    expect(parseDateInput('t', today)).toBe('2026-11-24');
    expect(parseDateInput('y', today)).toBe('2026-11-23');
  });

  it('displays as dd/mm/yyyy without going through Date (no off-by-one)', () => {
    expect(formatDate('2026-11-22')).toBe('22/11/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
    expect(formatDate('bad')).toBe('');
  });

  it('parses typed dates', () => {
    const today = '2026-11-22';
    expect(parseDateInput('22/11/2026', today)).toBe('2026-11-22');
    expect(parseDateInput('1/2/2026', today)).toBe('2026-02-01');
    expect(parseDateInput('22/11', today)).toBe('2026-11-22');
    expect(parseDateInput('22/11/26', today)).toBe('2026-11-22');
    expect(parseDateInput('22-11-2026', today)).toBe('2026-11-22');
    expect(parseDateInput('2026-11-22', today)).toBe('2026-11-22');
    expect(parseDateInput('t', today)).toBe('2026-11-22');
    expect(parseDateInput('y', today)).toBe('2026-11-21');
    expect(parseDateInput('31/02/2026', today)).toBeNull();
    expect(parseDateInput('hello', today)).toBeNull();
  });

  it('validates ISO dates including leap years', () => {
    expect(isValidISODate('2028-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
  });

  it('adds days across month ends and DST changes', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09'); // US DST start
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // US DST end
  });
});
