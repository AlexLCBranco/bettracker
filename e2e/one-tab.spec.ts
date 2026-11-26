// Only one tab of the site in use at a time, like WhatsApp Web: a newer tab stops the older one, which offers "Use here".
import { expect, test } from './helpers';

test('a second tab stops the first; "Use here" takes it back', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByTestId('quick-add')).toBeVisible();

  const second = await context.newPage();
  await second.goto('/analytics');
  await expect(page.getByTestId('other-tab')).toBeVisible();
  await expect(page.getByText('Bet tracker is open in another window')).toBeVisible();
  await expect(page.getByTestId('quick-add')).toHaveCount(0);
  await expect(second.getByTestId('other-tab')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use here' }).click();
  await expect(page.getByTestId('quick-add')).toBeVisible();
  await expect(page.getByTestId('other-tab')).toHaveCount(0);
  await expect(second.getByTestId('other-tab')).toBeVisible();

  // and back again
  await second.getByRole('button', { name: 'Use here' }).click();
  await expect(second.getByTestId('other-tab')).toHaveCount(0);
  await expect(page.getByTestId('other-tab')).toBeVisible();
  await second.close();
});
