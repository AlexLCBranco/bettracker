// BT-44: the "no brainer" mark, toggled from the row and with X.
import { betsTagged, createBet, expect, saved, test } from './helpers';

test('no brainer: toggle from the row, tinted cell and chip, kept after a reload, X turns it off', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} jokic 10+ reb`, legs: [{ selection: `${tag} jokic 10+ reb`, odds: 2 }] });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  await expect(row.getByTestId('no-brainer-chip')).toHaveCount(0);
  const heightBefore = (await row.boundingBox())!.height;

  await row.hover();
  await row.getByRole('button', { name: 'Mark no brainer' }).click();
  await expect(row.getByTestId('no-brainer-chip')).toHaveText('No brainer');
  await expect(row.locator('td[data-no-brainer]')).toHaveCount(1);
  expect((await row.boundingBox())!.height).toBe(heightBefore);
  await saved(page);
  expect((await betsTagged(request, tag))[0]!.noBrainer).toBe(true);

  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await expect(row.getByTestId('no-brainer-chip')).toBeVisible();
  await expect(row.locator('td[data-no-brainer]')).toHaveCount(1);

  // X on the selected row turns it off
  await page.getByLabel('Search bets').blur();
  await row.getByTestId('bet-text').click();
  await page.keyboard.press('x');
  await expect(row.getByTestId('no-brainer-chip')).toHaveCount(0);
  await saved(page);
  expect((await betsTagged(request, tag))[0]!.noBrainer).toBe(false);
});

test('no brainer: "#nb" on the quick-add line', async ({ page, request, tag }) => {
  await page.goto('/');
  await page.getByTestId('quick-add').fill(`R$10 @2 ${tag} lakers ml #nb`);
  await page.getByTestId('quick-add').press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag)).map((b) => [b.betText, b.noBrainer])).toEqual([[`${tag} lakers ml`, true]]);
});
