import { readFileSync } from 'node:fs';
import { betsTagged, createBet, expect, test } from './helpers';

const LIVE = !!process.env.E2E_BASE_URL;

test('quick-add saves a pending bet with comma decimals', async ({ page, request, tag }) => {
  await page.goto('/history');
  await page.getByTestId('quick-add').fill(`150 @2,10 ${tag} lakers ml`);
  await page.getByTestId('quick-add').press('Enter');
  await expect(page.getByRole('status')).toContainText('Saved');
  await expect(page.getByTestId('quick-add')).toHaveValue('');
  const [b] = await betsTagged(request, tag);
  expect(b).toMatchObject({ stake: 150, odds: 2.1, result: 'pending', betText: `${tag} lakers ml` });
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('bet-row').filter({ hasText: tag });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('result')).toHaveText('Pending');
});

test('quick-add without odds opens the full form prefilled', async ({ page, request, tag }) => {
  await page.goto('/');
  await page.getByTestId('quick-add').fill(`150 ${tag}`);
  await page.getByTestId('quick-add').press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Stake')).toHaveValue('150');
  await expect(dialog.getByLabel('Bet text')).toHaveValue(tag);
  await dialog.getByLabel('Odds').fill('1,85');
  await expect(dialog.getByTestId('potential-return')).toHaveText('R$ 277,50');
  await dialog.getByLabel('Odds').press('Enter');
  await expect(dialog).toBeHidden();
  expect(await betsTagged(request, tag)).toHaveLength(1);
});

test('N opens the form; autocomplete shows recent entries, filters, and accepts with arrows + Enter', async ({ page, request, tag }) => {
  await createBet(request, { book: `${tag} Alpha`, betText: `${tag} a` });
  await createBet(request, { book: `${tag} Beta`, betText: `${tag} b` });
  await page.goto('/');
  await expect(page.getByTestId('site-version')).toBeVisible();
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Stake')).toBeFocused();
  const book = dialog.getByLabel('Book');
  await book.fill('');
  await book.focus();
  const list = dialog.getByRole('listbox');
  await expect(list.getByRole('option').first()).toHaveText(`${tag} Beta`); // most recent first
  await book.fill(`${tag} alp`);
  await expect(list.getByRole('option')).toHaveText([`${tag} Alpha`]);
  await book.press('ArrowDown');
  await book.press('Enter');
  await expect(book).toHaveValue(`${tag} Alpha`);
  await expect(list).toBeHidden();
  await book.press('Escape');
  await expect(dialog).toBeHidden();
});

test('full form: save and add another keeps book and dates', async ({ page, request, tag }) => {
  await page.goto('/');
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await dialog.getByLabel('Stake').fill('20');
  await dialog.getByLabel('Odds').fill('3');
  await dialog.getByLabel('Book').fill(`${tag} Book`);
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Bet text').fill(`${tag} one`);
  await dialog.getByRole('button', { name: 'Save and add another' }).click();
  await expect(dialog.getByLabel('Stake')).toHaveValue('');
  await expect(dialog.getByLabel('Book')).toHaveValue(`${tag} Book`);
  await expect(dialog.getByLabel('Game date')).toHaveValue('01/01/2000');
  await dialog.getByLabel('Stake').fill('30');
  await dialog.getByLabel('Odds').fill('1.5');
  await dialog.getByLabel('Bet text').fill(`${tag} two`);
  await dialog.getByLabel('Bet text').press('Control+Enter');
  await expect(dialog).toBeHidden();
  const saved = await betsTagged(request, tag);
  expect(saved.map((b) => [b.betText, b.stake, b.gameDate, b.book]).sort()).toEqual([
    [`${tag} one`, 20, '2000-01-01', `${tag} Book`],
    [`${tag} two`, 30, '2000-01-01', `${tag} Book`],
  ]);
});

test('combination with legs: total odds kept as entered, legs expand in the table', async ({ page, request, tag }) => {
  await createBet(request, {
    type: 'combination',
    odds: 5.25,
    betText: `${tag} combo`,
    legs: [
      { sport: 'Football', game: 'A x B', selection: 'A', odds: 2, result: 'won' },
      { sport: 'Football', game: 'C x D', selection: 'D', odds: 2, result: 'lost' },
    ],
  });
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('bet-row').filter({ hasText: tag });
  await expect(row).toContainText('5.25');
  await row.getByRole('button', { name: 'Show legs' }).click();
  await expect(page.getByTestId('leg-row')).toHaveCount(2);
});

test('settle queue: W, Z undo, C with amount', async ({ page, request, tag }) => {
  const a = await createBet(request, { betText: `${tag} first`, gameDate: '2000-01-01', placedDate: '2000-01-01' });
  const b = await createBet(request, { betText: `${tag} second`, gameDate: '2000-01-02', placedDate: '2000-01-02' });
  await page.goto('/settle');
  const rows = page.getByTestId('queue-row');
  await expect(rows.first()).toContainText(`${tag} first`);
  await expect(page.locator('[data-testid=queue-row][data-active]')).toContainText(`${tag} first`);

  await page.keyboard.press('w');
  await expect(page.locator('[data-testid=queue-row][data-active]')).toContainText(`${tag} second`);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === a.id)?.result).toBe('won');

  await page.keyboard.press('z');
  await expect(page.locator('[data-testid=queue-row][data-active]')).toContainText(`${tag} first`);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === a.id)?.result).toBe('pending');

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-testid=queue-row][data-active]')).toContainText(`${tag} second`);
  await page.keyboard.press('c');
  await page.getByLabel('Cash-out amount').fill('14,50');
  await page.getByLabel('Cash-out amount').press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === b.id)).toMatchObject({ result: 'cash-out', cashout: 14.5 });
});

test('history: inline edit a cell, one-click result, duplicate', async ({ page, request, tag }) => {
  const created = await createBet(request, { betText: `${tag} edit me`, book: 'Old Book', stake: 50, odds: 2 });
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${created.id}"]`);
  await row.getByRole('button', { name: 'Edit Book' }).click();
  await row.getByLabel('Book').fill(`${tag} New Book`);
  await row.getByLabel('Book').press('Enter');
  await expect(row).toContainText(`${tag} New Book`);
  await row.getByRole('button', { name: 'Mark Won' }).click();
  await expect(row.getByTestId('profit')).toHaveText('+R$ 50,00');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ book: `${tag} New Book`, result: 'won' });

  await row.getByRole('button', { name: 'Duplicate' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await expect(dialog.getByLabel('Stake')).toHaveValue('50');
  await expect(dialog.getByLabel('Result')).toHaveValue('pending');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await betsTagged(request, tag)).toHaveLength(2);
});

test('nav pending badge links to the settle queue', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} due` });
  await page.goto('/');
  await expect(page.getByTestId('due-count')).toBeVisible();
  await page.getByRole('link', { name: /Settle/ }).click();
  await expect(page).toHaveURL(/\/settle$/);
});

test('version: corner label matches /version.json and package.json', async ({ page, request }) => {
  const res = await request.get('/version.json');
  expect(res.headers()['cache-control']).toContain('no-store');
  const v = (await res.json()) as { version: string; commit: string };
  if (!LIVE) expect(v.version).toBe((JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version);
  await page.goto('/');
  await expect(page.getByTestId('site-version')).toHaveText(`v${v.version}`);
});

test('logged out: pages redirect to login and the API refuses', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto('/history');
  await expect(page).toHaveURL(/\/login\?next=%2Fhistory/);
  expect((await ctx.request.get('/api/bets')).status()).toBe(401);
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Wrong password' })).toBeVisible();
  await ctx.close();
});

test('empty database: stats show "-" and no NaN', async ({ page }) => {
  test.skip(LIVE, 'the live database has real bets');
  await page.goto('/');
  const stats = page.getByTestId('stats');
  await expect(stats).toBeVisible();
  await expect(stats).not.toContainText('NaN');
  // other tests' throwaway bets are deleted, so only pending/void-free history remains: no settled bet → "-"
  const res = await page.request.get('/api/bets');
  if (((await res.json()) as unknown[]).length === 0) {
    await expect(page.getByTestId('stat-winrate-value')).toHaveText('-');
    await expect(page.getByTestId('stat-roi-value')).toHaveText('-');
  }
});

test('analytics: breakdown by sport and odds range, and the combination that lost by one leg', async ({ page, request, tag }) => {
  const sport = `${tag} Sport`;
  const solo = (over: Record<string, unknown>) =>
    createBet(request, { type: 'solo', stake: 100, odds: 2, betText: tag, legs: [{ sport, game: '', market: '', selection: '', odds: 2, result: 'pending' }], ...over });
  await solo({ result: 'won' });
  await solo({ stake: 50, result: 'lost', legs: [{ sport: sport.toUpperCase(), game: '', market: '', selection: '', odds: 2, result: 'lost' }] });
  await solo({ stake: 20, result: 'pending' });
  await createBet(request, {
    type: 'combination',
    stake: 10,
    odds: 4,
    result: 'lost',
    betText: `${tag} combo`,
    legs: [
      { sport: `${tag} Combo`, game: 'A x B', market: 'Moneyline', selection: 'A', odds: 2, result: 'won' },
      { sport: `${tag} Combo`, game: 'C x D', market: `${tag} Mkt`, selection: 'Over 2.5', odds: 2, result: 'lost' },
    ],
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole('tab', { name: 'Sport' })).toHaveAttribute('aria-selected', 'true');

  // same sport typed in two cases is one row; pending counts in bets and wagered, not in profit
  const row = page.getByTestId('analytics-row').filter({ hasText: sport });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId('cell-bets')).toContainText('3');
  await expect(row.getByTestId('cell-wagered')).toHaveText('R$ 170,00');
  await expect(row.getByTestId('cell-profit')).toHaveText('+R$ 50,00');
  await expect(row.getByTestId('cell-roi')).toHaveText('+33.3%');
  await expect(row.getByTestId('cell-winrate')).toContainText('50.0% 1W/1L');
  await expect(page.locator('main')).not.toContainText('NaN');

  await page.getByRole('tab', { name: 'Odds range' }).click();
  await expect(page.getByRole('table', { name: 'By odds range' })).toBeVisible();
  await expect(page.getByTestId('analytics-row').filter({ hasText: '2.00–2.99' })).toHaveCount(1);

  const combos = page.getByTestId('combos');
  await expect(combos.getByRole('list', { name: 'One leg away' }).getByRole('listitem').filter({ hasText: `${tag} combo` })).toContainText(`lost: C x D · ${tag} Mkt · Over 2.5`);
  const legRow = combos.getByRole('table', { name: 'Leg record by market' }).getByRole('row').filter({ hasText: `${tag} Mkt` });
  await expect(legRow.getByRole('cell')).toHaveText([`${tag} Mkt`, '0', '1', '0.0%']);
});

test('betting tool: dutching splits the stake so every selection returns the same, and remembers it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Betting Tool' }).click();
  await expect(page).toHaveURL(/\/betting-tool$/);
  await expect(page.getByTestId('dutch-error')).toHaveText('Enter odds for at least two selections.');

  await page.getByLabel('Total stake').fill('100');
  await page.getByLabel('Selection 1 name').fill('Home');
  await page.getByLabel('Selection 1 odds').fill('2');
  await page.getByLabel('Selection 2 odds').fill('4,00'); // comma decimals; selection 3 left empty is ignored
  await expect(page.getByTestId('dutch-stake')).toHaveText(['R$ 66,67', 'R$ 33,33']);
  await expect(page.getByTestId('dutch-row').first()).toContainText('Home');
  await expect(page.getByTestId('dutch-return-value')).toHaveText('R$ 133,32');
  await expect(page.getByTestId('dutch-return')).toContainText('up to R$ 133,34');
  await expect(page.getByTestId('dutch-profit-value')).toHaveText('+R$ 33,32');
  await expect(page.getByTestId('dutch-profit')).toContainText('up to +R$ 33,34');
  await expect(page.getByTestId('dutch-odds-value')).toHaveText('1.33');

  await page.getByLabel('Round stakes to').selectOption({ label: 'R$ 1' });
  await expect(page.getByTestId('dutch-stake')).toHaveText(['R$ 67,00', 'R$ 33,00']);

  await page.getByLabel('Selection 3 odds').fill('1.5');
  await expect(page.getByRole('alert').filter({ hasText: 'you lose money whichever selection wins' })).toContainText('141.7%');
  await page.getByLabel('Selection 3 odds').fill('100%'); // converts to 1.00: not valid
  await expect(page.getByTestId('dutch-error')).toHaveText('Every odds value must be readable and above 1.00 as decimal odds.');
  await expect(page.getByTestId('odds-converted')).toHaveText('Cannot read these odds');
  await expect(page.getByRole('button', { name: 'Log as bets' })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove selection 3' }).click();
  await expect(page.getByTestId('dutch-input-row')).toHaveCount(2);

  await page.reload();
  await expect(page.getByLabel('Selection 1 name')).toHaveValue('Home');
  await expect(page.getByTestId('dutch-stake')).toHaveText(['R$ 67,00', 'R$ 33,00']);
});

test('export JSON and CSV, then import: restores a deleted bet exactly, leaves existing ones, rejects other files', async ({ page, request, tag }) => {
  const combo = await createBet(request, {
    type: 'combination',
    odds: 5,
    result: 'lost',
    betText: `${tag} combo, "quoted"`,
    legs: [
      { sport: 'Football', game: 'A x B', market: 'Moneyline', selection: 'A', odds: 2, result: 'won' },
      { sport: 'Football', game: 'C x D', market: 'Goals', selection: 'Over 2.5', odds: 2.5, result: 'lost' },
    ],
  });
  const solo = await createBet(request, { betText: `${tag} solo`, stake: 25 });

  await page.goto('/history');
  const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  expect(json.suggestedFilename()).toMatch(/^bettracker-\d{4}-\d{2}-\d{2}\.json$/);
  const exported = JSON.parse(readFileSync(await json.path(), 'utf8')) as { format: string; bets: { id: string }[] };
  expect(exported.format).toBe('bettracker-export');
  const mine = exported.bets.filter((b) => b.id === combo.id || b.id === solo.id);
  expect(mine).toEqual(expect.arrayContaining([expect.objectContaining({ id: combo.id, legs: combo.legs })]));
  expect(mine).toHaveLength(2);

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()]);
  const csvText = readFileSync(await csv.path(), 'utf8');
  expect(csvText).toContain(`"${tag} combo, ""quoted"""`);
  expect(csvText).toContain(`${tag} solo`);

  // delete one, import a file holding just this test's two bets
  await request.delete(`/api/bets/${combo.id}`);
  const file = { ...exported, bets: mine };
  await page.getByLabel('Import file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) });
  await expect(page.getByRole('status')).toHaveText('Imported 1 bet; 1 already here, left as they are');
  const after = await betsTagged(request, tag);
  expect(after.find((b) => b.id === combo.id)).toEqual(combo);
  expect(after.find((b) => b.id === solo.id)).toEqual(solo);
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.getByTestId('bet-row')).toHaveCount(2);

  await page.getByLabel('Import file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.getByRole('status')).toHaveText('Import failed: This is not a BetTracker export file');
  expect(await betsTagged(request, tag)).toHaveLength(2);
});

test('dutch: odds in any format, log as linked bets, one group row, settle with a number key, counted as one bet', async ({ page, request, tag }) => {
  await page.goto('/betting-tool');
  await page.getByLabel('Total stake').fill('100');
  await page.getByLabel('Selection 1 name').fill('Home');
  await page.getByLabel('Selection 1 odds').fill('+200'); // American = 3.00
  await page.getByLabel('Selection 2 name').fill('Draw');
  await page.getByLabel('Selection 2 odds').fill('25%'); // probability = 4.00
  await page.getByLabel('Selection 3 name').fill('Away');
  await page.getByLabel('Selection 3 odds').fill('2');
  await page.getByLabel('Selection 3 format').selectOption({ label: 'Hong Kong' }); // HK 2 = 3.00
  const hints = page.getByTestId('odds-converted');
  await expect(hints).toHaveText(['= 3.00 decimal · American', '= 4.00 decimal · Probability %', '= 3.00 decimal · Hong Kong']);
  await expect(page.getByTestId('dutch-odds-value')).toHaveText('1.09');

  await page.getByRole('button', { name: 'Log as bets' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log dutch' });
  await dialog.getByLabel('Game', { exact: true }).fill(`${tag} game`);
  await dialog.getByLabel('Placed date').fill('01/01/2000');
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Selection 1 book').fill(`${tag} BookA`);
  await expect(dialog.getByLabel('Selection 2 book')).toHaveValue(`${tag} BookA`); // copied from the row above
  await dialog.getByLabel('Selection 3 book').fill(`${tag} BookB`);
  await dialog.getByRole('button', { name: 'Log 3 bets' }).click();
  await expect(dialog).toBeHidden();

  const logged = await betsTagged(request, tag);
  expect(logged).toHaveLength(3);
  expect(new Set(logged.map((b) => b.dutchId)).size).toBe(1);
  expect(logged[0]!.dutchId).toBeTruthy();
  const bySel = Object.fromEntries(logged.map((b) => [b.legs[0]!.selection, b]));
  expect(Object.keys(bySel).sort()).toEqual(['Away', 'Draw', 'Home']);
  expect([bySel.Home!.odds, bySel.Draw!.odds, bySel.Away!.odds]).toEqual([3, 4, 3]);
  expect([bySel.Home!.book, bySel.Draw!.book, bySel.Away!.book]).toEqual([`${tag} BookA`, `${tag} BookA`, `${tag} BookB`]);
  expect(Math.round(logged.reduce((s, b) => s + b.stake, 0) * 100)).toBe(10000);
  expect(logged.every((b) => b.result === 'pending' && b.type === 'solo' && b.gameDate === '2000-01-01')).toBe(true);

  // History: one group row that expands to its three bets
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const group = page.getByTestId('dutch-row');
  await expect(group).toHaveCount(1);
  await expect(group.getByTestId('dutch-stake')).toHaveText('R$ 100,00');
  await expect(page.getByTestId('bet-row')).toHaveCount(0);
  await group.getByRole('button', { name: 'Show bets' }).click();
  await expect(page.locator('[data-testid=bet-row][data-nested]')).toHaveCount(3);
  await expect(page.getByTestId('history-summary')).toContainText(/^1 of \d+ bets/);

  // Settle: the dutch is one item; 2 toggles Draw as won, Enter confirms (the others lost); Z undoes the whole group
  await page.goto('/settle');
  const item = page.getByTestId('queue-row').filter({ hasText: `${tag} BookA` });
  await expect(item).toHaveCount(1);
  await expect(item.getByTestId('queue-dutch-bet')).toHaveCount(3);
  await item.click();
  await page.keyboard.press('2');
  await expect(item.locator('[data-testid=queue-dutch-bet][data-won]')).toHaveText(/Draw/);
  await page.keyboard.press('Enter');
  const results = async () => Object.fromEntries((await betsTagged(request, tag)).map((b) => [b.legs[0]!.selection, b.result]));
  await expect.poll(results).toEqual({ Home: 'lost', Draw: 'won', Away: 'lost' });
  await expect(item).toHaveCount(0);
  await page.keyboard.press('z');
  await expect.poll(results).toEqual({ Home: 'pending', Draw: 'pending', Away: 'pending' });
  await expect(item).toHaveCount(1);
  await item.click();
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await expect.poll(results).toEqual({ Home: 'lost', Draw: 'won', Away: 'lost' });

  // Stats: one bet, one win, money bet by bet (Draw stake × 4 − 100)
  const draw = (await betsTagged(request, tag)).find((b) => b.legs[0]!.selection === 'Draw')!;
  const net = Math.round((draw.stake * 4 - 100) * 100) / 100;
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.getByTestId('history-summary')).toContainText('1 of ');
  await expect(page.getByTestId('history-summary')).toContainText('win rate 100.0% (1W/0L)');
  await expect(page.getByTestId('history-summary')).toContainText(`+R$ ${net.toFixed(2).replace('.', ',')}`);
  await expect(page.getByTestId('dutch-row').getByTestId('result')).toHaveText('Won');
});

test('dutch of combinations: shared leg, estimated and typed total, logged as combinations, legs in History, two winners settled with 1, 2, Enter', async ({ page, request, tag }) => {
  await page.goto('/betting-tool');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByLabel('Total stake').fill('100');
  // owner's example: McCain 25 pts (+220) + Celtics W (1,3) / Mitchell 30 pts (+220) + Celtics W (1,3)
  await page.getByRole('button', { name: '+ Shared leg' }).click();
  await page.getByLabel('Shared leg 1 name').fill(`${tag} Celtics W`);
  await page.getByLabel('Shared leg 1 odds').fill('1,3');
  await page.getByLabel('Selection 1 name').fill(`${tag} McCain 25 pts`);
  await page.getByLabel('Selection 1 odds').fill('+220');
  await page.getByLabel('Selection 2 name').fill(`${tag} Mitchell 30 pts`);
  await page.getByLabel('Selection 2 odds').fill('+220');
  // the total is prefilled with the legs multiplied (3.20 × 1.30) and marked estimated
  await expect(page.getByLabel('Selection 1 total odds')).toHaveValue('4.16');
  await expect(page.getByTestId('total-estimated')).toHaveCount(2); // the blank selection 3 has no total box
  await expect(page.getByTestId('dutch-stake')).toHaveText(['R$ 50,00', 'R$ 50,00']);
  // the book's real price typed over it wins
  await page.getByLabel('Selection 2 total odds').fill('4');
  await expect(page.getByTestId('total-estimated')).toHaveCount(1);
  await expect(page.getByTestId('dutch-row').nth(1)).toContainText(`${tag} Mitchell 30 pts + ${tag} Celtics W`);
  const stakes = await page.getByTestId('dutch-stake').allTextContents();
  expect(stakes).toEqual(['R$ 49,02', 'R$ 50,98']); // 100 / (1/4.16 + 1/4) split so both return the same

  // remembered across visits
  await page.reload();
  await expect(page.getByLabel('Shared leg 1 name')).toHaveValue(`${tag} Celtics W`);
  await expect(page.getByLabel('Selection 2 total odds')).toHaveValue('4');

  await page.getByRole('button', { name: 'Log as bets' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log dutch' });
  await expect(dialog.getByTestId('dutch-log-legs')).toHaveCount(2);
  await dialog.getByLabel('Placed date').fill('01/01/2000');
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Selection 1 book').fill(`${tag} Book`);
  await dialog.getByRole('button', { name: 'Log 2 bets' }).click();
  await expect(dialog).toBeHidden();

  const logged = (await betsTagged(request, tag)).sort((a, b) => a.betText.localeCompare(b.betText));
  expect(logged).toHaveLength(2);
  expect(logged.every((b) => b.type === 'combination' && b.dutchId === logged[0]!.dutchId && b.result === 'pending')).toBe(true);
  expect(logged.map((b) => b.betText)).toEqual([`${tag} McCain 25 pts + ${tag} Celtics W`, `${tag} Mitchell 30 pts + ${tag} Celtics W`]);
  expect(logged[0]!.odds).toBeCloseTo(4.16, 10);
  expect(logged[1]!.odds).toBe(4);
  expect(logged[0]!.legs.map((l) => [l.selection, l.odds])).toEqual([
    [`${tag} McCain 25 pts`, 3.2],
    [`${tag} Celtics W`, 1.3],
  ]);

  // History: the dutch expands to its two bets, each expands to its legs
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const group = page.getByTestId('dutch-row');
  await expect(group).toHaveCount(1);
  await group.getByRole('button', { name: 'Show bets' }).click();
  const nested = page.locator('[data-testid=bet-row][data-nested]');
  await expect(nested).toHaveCount(2);
  await nested.first().getByRole('button', { name: 'Show legs' }).click();
  await expect(page.getByTestId('leg-row')).toHaveCount(2);

  // Settle: both won with 1, 2, Enter; their legs are marked won. Z undoes; then S = shared leg lost
  await page.goto('/settle');
  const item = page.getByTestId('queue-row').filter({ hasText: `${tag} Book` });
  await item.click();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(item.locator('[data-testid=queue-dutch-bet][data-won]')).toHaveCount(2);
  await page.keyboard.press('Enter');
  const state = async () => (await betsTagged(request, tag)).sort((a, b) => a.betText.localeCompare(b.betText)).map((b) => [b.result, ...b.legs.map((l) => l.result)]);
  await expect.poll(state).toEqual([
    ['won', 'won', 'won'],
    ['won', 'won', 'won'],
  ]);
  await expect(item).toHaveCount(0);
  await page.keyboard.press('z');
  await expect.poll(state).toEqual([
    ['pending', 'pending', 'pending'],
    ['pending', 'pending', 'pending'],
  ]);
  await item.click();
  await page.keyboard.press('s');
  await expect.poll(state).toEqual([
    ['lost', 'pending', 'lost'],
    ['lost', 'pending', 'lost'],
  ]);
});
