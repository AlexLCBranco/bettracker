// Owner, 2026-11-27: "with 1 Major-major and 4 Majors, how many PP shots do I need?" A live line while filling the pool
// (Legs tab in edit mode) and in Build step 1, on the same numbers as the Build scheme.
import { expect, test } from './helpers';

test('shot planner: PP shots needed from the pool, live as legs are added, shared with Build', async ({ page, request, tag }) => {
  const legs = [
    { id: 'mm', selection: `${tag} MM`, odds: 2, tier: 'mm', game: 'G0' },
    ...[1, 2, 3, 4].map((i) => ({ id: `m${i}`, selection: `${tag} M${i}`, odds: 1.7, tier: 'major', game: `G${i}` })),
    ...[1, 2, 3].map((i) => ({ id: `s${i}`, selection: `${tag} S${i}`, odds: 3, tier: 'shot', game: `H${i}` })),
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} planner`, placedDate: '2000-01-01', book: tag, stake: 2, money: 'real', legs, tickets: [] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };

  // Majors per PP live in Build: one (the owner's), then plan in the Legs tab (same numbers)
  await page.goto(`/pp/${b.id}?edit=1`);
  await page.getByRole('tab', { name: 'Build' }).click();
  await page.getByTestId('builder').getByLabel('Major: per PP').fill('1');
  await page.getByRole('tab', { name: /Legs/ }).click();

  const planner = page.getByTestId('shot-planner');
  await planner.getByLabel('Number of PPs').fill('20');
  await planner.getByLabel('Target odds').fill('20');
  await planner.getByLabel('PP shot: PPs each').fill('2');
  await expect(planner.getByLabel('PP shot odds (typical)')).toHaveValue('3'); // the pool's shots at their average
  await expect(planner.getByTestId('shot-plan')).toContainText('1 Major-major and 4 Majors (1 per PP): the average PP is 3.40 before any PP shot.');
  await expect(planner.getByTestId('shots-needed')).toHaveText('17 PP shots');
  await expect(planner.getByTestId('shots-missing')).toHaveText('You have 3: find 14 more.');

  // live: one more shot in the pool
  const f = page.getByRole('form', { name: 'Add leg' });
  await f.getByLabel('Leg game').fill('H9');
  await f.getByLabel('Leg selection').fill(`${tag} S4`);
  await f.getByLabel('Leg odds').fill('3');
  await f.getByLabel('Leg tier').selectOption({ label: 'PP shot' });
  await f.getByRole('button', { name: 'Add leg' }).click();
  await expect(planner.getByTestId('shots-missing')).toHaveText('You have 4: find 13 more.');

  // a cheaper typical shot needs more of them
  await planner.getByLabel('PP shot odds (typical)').fill('2.5');
  await expect(planner.getByTestId('shots-needed')).toHaveText('20 PP shots');

  // fewer PPs: enough
  await planner.getByLabel('Number of PPs').fill('4');
  await expect(planner.getByTestId('shots-missing')).toHaveText('You have 4: enough.');

  // Build shares the numbers
  await page.getByRole('tab', { name: 'Build' }).click();
  const builder = page.getByTestId('builder');
  await expect(builder.getByLabel('Number of PPs')).toHaveValue('4');
  await expect(builder.getByTestId('shot-planner').getByTestId('shots-needed')).toHaveText('4 PP shots');
});
