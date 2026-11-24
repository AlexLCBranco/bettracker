// BT-48: the day header's NBA Slate and football links.
import { describe, expect, it } from 'vitest';
import { footballDayUrl, nbaSlateUrl } from '@/lib/dayLinks';

describe('day links', () => {
  it('calendarkit NBA Slate for the day', () => {
    expect(nbaSlateUrl('2026-11-24')).toBe('https://gauntlet-home.vercel.app/calendar?view=league&layout=slate&on=2026-11-24');
  });
  it('footykit day view for the day', () => {
    expect(footballDayUrl('2027-01-01')).toBe('https://gauntlet-home.vercel.app/football?date=2027-01-01');
  });
});
