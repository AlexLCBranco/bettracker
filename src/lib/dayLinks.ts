// BT-48: a day of the Bets table opened in the owner's other apps, both served under gauntlet-home (their vercel.json
// rewrites): calendarkit's NBA Slate and footykit's games of that day. The two base addresses live here only.

export const CALENDARKIT_URL = 'https://gauntlet-home.vercel.app/calendar';
export const FOOTYKIT_URL = 'https://gauntlet-home.vercel.app/football';

/** calendarkit's NBA Slate for a day ("YYYY-MM-DD", the NBA / US Eastern date): its `dayLinkUrl` format. */
export const nbaSlateUrl = (iso: string) => `${CALENDARKIT_URL}?view=league&layout=slate&on=${iso}`;

/** footykit's default day view for a day. */
export const footballDayUrl = (iso: string) => `${FOOTYKIT_URL}?date=${iso}`;
