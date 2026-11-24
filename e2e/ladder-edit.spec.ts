// A ladder rung edited in the full form stays a rung: the form has no ladder field, so the edit must keep it.
import { betsTagged, createBet, expect, test } from './helpers';

test('editing a ladder rung in the form keeps it in its ladder (goal kept)', async ({ page, request, tag }) => {
  const id = `${tag}-lad`.replace(/[^A-Za-z0-9_-]/g, '');
  const ladder = { goalRungs: 3, goalAmount: null, taken: false };
  const rung = await createBet(request, { betText: `${tag} rung`, stake: 50, odds: 2, money: 'real', rolloverId: id, ladder });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${rung.id}"]`);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit bet' });
  await form.getByLabel('Bet text').fill(`${tag} rung edited`);
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag))[0]?.betText).toBe(`${tag} rung edited`);
  expect((await betsTagged(request, tag))[0]).toMatchObject({ rolloverId: id, ladder });
  await expect(page.getByTestId('ladder-goal')).toHaveText('rung 1 of 3');
});
