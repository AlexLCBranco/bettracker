// BT-31: pool → scheme (proposal, preview) → generate → tick placed with Space.
import { expect, test } from './helpers';

test('BT-31: pool → scheme → generate → tick placed', async ({ page, request, tag }) => {
  const legs = [
    { id: 'mm', selection: `${tag} MM`, odds: 2, tier: 'mm' },
    ...[1.6, 1.7, 1.8, 1.9].map((odds, i) => ({ id: `m${i}`, selection: `${tag} M${i}`, odds, tier: 'major', game: `G${i}` })),
    ...[3, 3.5, 4, 2.5, 3].map((odds, i) => ({ id: `s${i}`, selection: `${tag} S${i}`, odds, tier: 'shot', game: `H${i}` })),
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} build`, placedDate: '2000-01-01', book: tag, stake: 2, money: 'real', legs, tickets: [] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: 'Build' }).click();
  const builder = page.getByTestId('builder');
  // step 1: the pool by tier
  await expect(builder.getByRole('region', { name: 'Step 1: Pool' })).toContainText('1 Major-major');
  await expect(builder.getByRole('region', { name: 'Step 1: Pool' })).toContainText('4 Major');
  // step 2: one Major and one PP shot per PP; 10 PPs: the 5 shots on 2 PPs each
  await expect(builder.getByLabel('Major: per PP')).toHaveValue('1');
  await builder.getByLabel('Minimum odds').fill('8');
  await builder.getByLabel('PP shots per PP').fill('1');
  await builder.getByLabel('Number of PPs').fill('10');
  await expect(builder.getByTestId('proposal')).toContainText('10 PPs, 1 Major per PP, 1 PP shot per PP: the average PP is');
  // live preview
  // each PP its own stake: the longest gets the minimum (2,00), shorter ones more, so all pay the same
  await expect(builder.getByTestId('pv-stakes')).toHaveText(/^R\$\s2,00 – R\$\s\d+,\d\d \(same payout on every PP\)$/);
  await expect(builder.getByTestId('pv-appearances').locator('tr', { hasText: `${tag} MM` })).toContainText('10 (10)');
  await expect(builder.getByTestId('pv-appearances').locator('tr', { hasText: `${tag} S0` })).toContainText('2 (2)');
  await expect(builder.getByTestId('pv-under')).toHaveText('0 PPs');
  // 6 PPs: 5 shots do not split evenly, so Generate waits (every shot the same weight)
  await builder.getByLabel('Number of PPs').fill('6');
  await expect(builder.getByTestId('not-even')).toContainText('do not split evenly');
  await expect(builder.getByRole('button', { name: /^Generate \d+ PPs$/ })).toBeDisabled();
  await builder.getByLabel('Number of PPs').fill('10');
  await expect(builder.getByTestId('not-even')).toHaveCount(0);

  // step 3: the same seed gives the same PPs; Shuffle changes the seed
  const seed = await builder.getByTestId('seed').textContent();
  await builder.getByRole('button', { name: 'Shuffle' }).click();
  await expect(builder.getByTestId('seed')).not.toHaveText(seed!);
  await builder.getByRole('button', { name: /^Generate \d+ PPs$/ }).click();
  await expect(page.getByRole('tab', { name: /Tickets · \d+/ })).not.toHaveText('Tickets · 0');

  // step 4: Space ticks the current PP and moves down
  const rows = builder.getByTestId('place-row');
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(8);
  await expect(rows.first()).toContainText(`PP 1 · ${tag} MM`);
  await builder.getByTestId('place-list').click();
  await rows.first().click();
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await expect(builder.getByTestId('placed-count')).toHaveText(`3 of ${n}`);
  await expect(rows.nth(3)).toHaveAttribute('data-current', 'true');
  await rows.nth(0).getByLabel('PP 1 book odds').fill('21.5');
  await rows.nth(0).getByLabel('PP 1 book odds').press('Enter');

  // saved: after a reload the ticks and the book's odds are there; the Tickets view shows them
  await expect.poll(async () => ((await (await request.get('/api/pp')).json()) as { id: string; tickets: { placed: boolean; oddsOverride: number | null }[] }[]).find((x) => x.id === b.id)!.tickets.filter((t) => t.placed).length).toBe(3);
  await page.reload();
  await page.getByRole('tab', { name: /Tickets/ }).click();
  const first = page.locator('[data-testid="ticket"][data-number="1"]');
  await expect(first.getByTestId('ticket-odds')).toHaveText('21.50');
  await expect(page.locator('[data-testid="ticket"][data-number="4"]')).toContainText('not placed');
  // staked: the three placed PPs' own stakes; the Tickets view shows each one
  const saved = ((await (await request.get('/api/pp')).json()) as { id: string; tickets: { number: number; placed: boolean; stake: number }[] }[]).find((x) => x.id === b.id)!;
  const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
  expect(Math.min(...saved.tickets.map((t) => t.stake))).toBe(2);
  await expect(page.getByTestId('batch-summary')).toContainText(`Staked ${brl(saved.tickets.filter((t) => t.placed).reduce((a, t) => a + t.stake, 0))}`);
  await expect(first.getByTestId('ticket-stake')).toHaveText(brl(saved.tickets.find((t) => t.number === 1)!.stake));
});
