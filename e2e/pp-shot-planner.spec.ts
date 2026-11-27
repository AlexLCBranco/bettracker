// Owner, 2026-11-27: the PP-shot planner, live while filling the pool and in Build. Shots per PP from the target (never
// leaving the average PP under the minimum); the shots he plans to send must split evenly (every shot on the same
// number of PPs), else the nearest numbers that do are offered; Generate waits until the pool's shots split evenly.
import { expect, test } from './helpers';

test('shot planner: shots per PP, planned shots split evenly or suggestions, Generate waits for an even pool', async ({ page, request, tag }) => {
  const legs = [
    { id: 'mm', selection: `${tag} MM`, odds: 2, tier: 'mm', game: 'G0' },
    ...[1, 2, 3, 4].map((i) => ({ id: `m${i}`, selection: `${tag} M${i}`, odds: 1.7, tier: 'major', game: `G${i}` })),
    ...[1, 2, 3].map((i) => ({ id: `s${i}`, selection: `${tag} S${i}`, odds: 3, tier: 'shot', game: `H${i}` })),
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} planner`, placedDate: '2000-01-01', book: tag, stake: 2, money: 'real', legs, tickets: [] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };

  await page.goto(`/pp/${b.id}?edit=1`);
  const planner = page.getByTestId('shot-planner');
  await planner.getByLabel('Number of PPs').fill('20');
  await planner.getByLabel('Target odds').fill('20');
  await planner.getByLabel('Minimum odds').fill('15');
  // 1 MM at 2, 4 Majors at 1.70, one per PP: 3.40; 1 shot at 3 → 10.20 is under 15, so 2 shots per PP (30.60)
  await expect(planner.getByTestId('shot-plan')).toContainText('1 Major-major and 4 Majors (1 per PP): the average PP is 3.40 before any PP shot.');
  await expect(planner.getByTestId('shots-per-pp')).toHaveText('2 PP shots');
  await expect(planner.getByTestId('per-pp-auto')).toBeVisible();
  // suggested: 40 places → 20 shots on 2 PPs each
  await expect(planner.getByLabel("PP shots you'll send")).toHaveValue('20');
  await expect(planner.getByTestId('plan-ok')).toHaveText('Sending 20 PP shots: each on 2 PPs, every PP shot the same weight.');
  // the pool's 3 shots: 40 ÷ 3 does not split
  await expect(planner.getByTestId('pool-split')).toContainText('Your 3 PP shots do not split evenly: Generate waits. Find 17 more for the 20 planned');

  // 7 planned: not even; the nearest that are: 5 (8 each) or 8 (5 each), or 14 / 21 PPs
  await planner.getByLabel("PP shots you'll send").fill('7');
  await expect(planner.getByTestId('plan-split')).toContainText('7 PP shots do not split evenly (40 ÷ 7 = 5.71)');
  await planner.getByTestId('plan-split').getByRole('button', { name: '8 shots (5 PPs each)' }).click();
  await expect(planner.getByLabel("PP shots you'll send")).toHaveValue('8');
  await expect(planner.getByTestId('plan-ok')).toHaveText('Sending 8 PP shots: each on 5 PPs, every PP shot the same weight.');
  await planner.getByLabel("PP shots you'll send").fill('7');
  await planner.getByTestId('plan-split').getByRole('button', { name: '21 PPs (6 each)' }).click();
  await expect(planner.getByLabel('Number of PPs')).toHaveValue('21');
  await planner.getByLabel('Number of PPs').fill('20');
  await planner.getByRole('button', { name: 'Suggest' }).click();
  await expect(planner.getByLabel("PP shots you'll send")).toHaveValue('20');

  // shots per PP typed over, then Auto again
  await planner.getByLabel('PP shots per PP').fill('1');
  await expect(planner.getByTestId('per-pp-auto')).toHaveCount(0);
  await expect(planner.getByLabel('PP shots per PP')).toBeFocused();
  await planner.getByRole('button', { name: 'Auto' }).click();
  await expect(planner.getByLabel('PP shots per PP')).toHaveValue('2');

  // Build: the same numbers; 3 shots do not split over 20 × 2, so Generate waits
  await page.getByRole('tab', { name: 'Build' }).click();
  const builder = page.getByTestId('builder');
  await expect(builder.getByLabel('PP shots per PP')).toHaveValue('2');
  await expect(builder.getByTestId('not-even')).toContainText('Your 3 PP shots do not split evenly over 20 PPs × 2');
  await expect(builder.getByRole('button', { name: /^Generate \d+ PPs$/ })).toBeDisabled();

  // one more shot: 4 × 10 = 20 × 2, every shot on 10 PPs
  await page.getByRole('tab', { name: /Legs/ }).click();
  const f = page.getByRole('form', { name: 'Add leg' });
  await f.getByLabel('Leg tier').selectOption({ label: 'PP shot' });
  await f.getByLabel('Leg game').fill('H9');
  await f.getByLabel('Leg selection').fill(`${tag} S4`);
  await f.getByLabel('Leg odds').fill('3');
  await f.getByRole('button', { name: 'Add leg' }).click();
  await expect(planner.getByTestId('pool-split')).toContainText('Your 4 PP shots: each on 10 PPs, every one the same weight.');
  await page.getByRole('tab', { name: 'Build' }).click();
  await expect(builder.getByTestId('not-even')).toHaveCount(0);
  await expect(builder.getByTestId('under-min')).toHaveCount(0);
  await expect(builder.getByRole('button', { name: 'Generate 20 PPs' })).toBeEnabled();
  await expect(builder.getByTestId('pv-appearances').locator('tr', { hasText: `${tag} S4` })).toContainText('10 (10)');
});
