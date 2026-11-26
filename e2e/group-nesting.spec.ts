// Shots and dutches read as one block: the group's rail runs down every row under it, its own row is a header, and a
// dutch leg's splits inside a shot are bracketed one level deeper. A cash-out leaves Pending once its woulda is set.
import { createBet, expect, test } from './helpers';

const railColor = (row: import('@playwright/test').Locator) => row.locator('td').first().evaluate((td) => getComputedStyle(td).borderLeftColor);
const padLeft = (row: import('@playwright/test').Locator) => row.locator('td').nth(1).evaluate((td) => parseFloat(getComputedStyle(td).paddingLeft));

test("a shot's bets sit on its rail, a dutch leg's splits one level deeper", async ({ page, request, tag }) => {
  const rolloverId = `ro-${tag}`;
  const dutchId = `du-${tag}`;
  const first = await createBet(request, { betText: `${tag} first`, stake: 100, odds: 1.3, result: 'won', rolloverId, banked: true });
  const x = await createBet(request, { betText: `${tag} X`, stake: 68.1, odds: 2, rolloverId, dutchId });
  const y = await createBet(request, { betText: `${tag} Y`, stake: 61.9, odds: 2.2, rolloverId, dutchId });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const shot = page.getByTestId('rollover-row');
  await expect(shot).toHaveCount(1);
  const rows = [first, x, y].map((b) => page.locator(`[data-bet-id="${b.id}"]`));
  for (const r of rows) await expect(r).toHaveAttribute('data-child', 'true');
  // one rail: every bet under the shot carries the shot's edge colour, not its own (Bet 1 won, the shot is pending)
  const rail = await railColor(shot);
  for (const r of rows) expect(await railColor(r)).toBe(rail);
  // the shot's row is a header: a background the bets under it do not have
  const bg = (l: import('@playwright/test').Locator) => l.evaluate((tr) => getComputedStyle(tr).backgroundColor);
  expect(await bg(shot)).not.toBe(await bg(rows[0]!));
  // the dutch leg's splits: bracketed and indented past Bet 1
  await expect(page.getByTestId('sub-connector')).toHaveCount(2);
  await expect(rows[0]!.getByTestId('sub-connector')).toHaveCount(0);
  expect(await padLeft(rows[1]!)).toBeGreaterThan(await padLeft(rows[0]!));
});

test('a cash-out leaves the To settle tab once its woulda is set', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} cashed`, stake: 100, odds: 2, result: 'cash-out', cashout: 120 });
  await page.goto('/?tab=settle');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  await expect(row).toHaveCount(1);
  await row.getByTestId('result').hover();
  await row.getByRole('button', { name: 'Woulda lost' }).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.getByText('Nothing to settle.')).toBeVisible();
});
