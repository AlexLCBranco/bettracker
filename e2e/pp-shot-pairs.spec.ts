// Owner, 2026-11-27 (Garland 21 pts and McDaniels 20 pts together on PP 8 and PP 18): two PP shots share ONE PP at
// most. Generate keeps it (and says so when it cannot); a batch already breaking it is flagged on the Tickets tab.
import { expect, test } from './helpers';

type Saved = { id: string; tickets: { legIds: string[] }[] };

test('Generate never puts two PP shots together on more than one PP', async ({ page, request, tag }) => {
  const legs = [
    { id: 'mm', selection: `${tag} MM`, odds: 1.5, tier: 'mm', game: 'G0' },
    ...[1.6, 1.7, 1.8, 1.9].map((odds, i) => ({ id: `m${i}`, selection: `${tag} M${i}`, odds, tier: 'major', game: `M${i}` })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, selection: `${tag} S${i}`, odds: 2.5 + (i % 4) * 0.3, tier: 'shot', game: `S${i}` })),
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} pairs`, placedDate: '2000-01-01', book: tag, stake: 0.5, money: 'hypothetical', legs, tickets: [] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };
  const fetchBatch = async () => ((await (await request.get('/api/pp')).json()) as Saved[]).find((x) => x.id === b.id)!;

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: 'Build' }).click();
  const builder = page.getByTestId('builder');
  await builder.getByLabel('Number of PPs').fill('10');
  await builder.getByLabel('Minimum odds').fill('1');
  await builder.getByLabel('PP shots per PP').fill('2');
  await expect(builder.getByTestId('shot-pairs')).toHaveCount(0);
  await builder.getByRole('button', { name: 'Generate 10 PPs' }).click();
  await expect.poll(async () => (await fetchBatch()).tickets.length).toBe(10);

  const seen = new Map<string, number>();
  for (const t of (await fetchBatch()).tickets) {
    const shots = t.legIds.filter((id) => id.startsWith('s')).sort();
    expect(shots).toHaveLength(2);
    const k = shots.join('|');
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  expect([...seen.values()].every((c) => c === 1)).toBe(true);

  // 4 per PP from 10 shots on 10 PPs: each shot on 4 PPs, 12 partners needed out of 9: some pairs must repeat. Heavily
  // discouraged, not forbidden (owner, 2026-11-27): said plainly, and Generate asks first.
  await builder.getByLabel('PP shots per PP').fill('4');
  const warn = builder.getByTestId('shot-pairs');
  await expect(warn).toContainText('of PP shots together on more than one PP');
  await expect(warn).toContainText('Unavoidable with 10 PP shots');
  await expect(warn).toContainText('so it needs 12 different partners, but there are only 9.');
  await expect(warn).toContainText('To have none: send at least 12 PP shots'); // 12 × 11 = 132 ≥ 10 × 4 × 3 = 120
  const generateBtn = builder.getByRole('button', { name: 'Generate 10 PPs' });
  await expect(generateBtn).toBeEnabled();

  // Cancel: the PPs stay as they were
  const before = JSON.stringify((await fetchBatch()).tickets);
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await generateBtn.click();
  await expect.poll(() => message).toContain('of PP shots will be together on more than one PP');
  expect(JSON.stringify((await fetchBatch()).tickets)).toBe(before);

  // OK (and OK to replace the PPs): saved, every shot still on exactly 4 PPs, the Tickets tab flags the repeats
  page.on('dialog', (d) => void d.accept());
  await generateBtn.click();
  await expect.poll(async () => (await fetchBatch()).tickets.filter((t) => t.legIds.filter((id) => id.startsWith('s')).length === 4).length).toBe(10);
  const saved = await fetchBatch();
  for (let i = 0; i < 10; i++) expect(saved.tickets.filter((t) => t.legIds.includes(`s${i}`))).toHaveLength(4);
  await page.getByRole('tab', { name: /^Tickets/ }).click();
  await expect(page.getByTestId('shot-repeat-warning')).toBeVisible();
});

test('a batch with two shots together on two PPs is flagged on the Tickets tab', async ({ page, request, tag }) => {
  const legs = [
    { id: 'blz', selection: `${tag} Blazers ML`, odds: 1.33, tier: 'mm', game: 'Warriors@Blazers' },
    { id: 'gar', selection: `${tag} Garland 21 pts`, odds: 3, tier: 'shot', game: 'Cavs@Hawks' },
    { id: 'mcd', selection: `${tag} McDaniels 20 pts`, odds: 3.2, tier: 'shot', game: 'Wolves@Bulls' },
    { id: 'max', selection: `${tag} Maxey 30 pts`, odds: 3.4, tier: 'shot', game: '76ers@Pacers' },
  ];
  const t = (number: number, legIds: string[]) => ({ id: `t${number}`, number, legIds, placed: false, oddsOverride: null, stake: 1 });
  const res = await request.post('/api/pp', { data: { name: `${tag} repeat`, placedDate: '2000-01-01', book: tag, stake: 1, money: 'hypothetical', legs, tickets: [t(8, ['blz', 'gar', 'mcd']), t(18, ['blz', 'gar', 'mcd']), t(3, ['blz', 'gar', 'max'])] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: /^Tickets/ }).click();
  await expect(page.getByTestId('shot-repeat-warning')).toContainText(`${tag} Garland 21 pts and ${tag} McDaniels 20 pts on PP 8, PP 18`);
  await expect(page.locator('[data-testid="ticket"][data-number="8"]').getByTestId('ticket-shot-repeat')).toBeVisible();
  await expect(page.locator('[data-testid="ticket"][data-number="18"]').getByTestId('ticket-shot-repeat')).toBeVisible();
  await expect(page.locator('[data-testid="ticket"][data-number="3"]').getByTestId('ticket-shot-repeat')).toHaveCount(0);
});
