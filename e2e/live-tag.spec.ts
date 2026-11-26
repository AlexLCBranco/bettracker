// The LIVE tag switches a bet to pregame with a click; Ctrl+Z puts it back.
import { betsTagged, createBet, expect, saved, test } from './helpers';

test('live tag: a click switches the bet to pregame, Ctrl+Z makes it live again', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} lakers ml`, situation: 'live', legs: [{ selection: `${tag} lakers ml`, odds: 2 }] });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  const liveTag = row.getByRole('button', { name: 'Switch to pregame' });
  await expect(liveTag).toHaveText('LIVE');

  await liveTag.click();
  await expect(row.getByTestId('live-tag')).toHaveCount(0);
  await saved(page);
  expect((await betsTagged(request, tag))[0]!.situation).toBe('pregame');

  await page.getByLabel('Search bets').blur();
  await page.keyboard.press('Control+z');
  await expect(row.getByTestId('live-tag')).toBeVisible();
  await saved(page);
  expect((await betsTagged(request, tag))[0]!.situation).toBe('live');
});
