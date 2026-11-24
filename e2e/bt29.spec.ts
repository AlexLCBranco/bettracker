// BT-29: rollover shots. Bank a won bet, add the next bet with its whole payout, settle; close; undo.
import { betsTagged, createBet, expect, saved, test } from './helpers';
import type { APIRequestContext, Page } from '@playwright/test';

async function search(page: Page, tag: string) {
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
}

/** The owner's example: R$ 100 @ 1.60, won. */
const wonBet = (request: APIRequestContext, tag: string) => createBet(request, { betText: `${tag} first`, stake: 100, odds: 1.6, result: 'won', money: 'real' });

/** Banks the bet, adds a 1.20 leg through the form (stake fixed at the banked R$ 160). */
async function bankAndAddLeg(page: Page, tag: string, betId: string) {
  await page.locator(`[data-bet-id="${betId}"]`).getByTestId('bank').click();
  const shot = page.getByTestId('rollover-row');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await expect(shot.getByTestId('shot-line')).toHaveText(/^Banked R\$\s160,00 @ 1\.60 · needs 1\.13\+ to reach 1\.80 \(Shot\)$/);
  await expect(shot.getByTestId('tier-chip')).toHaveText(/Banked Pepsi/i);

  await shot.getByTestId('add-leg').click();
  const form = page.getByRole('dialog', { name: 'Add rollover leg' });
  await expect(form.getByLabel('Stake')).toHaveValue('160');
  await expect(form.getByLabel('Stake')).toHaveAttribute('readonly', '');
  await expect(form.getByTestId('money-locked')).toHaveText('Real (R$)');
  await form.getByLabel('Odds').fill('1.2');
  await form.getByLabel('Bet text').fill(`${tag} second`);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(shot.getByTestId('type')).toHaveText('Rollover ×2');
  await expect(shot.getByTestId('result')).toHaveText('Pending');
  return shot;
}

test('BT-29: bank → add leg → win is ONE 1.92 shot paying +R$ 92 on R$ 100', async ({ page, request, tag }) => {
  const first = await wonBet(request, tag);
  await search(page, tag);
  const shot = await bankAndAddLeg(page, tag, first.id);

  await shot.getByRole('button', { name: 'Mark Won' }).click();
  await expect(shot.getByTestId('result')).toHaveText('Won');
  await expect(shot.getByTestId('rollover-odds')).toHaveText('1.92');
  await expect(shot.getByTestId('rollover-stake')).toHaveText(/R\$\s100,00/);
  await expect(shot.getByTestId('profit')).toHaveText(/\+R\$\s92,00/);
  // counted once: 1 bet, R$ 100 wagered, +R$ 92 net
  await expect(page.getByTestId('stat-wagered')).toContainText('1 of');
  await expect(page.getByTestId('stat-wagered-value')).toHaveText(/R\$\s100,00/);
  await expect(page.getByTestId('stat-net-value')).toHaveText(/\+R\$\s92,00/);

  await saved(page);
  const bets = await betsTagged(request, tag);
  expect(new Set(bets.map((b) => b.rolloverId)).size).toBe(1);
  expect(bets.find((b) => b.betText.endsWith('second'))).toMatchObject({ stake: 160, odds: 1.2, result: 'won', money: 'real' });
});

test('BT-29: bank → add leg → lose loses the first R$ 100 only; Z puts it back to pending', async ({ page, request, tag }) => {
  const first = await wonBet(request, tag);
  await search(page, tag);
  const shot = await bankAndAddLeg(page, tag, first.id);

  await shot.getByRole('button', { name: 'Mark Lost' }).click();
  await expect(shot.getByTestId('result')).toHaveText('Lost');
  await expect(shot.getByTestId('profit')).toHaveText(/-R\$\s100,00/);
  await expect(page.getByTestId('stat-winrate')).toContainText('0W / 1L');

  await page.keyboard.press('z');
  await expect(shot.getByTestId('result')).toHaveText('Pending');
  await expect.poll(async () => (await betsTagged(request, tag)).map((b) => b.result).sort()).toEqual(['pending', 'won']);
});

test('BT-29: B banks, B again closes back to a plain won bet; Z undoes the close and the bank', async ({ page, request, tag }) => {
  const first = await wonBet(request, tag);
  await search(page, tag);
  const row = page.locator(`[data-bet-id="${first.id}"]`).first();
  await row.click();
  await page.keyboard.press('b');
  const shot = page.getByTestId('rollover-row');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await expect(page.getByTestId('stat-pending-value')).toHaveText('1');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ banked: true });

  await page.keyboard.press('b'); // the open shot is selected: B closes it
  await expect(shot).toBeHidden();
  await expect(page.locator(`[data-bet-id="${first.id}"]`).getByTestId('result')).toHaveText('Won');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ rolloverId: null, banked: false });

  await page.keyboard.press('z');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await page.keyboard.press('z');
  await expect(shot).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ rolloverId: null, banked: false });
});

test('BT-29: Z after adding a leg removes it and the shot is open again', async ({ page, request, tag }) => {
  const first = await wonBet(request, tag);
  await search(page, tag);
  const shot = await bankAndAddLeg(page, tag, first.id);
  await page.keyboard.press('z');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(1);
});

test('a won dutch split banks: its shot starts from the split payout, dutch + shot count as ONE bet', async ({ page, request, tag }) => {
  const d = `${tag}-d`.replace(/[^A-Za-z0-9_-]/g, '');
  const won = await createBet(request, { dutchId: d, betText: `${tag} home`, stake: 50, odds: 2, result: 'won', money: 'real' });
  await createBet(request, { dutchId: d, betText: `${tag} away`, stake: 40, odds: 2.2, result: 'lost', money: 'real' });
  await search(page, tag);
  await expect(page.getByTestId('stat-winrate')).toContainText('1W / 0L');

  await page.locator(`[data-split-of="${d}"][data-bet-id="${won.id}"]`).getByTestId('bank').click();
  const shot = page.getByTestId('rollover-row');
  await expect(shot.getByTestId('result')).toHaveText('Open');
  await expect(shot.getByTestId('shot-line')).toHaveText(/^Banked R\$\s100,00 @ 2\.00/);
  await expect(page.getByTestId('dutch-row')).toHaveCount(1);
  // one bet, pending while the shot is open
  await expect(page.getByTestId('stat-pending-value')).toHaveText('1');
  await expect(page.getByTestId('stat-wagered')).toContainText('1 of');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === won.id)).toMatchObject({ banked: true, dutchId: d });

  await shot.getByTestId('add-leg').click();
  const form = page.getByRole('dialog', { name: 'Add rollover leg' });
  await expect(form.getByLabel('Stake')).toHaveValue('100');
  await form.getByLabel('Odds').fill('1.5');
  await form.getByLabel('Bet text').fill(`${tag} next`);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
  await shot.getByRole('button', { name: 'Mark Won' }).click();
  await expect(shot.getByTestId('result')).toHaveText('Won');
  // shot +R$ 100 (150 − 50), the lost split −R$ 40: one win, +R$ 60 on R$ 90
  await expect(page.getByTestId('stat-winrate')).toContainText('1W / 0L');
  await expect(page.getByTestId('stat-wagered-value')).toHaveText(/R\$\s90,00/);
  await expect(page.getByTestId('stat-net-value')).toHaveText(/\+R\$\s60,00/);
});

test('several banked bets: the top bar shows how many and how much, each opens on the Banked tab', async ({ page, request, tag }) => {
  const a = await createBet(request, { betText: `${tag} a`, stake: 100, odds: 1.6, result: 'won', money: 'real', rolloverId: `${tag}-ra`.replace(/[^A-Za-z0-9_-]/g, ''), banked: true });
  const b = await createBet(request, { betText: `${tag} b`, stake: 50, odds: 1.9, result: 'won', money: 'real', rolloverId: `${tag}-rb`.replace(/[^A-Za-z0-9_-]/g, ''), banked: true });
  await page.goto('/');
  const bar = page.getByTestId('banked');
  await expect(bar).toBeVisible();
  // other tests may have shots open too: at least these two, and their amounts are in the list
  await expect.poll(async () => Number(await page.getByTestId('banked-count').textContent())).toBeGreaterThanOrEqual(2);
  await bar.click();
  const panel = page.getByTestId('banked-panel');
  const itemA = panel.getByTestId('banked-item').filter({ hasText: /R\$\s160,00/ }).filter({ hasText: '@ 1.60 Pepsi' }).first();
  await expect(itemA).toContainText('needs 1.13+ to reach 1.80');
  await expect(panel.getByTestId('banked-item').filter({ hasText: /R\$\s95,00/ }).first()).toContainText('already 1.80+');

  await itemA.click();
  await expect(page).toHaveURL(/tab=banked/);
  await expect(page.getByRole('tab', { name: /Banked/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator(`[data-key="rollover:${a.rolloverId}"]`)).toHaveAttribute('data-selected', 'true');
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.getByTestId('rollover-row')).toHaveCount(2);
  expect(b.banked).toBe(true);
});
