// BT-54: a dutch as the next leg of an open rollover shot. Owner's case: H$ 100 @ 1.30 won and banked (H$ 130), the
// whole 130 dutched across @ 2.00 and @ 2.20 from the shot's "+ Dutch leg" button.
import { betsTagged, createBet, expect, saved, test, viewMenu } from './helpers';

test('BT-54: + Dutch leg dutches the banked payout, the shot rolls on with what the dutch returned', async ({ page, request, tag }) => {
  const rolloverId = `ro-${tag}`;
  await createBet(request, { betText: `${tag} first`, stake: 100, odds: 1.3, result: 'won', rolloverId, banked: true, money: 'hypothetical' });
  await page.goto('/');
  // the Bets page shows real money by default: show H$
  await (await viewMenu(page)).getByRole('radio', { name: /Hypothetical/ }).click();
  await page.getByLabel('Search bets').fill(tag);
  const shot = page.getByTestId('rollover-row');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await shot.getByTestId('dutch-leg').click();

  // the Betting Tool in rollover mode: the total stake is the banked payout, locked
  await expect(page).toHaveURL(/\/betting-tool\?rollover=/);
  const banner = page.getByTestId('rollover-mode');
  await expect(banner).toContainText(/H\$\s130,00/);
  await expect(page.getByLabel('Total stake')).toHaveValue(/H\$\s130,00/);
  await expect(page.getByLabel('Total stake')).not.toBeEditable();
  await page.getByLabel('Selection 1 name').fill(`${tag} X`);
  await page.getByLabel('Selection 1 odds').fill('2');
  await page.getByLabel('Selection 2 name').fill(`${tag} Y`);
  await page.getByLabel('Selection 2 odds').fill('2.2');
  // 1.30 × the dutch's combined 1.0476 = 1.36
  await expect(page.getByTestId('rollover-mode-odds')).toHaveText('1.36');
  await expect(page.getByTestId('dutch-stake')).toHaveText([/68,10/, /61,90/]);
  await page.getByRole('button', { name: 'Log as rollover leg' }).click();

  const form = page.getByRole('dialog', { name: 'Log dutch' });
  await expect(form.getByTestId('dutch-rollover-note')).toContainText(/H\$\s130,00/);
  await expect(form.getByLabel('Money')).toBeDisabled();
  await form.getByLabel('Placed date').fill('01/01/2000');
  await form.getByLabel('Game date').fill('01/01/2000');
  await form.getByRole('button', { name: 'Log 2 bets as the next leg' }).click();

  // back on the Bets page: the shot is one row with its dutch leg under it, no dutch row of its own
  await expect(page).toHaveURL(/sel=rollover/);
  await page.getByLabel('Search bets').fill(tag);
  await expect(shot.getByTestId('type')).toHaveText('Rollover ×2');
  await expect(shot.getByTestId('result')).toHaveText('Pending');
  await expect(page.getByTestId('chain-label')).toHaveText(['Bet 1', 'Bet 2 · dutch', 'Bet 2 · dutch']);
  await expect(page.locator('[data-key^="dutch:"]')).toHaveCount(0);

  await saved(page);
  const bets = await betsTagged(request, tag);
  const splits = bets.filter((b) => b.dutchId);
  expect(splits).toHaveLength(2);
  expect(new Set(splits.map((b) => b.rolloverId))).toEqual(new Set([rolloverId]));
  expect(new Set(splits.map((b) => b.dutchId)).size).toBe(1);
  expect(splits.every((b) => b.money === 'hypothetical')).toBe(true);
  expect(Math.round(splits.reduce((t, b) => t + b.stake, 0) * 100)).toBe(13000);

  // settle the splits on their own rows: X won, Y lost → the shot won with what the dutch returned (136,20)
  const x = splits.find((b) => b.legs[0]!.selection.endsWith(' X'))!;
  const y = splits.find((b) => b.legs[0]!.selection.endsWith(' Y'))!;
  const rowX = page.locator(`[data-bet-id="${x.id}"]`);
  const rowY = page.locator(`[data-bet-id="${y.id}"]`);
  await rowY.hover();
  await rowY.getByLabel('Mark Lost').click();
  await expect(shot.getByTestId('result')).toHaveText('Pending');
  await rowX.hover();
  await rowX.getByLabel('Mark Won').click();
  await expect(shot.getByTestId('result')).toHaveText('Won');
  await expect(shot.getByTestId('rollover-odds')).toHaveText('1.36');
  await expect(shot.getByTestId('profit')).toContainText('36,20');

  // the whole dutch's return banks again, from the shot's row
  await shot.hover();
  await shot.getByTestId('bank').click();
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await expect(shot.getByTestId('shot-line')).toHaveText(/^Banked H\$\s136,20 @ 1\.36 · needs a Semi · 1\.33\+$/);
});
