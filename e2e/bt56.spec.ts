// BT-56: the period switch drives the tiles and the table; typed From / To show it as Custom; the choice is remembered.
import { createBet, expect, test } from './helpers';

test('BT-56: Today / All switch, Custom while dates are typed, remembered after a reload', async ({ page, request, tag }) => {
  await page.goto('/');
  // the app's today in the browser's time zone (the day ends at 05:00)
  const today = await page.evaluate(() => {
    const n = new Date();
    if (n.getHours() < 5) n.setDate(n.getDate() - 1);
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });
  await createBet(request, { betText: `${tag} today`, stake: 100, odds: 2, result: 'won', placedDate: today, gameDate: today });
  await createBet(request, { betText: `${tag} old`, stake: 50, result: 'lost' });
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  const sw = page.getByRole('radiogroup', { name: 'Period' });
  const rows = page.getByTestId('bet-row');

  await expect(sw.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('stat-net-value')).toHaveText('+R$ 50,00');

  await sw.getByRole('radio', { name: 'Today' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('today');
  await expect(page.getByTestId('stat-net-value')).toHaveText('+R$ 100,00');
  await sw.getByRole('radio', { name: 'Month' }).click();
  await expect(rows).toHaveCount(1);

  // remembered
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await expect(sw.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
  await expect(rows).toHaveCount(1);

  // typed dates: Custom; picking a period clears them
  await page.getByLabel('From date').fill('01/01/2000');
  await page.getByLabel('To date').fill('01/01/2000');
  await expect(sw.getByRole('radio', { name: 'Custom' })).toBeVisible();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('old');
  await sw.getByRole('radio', { name: 'All' }).click();
  await expect(page.getByLabel('From date')).toHaveValue('');
  await expect(sw.getByRole('radio', { name: 'Custom' })).toHaveCount(0);
  await expect(rows).toHaveCount(2);
});
