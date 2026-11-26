// BT-67: Analytics sections as tabs, the chosen one in the address; ladders get their own tab.
import { createBet, expect, test } from './helpers';

test('BT-67: each Analytics tab shows its section and keeps it in the address', async ({ page, request, tag }) => {
  // an open ladder: its first rung won
  await createBet(request, { betText: `${tag} rung 1`, stake: 100, odds: 1.5, result: 'won', rolloverId: `lad-${tag}`, banked: true, ladder: { goalRungs: 2, goalAmount: null, taken: false } });
  await page.goto('/analytics');
  const tabs = page.getByRole('tablist', { name: 'Sections' }).getByRole('tab');
  await expect(tabs).toHaveText(['Overview', 'Dutches', 'Combinations', 'Ladders', 'Cash-outs']);
  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Performance Over Time' })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Break down by' })).toBeVisible();
  // the ladders are no longer inside the Type breakdown
  await page.getByRole('tab', { name: 'Type' }).click();
  await expect(page.getByTestId('ladder-report')).toHaveCount(0);

  const visit = async (name: string, param: string, testId: string) => {
    await page.getByRole('tab', { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/analytics\\?tab=${param}$`));
    await expect(page.getByTestId(testId)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Performance Over Time' })).toHaveCount(0);
  };
  await visit('Dutches', 'dutches', 'dutches');
  await visit('Combinations', 'combinations', 'combos');
  await visit('Ladders', 'ladders', 'ladder-report');
  await expect(page.getByTestId('ladders-started-value')).not.toHaveText('0');
  await visit('Cash-outs', 'cashouts', 'cashout-verdict');
  await expect(page.getByTestId('cashout-verdict-note')).toContainText('cashing out paid');

  // the address opens its tab; Overview has no parameter
  await page.goto('/analytics?tab=ladders');
  await expect(page.getByRole('tab', { name: 'Ladders' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Overview' }).click();
  await expect(page).toHaveURL(/\/analytics$/);
});
