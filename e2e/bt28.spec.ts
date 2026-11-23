// BT-28: one-click leg results, and legs, splits and dutch always agree.
import { betsTagged, createBet, expect, test } from './helpers';
import type { Page } from '@playwright/test';

async function search(page: Page, tag: string) {
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
}

/** A dutch of two combination splits sharing the leg "<tag> Shared". */
async function sharedLegDutch(request: Parameters<typeof createBet>[0], tag: string) {
  const dutchId = `${tag}-d`;
  const split = (own: string) =>
    createBet(request, {
      betText: '',
      type: 'combination',
      odds: 4,
      dutchId,
      money: 'real',
      legs: [
        { sport: 'NBA', game: `${tag} Big game`, market: 'ML', selection: `${tag} Shared`, odds: 2 },
        { sport: 'NBA', game: `${tag} ${own} game`, market: 'ML', selection: `${tag} ${own}`, odds: 2 },
      ],
    });
  return [await split('A'), await split('B')];
}

test('BT-28: L on a shared leg of a dutch → every split and the dutch read Lost; Z undoes it in one step', async ({ page, request, tag }) => {
  const [a, b] = await sharedLegDutch(request, tag);
  await search(page, tag);
  const dutch = page.locator(`[data-dutch-id="${tag}-d"]`);
  await expect(dutch.getByTestId('result')).toHaveText('Pending');

  await page.locator(`[data-bet-id="${a!.id}"]`).getByRole('button', { name: 'Show legs' }).click();
  const legs = page.locator(`[data-leg-of="${a!.id}"]`);
  await expect(legs.first().getByTestId('leg-result')).toContainText('W'); // a pending leg: W / L / V buttons
  await legs.first().getByRole('button', { name: 'Mark leg 1 Lost' }).click();

  await expect(dutch.getByTestId('result')).toHaveText('Lost');
  for (const id of [a!.id, b!.id]) await expect(page.locator(`[data-bet-id="${id}"]`).getByTestId('result')).toHaveText('Lost');
  await expect(legs.first().getByTestId('leg-result')).toHaveAttribute('data-result', 'lost');
  // the split's other leg: not known, "?" with W / L (never "Pending" on a settled bet)
  await expect(legs.nth(1).getByTestId('leg-result')).toHaveAttribute('data-unknown', 'true');
  await expect
    .poll(async () => (await betsTagged(request, tag)).map((x) => [x.result, x.legs[0]!.result]))
    .toEqual([
      ['lost', 'lost'],
      ['lost', 'lost'],
    ]);

  await page.keyboard.press('z');
  await expect(dutch.getByTestId('result')).toHaveText('Pending');
  await expect
    .poll(async () => (await betsTagged(request, tag)).map((x) => [x.result, ...x.legs.map((l) => l.result)]))
    .toEqual([
      ['pending', 'pending', 'pending'],
      ['pending', 'pending', 'pending'],
    ]);
});

test('BT-28: a combination settled lost shows "?" legs; clicking W on one leaves the other worked out as lost', async ({ page, request, tag }) => {
  const combo = await createBet(request, {
    betText: `${tag} two legs`,
    type: 'combination',
    odds: 4,
    money: 'real',
    legs: [
      { sport: 'NBA', game: 'G1', market: 'ML', selection: 'One', odds: 2 },
      { sport: 'NBA', game: 'G2', market: 'ML', selection: 'Two', odds: 2 },
    ],
  });
  await search(page, tag);
  const row = page.locator(`[data-bet-id="${combo.id}"]`);
  await row.getByRole('button', { name: 'Mark Lost' }).click();
  await expect(row.getByTestId('result')).toHaveText('Lost');
  await row.getByRole('button', { name: 'Show legs' }).click();
  const legs = page.locator(`[data-leg-of="${combo.id}"]`);
  for (const i of [0, 1]) {
    await expect(legs.nth(i).getByTestId('leg-result')).toHaveAttribute('data-unknown', 'true');
    await expect(legs.nth(i).getByTestId('leg-result')).not.toContainText('Pending');
  }
  await legs.first().getByRole('button', { name: 'Mark leg 1 Won' }).click();
  await expect(legs.nth(1).getByTestId('leg-result')).toHaveAttribute('data-result', 'lost');
  await expect(row.getByTestId('result')).toHaveText('Lost');

  // the lost leg changed to won → every leg won → the bet is won
  await legs.nth(1).getByRole('button', { name: 'Leg 2 result: Lost' }).click();
  await legs.nth(1).getByRole('button', { name: 'Mark leg 2 Won' }).click();
  await expect(row.getByTestId('result')).toHaveText('Won');
  await expect.poll(async () => (await betsTagged(request, tag))[0]!.result).toBe('won');
});
