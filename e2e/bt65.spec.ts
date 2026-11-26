// BT-65: a breakdown row with fewer than 10 settled bets is faded with a "small sample" mark.
import { createBet, expect, test } from './helpers';

test('BT-65: a small row carries the mark and loses its colours; a 10-bet row does not', async ({ page, request, tag }) => {
  for (let i = 0; i < 10; i++) await createBet(request, { betText: `${tag} big${i}`, book: `${tag} Big`, stake: 10, odds: 2, result: 'won' });
  await createBet(request, { betText: `${tag} small`, book: `${tag} Small`, stake: 10, odds: 2, result: 'won' });
  await page.goto('/analytics');
  await page.getByRole('tab', { name: 'Book' }).click();
  const small = page.getByTestId('analytics-row').filter({ hasText: `${tag} Small` });
  const big = page.getByTestId('analytics-row').filter({ hasText: `${tag} Big` });

  await expect(small).toHaveAttribute('data-small', 'true');
  await expect(small.getByTestId('small-sample')).toHaveAttribute('title', /Small sample: fewer than 10 settled bets/);
  // numbers kept, colour gone
  await expect(small.getByTestId('cell-profit')).toHaveText('+R$ 10,00');
  await expect(small.getByTestId('cell-profit').locator('span')).not.toHaveClass(/emerald/);

  await expect(big).not.toHaveAttribute('data-small', 'true');
  await expect(big.getByTestId('small-sample')).toHaveCount(0);
  await expect(big.getByTestId('cell-profit').locator('span')).toHaveClass(/emerald/);
});
