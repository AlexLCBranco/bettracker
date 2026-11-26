// BT-56: the period switch (Today / 7d / 30d / Month / All) shared by the Bets page and Analytics (BT-63). Periods
// are ranges of the app's days (a day ends at 05:00, BT-43: `todayISO`), as local "YYYY-MM-DD" strings.

import { addDays } from './dates';

export const PERIODS = ['today', '7d', '30d', 'month', 'all'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period | 'custom', string> = { today: 'Today', '7d': '7d', '30d': '30d', month: 'Month', all: 'All', custom: 'Custom' };
export const PERIOD_TITLE: Record<Period, string> = {
  today: "Today's bets (the day ends at 05:00)",
  '7d': 'The last 7 days, today included',
  '30d': 'The last 30 days, today included',
  month: 'This calendar month',
  all: 'Every bet',
};
/** The owner's choice (2026-11-26): All until another period is picked. */
export const DEFAULT_PERIOD: Period = 'all';

export const isPeriod = (v: unknown): v is Period => PERIODS.includes(v as Period);

export interface DateRange {
  /** "YYYY-MM-DD", or "" for no bound. */
  from: string;
  to: string;
}

const lastOfMonth = (iso: string) => addDays(`${nextMonth(iso)}-01`, -1);
const nextMonth = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/** The dates a period covers, `today` being the app's today. */
export function periodRange(p: Period, today: string): DateRange {
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: lastOfMonth(today) };
    case 'all':
      return { from: '', to: '' };
  }
}

/**
 * BT-63: the same-length period right before (7d: the 7 days before; Month: the previous calendar month). Null for
 * All, which has nothing before it.
 */
export function previousRange(p: Period, today: string): DateRange | null {
  if (p === 'all') return null;
  if (p === 'month') {
    const prevLast = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: `${prevLast.slice(0, 7)}-01`, to: prevLast };
  }
  const days = p === 'today' ? 1 : p === '7d' ? 7 : 30;
  const { from } = periodRange(p, today);
  return { from: addDays(from, -days), to: addDays(from, -1) };
}
