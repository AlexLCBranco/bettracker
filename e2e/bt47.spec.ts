// BT-47: a bet's description seen and edited from the Bets table, on throwaway bets.
import { betsTagged, createBet, expect, saved, test } from './helpers';

test('descriptions: D opens it under the row, click away saves, Esc discards, the switch opens all with text', async ({ page, request, tag }) => {
  const mk = (n: string, over: Record<string, unknown> = {}) => createBet(request, { betText: `${tag} ${n}`, legs: [{ selection: `${tag} ${n}`, odds: 2 }], ...over });
  const a = await mk('A', { preAnalysis: 'Jokic vs a weak front court', postAnalysis: 'lost by one' });
  const b = await mk('B');
  const c = await mk('C', { postAnalysis: 'garbage time' });
  const d = await mk('D');
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const row = (x: { id: string }) => page.locator(`[data-bet-id="${x.id}"]`);
  const descRow = (x: { id: string }) => page.locator(`[data-desc-for="bet:${x.id}"]`);
  await expect(row(d)).toBeVisible();

  // BT-52: a mark on every row, its dots lit for the slots with text
  await expect(row(a).getByTestId('desc-mark')).toHaveAttribute('data-filled', 'pre,post');
  await expect(row(c).getByTestId('desc-mark')).toHaveAttribute('data-filled', 'post');
  await expect(row(b).getByTestId('desc-mark')).not.toHaveAttribute('data-filled');

  // D on a row without one opens empty boxes; typing then clicking away saves
  await row(b).locator('td').first().click();
  await page.keyboard.press('d');
  await expect(descRow(b)).toBeVisible();
  await descRow(b).getByLabel('Pre note').fill('typed from the table');
  await page.getByTestId('stats').click({ position: { x: 4, y: 4 } });
  await expect(descRow(b)).toHaveCount(0);
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === b.id)!.preAnalysis).toBe('typed from the table');
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await expect(row(b).getByTestId('desc-mark')).toHaveAttribute('data-filled', 'pre');

  // a click on the mark opens it; Esc closes without saving
  await row(a).getByTestId('desc-mark').click();
  await expect(descRow(a)).toBeVisible();
  await descRow(a).getByLabel('Show Pre').click();
  await descRow(a).getByLabel('Edit the Pre note').click();
  await descRow(a).getByLabel('Pre note').fill('not saved');
  await descRow(a).getByLabel('Pre note').press('Escape');
  await expect(descRow(a)).toHaveCount(0);
  await saved(page);
  expect((await betsTagged(request, tag)).find((x) => x.id === a.id)!.preAnalysis).toBe('Jokic vs a weak front court');

  // the switch: every row with a description open, and only those
  await page.getByLabel('Descriptions').check();
  await expect(page.getByTestId('desc-row')).toHaveCount(3);
  await expect(descRow(d)).toHaveCount(0);
  await page.getByLabel('Descriptions').uncheck();
  await expect(page.getByTestId('desc-row')).toHaveCount(0);
});
