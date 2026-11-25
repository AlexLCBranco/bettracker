// BT-49: "what if" on a banked shot: type a next-leg odd, see the final shot, Enter opens "+ Add leg" filled in.
import { createBet, expect, test } from './helpers';

const rid = (tag: string, s: string) => `${tag}-${s}`.replace(/[^A-Za-z0-9_-]/g, '');

test("BT-49: banked @ 1.55, what if 1.20 → 1.86 Shot; Enter opens Add leg with 1.2 and the same preview", async ({ page, request, tag }) => {
  // R$ 100 @ 1.55 won and banked: R$ 155
  const first = await createBet(request, { betText: `${tag} first`, stake: 100, odds: 1.55, result: 'won', money: 'real', rolloverId: rid(tag, 'a'), banked: true });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const shot = page.locator(`[data-key="rollover:${first.rolloverId}"]`);
  await expect(shot.getByTestId('result')).toHaveText('Open');

  const widths = () => page.locator('[data-testid=bet-table] thead th').evaluateAll((ths) => ths.map((t) => Math.round(t.getBoundingClientRect().width)));
  const before = await widths();
  // the key opens it on the selected shot; the box sits under the row and keeps the "needs" hint
  await shot.getByTestId('type').click();
  await page.keyboard.press('i');
  const box = page.getByTestId('whatif');
  await expect(box).toBeVisible();
  await expect(box.getByTestId('whatif-needs')).toHaveText('needs 1.17+ to reach 1.80 (Shot)');
  const input = box.getByTestId('whatif-input');
  await expect(input).toBeFocused();

  // several at once, decimal commas, US odds: one line each
  await input.fill('1,1; 1,2; -500');
  const lines = box.getByTestId('whatif-line');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0).getByTestId('whatif-odds')).toHaveText('1.71');
  await expect(lines.nth(0).getByTestId('whatif-tier')).toHaveText('Pepsi');
  await expect(lines.nth(1).getByTestId('whatif-odds')).toHaveText('1.86');
  await expect(lines.nth(1).getByTestId('whatif-tier')).toHaveText('Shot');
  await expect(lines.nth(1).getByTestId('whatif-payout')).toHaveText(/R\$\s186,00/);
  await expect(lines.nth(1).getByTestId('whatif-profit')).toHaveText(/\+R\$\s86,00/);
  await expect(lines.nth(2).getByTestId('whatif-odds')).toHaveText('1.86');
  expect(await widths()).toEqual(before);
  await page.screenshot({ path: 'test-results/bt49-whatif.png' });

  // Esc closes, nothing saved; the table's columns did not move
  await input.press('Escape');
  await expect(box).toBeHidden();

  // the toggle opens it again; one odd + Enter opens "+ Add leg" with it filled in
  await shot.getByTestId('whatif-toggle').click();
  await page.getByTestId('whatif-input').fill('1,2');
  await page.getByTestId('whatif-input').press('Enter');
  const form = page.getByRole('dialog', { name: 'Add rollover leg' });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Stake')).toHaveValue('155');
  await expect(form.getByLabel('Odds')).toHaveValue('1.2');
  const preview = form.getByTestId('whatif-preview');
  await expect(preview.getByTestId('whatif-odds')).toHaveText('1.86');
  await expect(preview.getByTestId('whatif-tier')).toHaveText('Shot');
  await expect(preview.getByTestId('whatif-profit')).toHaveText(/\+R\$\s86,00/);
  // the preview follows the odds typed
  await form.getByLabel('Odds').fill('1.1');
  await expect(preview.getByTestId('whatif-odds')).toHaveText('1.71');
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(shot.getByTestId('type')).toHaveText('Rollover ×1');
});

test('BT-49: the top-bar Banked list tries an odd and places it on the Banked tab', async ({ page, request, tag }) => {
  const first = await createBet(request, { betText: `${tag} first`, stake: 100, odds: 1.55, result: 'won', money: 'real', rolloverId: rid(tag, 'b'), banked: true });
  await page.goto('/');
  await page.getByTestId('banked').click();
  const panel = page.getByTestId('banked-panel');
  const li = panel.locator('li').filter({ has: page.getByTestId('banked-item').filter({ hasText: /R\$\s155,00/ }).filter({ hasText: '@ 1.55 Pepsi' }) }).first();
  await li.getByTestId('banked-whatif-toggle').click();
  await li.getByTestId('whatif-input').fill('1.2');
  await expect(li.getByTestId('whatif-odds')).toHaveText('1.86');
  await li.getByTestId('whatif-place').click();
  const form = page.getByRole('dialog', { name: 'Add rollover leg' });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Stake')).toHaveValue('155');
  await expect(form.getByLabel('Odds')).toHaveValue('1.2');
  await expect(page).toHaveURL(/tab=banked/);
  await expect(page).not.toHaveURL(/leg=/);
  await form.getByRole('button', { name: 'Cancel' }).click();
  expect(first.banked).toBe(true);
});
