// BT-59: a line shows the keys that work on the selected row; each hint is a button doing the same thing.
import { betsTagged, createBet, expect, test } from './helpers';

test('BT-59: key hints follow the selection, a hint click settles, hidden with several rows selected', async ({ page, request, tag }) => {
  const pending = await createBet(request, { betText: `${tag} pending` });
  const d = `${tag}-d`.replace(/[^A-Za-z0-9_-]/g, '');
  await createBet(request, { betText: '', dutchId: d, legs: [{ selection: `${tag} Home`, odds: 2 }] });
  await createBet(request, { betText: '', dutchId: d, legs: [{ selection: `${tag} Away`, odds: 2 }] });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const hints = page.getByTestId('key-hints');
  const box = await hints.boundingBox();
  await expect(page.getByTestId('key-hint')).toHaveCount(0);

  // a pending bet
  await page.locator(`[data-bet-id="${pending.id}"]`).getByTestId('bet-text').click();
  await expect(hints).toContainText('Wwon');
  await expect(hints).toContainText('Hhalf-won');
  await expect(hints).toContainText('Xno brainer');
  // the line keeps its place and height
  expect(await hints.boundingBox()).toEqual(box);

  // a dutch
  await page.locator(`[data-dutch-id="${d}"]`).getByTestId('bet-text').first().click();
  await expect(hints).toContainText('1-9toggle');
  await expect(hints).toContainText('Shared leg', { ignoreCase: true });
  await expect(hints).not.toContainText('half-won');

  // a click on a hint does what the key does
  await page.locator(`[data-bet-id="${pending.id}"]`).getByTestId('bet-text').click();
  await hints.getByRole('button', { name: /won/ }).first().click();
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === pending.id)?.result).toBe('won');
  // the selection moves on to the next row, as after a key; the won bet now offers B bank
  await expect(hints).toContainText('1-9toggle');
  await page.locator(`[data-bet-id="${pending.id}"]`).getByTestId('bet-text').click();
  await expect(hints).toContainText('Bbank');

  // several rows selected: the line is empty
  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('bulk-bar')).toBeVisible();
  await expect(page.getByTestId('key-hint')).toHaveCount(0);
});
