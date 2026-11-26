// BT-68: the Dutches tab shows four tiles first; "More" (remembered) reveals the other six; the tables stay.
import { createBet, expect, test } from './helpers';

test('BT-68: four tiles, More reveals six more with their values, remembered', async ({ page, request, tag }) => {
  const d = `${tag}-d`.replace(/[^A-Za-z0-9_-]/g, '');
  await createBet(request, { betText: '', dutchId: d, stake: 60, odds: 2, result: 'won', legs: [{ selection: `${tag} H`, odds: 2 }] });
  await createBet(request, { betText: '', dutchId: d, stake: 40, odds: 4, result: 'lost', legs: [{ selection: `${tag} A`, odds: 4 }] });
  await page.goto('/analytics?tab=dutches');

  const main = page.getByTestId('dutch-main-tiles');
  await expect(main.locator(':scope > [data-testid]')).toHaveCount(4);
  for (const id of ['dutches-profit', 'dutches-roi', 'dutches-winrate', 'dutches-splits']) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('dutches-winrate')).toContainText(/\d+W \/ \d+L · \d+ settled/);
  const more = ['dutches-wagered', 'dutches-odds', 'hits-all', 'hits-some', 'hits-none', 'hits-shared'];
  for (const id of more) await expect(page.getByTestId(id)).toHaveCount(0);
  // the tables stay visible
  await expect(page.getByRole('table', { name: 'Which split hits' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By number of splits' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By combined odds' })).toBeVisible();

  await page.getByTestId('dutch-more').click();
  for (const id of more) await expect(page.getByTestId(id)).toBeVisible();
  if (!process.env.E2E_BASE_URL) {
    await expect(page.getByTestId('dutches-wagered-value')).toHaveText('R$ 100,00');
    await expect(page.getByTestId('hits-some-value')).toHaveText('1');
  }

  // remembered
  await page.reload();
  await expect(page.getByTestId('hits-all')).toBeVisible();
  await page.getByTestId('dutch-more').click();
  await expect(page.getByTestId('hits-all')).toHaveCount(0);
});
