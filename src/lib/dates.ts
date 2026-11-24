// Local calendar dates as "YYYY-MM-DD". Never goes through UTC: the prototype's
// new Date("2026-11-22") parsed as UTC midnight and showed the previous day west of Greenwich.

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * BT-43: the app's day starts at 05:00, not midnight: late NBA games run past midnight in Brazil, so a bet logged or
 * settled at 01:30 belongs to the day before.
 */
export const DAY_START_HOUR = 5;

/**
 * The app's "today": the local calendar date, still the day before until DAY_START_HOUR (04:59 on the 25th is the
 * 24th; 05:00 is the 25th). The single source of "today" everywhere (default dates, Today / Yesterday, "t" / "y").
 */
export function todayISO(now: Date = new Date()): string {
  const d = now.getHours() < DAY_START_HOUR ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12) : now;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function isValidISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

function daysInMonth(y: number, m: number) {
  return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
}

/** "2026-11-22" → "22/11/2026" (string work only). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** "2026-11-22" → "22/11" for chart ticks. */
export function formatShortDate(iso: string): string {
  return formatDate(iso).slice(0, 5);
}

/**
 * Parses what a person types into a date field: "22/11/2026", "22/11/26", "22/11" (this year), "22-11-2026",
 * "2026-11-22", "t"/"today", "y"/"yesterday". Returns "YYYY-MM-DD" or null.
 */
export function parseDateInput(input: string, today: string = todayISO()): string | null {
  const s = input.trim().toLowerCase();
  if (s === 't' || s === 'today') return today;
  if (s === 'y' || s === 'yesterday') return addDays(today, -1);
  if (s === 'tm' || s === 'tomorrow') return addDays(today, 1);
  if (isValidISODate(s)) return s;
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(s);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (m[3] && m[3].length === 2) y += 2000;
  const iso = `${y}-${pad(mo)}-${pad(d)}`;
  return isValidISODate(iso) ? iso : null;
}

/** Adds days to a local date, by calendar arithmetic (no time zones involved). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + days, 12); // local noon: immune to DST jumps
  return todayISO(dt);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-11-23" → "23 Nov"; the year added when it is not this year ("2 Jan 2000"). BT-23. */
export function formatDayMonth(iso: string, today: string = todayISO()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const s = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
  return m[1] === today.slice(0, 4) ? s : `${s} ${m[1]}`;
}

/** A day header: "Sun, 22 Nov" (year when not this year). The weekday by local calendar arithmetic. BT-23. */
export function formatDayHeader(iso: string, today: string = todayISO()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getDay();
  return `${WEEKDAYS[day]}, ${formatDayMonth(iso, today)}`;
}
