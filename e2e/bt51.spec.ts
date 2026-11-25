// BT-51: a cash-out with no "woulda won / lost" keeps its W / L on screen (no hover); answering hides them.
import { createBet, expect, test } from './helpers';

test('BT-51: open cash-outs show W / L without hover, answered ones do not', async ({ page, request, tag }) => {
  const open = await createBet(request, { betText: `${tag} open`, stake: 100, odds: 1.88, result: 'cash-out', cashout: 145 });
  const answered = await createBet(request, { betText: `${tag} answered`, stake: 100, odds: 1.88, result: 'cash-out', cashout: 145, wouldHave: 'lost' });
  const leg = (s: string) => [{ selection: `${tag} ${s}`, game: '', sport: '', market: '', odds: null, result: 'pending' }];
  const split = await createBet(request, { betText: '', dutchId: `${tag}-d`, stake: 60, odds: 2, result: 'cash-out', cashout: 70, legs: leg('Home') });
  await createBet(request, { betText: '', dutchId: `${tag}-d`, stake: 40, odds: 4, result: 'lost', legs: leg('Away') });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  // the mouse far from every row
  await page.mouse.move(0, 0);

  const row = page.locator(`[data-bet-id="${open.id}"]`);
  const height = (await row.boundingBox())!.height;
  await expect(row.getByRole('button', { name: 'Woulda won' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Woulda lost' })).toBeVisible();
  // Playwright counts opacity 0 as visible: the hover-only buttons (BT-37) had it
  await expect(row.getByTestId('woulda-keys')).toHaveCSS('opacity', '1');
  await expect(row.getByTestId('woulda-unset')).toHaveCount(0);

  // a dutch split cash-out too
  const splitRow = page.locator(`[data-bet-id="${split.id}"]`);
  await expect(splitRow.getByRole('button', { name: 'Woulda won' })).toBeVisible();
  await expect(splitRow.getByTestId('woulda-keys')).toHaveCSS('opacity', '1');

  // answered: no buttons, the chip
  const done = page.locator(`[data-bet-id="${answered.id}"]`);
  await expect(done.getByTestId('woulda-chip')).toBeVisible();
  await expect(done.getByRole('button', { name: 'Woulda won' })).toBeHidden();
  await expect(done.getByRole('button', { name: 'Woulda lost' })).toBeHidden();

  // clicking one hides them and shows the chip; the row keeps its height
  await row.getByRole('button', { name: 'Woulda won' }).click();
  await page.mouse.move(0, 0);
  await expect(row.getByTestId('woulda-chip')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Woulda won' })).toBeHidden();
  await expect(row.getByRole('button', { name: 'Woulda lost' })).toBeHidden();
  expect((await row.boundingBox())!.height).toBe(height);
});
