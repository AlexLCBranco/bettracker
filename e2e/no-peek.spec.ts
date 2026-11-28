// Notes never show on hover or on the selected row: only a click on the mark (or D) opens them.
import { createBet, expect, test } from './helpers';

test('notes: nothing on hover or selection, a click opens them', async ({ page, request, tag }) => {
  const a = await createBet(request, { betText: `${tag} A`, legs: [{ selection: `${tag} A`, odds: 2 }], preAnalysis: 'only on click' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const row = page.locator(`[data-bet-id="${a.id}"]`);
  await expect(row).toBeVisible();

  await row.getByTestId('desc-mark').hover();
  await page.waitForTimeout(400);
  await expect(page.getByText('only on click')).toHaveCount(0);

  // the selected row, past the old pause
  await row.locator('td').first().click();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(1000);
  await expect(page.getByText('only on click')).toHaveCount(0);

  await row.getByTestId('desc-mark').click();
  await expect(page.locator(`[data-desc-for="bet:${a.id}"]`)).toContainText('only on click');
});
