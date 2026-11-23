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
  // step 2: placeholders, then the proposal: about one PP shot per PP → 2 × 5 = 10 PPs
  await expect(builder.getByLabel('Major: % of PPs')).toHaveValue('50');
  await expect(builder.getByLabel('PP shot: PPs each')).toHaveValue('2');
  await expect(builder.getByTestId('proposal')).toContainText('10 PPs');
  await builder.getByRole('button', { name: 'Use proposal' }).click();
  await expect(builder.getByLabel('Number of PPs')).toHaveValue('10');
  await expect(builder.getByLabel('Major: % of PPs')).not.toHaveValue('50');
  // live preview
  await expect(builder.getByTestId('pv-stake')).toHaveText(/R\$\s20,00/);
  await expect(builder.getByTestId('pv-appearances')).toContainText(`${tag} MM`);
  await expect(builder.getByTestId('pv-appearances').locator('tr', { hasText: `${tag} MM` })).toContainText('10 (10)');
  await builder.getByLabel('Number of PPs').fill('6');
  await expect(builder.getByTestId('pv-stake')).toHaveText(/R\$\s12,00/);
  await builder.getByLabel('Number of PPs').fill('10');

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
  await expect(page.getByTestId('batch-summary')).toContainText('Staked R$ 6,00');
});
