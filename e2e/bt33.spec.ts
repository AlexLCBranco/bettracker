// BT-33: insert real, bonus and hypothetical money; bets of each type move the balances; a bonus win pays winnings only.
import type { Page } from '@playwright/test';
import { createBet, expect, test } from './helpers';

/** The bankroll panel's line for this test's book, for one money type. */
async function bookLine(page: Page, money: 'real' | 'bonus' | 'hypothetical', tag: string) {
  const panel = page.getByTestId('bankroll-panel');
  if (!(await panel.isVisible())) await page.getByTestId('bankroll').click();
  return page.getByTestId(`bankroll-books-${money}`).getByTestId('bankroll-book').filter({ hasText: tag });
}

async function insert(page: Page, type: 'Real' | 'Bonus' | 'Hypothetical', amount: string, tag: string, opts: { expiry?: string; another?: boolean } = {}) {
  const form = page.getByRole('dialog', { name: 'Insert money' });
  await form.getByRole('radio', { name: type }).click();
  await form.getByLabel('Amount').fill(amount);
  await form.getByLabel('Book').fill(tag);
  await form.getByLabel('Date', { exact: true }).fill('01/01/2000');
  if (opts.expiry) await form.getByLabel('Expiry').fill(opts.expiry);
  await form.getByLabel('Note').fill(`${tag} start`);
  await form.getByRole('button', { name: opts.another ? 'Save and add another' : 'Save', exact: true }).click();
  if (opts.another) await expect(form.getByLabel('Amount')).toHaveValue('');
  else await expect(form).toBeHidden();
}

test('BT-33: insert each type → bets of each type → balances move → a bonus win pays winnings only into real', async ({ page, request, tag }) => {
  await page.goto('/');
  await expect(page.getByTestId('bankroll')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.getByRole('dialog', { name: 'Insert money' })).toBeVisible();
  await insert(page, 'Real', '500', tag, { another: true });
  await insert(page, 'Bonus', '100', tag, { another: true, expiry: '31/12/2099' });
  await insert(page, 'Hypothetical', '1000', tag);
  await expect(page.getByRole('dialog', { name: 'Insert money' })).toBeHidden();

  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 500,00');
  await expect(await bookLine(page, 'bonus', tag)).toContainText('B$ 100,00');
  await expect(await bookLine(page, 'bonus', tag)).toContainText('B$ 100,00 expires 31 Dec 2099');
  await expect(await bookLine(page, 'hypothetical', tag)).toContainText('H$ 1.000,00');

  // a bet of each type, placed after the entries
  const real = await createBet(request, { betText: `${tag} real`, book: tag, placedDate: '2000-01-02', gameDate: '2000-01-02', stake: 100, odds: 2, money: 'real' });
  const bonus = await createBet(request, { betText: `${tag} bonus`, book: tag, placedDate: '2000-01-02', gameDate: '2000-01-02', stake: 10, odds: 20, money: 'bonus' });
  await createBet(request, { betText: `${tag} paper`, book: tag, placedDate: '2000-01-02', gameDate: '2000-01-02', stake: 50, odds: 2, money: 'hypothetical' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByRole('banner').getByRole('radio', { name: 'All' }).click();
  // bonus stake shown as B$
  await expect(page.locator(`[data-bet-id="${bonus.id}"]`).getByTestId('stake')).toHaveText(/B\$\s10,00/);

  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 400,00');
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 100,00 pending');
  await expect(await bookLine(page, 'bonus', tag)).toContainText('B$ 90,00');
  await expect(await bookLine(page, 'hypothetical', tag)).toContainText('H$ 950,00');
  await page.keyboard.press('Escape');

  // the bonus bet wins: 10 @ 20 pays 190 (winnings only) into REAL; the bonus stays spent
  await page.locator(`[data-bet-id="${bonus.id}"]`).getByRole('button', { name: 'Mark Won' }).click();
  await expect(page.locator(`[data-bet-id="${bonus.id}"]`).getByTestId('profit')).toHaveText(/\+R\$\s190,00/);
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 590,00');
  await expect(await bookLine(page, 'bonus', tag)).toContainText('B$ 90,00');
  await expect(await bookLine(page, 'bonus', tag)).toContainText('converted 1900.0%');
  await page.keyboard.press('Escape');

  // the real bet loses: its stake is gone for good
  await page.locator(`[data-bet-id="${real.id}"]`).getByRole('button', { name: 'Mark Lost' }).click();
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 590,00');
  await expect(await bookLine(page, 'real', tag)).not.toContainText('pending');
  await page.keyboard.press('Escape');

  // the bet form shows the balance and warns (does not block) when the stake is more
  await page.keyboard.press('n');
  const form = page.getByRole('dialog', { name: 'New bet' });
  await form.getByLabel('Money').selectOption('bonus');
  await form.getByLabel('Book').fill(tag);
  await form.getByLabel('Stake').fill('200');
  await expect(form.getByTestId('balance-hint')).toContainText('Bonus balance at');
  await expect(form.getByTestId('balance-hint')).toContainText('B$ 90,00');
  await expect(form.getByTestId('balance-hint')).toContainText('the stake is more than the balance');
  await form.getByLabel('Stake').fill('40');
  await expect(form.getByTestId('balance-hint')).toContainText('left after this bet: B$ 50,00');
  await expect(form.getByTestId('balance-hint')).not.toContainText('more than');
  await form.getByRole('button', { name: 'Cancel' }).click();
});

test('BT-33: take out, the entries list, delete and Z undo; a book with bets and no entry asks for a start', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} old`, book: `${tag}-nostart`, stake: 30, odds: 2, result: 'lost' });
  await page.goto('/bankroll');
  await page.getByRole('button', { name: 'Insert money' }).click();
  await insert(page, 'Real', '300', tag);
  await page.keyboard.press('m');
  const out = page.getByRole('dialog', { name: 'Insert money' });
  await out.getByLabel('Take out').check();
  const form = page.getByRole('dialog', { name: 'Take out money' });
  await form.getByRole('radio', { name: 'Real' }).click();
  await form.getByLabel('Amount').fill('120,50');
  await form.getByLabel('Book').fill(tag);
  await form.getByLabel('Date', { exact: true }).fill('02/01/2000');
  await form.getByLabel('Note').fill(`${tag} withdrawal`);
  await form.getByRole('button', { name: 'Save', exact: true }).click();

  await page.getByLabel('Filter book').fill(tag);
  const rows = page.getByTestId('entry-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first().getByTestId('entry-amount')).toHaveText(/−R\$\s120,50/);
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 179,50');
  // the old bet's book has no entry: "-" and a prompt, never a negative balance
  await expect(page.getByTestId('bankroll-books-real').getByTestId('missing-start').filter({ hasText: `${tag}-nostart` })).toContainText('set starting balance');
  await page.keyboard.press('Escape');

  await rows.first().getByRole('button', { name: 'Delete entry' }).click();
  await expect(rows).toHaveCount(1);
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 300,00');
  await page.keyboard.press('Escape');
  await page.keyboard.press('z');
  await expect(rows).toHaveCount(2);
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 179,50');
  await page.keyboard.press('Escape');

  // edit
  await rows.last().getByRole('button', { name: 'Edit entry' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit money entry' });
  await edit.getByLabel('Amount').fill('320');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(await bookLine(page, 'real', tag)).toContainText('R$ 199,50');
});
