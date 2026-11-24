// BT-45: marquee select and bulk actions on the Bets table, on throwaway bets only (the search box keeps the table to
// this test's tag).
import { betsTagged, createBet, expect, saved, test } from './helpers';
import type { Locator, Page } from '@playwright/test';

async function setup(page: Page, request: Parameters<typeof createBet>[0], tag: string) {
  const bets = [];
  for (const [i, stake] of [10, 20, 30, 40].entries()) bets.push(await createBet(request, { stake, odds: 2, betText: `${tag} pick ${i + 1}`, legs: [{ selection: `${tag} pick ${i + 1}`, odds: 2 }] }));
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const rows = bets.map((b) => page.locator(`[data-bet-id="${b.id}"]`));
  await expect(rows[3]!).toBeVisible();
  return { bets, rows };
}

/** The empty first cell of a row: no text there, so a press starts a drag. */
async function edge(row: Locator) {
  const box = (await row.locator('td').first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('marquee: drag over three rows, read the totals, bulk Won then undo', async ({ page, request, tag }) => {
  const { rows } = await setup(page, request, tag);
  // table order is newest first: rows[3] is on top
  const from = await edge(rows[3]!);
  const to = await edge(rows[1]!);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId('marquee')).toHaveCount(0);

  const bar = page.getByTestId('bulk-bar');
  await expect(bar.getByTestId('bulk-count')).toHaveText('3 selected');
  await expect(bar.getByTestId('bulk-stake')).toContainText('R$ 90,00');
  await expect(bar.getByTestId('bulk-pays')).toContainText('R$ 180,00');
  for (const i of [1, 2, 3]) await expect(rows[i]!).toHaveAttribute('data-multi', 'true');
  await expect(rows[0]!).not.toHaveAttribute('data-multi', 'true');

  // single-row keys do nothing while several rows are selected
  await page.keyboard.press('w');
  await page.waitForTimeout(300);
  expect((await betsTagged(request, tag)).every((b) => b.result === 'pending')).toBe(true);

  await bar.getByRole('button', { name: 'Won', exact: true }).click();
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).filter((b) => b.result === 'won').length).toBe(3);
  // one undo step puts all three back
  await page.keyboard.press('Control+z');
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).filter((b) => b.result === 'won').length).toBe(0);
});

test('Ctrl+click, Shift+click, Ctrl+A, Esc and bulk delete with its confirm', async ({ page, request, tag }) => {
  const { bets, rows } = await setup(page, request, tag);
  const bar = page.getByTestId('bulk-bar');
  await rows[3]!.locator('td').first().click();
  await rows[1]!.locator('td').first().click({ modifiers: ['Control'] });
  await expect(bar.getByTestId('bulk-count')).toHaveText('2 selected');
  await expect(rows[2]!).not.toHaveAttribute('data-multi', 'true');
  await rows[1]!.locator('td').first().click({ modifiers: ['Control'] });
  await expect(bar).toHaveCount(0);

  // Shift+click: a range from the last clicked row
  await rows[3]!.locator('td').first().click();
  await rows[0]!.locator('td').first().click({ modifiers: ['Shift'] });
  await expect(bar.getByTestId('bulk-count')).toHaveText('4 selected');
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);

  await page.keyboard.press('Control+a');
  await expect(bar.getByTestId('bulk-count')).toHaveText('4 selected');

  // label all four, as one step
  await bar.getByRole('button', { name: 'Label…' }).click();
  await bar.getByLabel('Bulk label').fill('bulk test');
  await bar.getByLabel('Bulk label').press('Enter');
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).map((b) => b.label)).toEqual(['bulk test', 'bulk test', 'bulk test', 'bulk test']);

  page.once('dialog', (d) => {
    expect(d.message()).toContain('Delete 4 selected rows (4 bets)');
    void d.accept();
  });
  await bar.getByRole('button', { name: 'Delete' }).click();
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(0);
  for (const r of rows) await expect(r).toHaveCount(0);
  // and back with one undo
  await page.keyboard.press('Control+z');
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(bets.length);
});
