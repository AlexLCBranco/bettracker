// BT-55: the Bets page's headline tiles count the period and filters, never the tab; scope All shows real and
// hypothetical side by side; the bankroll is a tile here and leaves the top bar.
import { createBet, expect, test, viewMenu } from './helpers';

test('BT-55: the tiles hold the same values on every tab; All shows R$ and H$ side by side', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} won`, stake: 100, odds: 2, result: 'won' });
  await createBet(request, { betText: `${tag} lost`, stake: 40, result: 'lost' });
  await createBet(request, { betText: `${tag} due`, stake: 30 });
  await createBet(request, { betText: `${tag} void`, stake: 5, result: 'void' });
  await createBet(request, { betText: `${tag} later`, stake: 20, placedDate: '2099-01-01', gameDate: '2099-01-01' });
  await createBet(request, { betText: `${tag} paper`, stake: 10, odds: 3, result: 'won', money: 'hypothetical' });
  await page.goto('/');
  await (await viewMenu(page)).getByRole('radio', { name: 'Real R$' }).click();
  await page.getByLabel('Search bets').fill(tag);

  const values = async () => ({
    net: await page.getByTestId('stat-net-value').textContent(),
    roi: await page.getByTestId('stat-roi-value').textContent(),
    win: await page.getByTestId('stat-winrate').textContent(),
    open: await page.getByTestId('stat-open-amount').textContent(),
    count: await page.getByTestId('stat-wagered').textContent(),
  });
  await expect(page.getByTestId('stat-net-value')).toHaveText('+R$ 60,00');
  await expect(page.getByTestId('stat-open-amount')).toHaveText('R$ 50,00');
  await expect(page.getByTestId('stat-pending-value')).toHaveText('2');
  await expect(page.getByTestId('stat-to-settle')).toHaveText('1 to settle');
  // the record says where the rest went: pending and settled as neither win nor loss
  await expect(page.getByTestId('stat-record')).toHaveText('1W / 1L · 2 pending · 1 other');
  await expect(page.getByTestId('stat-wagered')).toHaveText(/^5 of \d+ bets$/);
  const onAll = await values();
  for (const tab of [/To settle/, /Upcoming/, /Banked/]) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByTestId('stat-net-value')).toHaveText('+R$ 60,00');
    expect(await values()).toEqual(onAll);
  }

  // the to-settle count opens the To settle tab
  await page.getByRole('tab', { name: 'All' }).click();
  await page.getByTestId('stat-to-settle').click();
  await expect(page).toHaveURL(/\?tab=settle$/);

  // All: one Net per money type, never summed
  await (await viewMenu(page)).getByRole('radio', { name: 'All' }).click();
  await expect(page.getByTestId('stat-net-real-value')).toHaveText('+R$ 60,00');
  await expect(page.getByTestId('stat-net-hypothetical-value')).toHaveText('+H$ 20,00');
  await expect(page.getByTestId('stats')).not.toContainText('R$+H$');
  await (await viewMenu(page)).getByRole('radio', { name: 'Real R$' }).click();

  // the bankroll is a tile on the Bets page, in the top bar elsewhere
  await expect(page.getByTestId('stat-bankroll').getByTestId('bankroll')).toBeVisible();
  await expect(page.getByRole('banner').getByTestId('bankroll')).toHaveCount(0);
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('banner').getByTestId('bankroll')).toBeVisible();
});
