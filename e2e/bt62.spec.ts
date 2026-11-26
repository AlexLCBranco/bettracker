// BT-62: Analytics opens with Net, ROI, Win rate and Bets (the Bets page's figures for the same bets) and the best
// and worst segment.
import { createBet, expect, test, viewMenu } from './helpers';

test('BT-62: the headline tiles match the Bets page; best and worst segments', async ({ page, request, tag }) => {
  // two books with 10 settled bets each: one all won, one all lost
  for (let i = 0; i < 10; i++) {
    await createBet(request, { betText: `${tag} a${i}`, book: `${tag} Up`, stake: 10, odds: 2, result: 'won' });
    await createBet(request, { betText: `${tag} b${i}`, book: `${tag} Down`, stake: 10, odds: 2, result: 'lost', situation: 'live' });
  }
  await page.goto('/');
  await (await viewMenu(page)).getByRole('radio', { name: 'Real R$' }).click();
  // the Bets page with no filter and period All counts every bet, as Analytics does
  const bets = {
    net: await page.getByTestId('stat-net-value').textContent(),
    roi: await page.getByTestId('stat-roi-value').textContent(),
    win: await page.getByTestId('stat-winrate-value').textContent(),
  };
  await page.getByRole('link', { name: 'Analytics' }).click();
  const head = page.getByTestId('analytics-headline');
  await expect(head).toBeVisible();
  await expect(page.getByTestId('an-net-value')).toHaveText(bets.net!);
  await expect(page.getByTestId('an-roi-value')).toHaveText(bets.roi!);
  await expect(page.getByTestId('an-winrate-value')).toHaveText(bets.win!);
  // locally the database holds only this test's bets
  if (!process.env.E2E_BASE_URL) {
    await expect(page.getByTestId('an-bets-value')).toHaveText('20');
    await expect(page.getByTestId('an-best-value')).toHaveText(`Book: ${tag} Up`);
    await expect(page.getByTestId('an-worst-value')).toHaveText(`Book: ${tag} Down`);
  }
  await expect(head).not.toContainText('NaN');

  // scope All: one figure per money type, never summed
  await createBet(request, { betText: `${tag} paper`, stake: 10, odds: 3, result: 'won', money: 'hypothetical' });
  await page.reload();
  await (await viewMenu(page)).getByRole('radio', { name: 'All' }).click();
  await expect(page.getByTestId('an-net-real-value')).toHaveText(bets.net!);
  await expect(page.getByTestId('an-net-hypothetical-value')).toContainText('H$');
  await (await viewMenu(page)).getByRole('radio', { name: 'Real R$' }).click();
});
