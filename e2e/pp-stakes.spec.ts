// Owner, 2026-11-27: only the minimum per PP is typed (0,50 most of the time, prefilled and remembered); each PP's
// stake follows so every PP pays about the same: the longest gets the minimum, shorter ones more.
import { expect, test } from './helpers';

type Saved = { id: string; stake: number; legs: { id: string; odds: number }[]; tickets: { id: string; number: number; legIds: string[]; stake: number; oddsOverride: number | null }[] };
const brl = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;

test('minimum stake prefilled and remembered; each PP its own stake, same payout', async ({ page, request, tag }) => {
  // New batch: the minimum is prefilled with 0,50; the last one used is remembered
  await page.goto('/pp');
  await page.evaluate(() => localStorage.removeItem('bettracker:pp-min-stake'));
  await page.reload();
  await page.getByRole('button', { name: 'New batch' }).click();
  let nb = page.getByRole('form', { name: 'New batch' });
  await expect(nb.getByLabel('Minimum stake per PP')).toHaveValue('0,50');
  await nb.getByLabel('Batch name').fill(`${tag} stakes`);
  await nb.getByLabel('Placed date').fill('01/01/2000');
  await nb.getByLabel('Minimum stake per PP').fill('0,75');
  await nb.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/pp\/[^/?]+\?edit=1/);
  await expect(page.getByTestId('batch-fields').getByLabel('Minimum stake per PP')).toHaveValue('0.75');
  await page.goto('/pp');
  await page.getByRole('button', { name: 'New batch' }).click();
  nb = page.getByRole('form', { name: 'New batch' });
  await expect(nb.getByLabel('Minimum stake per PP')).toHaveValue('0,75');
  await page.evaluate(() => localStorage.removeItem('bettracker:pp-min-stake'));

  // a pool, then Generate: each PP gets its own stake
  const legs = [
    { id: 'mm', selection: `${tag} MM`, odds: 2, tier: 'mm', game: 'G0' },
    ...[1.6, 1.7, 1.8, 1.9].map((odds, i) => ({ id: `m${i}`, selection: `${tag} M${i}`, odds, tier: 'major', game: `G${i + 1}` })),
    ...[3, 3.5, 4, 2.5, 3].map((odds, i) => ({ id: `s${i}`, selection: `${tag} S${i}`, odds, tier: 'shot', game: `H${i}` })),
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} gen`, placedDate: '2000-01-01', book: tag, stake: 0.5, money: 'real', legs, tickets: [] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };
  const fetchBatch = async () => ((await (await request.get('/api/pp')).json()) as Saved[]).find((x) => x.id === b.id)!;

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: 'Build' }).click();
  const builder = page.getByTestId('builder');
  await builder.getByLabel('Number of PPs').fill('10');
  await expect(builder.getByTestId('pv-stakes')).toContainText('R$ 0,50 – ');
  await builder.getByRole('button', { name: /^Generate \d+ PPs$/ }).click();
  await expect.poll(async () => (await fetchBatch()).tickets.length).toBeGreaterThan(5);

  const saved = await fetchBatch();
  const oddsOf = (t: Saved['tickets'][number]) => t.legIds.reduce((p, id) => p * saved.legs.find((l) => l.id === id)!.odds, 1);
  const payout = 0.5 * Math.max(...saved.tickets.map(oddsOf));
  expect(Math.min(...saved.tickets.map((t) => t.stake))).toBe(0.5);
  expect(new Set(saved.tickets.map((t) => t.stake)).size).toBeGreaterThan(1);
  for (const t of saved.tickets) {
    expect(t.stake).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(t.stake * oddsOf(t) - payout)).toBeLessThan(0.005 * oddsOf(t) + 1e-9); // within the cent's rounding
  }

  // Place shows each PP's stake; the book took another amount on PP 1
  const pp1 = saved.tickets.find((t) => t.number === 1)!;
  const row1 = builder.getByTestId('place-row').first();
  await expect(row1.getByLabel('PP 1 stake')).toHaveValue(pp1.stake.toFixed(2).replace('.', ','));
  await row1.getByLabel('PP 1 stake').fill('1,10');
  await row1.getByLabel('PP 1 stake').press('Enter');
  await expect.poll(async () => (await fetchBatch()).tickets.find((t) => t.number === 1)!.stake).toBe(1.1);

  // Tickets: the stake column; a PP by hand gets the stake that pays the same, typed over if wanted
  await page.getByRole('tab', { name: /Tickets/ }).click();
  await expect(page.locator('[data-testid="ticket"][data-number="1"]').getByTestId('ticket-stake')).toHaveText(brl(1.1));
  await page.getByTestId('edit-toggle').click();
  await page.getByRole('button', { name: '+ Add PP' }).click();
  const f = page.getByRole('form', { name: /New PP/ });
  await f.getByText(`${tag} S0`).click(); // MM 2 × S0 3 = 6.00
  const after = await fetchBatch();
  const top = Math.max(...after.tickets.map((t) => t.stake * oddsOf(t)));
  const expected = Math.max(0.5, Math.round((top / 6) * 100) / 100);
  await expect(f.getByLabel('PP stake')).toHaveAttribute('placeholder', expected.toFixed(2));
  await f.getByRole('button', { name: 'Save PP' }).click();
  await expect(f).toBeHidden();
  await expect.poll(async () => (await fetchBatch()).tickets.find((t) => t.legIds.length === 2 && t.legIds.includes('s0') && t.legIds.includes('mm'))?.stake).toBe(expected);
});
