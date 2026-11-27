// "Copy table" on a batch's PPs tab: every PP of the batch (filters ignored) goes to the clipboard as a table, plain
// text and HTML, in the tab's style.
import { expect, test } from './helpers';

test('Copy table puts every PP of the batch on the clipboard', async ({ page, request, tag, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const legs = [
    { id: 'a', selection: `${tag} A`, odds: 2, tier: 'mm', game: 'G1' },
    { id: 'b', selection: `${tag} B`, odds: 3, tier: 'major', game: 'G2' },
    { id: 'c', selection: `${tag} C`, odds: 1.5, tier: 'shot', game: 'G3', result: 'lost' },
  ];
  const tickets = [
    { id: 't1', number: 1, legIds: ['a', 'b'], placed: false, oddsOverride: null, stake: 0.98 },
    { id: 't2', number: 2, legIds: ['a', 'c'], placed: true, oddsOverride: null, stake: 1.02 },
  ];
  const res = await request.post('/api/pp', { data: { name: `${tag} copy`, placedDate: '2000-01-01', book: tag, stake: 0.5, money: 'hypothetical', legs, tickets } });
  expect(res.status()).toBe(201);
  const b = (await res.json()) as { id: string };

  await page.goto(`/pp/${b.id}`);
  await page.getByRole('tab', { name: /^Tickets/ }).click();
  // a filter showing only the dead PP: the copy still has both
  await page.getByRole('button', { name: /^Dead/ }).click();
  await expect(page.getByTestId('ticket')).toHaveCount(1);
  await page.getByRole('button', { name: 'Copy table' }).click();
  await expect(page.getByText('Copied 2 PPs')).toBeVisible();

  const { text, html } = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { text: await (await item!.getType('text/plain')).text(), html: await (await item!.getType('text/html')).text() };
  });
  // Windows' clipboard stores line breaks as \r\n
  expect(text.split(/\r?\n/)).toEqual([
    `${tag} copy · ${tag} · 01/01/2000`,
    'PP | Legs | Odds | Stake | Potential | Status',
    `PP 1 (not placed) | ${tag} A, ${tag} B | 6.00 (est.) | H$ 0,98 | H$ 5,88 | Alive (2 left)`,
    `PP 2 | ${tag} A, ${tag} C | 3.00 (est.) | H$ 1,02 | -H$ 1,02 | Dead`,
  ]);
  expect(html).toContain(`<td>${tag} A, ${tag} B</td>`);
});
