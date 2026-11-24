// Ctrl+Z undoes the last change to the bets (add, edit, delete); "Remove from ladder" keeps the bet as a plain bet.
import { betsTagged, createBet, expect, saved, test } from './helpers';

test('Ctrl+Z: a bet added by mistake goes; an edit goes back; a deleted bet comes back as it was', async ({ page, request, tag }) => {
  await page.goto('/');
  // add from quick-add, then Ctrl+Z in the (now empty) box: the bet goes
  await page.getByTestId('quick-add').fill(`30 @1.9 ${tag} oops`);
  await page.getByTestId('quick-add').press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(1);
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByTestId('quick-add').press('Control+z');
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(0);
  await expect(page.getByRole('status')).toContainText(`Undone: Added: ${tag} oops`);

  // with text in the box, Ctrl+Z is the box's own undo, never the bets'
  const keep = await createBet(request, { betText: `${tag} keep`, stake: 40, odds: 2.5 });
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${keep.id}"]`);
  await expect(row).toBeVisible();

  // edit in the form, then Ctrl+Z on the page: the old text and stake come back
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit bet' });
  await form.getByLabel('Stake').fill('45');
  await form.getByLabel('Bet text').fill(`${tag} edited`);
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toBeHidden();
  await expect(row).toContainText(`${tag} edited`);
  await page.getByTestId('quick-add').fill('typing here');
  await page.getByTestId('quick-add').press('Control+z');
  await expect(row).toContainText(`${tag} edited`);
  await page.getByTestId('quick-add').fill('');
  await page.getByTestId('quick-add').evaluate((e) => (e as HTMLElement).blur());
  await expect(page.getByTestId('undo-last')).toContainText('Edited');
  await page.keyboard.press('Control+z');
  await expect(row).toContainText(`${tag} keep`);
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ betText: `${tag} keep`, stake: 40 });

  // delete, then Ctrl+Z: back with the same id and created time
  page.once('dialog', (d) => void d.accept());
  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(row).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(0);
  await page.keyboard.press('Control+z');
  await expect(row).toBeVisible();
  await expect.poll(async () => (await betsTagged(request, tag)).map((b) => [b.id, b.createdAt, b.betText])).toEqual([[keep.id, keep.createdAt, `${tag} keep`]]);

  // nothing left to undo: says so, changes nothing
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('status')).toHaveText('Nothing to undo');
  expect(await betsTagged(request, tag)).toHaveLength(1);
});

test('Remove from ladder: the rung stays as a plain bet (bonus money kept), the ladder is open again; Ctrl+Z puts it back', async ({ page, request, tag }) => {
  const first = await createBet(request, { betText: `${tag} rung one`, stake: 100, odds: 2, result: 'won', money: 'real' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.locator(`[data-bet-id="${first.id}"]`).getByTestId('start-ladder').click();
  const ladder = page.getByTestId('rollover-row');
  await ladder.getByTestId('next-rung').click();
  const form = page.getByRole('dialog', { name: 'Add ladder rung' });
  await form.getByLabel('Odds').fill('1.5');
  await form.getByLabel('Bet text').fill(`${tag} wrong rung`);
  await form.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(ladder.getByTestId('type')).toHaveText('Ladder ×2');
  const rung = (await betsTagged(request, tag)).find((b) => b.betText.includes('wrong rung'))!;

  await page.locator(`[data-bet-id="${rung.id}"]`).getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Remove from ladder' }).click();
  await expect(ladder.getByTestId('type')).toHaveText('Ladder ×1');
  await expect(ladder.getByTestId('result')).toHaveText('Open');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === rung.id)).toMatchObject({ rolloverId: null, ladder: null, stake: 200, odds: 1.5, result: 'pending' });
  // a plain bet now: its money can be changed in the form
  const plain = page.locator(`[data-bet-id="${rung.id}"]`);
  await plain.getByRole('button', { name: 'Edit', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit bet' });
  await expect(edit.getByLabel('Money')).toBeEnabled();
  await edit.getByLabel('Money').selectOption('bonus');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === rung.id)?.money).toBe('bonus');

  // Ctrl+Z twice: the money edit, then the removal
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === rung.id)?.money).toBe('real');
  await page.keyboard.press('Control+z');
  await expect(ladder.getByTestId('type')).toHaveText('Ladder ×2');
  await expect
    .poll(async () => {
      const all = await betsTagged(request, tag);
      const [a, b] = [all.find((x) => x.id === first.id)!, all.find((x) => x.id === rung.id)!];
      return b.rolloverId != null && b.rolloverId === a.rolloverId && b.ladder != null;
    })
    .toBe(true);
});

test('a slow server: settle then Z at once saves in order, "saving…" shows, and the page waits before leaving', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} slow`, stake: 10, odds: 2, result: 'pending', money: 'real' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  // the first PATCH answers late (like an overlapping request landing on a slower server instance)
  let n = 0;
  await page.route(`**/api/bets/${b.id}`, async (route) => {
    if (route.request().method() === 'PATCH' && n++ === 0) await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  const row = page.locator(`[data-bet-id="${b.id}"]`).first();
  await row.click();
  await page.keyboard.press('l');
  await page.keyboard.press('z');
  await expect(page.getByTestId('saving')).toBeVisible();
  await saved(page);
  await expect(page.getByTestId('saving')).toBeHidden();
  expect((await betsTagged(request, tag))[0]).toMatchObject({ result: 'pending' });
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.locator(`[data-bet-id="${b.id}"]`).first().getByTestId('result')).toHaveText('Pending');
});
