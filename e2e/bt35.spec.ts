// BT-35: ladders. Start from a won bet → next rung → win → take; Z undoes each step. Start one from quick-add.
import { betsTagged, createBet, expect, test } from './helpers';

test('BT-35: start ladder → next rung → win → take → rungs and profit; Z undoes each step', async ({ page, request, tag }) => {
  const first = await createBet(request, { betText: `${tag} rung one`, stake: 100, odds: 2, result: 'won', money: 'real' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.locator(`[data-bet-id="${first.id}"]`).getByTestId('start-ladder').click();

  const row = page.getByTestId('rollover-row');
  await expect(row.getByTestId('type')).toHaveText('Ladder ×1');
  await expect(row.getByTestId('result')).toHaveText('Open');
  await expect(row.getByTestId('ladder-goal')).toHaveText('rung 2');
  await expect(row.getByTestId('ladder-strip')).toHaveText(/^R\$\s100,00 → R\$\s200,00 → next rung: R\$\s200,00$/);
  await expect(row.getByTestId('tier-chip')).toHaveCount(0);
  await expect(row.getByTestId('take')).toHaveText(/Take R\$\s200,00/);

  await row.getByTestId('next-rung').click();
  const form = page.getByRole('dialog', { name: 'Add ladder rung' });
  await expect(form.getByLabel('Stake')).toHaveValue('200');
  await expect(form.getByLabel('Stake')).toHaveAttribute('readonly', '');
  await form.getByLabel('Odds').fill('2');
  await form.getByLabel('Bet text').fill(`${tag} rung two`);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(row.getByTestId('type')).toHaveText('Ladder ×2');
  await expect(row.getByTestId('ladder-strip')).toHaveText(/R\$\s200,00 → next: R\$\s400,00 @ 2\.00$/);
  // the rung being played is highlighted
  await expect(page.locator('[data-testid="chain-label"][data-current]')).toHaveText('Rung 2');

  await row.getByRole('button', { name: 'Mark Won' }).click();
  await expect(row.getByTestId('result')).toHaveText('Open');
  await expect(row.getByTestId('ladder-strip')).toHaveText(/R\$\s400,00 → next rung: R\$\s400,00$/);
  await row.getByTestId('take').click();
  await expect(row.getByTestId('result')).toHaveText('Won');
  await expect(row.getByTestId('profit')).toHaveText(/\+R\$\s300,00/);
  await expect(row.getByTestId('rollover-stake')).toHaveText(/R\$\s100,00/);
  // one bet in the counts
  await expect(page.getByTestId('stat-wagered')).toContainText('1 of');
  await expect(page.getByTestId('stat-net-value')).toHaveText(/\+R\$\s300,00/);

  // Z: take, the win, the rung, the start
  await page.keyboard.press('z');
  await expect(row.getByTestId('result')).toHaveText('Open');
  await page.keyboard.press('z');
  await expect(row.getByTestId('result')).toHaveText('Pending');
  await page.keyboard.press('z');
  await expect(row.getByTestId('type')).toHaveText('Ladder ×1');
  await page.keyboard.press('z');
  await expect(row).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag)).map((b) => [b.rolloverId, b.ladder])).toEqual([[null, null]]);
});

test('BT-35: a lost rung ends the ladder (first stake lost); quick-add "ladder:3" and the form start one with a goal', async ({ page, request, tag }) => {
  await page.goto('/');
  await page.getByTestId('quick-add').fill(`50 @2 ${tag} quick ladder:3`);
  await page.getByTestId('quick-add').press('Enter');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('rollover-row');
  await expect(row.getByTestId('type')).toHaveText('Ladder ×1');
  await expect(row.getByTestId('ladder-goal')).toHaveText('rung 1 of 3');
  await row.getByRole('button', { name: 'Mark Lost' }).click();
  await expect(row.getByTestId('result')).toHaveText('Lost');
  await expect(row.getByTestId('profit')).toHaveText(/-R\$\s50,00/);
  await expect(row.getByTestId('next-rung')).toHaveCount(0);

  // full form: Ladder with a goal amount
  await page.keyboard.press('Escape');
  await page.keyboard.press('n');
  const form = page.getByRole('dialog', { name: 'New bet' });
  await form.getByLabel('Stake').fill('25');
  await form.getByLabel('Odds').fill('2');
  await form.getByLabel('Money').selectOption('real');
  await form.getByLabel('Bet text').fill(`${tag} formed`);
  await form.getByLabel('Ladder').check();
  await form.getByLabel('Goal amount').fill('400');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
  const formed = page.getByTestId('rollover-row').filter({ hasText: `${tag} formed` });
  await expect(formed.getByTestId('ladder-goal')).toHaveText(/R\$\s25,00 of R\$\s400,00/);
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.betText.includes('formed'))?.ladder).toEqual({ goalRungs: null, goalAmount: 400, taken: false });
});
