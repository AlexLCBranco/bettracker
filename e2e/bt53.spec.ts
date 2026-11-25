// BT-53: a rollover finished under 1.80 says what its next bet needs, and Bank shows on its row and its last bet's row:
// either one banks it once.
import { betsTagged, createBet, expect, saved, test } from './helpers';
import type { APIRequestContext } from '@playwright/test';

/** The owner's screenshot: Bet 1 won @ 1.53 (banked), Bet 2 cashed out R$ 170 on R$ 153. */
async function screenshotCase(request: APIRequestContext, tag: string) {
  const rolloverId = `ro-${tag}`;
  const one = await createBet(request, { betText: `${tag} one`, stake: 100, odds: 1.53, result: 'won', rolloverId, banked: true, money: 'real' });
  const two = await createBet(request, { betText: `${tag} two`, stake: 153, odds: 1.5, result: 'cash-out', cashout: 170, rolloverId, money: 'real' });
  return { one, two };
}

for (const where of ['parent', 'child'] as const) {
  test(`BT-53: won → banked → positive cash-out banks again from the ${where} row, once`, async ({ page, request, tag }) => {
    const { two } = await screenshotCase(request, tag);
    await page.goto('/');
    await page.getByLabel('Search bets').fill(tag);
    const shot = page.getByTestId('rollover-row');
    const child = page.locator(`[data-bet-id="${two.id}"]`);
    await expect(shot.getByTestId('result')).toHaveText('Won');
    await expect(shot.getByTestId('again-line')).toHaveText('Finished @ 1.70 · needs 1.06+');

    // Bank on both rows (hover-only actions)
    await shot.hover();
    await expect(shot.getByTestId('bank')).toBeVisible();
    await child.hover();
    await expect(child.getByTestId('bank')).toBeVisible();

    const row = where === 'parent' ? shot : child;
    await row.hover();
    await row.getByTestId('bank').click();
    await expect(shot.getByTestId('result')).toHaveText('Open');
    await expect(shot.getByTestId('shot-line')).toHaveText(/^Banked R\$\s170,00 @ 1\.70 · needs 1\.06\+$/);
    await expect(shot.getByTestId('again-line')).toHaveCount(0);
    // nothing left to bank on either row
    await shot.hover();
    await expect(shot.getByTestId('bank')).toHaveCount(0);
    await expect(child.getByTestId('bank')).toHaveCount(0);

    await saved(page);
    const bets = await betsTagged(request, tag);
    expect(bets.filter((b) => b.banked).map((b) => b.betText).sort()).toEqual([`${tag} one`, `${tag} two`]);
  });
}

test('BT-53: B on the selected chain row banks it again', async ({ page, request, tag }) => {
  await screenshotCase(request, tag);
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const shot = page.getByTestId('rollover-row');
  await shot.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('b');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await expect(shot.getByTestId('shot-line')).toContainText('needs 1.06+');
});
