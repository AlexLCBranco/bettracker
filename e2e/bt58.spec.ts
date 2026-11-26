// BT-58: day headers show the day's record before a bolder net; each week ends with a subtotal row (All tab only).
import { createBet, expect, test } from './helpers';

test('BT-58: day record, louder net, weekly subtotal on All only', async ({ page, request, tag }) => {
  // Mon 3 Jan 2000 and Tue 4 Jan 2000 are one week; Sun 2 Jan 2000 is the week before
  await createBet(request, { betText: `${tag} tue won`, stake: 100, odds: 2, result: 'won', placedDate: '2000-01-04', gameDate: '2000-01-04' });
  await createBet(request, { betText: `${tag} mon lost`, stake: 40, result: 'lost', placedDate: '2000-01-03', gameDate: '2000-01-03' });
  await createBet(request, { betText: `${tag} mon pending`, stake: 10, placedDate: '2000-01-03', gameDate: '2000-01-03' });
  await createBet(request, { betText: `${tag} sun won`, stake: 10, odds: 3, result: 'won', placedDate: '2000-01-02', gameDate: '2000-01-02' });
  await page.goto('/');
  await page.getByRole('radiogroup', { name: 'Money shown' }).getByRole('radio', { name: 'Real R$' }).click();
  await page.getByLabel('Search bets').fill(tag);

  await expect(page.getByTestId('day-totals')).toHaveText(['1 bet · 1W 0L · +R$ 100,00', '2 bets · 0W 1L · 1 pending · -R$ 40,00', '1 bet · 1W 0L · +R$ 20,00']);
  await expect(page.getByTestId('day-net-real').first()).toHaveClass(/font-bold/);

  const weeks = page.getByTestId('week-subtotal');
  await expect(weeks).toHaveCount(2);
  await expect(weeks.first()).toContainText('Week 3 Jan 2000 – 9 Jan 2000');
  await expect(weeks.first().getByTestId('week-totals')).toHaveText('3 bets · 1W 1L · 1 pending · +R$ 60,00');
  await expect(weeks.nth(1).getByTestId('week-totals')).toHaveText('1 bet · 1W 0L · +R$ 20,00');
  // the subtotal comes right after the week's last day shown (Monday), before Sunday's header
  const order = await page.locator('[data-testid=day-header], [data-testid=week-subtotal]').evaluateAll((els) => els.map((e) => e.getAttribute('data-date') ?? `week ${e.getAttribute('data-week')}`));
  expect(order).toEqual(['2000-01-04', '2000-01-03', 'week 2000-01-03', '2000-01-02', 'week 1999-12-27']);

  // not on the other tabs
  await page.getByRole('tab', { name: /To settle/ }).click();
  await expect(page.getByTestId('day-header')).toHaveCount(1);
  await expect(weeks).toHaveCount(0);
});
