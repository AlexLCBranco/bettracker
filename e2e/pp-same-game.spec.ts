// Owner, 2026-11-27: two legs from the same game are never on the same PP, whatever their tiers. Major-majors from
// one game take turns (one per PP); a PP made by hand swaps a same-game leg out when another is picked.
import { expect, test } from './helpers';

type Batch = { id: string; legs: { id: string; game: string }[]; tickets: { legIds: string[] }[] };

test('same game never on one PP: generator turns, hand-made PP swaps', async ({ page, request, tag }) => {
  const legs = [
    { id: 'mmA', selection: `${tag} MMA`, odds: 1.5, tier: 'mm', game: 'Lakers v Celtics' },
    { id: 'mmB', selection: `${tag} MMB`, odds: 1.6, tier: 'mm', game: 'Lakers v Celtics' },
    { id: 'mmC', selection: `${tag} MMC`, odds: 1.4, tier: 'mm', game: 'G9' },
    { id: 'x', selection: `${tag} X`, odds: 2.1, tier: 'major', game: 'Lakers v Celtics' },
    ...[1.6, 1.7, 1.8, 1.9].map((odds, i) => ({ id: `m${i}`, selection: `${tag} M${i}`, odds, tier: 'major', game: `G${i % 2}` })),
    // 8 shots over two games: enough pairs for two shots to share one PP at most (v0.85.0)
    ...[3, 3.5, 4, 2.5, 3, 3.5, 4, 2.5].map((odds, i) => ({ id: `s${i}`, selection: `${tag} S${i}`, odds, tier: 'shot', game: `H${i % 2}` })),
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} same game`, placedDate: '2000-01-01', book: tag, stake: 2, money: 'real', legs, tickets: [] } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };
  const fetchBatch = async () => ((await (await request.get('/api/pp')).json()) as Batch[]).find((x) => x.id === b.id)!;

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: 'Build' }).click();
  const builder = page.getByTestId('builder');
  await expect(builder.getByTestId('same-game-rule')).toContainText('Two legs from the same game are never on the same PP');
  await expect(builder.getByTestId('mm-turns')).toHaveText(`Same game, so they take turns (one per PP): ${tag} MMA / ${tag} MMB`);
  await expect(builder.getByText('No two legs from the same game on one PP')).toHaveCount(0); // no toggle any more
  await builder.getByLabel('Number of PPs').fill('8');
  await expect(builder.getByTestId('pv-appearances').locator('tr', { hasText: `${tag} MMA` })).toContainText('(4)');
  await expect(builder.getByTestId('pv-appearances').locator('tr', { hasText: `${tag} MMC` })).toContainText('(8)');
  await builder.getByRole('button', { name: /^Generate \d+ PPs$/ }).click();
  await expect(page.getByRole('tab', { name: /Tickets · \d+/ })).not.toHaveText('Tickets · 0');

  await expect.poll(async () => (await fetchBatch()).tickets.length).toBeGreaterThan(0);
  const saved = await fetchBatch();
  const gameOf = new Map(saved.legs.map((l) => [l.id, l.game.toLowerCase()]));
  for (const t of saved.tickets) {
    const games = t.legIds.map((id) => gameOf.get(id));
    expect(new Set(games).size).toBe(games.length);
  }
  const lakers = saved.legs.filter((l) => l.game === 'Lakers v Celtics').map((l) => l.id);
  for (const t of saved.tickets) expect(t.legIds.filter((id) => lakers.includes(id))).toHaveLength(1);

  // by hand: a new PP starts with one Major-major per game; picking a same-game leg swaps the other out
  const before = saved.tickets.length;
  await page.getByRole('tab', { name: /Tickets/ }).click();
  await page.getByTestId('edit-toggle').click();
  await page.getByRole('button', { name: '+ Add PP' }).click();
  const f = page.getByRole('form', { name: /New PP/ });
  await expect(f.getByLabel(`Leg ${tag} MMA`)).toBeChecked();
  await expect(f.getByLabel(`Leg ${tag} MMB`)).not.toBeChecked();
  await expect(f.getByLabel(`Leg ${tag} MMC`)).toBeChecked();
  await f.getByText(`${tag} MMB`).click();
  await expect(f.getByLabel(`Leg ${tag} MMB`)).toBeChecked();
  await expect(f.getByLabel(`Leg ${tag} MMA`)).not.toBeChecked();
  await f.getByText(`${tag} X`).click();
  await expect(f.getByLabel(`Leg ${tag} MMB`)).not.toBeChecked();
  await f.getByText(`${tag} S0`).click();
  await f.getByRole('button', { name: 'Save PP' }).click();
  await expect(f).toBeHidden();
  await expect.poll(async () => (await fetchBatch()).tickets.length).toBe(before + 1);
  const made = (await fetchBatch()).tickets.find((t) => t.legIds.includes('x') && t.legIds.includes('s0') && t.legIds.length === 3);
  expect(made?.legIds.sort()).toEqual(['mmC', 's0', 'x']);
});
