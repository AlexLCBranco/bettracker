// Owner, 2026-11-27: any leg can be a combo, of any tier (his Major-major is a 3-part combo). Add one in the pool: its parts, the estimate (parts multiplied), the
// book's price typed over it; it shows as one leg with its parts, is edited back the same, and settles as one.
import { expect, test } from './helpers';

type Saved = { id: string; legs: { id: string; selection: string; odds: number; game: string; parts: { game: string; selection: string; odds: number }[]; result: string; tier: string }[] };

test('a combo Major-major: parts, estimated then the book’s price, one leg, settled as one', async ({ page, request, tag }) => {
  const res = await request.post('/api/pp', {
    data: { name: `${tag} combo`, placedDate: '2000-01-01', book: tag, stake: 0.5, money: 'real', legs: [{ id: 'mm', selection: `${tag} MM`, odds: 1.5, tier: 'mm', game: 'G0' }], tickets: [] },
  });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };
  const fetchBatch = async () => ((await (await request.get('/api/pp')).json()) as Saved[]).find((x) => x.id === b.id)!;

  await page.goto(`/pp/${b.id}?edit=1`);
  const f = page.getByRole('form', { name: 'Add leg' });
  // a combo on the first tier (Major-major), not only on PP shots
  await expect(f.getByLabel('Leg tier')).toHaveValue('mm');
  await f.getByLabel('Leg game').fill('Lakers v Celtics');
  await f.getByLabel('Leg selection').fill(`${tag} LeBron 25+`);
  await f.getByLabel('Leg odds').fill('1.5');
  await f.getByLabel('Combo', { exact: true }).check();
  // the first part starts from what was typed
  await expect(f.getByLabel('Part 1 selection')).toHaveValue(`${tag} LeBron 25+`);
  await expect(f.getByLabel('Part 1 game')).toHaveValue('Lakers v Celtics');
  await f.getByLabel('Part 2 game').fill('Nets vs Raptors');
  await f.getByLabel('Part 2 selection').fill(`${tag} Scottie 8 ast`);
  await f.getByLabel('Part 2 odds').fill('2.2');
  await f.getByRole('button', { name: '+ Part' }).click();
  await f.getByLabel('Part 3 game').fill('76ers@Pacers');
  await f.getByLabel('Part 3 selection').fill(`${tag} Maxey 30`);
  await f.getByLabel('Part 3 odds').fill('2');
  // estimated: 1.5 × 2.2 × 2 = 6.60, then the book's price typed over it
  await expect(f.getByLabel('Combo odds')).toHaveValue('6.60');
  await expect(f.getByText('Combo odds (estimated)')).toBeVisible();
  await f.getByLabel('Combo odds').fill('6.25');
  await expect(f.getByText('Combo odds *')).toBeVisible();
  await f.getByRole('button', { name: 'Add leg' }).click();

  const row = page.getByTestId('pp-leg').filter({ hasText: `${tag} Maxey 30` });
  await expect(row.getByTestId('leg-selection')).toHaveText(`${tag} LeBron 25+ + ${tag} Scottie 8 ast + ${tag} Maxey 30`);
  await expect(row.getByTestId('leg-combo')).toHaveText('combo · 3');
  await expect(row.getByTestId('leg-parts')).toContainText(`${tag} Scottie 8 ast @ 2.20 (Nets vs Raptors)`);
  await expect(row).toContainText('6.25');
  await expect.poll(async () => (await fetchBatch()).legs.length).toBe(2);
  const combo = (await fetchBatch()).legs.find((l) => l.parts.length)!;
  expect(combo.odds).toBe(6.25);
  expect(combo.tier).toBe('mm');
  expect(combo.parts.map((x) => [x.selection, x.odds, x.game])).toEqual([
    [`${tag} LeBron 25+`, 1.5, 'Lakers v Celtics'],
    [`${tag} Scottie 8 ast`, 2.2, 'Nets vs Raptors'],
    [`${tag} Maxey 30`, 2, '76ers@Pacers'],
  ]);

  // editing opens it as a combo with the book's price kept
  await row.getByRole('button', { name: 'Edit leg' }).click();
  const ef = page.getByRole('form', { name: 'Edit leg' });
  await expect(ef.getByLabel('Combo', { exact: true })).toBeChecked();
  await expect(ef.getByLabel('Part 3 selection')).toHaveValue(`${tag} Maxey 30`);
  await expect(ef.getByLabel('Combo odds')).toHaveValue('6.25');
  await ef.getByRole('button', { name: 'Cancel' }).click();

  // settled as one leg
  await row.getByRole('button', { name: 'Mark Won' }).click();
  await expect.poll(async () => (await fetchBatch()).legs.find((l) => l.parts.length)!.result).toBe('won');
});
