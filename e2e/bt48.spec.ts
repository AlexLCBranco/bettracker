// BT-48: each day header links to that day's NBA Slate (calendarkit) and football day (footykit). No test opens them.
import { createBet, expect, test } from './helpers';

test('day header: NBA and Football marks with the day in their address', async ({ page, request, tag }) => {
  await createBet(request, { placedDate: '2000-01-02', gameDate: '2000-01-02', betText: `${tag} x`, legs: [{ selection: `${tag} x`, odds: 2 }] });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const header = page.locator('[data-testid=day-header][data-date="2000-01-02"]');
  const heightBefore = (await header.boundingBox())!.height;
  const nba = header.getByTestId('day-link-nba');
  const football = header.getByTestId('day-link-football');
  await expect(nba).toHaveAttribute('href', 'https://gauntlet-home.vercel.app/calendar?view=league&layout=slate&on=2000-01-02');
  await expect(football).toHaveAttribute('href', 'https://gauntlet-home.vercel.app/football?date=2000-01-02');
  for (const a of [nba, football]) {
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  }
  await expect(nba).toHaveAttribute('title', 'NBA Slate, 02/01');
  expect(heightBefore).toBeLessThan(40);
});
