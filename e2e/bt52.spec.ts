// BT-52: three notes per bet (Pre / Live / Post), a mark on every bet cell, links clickable, search covers them.
import { betsTagged, createBet, expect, saved, test } from './helpers';

test('BT-52: add a note from a row with none, switch slots, links, D, the switch, search', async ({ page, request, tag }) => {
  const mk = (n: string, over: Record<string, unknown> = {}) => createBet(request, { betText: `${tag} ${n}`, legs: [{ selection: `${tag} ${n}`, odds: 2 }], ...over });
  const none = await mk('none');
  const live = await mk('live', { liveAnalysis: `momentum swing, see https://example.com/${tag}/box` });
  // a dutch: its row and each split have a mark
  const leg = (s: string) => [{ selection: `${tag} ${s}`, game: '', sport: '', market: '', odds: null, result: 'pending' }];
  const s1 = await createBet(request, { betText: '', dutchId: `${tag}-d`, stake: 60, odds: 2, legs: leg('Home') });
  await createBet(request, { betText: '', dutchId: `${tag}-d`, stake: 40, odds: 4, legs: leg('Away') });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const row = (x: { id: string }) => page.locator(`[data-bet-id="${x.id}"]`);
  const descRow = (k: string) => page.locator(`[data-desc-for="${k}"]`);
  await expect(row(none)).toBeVisible();

  // every bet cell has the mark: a plain bet with none (dim), a dutch row, a split
  await expect(row(none).getByTestId('desc-mark')).toHaveAttribute('aria-label', 'Add description');
  await expect(page.getByTestId('dutch-row').getByTestId('desc-mark')).toHaveCount(1);
  await expect(row(s1).getByTestId('desc-mark')).toHaveCount(1);
  await expect(row(live).getByTestId('desc-mark')).toHaveAttribute('data-filled', 'live');
  await expect(row(live).locator('[data-testid="desc-dot"][data-lit]')).toHaveCount(1);
  // the mark adds no height: as tall as a row with no chips
  const h = (await row(none).boundingBox())!.height;
  expect(h).toBeLessThan(60);

  // add from the row with none: opens on Pre, ready to type
  await row(none).getByTestId('desc-mark').click();
  await expect(descRow(`bet:${none.id}`)).toHaveAttribute('data-slot', 'pre');
  await expect(descRow(`bet:${none.id}`).getByLabel('Pre note')).toBeFocused();
  await page.keyboard.type('pre thought');
  // switch slots: Live one click away, ⇄ to the next
  await descRow(`bet:${none.id}`).getByLabel('Show Live').click();
  await expect(descRow(`bet:${none.id}`)).toHaveAttribute('data-slot', 'live');
  await descRow(`bet:${none.id}`).getByLabel('Live note').fill('live thought');
  await descRow(`bet:${none.id}`).getByLabel('Next note').click();
  await expect(descRow(`bet:${none.id}`)).toHaveAttribute('data-slot', 'post');
  await descRow(`bet:${none.id}`).getByLabel('Post note').fill('post thought');
  await page.getByTestId('stats').click({ position: { x: 4, y: 4 } });
  await expect(descRow(`bet:${none.id}`)).toHaveCount(0);
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === none.id)).toMatchObject({ preAnalysis: 'pre thought', liveAnalysis: 'live thought', postAnalysis: 'post thought' });
  await expect(row(none).getByTestId('desc-mark')).toHaveAttribute('data-filled', 'pre,live,post');

  // D on the selected row opens it on its last filled slot; the link is a real link, new tab
  await row(live).locator('td').first().click();
  await page.keyboard.press('d');
  const lr = descRow(`bet:${live.id}`);
  await expect(lr).toHaveAttribute('data-slot', 'live');
  const link = lr.getByTestId('note-link');
  await expect(link).toHaveAttribute('href', `https://example.com/${tag}/box`);
  await expect(link).toHaveAttribute('target', '_blank');
  // clicking the text (not the link) edits it
  await lr.getByLabel('Edit the Live note').click({ position: { x: 4, y: 4 } });
  await expect(lr.getByLabel('Live note')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(lr).toHaveCount(0);

  // a split's notes open under the split
  await row(s1).getByTestId('desc-mark').click();
  await expect(descRow(`bet:${s1.id}`)).toBeVisible();
  await descRow(`bet:${s1.id}`).getByLabel('Pre note').fill('split note');
  await page.getByTestId('stats').click({ position: { x: 4, y: 4 } });
  await saved(page);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === s1.id)!.preAnalysis).toBe('split note');

  // the switch opens every row that has notes (the dutch row, not its split again)
  await page.getByLabel('Descriptions').check();
  await expect(descRow(`bet:${none.id}`)).toBeVisible();
  await expect(descRow(`bet:${live.id}`)).toBeVisible();
  await expect(page.locator('[data-desc-for^="dutch:"]')).toHaveCount(1);
  await expect(descRow(`bet:${s1.id}`)).toHaveCount(0);
  await page.getByLabel('Descriptions').uncheck();

  // search covers the notes
  await page.getByLabel('Search bets').fill(`example.com/${tag}`);
  await expect(page.getByTestId('bet-row')).toHaveCount(1);
  await expect(row(live)).toBeVisible();
});

test('BT-52: the bet form has Pre, Live and Post', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Full form' }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Pre note')).toBeVisible();
  await expect(form.getByLabel('Live note')).toBeVisible();
  await expect(form.getByLabel('Post note')).toBeVisible();
  await page.keyboard.press('Escape');
});
