// BT-63: Analytics has the Bets page's period switch (one remembered choice) and shows the change against the
// previous period under the headline numbers.
import { createBet, expect, test, viewMenu } from './helpers';

test('BT-63: the period changes the tables; vs previous under the headline; shared with the Bets page', async ({ page, request, tag }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'needs a database with only this test’s bets');
  await page.goto('/analytics');
  const day = await page.evaluate(() => {
    const n = new Date();
    if (n.getHours() < 5) n.setDate(n.getDate() - 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const y = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1, 12);
    return { today: iso(n), yesterday: iso(y) };
  });
  const sport = `${tag} Sport`;
  const legs = [{ sport, selection: 'x', odds: 2 }];
  await createBet(request, { betText: `${tag} today`, stake: 100, odds: 2, result: 'won', placedDate: day.today, gameDate: day.today, legs });
  await createBet(request, { betText: `${tag} yesterday`, stake: 50, odds: 2, result: 'lost', placedDate: day.yesterday, gameDate: day.yesterday, legs });
  await createBet(request, { betText: `${tag} old`, stake: 10, odds: 2, result: 'won', legs });
  await page.reload();
  await (await viewMenu(page)).getByRole('radio', { name: 'Real R$' }).click();
  const sw = page.getByRole('radiogroup', { name: 'Period' });
  const sportRow = page.getByTestId('analytics-row').filter({ hasText: sport });

  // All: every bet, no comparison
  await expect(sw.getByRole('radio', { name: 'All' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('an-net-value')).toHaveText('+R$ 60,00');
  await expect(sportRow.getByTestId('cell-bets')).toHaveText('3');
  await expect(page.getByTestId('an-net-vs')).toHaveCount(0);

  // Today: today's bet, compared with yesterday
  await sw.getByRole('radio', { name: 'Today' }).click();
  await expect(page.getByTestId('an-net-value')).toHaveText('+R$ 100,00');
  await expect(sportRow.getByTestId('cell-bets')).toHaveText('1');
  await expect(page.getByTestId('an-net-vs')).toHaveText('▲ +R$ 150,00 vs previous');
  await expect(page.getByTestId('an-winrate-vs')).toHaveText('▲ +100.0 pp vs previous');
  await expect(page.getByTestId('an-bets-vs')).toHaveText('= 0 vs previous');

  // the same choice on the Bets page
  await page.getByRole('link', { name: 'Bets' }).first().click();
  await expect(page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: 'Today' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Period' }).getByRole('radio', { name: 'All' }).click();
});
