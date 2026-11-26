// BT-66: a click on an Analytics row opens the Bets page filtered to exactly that row's bets, with a chip.
import { createBet, expect, test } from './helpers';

test('BT-66: one row per breakdown opens Bets with the same count and a removable chip', async ({ page, request, tag }) => {
  test.setTimeout(90_000);
  const legs = (market: string) => [{ sport: `${tag} Sport`, market, selection: 'x', odds: 2 }];
  await createBet(request, { betText: `${tag} a`, book: `${tag} Book`, stake: 10, odds: 1.4, result: 'won', label: `${tag}lab`, noBrainer: true, legs: legs(`${tag} Mkt`) });
  await createBet(request, { betText: `${tag} b`, book: `${tag} Book`, stake: 10, odds: 2.5, result: 'lost', situation: 'live', legs: legs(`${tag} Mkt`) });
  await createBet(request, { betText: `${tag} c`, book: `${tag} Book`, stake: 10, odds: 6, legs: legs('') });
  const d = `${tag}-d`.replace(/[^A-Za-z0-9_-]/g, '');
  await createBet(request, { betText: '', dutchId: d, book: `${tag} Book`, stake: 10, odds: 3, result: 'won', legs: legs(`${tag} Mkt`) });
  await createBet(request, { betText: '', dutchId: d, book: `${tag} Book`, stake: 10, odds: 3, result: 'lost', legs: legs(`${tag} Mkt`) });

  const cases: [dim: string, param: RegExp, rowText: string | RegExp][] = [
    ['Sport', /sport=/, `${tag} Sport`],
    ['Book', /book=/, `${tag} Book`],
    ['Market', /market=/, `${tag} Mkt`],
    ['Odds', /odds=/, /Semi/],
    ['Type', /type=/, 'Dutch'],
    ['Situation', /situation=/, 'Live'],
    ['No brainer', /nb=/, 'No brainer'],
    ['Label', /label=/, `${tag}lab`.toUpperCase()],
  ];
  for (const [dim, param, rowText] of cases) {
    await page.goto('/analytics');
    await page.getByRole('tablist', { name: 'Break down by' }).getByRole('tab', { name: dim, exact: true }).click();
    const row = page.getByTestId('analytics-row').filter({ hasText: rowText }).first();
    const n = Number(/^\d+/.exec((await row.getByTestId('cell-bets').textContent()) ?? '')![0]);
    await row.getByTestId('row-open').click();
    await expect(page).toHaveURL(param);
    // the Bets page counts what the row counted, and says why the list is short
    await expect(page.getByTestId('stat-wagered')).toHaveText(new RegExp(`^${n} of \\d+ bets?$`));
    await expect(page.locator('[data-testid=filter-chip][data-group]')).toHaveCount(1);
  }

  // the chip's × clears it
  await page.locator('[data-testid=filter-chip][data-group]').getByRole('button').click();
  await expect(page).not.toHaveURL(/label=/);
  await expect(page.locator('[data-testid=filter-chip][data-group]')).toHaveCount(0);

  // a dutch table row and a "Not set" row open the same way
  await page.goto('/analytics?tab=dutches');
  const split = page.getByRole('table', { name: 'By number of splits' }).getByTestId('analytics-row').first();
  const ns = Number(/^\d+/.exec((await split.getByTestId('cell-bets').textContent()) ?? '')![0]);
  await split.getByTestId('row-open').click();
  await expect(page).toHaveURL(/dutchSplits=/);
  await expect(page.getByTestId('stat-wagered')).toHaveText(new RegExp(`^${ns} of`));
  await page.goto('/analytics');
  await page.getByRole('tablist', { name: 'Break down by' }).getByRole('tab', { name: 'Market' }).click();
  const notSet = page.getByTestId('analytics-row').filter({ hasText: 'Not set' });
  const nn = Number(/^\d+/.exec((await notSet.getByTestId('cell-bets').textContent()) ?? '')![0]);
  await notSet.getByTestId('row-open').click();
  await expect(page).toHaveURL(/market=%7Enot-set/);
  await expect(page.getByTestId('stat-wagered')).toHaveText(new RegExp(`^${nn} of`));
  await expect(page.locator('[data-testid=filter-chip][data-group]')).toHaveText(['Market: Not set×']);

  // "One leg away" opens that one bet
  await createBet(request, {
    betText: `${tag} combo`,
    type: 'combination',
    stake: 10,
    odds: 4,
    result: 'lost',
    legs: [
      { selection: 'A', odds: 2, result: 'won' },
      { selection: 'B', odds: 2, result: 'lost' },
    ],
  });
  await page.goto('/analytics?tab=combinations');
  await page.getByTestId('one-leg-away-link').filter({ hasText: `${tag} combo` }).click();
  await expect(page).toHaveURL(/bet=/);
  await expect(page.getByTestId('stat-wagered')).toHaveText(/^1 of/);
  await expect(page.locator('[data-testid=filter-chip][data-group]')).toHaveText([`Bet: ${tag} combo×`]);
});
