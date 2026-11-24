// BT-32: the batch's Stats tab (per tier vs implied, lost by one) and the across-batches section with its date range.
import { expect, test } from './helpers';

test('BT-32: stats per batch and across batches', async ({ page, request, tag }) => {
  const legs = [
    { id: 'mm', selection: `${tag} MM`, odds: 2, tier: 'mm', result: 'won', sport: 'NBA', market: 'Assists' },
    { id: 'j', selection: `${tag} Jokic 12+ ast`, odds: 2, tier: 'major', result: 'lost', actual: '11', note: 'sure thing', sport: 'NBA', market: 'Assists' },
    { id: 'm', selection: `${tag} Celtics ML`, odds: 1.6, tier: 'major', result: 'won', sport: 'NBA', market: 'Moneyline' },
    { id: 's', selection: `${tag} Shot`, odds: 4, tier: 'shot', result: 'won', sport: 'Soccer', market: 'Goals' },
  ];
  const tickets = [
    { id: 't1', number: 1, legIds: ['mm', 'j', 'm'] },
    { id: 't2', number: 2, legIds: ['mm', 'j', 's'] },
    { id: 't3', number: 3, legIds: ['mm', 'm', 's'] },
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} stats`, placedDate: '2000-01-01', book: tag, stake: 10, money: 'real', legs, tickets } });
  const b = (await res.json()) as { id: string };

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: 'Stats' }).click();
  const stats = page.getByTestId('batch-stats');
  const major = stats.getByTestId('tier-stats').getByTestId('hit-row').filter({ has: page.getByRole('cell', { name: 'Major', exact: true }) });
  await expect(major).toContainText('1–1');
  await expect(major.getByTestId('hit-rate')).toHaveText('50.0%');
  await expect(major).toContainText('56.3%'); // implied: (1/2 + 1/1.6) / 2
  await expect(stats.getByTestId('tier-stats').getByTestId('hit-row').filter({ hasText: 'PP shot' }).getByTestId('hit-rate')).toHaveText('100.0%');
  await expect(stats.getByTestId('lost-by-one-row')).toHaveText(new RegExp(`${tag} Jokic 12\\+ ast → 11 killed 2 PPs that were otherwise complete \\(PP 1, 2\\)\\s*sure thing`));

  // across batches, narrowed to this test's date
  await page.goto('/pp');
  const across = page.getByTestId('across-batches');
  await across.getByLabel('Stats from').fill('01/01/2000');
  await across.getByLabel('Stats to').fill('01/01/2000');
  await expect(across).toContainText('· 1 batch');
  await expect(across.getByTestId('by-sport').getByTestId('hit-row').filter({ hasText: 'NBA' })).toContainText('2–1');
  await expect(across.getByTestId('by-market').getByTestId('hit-row').filter({ hasText: 'Assists' }).getByTestId('hit-rate')).toHaveText('50.0%');
  await expect(across.getByTestId('tier-chart')).toBeVisible();
});
