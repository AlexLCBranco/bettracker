// BT-36: the Ladder sim. Inputs → table → one rung typed over → totals → note and plan survive reload → Reset;
// target, Try it, "Start this ladder" and "Open in sim".
import { createBet, expect, test } from './helpers';

test('BT-36: start / odds / rungs → table → override a rung → note and plan survive reload → Reset', async ({ page }) => {
  await page.goto('/ladder-sim');
  await page.getByRole('button', { name: 'Reset' }).click();
  const rows = page.getByTestId('sim-row');
  // defaults: 100 @ 2.00 × 10
  await expect(rows).toHaveCount(11);
  await expect(page.getByTestId('sim-summary')).toHaveText(/R\$\s100,00 → R\$\s102\.400,00 · ×1024 · 10 wins in a row · chance 0\.10% \(1 in 1,024\)/);

  await page.getByLabel('Start', { exact: true }).fill('193');
  await page.getByLabel('Odds', { exact: true }).fill('1.9');
  await page.getByLabel('Rungs', { exact: true }).fill('3');
  await expect(rows).toHaveCount(4);
  const r3 = page.locator('[data-testid="sim-row"][data-rung="3"]');
  await expect(r3.getByTestId('sim-pays')).toHaveText(/R\$\s1\.323,79/);
  await expect(r3.getByTestId('sim-total')).toHaveText('×6.86');
  await expect(r3.getByTestId('sim-chance')).toHaveText('14.6%');
  await expect(r3.getByTestId('sim-tier')).toHaveText(/Shot/i);

  // rung 2 typed over (American odds work too): rung 3 and the totals follow; the top box never wipes it
  await page.getByLabel('Odds rung 2', { exact: true }).fill('+200');
  await expect(r3.getByTestId('sim-total')).toHaveText('×10.83');
  await page.getByLabel('Odds', { exact: true }).fill('2');
  await expect(r3.getByTestId('sim-total')).toHaveText('×12');
  await expect(page.getByLabel('Reset odds rung 2')).toBeVisible();

  await page.getByLabel('Note rung 2', { exact: true }).fill('the risky one');
  await page.reload();
  await expect(page.getByLabel('Note rung 2', { exact: true })).toHaveValue('the risky one');
  await expect(page.getByLabel('Start', { exact: true })).toHaveValue('193');
  await expect(page.locator('[data-testid="sim-row"][data-rung="3"]').getByTestId('sim-total')).toHaveText('×12');

  await page.getByLabel('Reset odds rung 2').click();
  await expect(page.locator('[data-testid="sim-row"][data-rung="3"]').getByTestId('sim-total')).toHaveText('×8');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(rows).toHaveCount(11);
  await expect(page.getByLabel('Note rung 2', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Start', { exact: true })).toHaveValue('100');
});

test('BT-36: target, needed odds, Try it, and Start this ladder opens the form as rung 1 with the goal', async ({ page, request, tag }) => {
  await page.goto('/ladder-sim');
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByLabel('Target').fill('1500');
  await expect(page.getByTestId('target-info')).toContainText('reached at rung 4');
  await expect(page.getByTestId('needed')).toContainText('needs 1.31 per rung to reach R$ 1.500,00 in 10 rungs');
  await expect(page.locator('[data-testid="sim-row"][data-rung="5"]')).toHaveAttribute('data-after-target', 'true');

  await page.getByTestId('try-it').click();
  await expect(page.getByTestId('try-tally')).toContainText('1 try: best rung');
  await page.getByTestId('try-it').click();
  await expect(page.getByTestId('try-tally')).toContainText('2 tries');
  await expect(page.getByText('a game, not a prediction')).toBeVisible();

  await page.getByRole('button', { name: 'Start this ladder' }).click();
  const form = page.getByRole('dialog', { name: 'New bet' });
  await expect(form.getByLabel('Stake')).toHaveValue('100');
  await expect(form.getByLabel('Odds')).toHaveValue('2.00');
  await expect(form.getByLabel('Ladder')).toBeChecked();
  await expect(form.getByLabel('Goal amount')).toHaveValue('1500');
  await form.getByLabel('Bet text').fill(`${tag} from sim`);
  await form.getByLabel('Placed date').fill('01/01/2000');
  await form.getByLabel('Game date').fill('01/01/2000');
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();

  // the ladder's row offers "Open in sim": its rung 1 is locked, the goal comes along
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('rollover-row');
  await expect(row.getByTestId('ladder-goal')).toHaveText(/R\$\s100,00 of R\$\s1\.500,00/);
  await row.click();
  await row.getByRole('button', { name: 'More ladder actions' }).click();
  await page.getByRole('menuitem', { name: 'Open in sim' }).click();
  await expect(page).toHaveURL(/\/ladder-sim$/);
  await expect(page.getByTestId('from-ladder')).toContainText('1 placed rung is locked');
  await expect(page.locator('[data-testid="sim-row"][data-rung="1"]').getByTestId('locked-rung')).toContainText('Pending');
  await expect(page.getByLabel('Note rung 1', { exact: true })).toHaveValue(`${tag} from sim`);
  await page.getByRole('button', { name: 'Reset' }).click();
  void request;
});

test('BT-36: an open ladder loads with its won rungs locked', async ({ page, request, tag }) => {
  const id = `ro-${tag}`;
  const L = { goalRungs: 4, goalAmount: null, taken: false };
  await createBet(request, { betText: `${tag} one`, stake: 50, odds: 2, result: 'won', rolloverId: id, ladder: L });
  await page.goto(`/ladder-sim?ladder=${id}`);
  await expect(page.getByTestId('from-ladder')).toBeVisible();
  await expect(page.getByTestId('sim-row')).toHaveCount(5);
  await expect(page.locator('[data-testid="sim-row"][data-rung="1"]').getByTestId('locked-rung')).toContainText('Won');
  await expect(page.locator('[data-testid="sim-row"][data-rung="1"]').getByTestId('sim-chance')).toHaveText('100.0%');
  await expect(page.locator('[data-testid="sim-row"][data-rung="4"]').getByTestId('sim-pays')).toHaveText(/R\$\s800,00/);
  await page.getByRole('button', { name: 'Reset' }).click();
});
