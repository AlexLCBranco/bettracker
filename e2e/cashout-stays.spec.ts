// A cash-out entered with C never makes its bet vanish: on To settle and Upcoming it stays, showing the cash-out.
import { betsTagged, createBet, expect, test } from './helpers';

for (const tab of ['upcoming', 'settle'] as const) {
  test(`cash-out with C on the ${tab} tab: the bet stays, also after a reload`, async ({ page, request, tag }) => {
    // an upcoming bet's game is after today
    const b = await createBet(request, { betText: `${tag} mitchell`, stake: 100, odds: 2, ...(tab === 'upcoming' ? { gameDate: '2099-01-01' } : {}) });
    await page.goto(`/?tab=${tab}`);
    await page.getByLabel('Search bets').fill(tag);
    const row = page.locator(`[data-bet-id="${b.id}"]`);
    await row.getByTestId('cashout-button').click();
    await row.getByLabel('Cash-out amount').fill('111');
    await row.getByLabel('Cash-out amount').press('Enter');
    await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ result: 'cash-out', cashout: 111 });
    await expect(row.getByTestId('cashout-amount')).toHaveText(/^R\$\s111,00/);
    await page.reload();
    await page.getByLabel('Search bets').fill(tag);
    await expect(row.getByTestId('cashout-amount')).toHaveText(/^R\$\s111,00/);
  });
}
