// BT-64: Analytics can break down by no brainer and by label.
import { createBet, expect, test } from './helpers';

test('BT-64: No brainer and Label chips list their rows', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} nb`, noBrainer: true, result: 'won', label: `${tag}trap` });
  await createBet(request, { betText: `${tag} plain`, result: 'lost', label: `${tag}TRAP` });
  await page.goto('/analytics');

  await page.getByRole('tab', { name: 'No brainer' }).click();
  await expect(page.getByRole('table', { name: 'By no brainer' })).toBeVisible();
  const rows = page.getByTestId('analytics-row');
  await expect(rows.filter({ hasText: 'No brainer' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Other' })).toHaveCount(1);
  await expect(rows.first()).toContainText('No brainer');

  await page.getByRole('tab', { name: 'Label', exact: true }).click();
  await expect(page.getByRole('table', { name: 'By label' })).toBeVisible();
  // the same label in two cases is one row, shown as the chip shows it
  const label = rows.filter({ hasText: `${tag}TRAP`.toUpperCase() });
  await expect(label).toHaveCount(1);
  await expect(label.getByTestId('cell-bets')).toHaveText('2');
  await expect(label.getByTestId('cell-winrate')).toContainText('1W/1L');
});
