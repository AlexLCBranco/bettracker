// Owner, 2026-11-27: swapping a pool leg (Newcastle v Brighton → Dosunmu 20 pts) can put two legs from the same game
// on a PP the builder made (Dosunmu and McDaniels, both Bulls v Wolves). Saving the edit asks first; the PPs that hold
// both are flagged "same game" on the Tickets tab and in the copied table.
import { expect, test } from './helpers';

type Saved = { id: string; legs: { id: string; selection: string; game: string }[] };

test('an edited leg from the same game as another on a PP: asks first, then flags the PP', async ({ page, request, tag, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const legs = [
    { id: 'mcd', selection: `${tag} McDaniels 10 pts`, odds: 1.8, tier: 'mm', game: 'Bulls v Wolves' },
    { id: 'new', selection: `${tag} Newcastle Brighton 3G BTTS`, odds: 2.5, tier: 'shot', game: 'Newcastle v Brighton' },
    { id: 'che', selection: `${tag} Chelsea G`, odds: 2, tier: 'major', game: 'Chelsea v Spurs' },
  ];
  const tickets = [
    { id: 't1', number: 1, legIds: ['mcd', 'new', 'che'], placed: true, oddsOverride: null, stake: 1 },
    { id: 't2', number: 2, legIds: ['mcd', 'che'], placed: true, oddsOverride: null, stake: 1 },
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} swap`, placedDate: '2000-01-01', book: tag, stake: 1, money: 'hypothetical', legs, tickets } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };
  const fetchBatch = async () => ((await (await request.get('/api/pp')).json()) as Saved[]).find((x) => x.id === b.id)!;

  await page.goto(`/pp/${b.id}?edit=1`);
  const row = page.getByTestId('pp-leg').filter({ hasText: `${tag} Newcastle` });
  await row.getByRole('button', { name: 'Edit leg' }).click();
  const ef = page.getByRole('form', { name: 'Edit leg' });
  await ef.getByLabel('Leg game').fill('Bulls v Wolves');
  await ef.getByLabel('Leg selection').fill(`${tag} Dosunmu 20 pts`);

  // Cancel in the dialog: nothing saved, the form stays open
  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await ef.getByRole('button', { name: 'Save' }).click();
  expect(message).toContain(`Same game on one PP: ${tag} McDaniels 10 pts and ${tag} Dosunmu 20 pts on PP 1.`);
  await expect(ef).toBeVisible();
  expect((await fetchBatch()).legs.find((l) => l.id === 'new')!.game).toBe('Newcastle v Brighton');

  // OK: saved, and PP 1 (only) is flagged
  page.once('dialog', (d) => void d.accept());
  await ef.getByRole('button', { name: 'Save' }).click();
  await expect(ef).toHaveCount(0);
  await expect.poll(async () => (await fetchBatch()).legs.find((l) => l.id === 'new')!.selection).toBe(`${tag} Dosunmu 20 pts`);

  await page.getByRole('tab', { name: /^Tickets/ }).click();
  await expect(page.getByTestId('same-game-warning')).toContainText(`${tag} McDaniels 10 pts and ${tag} Dosunmu 20 pts on PP 1`);
  await expect(page.getByTestId('ticket').filter({ has: page.getByTestId('ticket-same-game') })).toHaveCount(1);
  await expect(page.locator('[data-testid="ticket"][data-number="1"]').getByTestId('ticket-same-game')).toBeVisible();

  await page.getByRole('button', { name: 'Copy table' }).click();
  await expect(page.getByText('Copied 2 PPs')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.split(/\r?\n/);
  expect(lines[2]).toMatch(/^PP 1 ⚠ same game \|/);
  expect(lines[3]).toMatch(/^PP 2 \|/);

  // an edit that clashes with nothing saves without asking
  await page.getByRole('tab', { name: /^Legs/ }).click();
  let asked = false;
  page.on('dialog', (d) => {
    asked = true;
    void d.accept();
  });
  await page.getByTestId('pp-leg').filter({ hasText: `${tag} Chelsea G` }).getByRole('button', { name: 'Edit leg' }).click();
  await page.getByRole('form', { name: 'Edit leg' }).getByLabel('Leg odds').fill('2.1');
  await page.getByRole('form', { name: 'Edit leg' }).getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('form', { name: 'Edit leg' })).toHaveCount(0);
  expect(asked).toBe(false);
});
