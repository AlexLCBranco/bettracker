// BT-34: the blue C button opens the cash-out box; an amount or a percentage of the full payout, both shown.
import { betsTagged, createBet, expect, test } from './helpers';

test('BT-34: click C → 70% → both values shown → Enter → cash-out and profit → Z undoes', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} cash me`, stake: 100, odds: 2 });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  const c = row.getByTestId('cashout-button');
  await expect(c).toHaveText('C');
  await expect(c).toHaveAttribute('title', 'Cash-out (C)');
  // saturated blue, not V's grey
  const color = await c.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe(await row.getByRole('button', { name: 'Mark Void' }).evaluate((el) => getComputedStyle(el).color));

  await c.click();
  const box = row.getByLabel('Cash-out amount');
  await box.fill('70%');
  await expect(row.getByTestId('cashout-preview')).toHaveText(/^R\$\s140,00 returned · 70% of full payout \(R\$\s200,00\) · profit \+R\$\s40,00$/);
  await expect(row.getByRole('radio', { name: '%' })).toHaveAttribute('aria-checked', 'true');
  await box.press('Enter');

  await expect(row.getByTestId('result')).toContainText('Cash-out');
  await expect(row.getByTestId('cashout-amount')).toHaveText(/^R\$\s140,00 \(70%\)$/);
  await expect(row.getByTestId('result')).toHaveAttribute('title', /Cash-out · R\$\s140,00 \(70%\)/);
  await expect(row.getByTestId('profit')).toHaveText(/\+R\$\s40,00/);
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ result: 'cash-out', cashout: 140 });

  await page.keyboard.press('z');
  await expect(row.getByTestId('result')).toHaveText('Pending');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ result: 'pending', cashout: null });
});

test('BT-34: the % toggle is remembered and an amount still works; Esc closes', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} toggle`, stake: 10, odds: 3 });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  await row.getByTestId('cashout-button').click();
  await row.getByRole('radio', { name: '%' }).click();
  await row.getByLabel('Cash-out amount').fill('50');
  await expect(row.getByTestId('cashout-preview')).toContainText('R$ 15,00 returned · 50% of full payout (R$ 30,00)');
  await row.getByLabel('Cash-out amount').press('Escape');
  await expect(row.getByTestId('cashout-box')).toBeHidden();

  // reopened (with the C key on the selected row): the % mode is remembered; switching to R$ reads an amount
  await row.click();
  await page.keyboard.press('c');
  await expect(row.getByRole('radio', { name: '%' })).toHaveAttribute('aria-checked', 'true');
  await row.getByRole('radio', { name: 'R$' }).click();
  await row.getByLabel('Cash-out amount').fill('12,50');
  await expect(row.getByTestId('cashout-preview')).toContainText('R$ 12,50 returned');
  await row.getByLabel('Cash-out amount').press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ result: 'cash-out', cashout: 12.5 });
});
