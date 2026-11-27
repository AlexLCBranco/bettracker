// The note peek goes away on scroll: hovered then scrolled with a still pointer, or the selected row's peek.
import { createBet, expect, test } from './helpers';

test('note peek: a scroll hides it', async ({ page, request, tag }) => {
  const a = await createBet(request, { betText: `${tag} A`, legs: [{ selection: `${tag} A`, odds: 2 }], preAnalysis: 'peek me' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const row = page.locator(`[data-bet-id="${a.id}"]`);
  await expect(row).toBeVisible();
  // room to scroll
  await page.evaluate(() => (document.body.style.paddingBottom = '3000px'));
  const peek = page.getByTestId('desc-peek');

  // hovered, then the wheel scrolls without moving the pointer
  await row.getByTestId('desc-mark').hover();
  await expect(peek).toBeVisible();
  await page.mouse.wheel(0, 400);
  await expect(peek).toHaveCount(0);

  // the selected row's peek (after its pause) goes on scroll too
  await page.mouse.move(5, 5);
  await page.evaluate(() => window.scrollTo(0, 0));
  await row.locator('td').first().click();
  await page.mouse.move(5, 5);
  await expect(peek).toBeVisible();
  await page.evaluate(() => window.scrollBy(0, 300));
  await expect(peek).toHaveCount(0);
});
