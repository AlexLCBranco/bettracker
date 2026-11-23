import { readFileSync } from 'node:fs';
import { betsTagged, createBet, expect, test } from './helpers';

const LIVE = !!process.env.E2E_BASE_URL;

test('quick-add saves a pending bet with comma decimals', async ({ page, request, tag }) => {
  await page.goto('/history');
  await page.getByTestId('quick-add').fill(`R$150 @2,10 ${tag} lakers ml`); // R$: the table shows Real by default
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
  await expect(page.getByTestId('site-version')).toBeVisible(); // the page is ready for the N key
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

test('To settle tab: W settles the selected row and selects the next, Z undoes, C asks the amount', async ({ page, request, tag }) => {
  const a = await createBet(request, { betText: `${tag} first`, gameDate: '2000-01-01', placedDate: '2000-01-01' });
  const b = await createBet(request, { betText: `${tag} second`, gameDate: '2000-01-02', placedDate: '2000-01-02' });
  await page.goto('/?tab=settle');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const selected = page.locator('[data-testid=bet-row][data-selected]');
  await expect(page.getByTestId('bet-row').first()).toContainText(`${tag} first`);
  await expect(selected).toContainText(`${tag} first`);

  await page.keyboard.press('w');
  await expect(selected).toContainText(`${tag} second`);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === a.id)?.result).toBe('won');

  await page.keyboard.press('z');
  await expect(selected).toContainText(`${tag} first`);
  await expect.poll(async () => (await betsTagged(request, tag)).find((x) => x.id === a.id)?.result).toBe('pending');

  await page.keyboard.press('ArrowDown');
  await expect(selected).toContainText(`${tag} second`);
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
  await row.getByRole('button', { name: 'Edit Book' }).dblclick();
  await row.getByLabel('Book').fill(`${tag} New Book`);
  await row.getByLabel('Book').press('Enter');
  await expect(row).toContainText(`${tag} New Book`);
  await row.getByRole('button', { name: 'Mark Won' }).click();
  await expect(row.getByTestId('profit')).toHaveText('+R$ 50,00');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ book: `${tag} New Book`, result: 'won' });

  await row.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await expect(dialog.getByLabel('Stake')).toHaveValue('50');
  await expect(dialog.getByLabel('Result')).toHaveValue('pending');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await betsTagged(request, tag)).toHaveLength(2);
});

test('nav badge opens the To settle tab; old /history and /settle addresses land on Bets', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} due` });
  await page.goto('/analytics');
  await expect(page.getByTestId('due-count')).toBeVisible();
  await page.getByTestId('due-count').click();
  await expect(page).toHaveURL(/\/\?tab=settle$/);
  await expect(page.getByRole('tab', { name: /To settle/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('navigation').getByRole('link')).toHaveText(['Bets', /^\d+$/, 'Analytics', 'Dutch tool']);
  await page.goto('/history');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/settle');
  await expect(page).toHaveURL(/\/\?tab=settle$/);
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
  await page.goto('/analytics');
  await expect(page).toHaveURL(/\/login\?next=%2Fanalytics/);
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
  await expect(combos.getByRole('list', { name: 'One leg away' }).getByRole('listitem').filter({ hasText: `${tag} combo` })).toContainText(`lost: C vs D · ${tag} Mkt · Over 2.5`);
  const legRow = combos.getByRole('table', { name: 'Leg record by market' }).getByRole('row').filter({ hasText: `${tag} Mkt` });
  await expect(legRow.getByRole('cell')).toHaveText([`${tag} Mkt`, '0', '1', '0.0%']);
});

test('betting tool: dutching splits the stake so every selection returns the same, and remembers it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Dutch tool' }).click();
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

  await page.goto('/');
  await page.getByRole('button', { name: 'Export and import' }).click();
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
  await dialog.getByLabel('Game(s)').fill(`${tag} game`);
  await dialog.getByLabel('Game(s)').press('Enter'); // adds it as a chip; with one chip every leg gets it
  // the form starts on the last-used money, which on the live site can be H$: this test is about R$
  await dialog.getByLabel('Money').selectOption('real');
  await dialog.getByLabel('Placed date').fill('01/01/2000');
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Selection 1 book').fill(`${tag} BookA`);
  await expect(dialog.getByLabel('Selection 2 book')).toHaveValue(`${tag} BookA`); // copied from the row above
  await dialog.getByLabel('Selection 3 book').fill(`${tag} BookB`);
  await dialog.getByRole('button', { name: 'Log 3 bets' }).click();
  await expect(dialog).toBeHidden();

  // BT-9: the tool clears (stake kept) and says so; Undo clear puts the calculation back
  await expect(page.getByTestId('dutch-logged')).toContainText('Dutch logged: 3 bets, R$ 100,00');
  await expect(page.getByLabel('Selection 1 name')).toHaveValue('');
  await expect(page.getByLabel('Selection 3 odds')).toHaveValue('');
  await expect(page.getByLabel('Total stake')).toHaveValue('100');
  await page.getByRole('button', { name: 'Undo clear' }).click();
  await expect(page.getByLabel('Selection 1 name')).toHaveValue('Home');
  await expect(page.getByLabel('Selection 3 format')).toHaveValue('hongkong');
  await expect(page.getByTestId('dutch-logged')).toHaveCount(0);

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

  // Bets: one dutch row with its three splits under it
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const group = page.getByTestId('dutch-row');
  await expect(group).toHaveCount(1);
  await expect(group.getByTestId('dutch-stake')).toHaveText('R$ 100,00');
  await expect(page.locator('[data-testid=bet-row]:not([data-nested])')).toHaveCount(0);
  await expect(page.locator('[data-testid=bet-row][data-nested]')).toHaveCount(3);
  await expect(page.getByTestId('stat-wagered')).toContainText(/1 of \d+ bets?/);

  // To settle: the dutch is one row; 2 toggles Draw as won, Enter confirms (the others lost); Z undoes the whole group
  await page.getByRole('tab', { name: /To settle/ }).click();
  await expect(group).toHaveCount(1);
  await group.getByTestId('bet-text').click();
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: /Toggle won/, pressed: true })).toHaveAccessibleName(/Draw/);
  await page.keyboard.press('Enter');
  const results = async () => Object.fromEntries((await betsTagged(request, tag)).map((b) => [b.legs[0]!.selection, b.result]));
  await expect.poll(results).toEqual({ Home: 'lost', Draw: 'won', Away: 'lost' });
  await expect(group).toHaveCount(0);
  await page.keyboard.press('z');
  await expect.poll(results).toEqual({ Home: 'pending', Draw: 'pending', Away: 'pending' });
  await expect(group).toHaveCount(1);
  await group.getByTestId('bet-text').click();
  await page.keyboard.press('2');
  await page.keyboard.press('Enter');
  await expect.poll(results).toEqual({ Home: 'lost', Draw: 'won', Away: 'lost' });

  // Stats: one bet, one win, money bet by bet (Draw stake × 4 − 100)
  const draw = (await betsTagged(request, tag)).find((b) => b.legs[0]!.selection === 'Draw')!;
  const net = Math.round((draw.stake * 4 - 100) * 100) / 100;
  await page.getByRole('tab', { name: 'All' }).click();
  await expect(page.getByTestId('stat-wagered')).toContainText('1 of ');
  await expect(page.getByTestId('stat-winrate')).toContainText('100.0%');
  await expect(page.getByTestId('stat-winrate')).toContainText('1W / 0L');
  await expect(page.getByTestId('stat-net-value')).toHaveText(`+R$ ${net.toFixed(2).replace('.', ',')}`);
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
  await dialog.getByLabel('Money').selectOption('real'); // the table shows Real by default
  await expect(dialog.getByTestId('dutch-log-leg')).toHaveCount(2);
  await expect(dialog.getByTestId('dutch-log-shared')).toHaveCount(1);
  await dialog.getByLabel('Placed date').fill('01/01/2000');
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Selection 1 book').fill(`${tag} Book`);
  await dialog.getByRole('button', { name: 'Log 2 bets' }).click();
  await expect(dialog).toBeHidden();

  // BT-9: cleared, and a reload does not bring the logged dutch back
  await expect(page.getByLabel('Shared leg 1 name')).toHaveCount(0);
  await expect(page.getByLabel('Selection 1 name')).toHaveValue('');
  await page.reload();
  await expect(page.getByLabel('Selection 1 name')).toHaveValue('');
  await expect(page.getByLabel('Shared leg 1 name')).toHaveCount(0);
  await expect(page.getByLabel('Total stake')).toHaveValue('100');

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
  const nested = page.locator('[data-testid=bet-row][data-nested]');
  await expect(nested).toHaveCount(2);
  await nested.first().getByRole('button', { name: 'Show legs' }).click();
  await expect(page.getByTestId('leg-row')).toHaveCount(2);

  // Settle: both won with 1, 2, Enter; their legs are marked won. Z undoes; then S = shared leg lost
  await page.getByRole('tab', { name: /To settle/ }).click();
  const item = page.getByTestId('dutch-row');
  await item.getByTestId('bet-text').click();
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: /Toggle won/, pressed: true })).toHaveCount(2);
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
  await item.getByTestId('bet-text').click();
  await page.keyboard.press('s');
  await expect.poll(state).toEqual([
    ['lost', 'pending', 'lost'],
    ['lost', 'pending', 'lost'],
  ]);
});

test('dutch hit count: the owner example settled three ways shows 0 of 2, 0 of 2, 1 of 2 splits hit', async ({ page, request, tag }) => {
  // three copies of McCain 25 pts + Celtics W / Mitchell 30 pts + Celtics W
  const make = async (n: number) => {
    const dutchId = `${tag}-${n}`;
    const out = [];
    for (const own of ['McCain 25 pts', 'Mitchell 30 pts']) {
      out.push(
        await createBet(request, {
          dutchId,
          type: 'combination',
          odds: 4,
          stake: 50,
          book: `${tag} Book${n}`,
          betText: `${tag} ${own} + Celtics W`,
          legs: [
            { selection: own, odds: 3.2 },
            { selection: 'Celtics W', odds: 1.3 },
          ],
        }),
      );
    }
    return out;
  };
  const [, two, three] = [await make(1), await make(2), await make(3)];
  const settle = (id: string, result: string, legs: [string, string], bets: { id: string; legs: { selection: string; odds: number | null }[] }[]) => {
    const b = bets.find((x) => x.id === id)!;
    return request.patch(`/api/bets/${id}`, { data: { result, legs: b.legs.map((l, i) => ({ selection: l.selection, odds: l.odds, result: legs[i] })) } });
  };

  // 1: Celtics lose, settled from the queue with S
  await page.goto('/?tab=settle');
  await page.getByLabel('Search bets').fill(tag);
  const item = page.getByTestId('dutch-row').filter({ hasText: `${tag} Book1` });
  await item.getByTestId('bet-text').click();
  await page.keyboard.press('s');
  await expect(item).toHaveCount(0);

  // 2: Celtics win, McCain and Mitchell both short
  for (const b of two) expect((await settle(b.id, 'lost', ['lost', 'won'], two)).ok()).toBe(true);
  // 3: only McCain short; first settle Mitchell alone so the queue shows the partly settled badge
  expect((await settle(three[1]!.id, 'won', ['won', 'won'], three)).ok()).toBe(true);
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  const partly = page.getByTestId('dutch-row').filter({ hasText: `${tag} Book3` });
  await expect(partly.getByTestId('result-sub')).toHaveText('1 of 2 splits hit');
  expect((await settle(three[0]!.id, 'lost', ['lost', 'won'], three)).ok()).toBe(true);

  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const row = (n: number) => page.getByTestId('dutch-row').filter({ hasText: `${tag} Book${n}` });
  await expect(page.getByTestId('dutch-row')).toHaveCount(3);
  // BT-19: a lost dutch where nothing hit says it once ("Lost"); what missed is in its tooltip
  await expect(row(1).getByTestId('result')).toHaveText('Lost');
  // BT-23: one pill and one sub-line per row; what missed is in the pill's tooltip
  await expect(row(1).getByTestId('result-sub')).toHaveText('0 of 2 splits hit');
  await expect(row(1).getByTestId('result')).toHaveAttribute('title', /^0\/2 hit · Missed: Celtics W \(shared\)/);
  await expect(row(2).getByTestId('result-sub')).toHaveText('0 of 2 splits hit');
  await expect(row(2).getByTestId('result')).toHaveAttribute('title', /Missed: McCain 25 pts, Mitchell 30 pts/);
  await expect(row(3).getByTestId('result')).toHaveText('Won');
  await expect(row(3).getByTestId('result')).toHaveClass(/emerald/);
  await expect(row(3).getByTestId('result-sub')).toHaveText('1 of 2 splits hit');

  // expanded: each split its own result pill, the lost leg marked
  await expect(page.locator(`[data-split-of="${three[0]!.dutchId}"] [data-testid=result]`)).toHaveText(['Lost', 'Won']);
  await page.locator(`[data-split-of="${three[0]!.dutchId}"]`).first().getByRole('button', { name: 'Show legs' }).click();
  await expect(page.locator('[data-testid=leg-row][data-lost]')).toHaveCount(1);
  await expect(page.locator('[data-testid=leg-row][data-lost]')).toContainText('McCain 25 pts');

  // all hit = bright green: flip McCain's split to won
  expect((await settle(three[0]!.id, 'won', ['won', 'won'], three)).ok()).toBe(true);
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await expect(row(3).getByTestId('result-sub')).toHaveText('2 of 2 splits hit');

  // Analytics, type view: the hit tiles count these (plus any real dutches on the live site)
  await page.goto('/analytics');
  await page.getByRole('tab', { name: 'Type' }).click();
  await expect(page.getByTestId('dutch-hits')).toBeVisible();
  for (const id of ['hits-all', 'hits-none', 'hits-shared']) expect(Number(await page.getByTestId(`${id}-value`).textContent())).toBeGreaterThanOrEqual(1);
});

test('betting tool: "If this many win" table with ranges and the break-even row, also in the log form', async ({ page }) => {
  await page.goto('/betting-tool');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByLabel('Total stake').fill('100');
  await page.getByLabel('Round stakes to').selectOption({ label: 'R$ 1' });
  for (const n of [1, 2, 3]) await page.getByLabel(`Selection ${n} odds`).fill('3');
  // stakes 34 / 33 / 33 return 102 / 99 / 99
  await expect(page.getByTestId('dutch-stake')).toHaveText(['R$ 34,00', 'R$ 33,00', 'R$ 33,00']);
  await expect(page.getByTestId('dutch-profit')).toContainText('Profit if 1 wins');
  const table = page.getByTestId('outcome-table');
  const rows = table.getByTestId('outcome-row');
  await expect(rows).toHaveCount(4);
  await expect(table.getByTestId('outcome-returns')).toHaveText(['R$ 0,00', 'R$ 99,00 – R$ 102,00', 'R$ 198,00 – R$ 201,00', 'R$ 300,00']);
  await expect(table.getByTestId('outcome-profit')).toHaveText(['-R$ 100,00', '-R$ 1,00 – +R$ 2,00', '+R$ 98,00 – +R$ 101,00', '+R$ 200,00']);
  await expect(table.locator('[data-testid=outcome-row][data-break-even]')).toHaveCount(1);
  await expect(rows.nth(2)).toHaveAttribute('data-break-even', 'true');
  await expect(table.getByTestId('outcome-break-even')).toHaveText('break-even from 2 wins');

  // a shared leg adds "Shared leg loses" on top
  await page.getByRole('button', { name: '+ Shared leg' }).click();
  await page.getByLabel('Shared leg 1 name').fill('Celtics W');
  await page.getByLabel('Shared leg 1 odds').fill('1.3');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText('Shared leg loses');
  await expect(rows.first()).toContainText('-R$ 100,00');

  // invalid: hidden with the rest of the results
  await page.getByLabel('Total stake').fill('0');
  await expect(table).toHaveCount(0);
  await page.getByLabel('Total stake').fill('100');

  // the log form shows a compact copy
  await page.getByRole('button', { name: 'Log as bets' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log dutch' });
  await expect(dialog.getByTestId('outcome-row')).toHaveCount(5);
  await expect(dialog.getByTestId('outcome-break-even')).toHaveText(/^break-even from \d wins?$/);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});

test('log dutch: Game(s) and Market(s) as chips, picked per leg (owner example), saved per leg, "2 games · 2 markets" in History', async ({ page, request, tag }) => {
  await page.goto('/betting-tool');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByLabel('Total stake').fill('100');
  await page.getByRole('button', { name: '+ Shared leg' }).click();
  await page.getByLabel('Shared leg 1 name').fill('Celtics W');
  await page.getByLabel('Shared leg 1 odds').fill('1,3');
  await page.getByLabel('Selection 1 name').fill('McCain 25 pts');
  await page.getByLabel('Selection 1 odds').fill('+220');
  await page.getByLabel('Selection 2 name').fill('Mitchell 30 pts');
  await page.getByLabel('Selection 2 odds').fill('+220');
  await page.getByRole('button', { name: 'Log as bets' }).click();

  const dialog = page.getByRole('dialog', { name: 'Log dutch' });
  // the form starts on the last-used money, which on the live site can be H$ (hidden under the Real switch)
  await dialog.getByLabel('Money').selectOption('real');
  await dialog.getByLabel('Placed date').fill('01/01/2000');
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Selection 1 book').fill(`${tag} Book`);
  const games = dialog.getByLabel('Game(s)');
  await games.fill(`${tag} CLE x BOS, ${tag} NYK x MIA,`); // comma adds chips
  const markets = dialog.getByLabel('Market(s)');
  await markets.fill('ML');
  await markets.press('Enter');
  await markets.fill('PTS');
  await markets.press('Enter');
  await markets.fill('Oops');
  await markets.press('Enter');
  await markets.press('Backspace'); // empty box: removes the last chip
  await expect(dialog.getByTestId('chips-game').getByTestId('chip')).toHaveText([`${tag} CLE x BOS×`, `${tag} NYK x MIA×`]);
  await expect(dialog.getByTestId('chips-market').getByTestId('chip')).toHaveText(['ML×', 'PTS×']);

  // several chips and nothing picked: refused
  await dialog.getByRole('button', { name: 'Log 2 bets' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Pick the game for each leg');

  await dialog.getByLabel('Selection 1 leg 1 game').selectOption(`${tag} CLE x BOS`);
  await dialog.getByLabel('Selection 2 leg 1 game').selectOption(`${tag} NYK x MIA`);
  await dialog.getByLabel('Selection 1 leg 1 market').selectOption('PTS'); // quick fill: Mitchell below gets PTS too
  await dialog.getByLabel('Shared leg 1 game').selectOption(`${tag} CLE x BOS`);
  await dialog.getByRole('button', { name: 'Log 2 bets' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Pick the market for each leg');
  await dialog.getByLabel('Shared leg 1 market').selectOption('ML');
  await dialog.getByRole('button', { name: 'Log 2 bets' }).click();
  await expect(dialog).toBeHidden();

  const logged = (await betsTagged(request, tag)).sort((a, b) => a.betText.localeCompare(b.betText));
  expect(logged.map((b) => b.legs.map((l) => [l.selection, l.game, l.market]))).toEqual([
    [
      ['McCain 25 pts', `${tag} CLE vs BOS`, 'pts'],
      ['Celtics W', `${tag} CLE vs BOS`, 'ML'],
    ],
    [
      ['Mitchell 30 pts', `${tag} NYK vs MIA`, 'pts'],
      ['Celtics W', `${tag} CLE vs BOS`, 'ML'],
    ],
  ]);

  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const group = page.getByTestId('dutch-row');
  // BT-23: the first game with a "+1" chip, every game in its tooltip, written "Away @ Home"
  await expect(group.getByTestId('combo-games')).toContainText(`${tag} CLE @ BOS`);
  await expect(group.getByTestId('several-games')).toHaveText('+1');
  await expect(group.getByTestId('several-games')).toHaveAttribute('title', `${tag} CLE @ BOS, ${tag} NYK @ MIA`);
  await expect(group.getByTestId('several-markets')).toHaveText('2 markets');
  // each bet: one game, two markets
  await expect(page.locator('[data-testid=bet-row][data-nested]').first().getByTestId('several-markets')).toHaveText('2 markets');
});

test('dutch row: one-click settle buttons in History (Pick W… one split, Undo, Shared ✕, Z), badge updates', async ({ page, request, tag }) => {
  const dutchId = `${tag}-row`;
  for (const own of ['McCain 25 pts', 'Mitchell 30 pts'])
    await createBet(request, {
      dutchId,
      type: 'combination',
      odds: 4,
      stake: 50,
      book: `${tag} Book`,
      betText: `${tag} ${own} + Celtics W`,
      legs: [
        { selection: own, odds: 3.2 },
        { selection: 'Celtics W', odds: 1.3 },
      ],
    });
  const state = async () =>
    Object.fromEntries((await betsTagged(request, tag)).map((b) => [b.betText.replace(`${tag} `, ''), [b.result, ...b.legs.map((l) => l.result)].join(' ')]));

  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('dutch-row');
  const badge = row.getByTestId('result-sub');
  await expect(row.getByTestId('dutch-settle').getByRole('button')).toHaveText(['0 W', 'All W', 'Pick W…', 'Shared ✕', 'V']);

  // Pick W… with two splits: one button per split, one click settles
  await row.getByRole('button', { name: 'Dutch: pick winners' }).click();
  await page.getByRole('dialog', { name: 'Which splits won' }).getByRole('button', { name: /Mitchell 30 pts \+ Celtics W won/ }).click();
  // BT-27: the shared Celtics W won on Mitchell's split, so McCain is the leg that lost
  await expect.poll(state).toEqual({ 'McCain 25 pts + Celtics W': 'lost lost won', 'Mitchell 30 pts + Celtics W': 'won won won' });
  await expect(badge).toHaveText('1 of 2 splits hit');
  await expect(row.getByTestId('dutch-settle')).toHaveCount(0); // settled: buttons hidden, Undo shown

  await row.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(state).toEqual({ 'McCain 25 pts + Celtics W': 'pending pending pending', 'Mitchell 30 pts + Celtics W': 'pending pending pending' });
  await expect(row.getByTestId('dutch-settle')).toBeVisible();

  await row.getByRole('button', { name: 'Dutch: shared leg lost' }).click();
  await expect.poll(state).toEqual({ 'McCain 25 pts + Celtics W': 'lost pending lost', 'Mitchell 30 pts + Celtics W': 'lost pending lost' });
  // nothing hit: the Lost pill with "0 of 2 splits hit", the miss in its tooltip
  await expect(badge).toHaveText('0 of 2 splits hit');
  await expect(row.getByTestId('result')).toHaveAttribute('title', /Missed: Celtics W \(shared\)/);

  // Z on the page undoes too (not while typing in the search box)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('z');
  await expect.poll(state).toEqual({ 'McCain 25 pts + Celtics W': 'pending pending pending', 'Mitchell 30 pts + Celtics W': 'pending pending pending' });
});

test('dutch row: Pick W… with three splits uses checkboxes, Enter saves', async ({ page, request, tag }) => {
  for (const [sel, odds] of [
    ['Home', 2.5],
    ['Draw', 3.2],
    ['Away', 4],
  ] as const)
    await createBet(request, { dutchId: `${tag}-3`, book: `${tag} Book`, betText: '', odds, legs: [{ selection: `${tag} ${sel}`, odds }] });
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('dutch-row');
  await row.getByRole('button', { name: 'Dutch: pick winners' }).click();
  const pick = page.getByRole('dialog', { name: 'Which splits won' });
  await expect(pick.getByRole('checkbox')).toHaveCount(3);
  await pick.getByLabel(`${tag} Home @2.50`).check();
  await pick.getByLabel(`${tag} Away @4.00`).check();
  await pick.getByLabel(`${tag} Away @4.00`).press('Enter');
  const results = async () => Object.fromEntries((await betsTagged(request, tag)).map((b) => [b.legs[0]!.selection.replace(`${tag} `, ''), b.result]));
  await expect.poll(results).toEqual({ Home: 'won', Draw: 'lost', Away: 'won' });
  await expect(row.getByTestId('result-sub')).toHaveText('2 of 3 splits hit');
});

test('bets reload when the tab comes back into view: a bet added and deleted elsewhere shows / goes', async ({ page, request, tag }) => {
  await page.clock.install();
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.getByTestId('bet-row')).toHaveCount(0);

  // another client (the phone, another tab, an e2e run) adds a bet
  const made = await createBet(request, { betText: `${tag} from elsewhere` });
  const comeBack = async () => {
    await page.clock.fastForward(6000); // reloads at most every 5 s
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  };
  await comeBack();
  await expect(page.getByTestId('bet-row')).toHaveCount(1);
  await expect(page.getByTestId('bet-row')).toContainText(`${tag} from elsewhere`);

  // ... and deletes it: it goes away here too
  await request.delete(`/api/bets/${made.id}`);
  await comeBack();
  await expect(page.getByTestId('bet-row')).toHaveCount(0);
});

test('BT-16: odds in any format in the full form, quick-add and History cells, saved as decimal', async ({ page, request, tag }) => {
  await page.goto('/history');
  // full form: "-114" shows the hint, becomes 1.88 on blur, saves 1.88
  await page.getByRole('button', { name: 'Full form' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await dialog.getByLabel('Money').selectOption('real'); // the table shows Real by default
  await dialog.getByLabel('Stake').fill('100');
  await dialog.getByLabel('Odds').fill('-114');
  await expect(dialog.getByTestId('odds-hint')).toHaveText('-114 → 1.88 (American)');
  await expect(dialog.getByTestId('potential-return')).toHaveText('R$ 188,00');
  await dialog.getByLabel('Bet text').fill(`${tag} minus`);
  await expect(dialog.getByLabel('Odds')).toHaveValue('1.88');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag)).map((b) => b.odds)).toEqual([1.88]);

  // quick-add "+220"
  await page.getByTestId('quick-add').fill(`R$50 @+220 ${tag} plus`);
  await page.getByTestId('quick-add').press('Enter');
  await expect(page.getByRole('status')).toContainText('@3.20');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.betText.endsWith('plus'))?.odds).toBe(3.2);

  // History inline odds cell: "5/2" saves 3.5 and shows 3.50
  await page.getByLabel('Search bets').fill(tag);
  const row = page.getByTestId('bet-row').filter({ hasText: `${tag} minus` });
  await row.getByRole('button', { name: 'Edit Odds' }).dblclick();
  await row.getByLabel('Odds').fill('5/2');
  await expect(row.getByTestId('odds-hint')).toContainText('→ 3.50');
  await row.getByLabel('Odds').press('Enter');
  await expect(row.getByRole('button', { name: 'Edit Odds' })).toHaveText('3.50');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.betText.endsWith('minus'))?.odds).toBe(3.5);
});

for (const width of [1366, 1920]) {
  test(`BT-15: History fits a ${width}px screen: no sideways scroll, every row's buttons in view`, async ({ page, request, tag }) => {
    await page.setViewportSize({ width, height: 900 });
    const long = 'a very long bet text that goes on and on about the over under and both teams to score';
    await createBet(request, { betText: `${tag} ${long}`, book: 'A Book With A Long Name Indeed', legs: [{ sport: 'Football', game: 'Sociedade Esportiva Palmeiras x Clube de Regatas do Flamengo', market: 'Match result', selection: 'Palmeiras' }] });
    await createBet(request, { betText: `${tag} combo`, type: 'combination', odds: 4, legs: [{ sport: 'Football', game: 'A x B', selection: 'A', odds: 2 }, { sport: 'Basketball', game: 'C x D', selection: 'C', odds: 2 }] });
    const d = `${tag}-d`;
    for (const sel of ['Home', 'Draw', 'Away']) await createBet(request, { betText: '', dutchId: d.replace(/[^A-Za-z0-9_-]/g, ''), odds: 3, legs: [{ sport: 'Football', game: `${tag} long game name x another long name`, selection: sel }] });
    for (const path of ['/']) {
      await page.goto(path);
      await page.getByLabel('Search bets').fill(tag);
      await expect(page.getByTestId('bet-row').first()).toBeVisible();
      const scroll = page.getByTestId('bet-table-scroll');
      const { sw, cw } = await scroll.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
      expect(sw, `${path}: table scrolls sideways`).toBeLessThanOrEqual(cw);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const tableBox = (await page.getByTestId('bet-table').boundingBox())!;
      const rows = page.locator('[data-testid="bet-row"]:not([data-nested]), [data-testid="dutch-row"]').filter({ hasText: tag });
      for (const row of await rows.all()) {
        const btn = row.getByRole('button', { name: /^(Edit|More dutch actions)$/ });
        const box = (await btn.boundingBox())!;
        expect(box.x + box.width, `${path}: a row's buttons are off screen`).toBeLessThanOrEqual(width);
        // BT-23: and inside the table (a pending dutch's settle buttons are the widest)
        expect(box.x + box.width, `${path}: a row's buttons stick out of the table`).toBeLessThanOrEqual(tableBox.x + tableBox.width + 0.5);
      }
      // BT-26: long text is no longer cut: it wraps
      await expect(page.getByRole('button', { name: 'Edit Bet' }).filter({ hasText: 'over under' })).toHaveText(`${tag} ${long}`);
    }
  });
}

test('BT-13: wins green, losses red, half amber, pending grey; a lost combination names the leg that killed it; a dutch row by its net', async ({ page, request, tag }) => {
  const won = await createBet(request, { betText: `${tag} won`, result: 'won' });
  const lost = await createBet(request, { betText: `${tag} lost`, result: 'lost' });
  const half = await createBet(request, { betText: `${tag} half`, result: 'half-won' });
  const pend = await createBet(request, { betText: `${tag} pending` });
  const combo = await createBet(request, {
    betText: `${tag} combo`,
    type: 'combination',
    odds: 4,
    result: 'lost',
    legs: [{ selection: 'Lakers', odds: 2, result: 'won' }, { selection: 'Celtics', odds: 2, result: 'lost' }],
  });
  const d = tag.replace(/[^A-Za-z0-9_-]/g, '');
  await createBet(request, { betText: '', dutchId: d, odds: 3, result: 'won', legs: [{ game: `${tag} g`, selection: 'Home' }] });
  await createBet(request, { betText: '', dutchId: d, odds: 3, result: 'lost', legs: [{ game: `${tag} g`, selection: 'Away' }] });
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const tones: [typeof won, string, string][] = [
    [won, 'win', 'Won'],
    [lost, 'loss', 'Lost'],
    [half, 'partial', 'Half-won'],
    [pend, 'pending', 'Pending'],
    [combo, 'loss', 'Lost'],
  ];
  for (const [b, tone, label] of tones) {
    const row = page.locator(`[data-bet-id="${b.id}"]`);
    await expect(row).toHaveAttribute('data-tone', tone);
    await expect(row.getByTestId('result')).toHaveText(label);
  }
  await expect(page.locator(`[data-bet-id="${won.id}"] [data-testid="result"]`)).toHaveClass(/emerald/);
  await expect(page.locator(`[data-bet-id="${lost.id}"] [data-testid="result"]`)).toHaveClass(/red/);
  await expect(page.locator(`[data-bet-id="${pend.id}"] [data-testid="result"]`)).toHaveClass(/zinc/);
  await expect(page.locator(`[data-bet-id="${combo.id}"] [data-testid="loss-line"]`)).toHaveText('✗ Celtics'); // BT-27: losing legs on their own line
  // the expanded combination: the lost leg red ✕, the won leg green ✓
  await page.locator(`[data-bet-id="${combo.id}"]`).getByRole('button', { name: 'Show legs' }).click();
  await expect(page.getByTestId('leg-row').filter({ hasText: 'Celtics' })).toHaveAttribute('data-tone', 'loss');
  await expect(page.getByTestId('leg-row').filter({ hasText: 'Lakers' })).toHaveAttribute('data-tone', 'win');
  // dutch: 10 @3 won, 10 @3 lost = +10 net: a green row; its profit the same size as any row's (BT-18)
  const dutch = page.locator(`[data-dutch-id="${d}"]`);
  await expect(dutch).toHaveAttribute('data-tone', 'win');
  await expect(dutch.getByTestId('profit').locator('span')).toHaveClass(/font-semibold/);
  await expect(dutch.getByTestId('profit')).toHaveText('+R$ 10,00');
  await expect(page.locator(`[data-split-of="${d}"] [data-testid=result]`)).toHaveText(['Won', 'Lost']);
});

test('BT-12: edit a logged dutch: change odds and stake, add a split, remove a split; results kept, History and dashboard follow', async ({ page, request, tag }) => {
  const d = tag.replace(/[^A-Za-z0-9_-]/g, '');
  const leg = (selection: string) => [{ sport: 'Football', game: `${tag} A x B`, market: '1X2', selection }];
  const home = await createBet(request, { betText: '', dutchId: d, odds: 2, stake: 50, result: 'won', legs: leg('Home') });
  const draw = await createBet(request, { betText: '', dutchId: d, odds: 4, stake: 25, legs: leg('Draw') });
  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-dutch-id="${d}"]`);
  await expect(row.getByTestId('dutch-stake')).toHaveText('R$ 75,00');
  await row.getByRole('button', { name: 'Edit dutch' }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit dutch' });
  await expect(dialog.getByLabel('Selection 1 name')).toHaveValue('Home');
  await expect(dialog.getByLabel('Selection 1 odds')).toHaveValue('2.00');
  await expect(dialog.getByLabel('Selection 2 stake')).toHaveValue('25');
  await expect(dialog.getByLabel('Placed date')).toHaveValue('01/01/2000');
  // split 1: odds "+150" (= 2.50) and stake 60
  await dialog.getByLabel('Selection 1 odds').fill('+150');
  await dialog.getByLabel('Selection 1 stake').fill('60');
  // remove split 2 (Draw), add Away @3.5 for 20
  await dialog.getByRole('button', { name: 'Remove selection 2' }).click();
  await dialog.getByRole('button', { name: '+ Add split' }).click();
  await dialog.getByLabel('Selection 2 name').fill('Away');
  await dialog.getByLabel('Selection 2 odds').fill('3.5');
  await dialog.getByLabel('Selection 2 stake').fill('20');
  await expect(dialog.getByTestId('dutch-form-total')).toHaveText('R$ 80,00');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Dutch saved: 1 updated, 1 added, 1 removed');

  await expect
    .poll(async () => {
      const all = (await (await request.get('/api/bets')).json()) as { id: string; dutchId: string | null; odds: number; stake: number; result: string; legs: { selection: string; game: string }[] }[];
      return all
        .filter((b) => b.dutchId === d)
        .map((b) => [b.id === home.id ? 'home' : b.id === draw.id ? 'draw' : 'new', b.legs[0]!.selection, b.odds, b.stake, b.result, b.legs[0]!.game])
        .sort();
    })
    .toEqual([
      ['home', 'Home', 2.5, 60, 'won', `${tag} A vs B`],
      ['new', 'Away', 3.5, 20, 'pending', `${tag} A vs B`],
    ]);
  // History: still one dutch row, new total, Home still won
  await expect(row.getByTestId('dutch-stake')).toHaveText('R$ 80,00');
  await expect(page.locator(`[data-split-of="${d}"] [data-testid=bet-text]`)).toHaveText([/Home/, /Away/]);
  await expect(row.getByTestId('result')).toHaveText('Pending');
  await expect(page.getByTestId('stat-wagered')).toContainText('1 of');
  // dashboard recent bets shows the edited dutch too (locally: on the live site real bets push a 2000-dated one out of the last 20)
  if (!LIVE) {
    await page.goto('/');
    await expect(page.locator(`[data-dutch-id="${d}"]`).getByTestId('dutch-stake')).toHaveText('R$ 80,00');
  }
});

test('BT-14: hypothetical money (H$): quick-add and full form, never in Real totals, Hypothetical / Both switch, History filter', async ({ page, request, tag }) => {
  const real = await createBet(request, { betText: `${tag} real`, stake: 100, odds: 2, result: 'won' });
  const hypo = await createBet(request, { betText: `${tag} hypo`, stake: 1000, odds: 3, result: 'won', money: 'hypothetical' });
  expect(hypo.money).toBe('hypothetical');

  // quick-add "H$50" saves hypothetical money
  await page.goto('/history');
  await page.getByTestId('quick-add').fill(`H$50 @2 ${tag} quick`);
  await page.getByTestId('quick-add').press('Enter');
  await expect(page.getByRole('status')).toContainText('Saved: H$ 50,00');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.betText.endsWith('quick'))?.money).toBe('hypothetical');

  // full form: pick Hypothetical
  await page.getByRole('button', { name: 'Full form' }).click();
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await dialog.getByLabel('Money').selectOption('hypothetical');
  await expect(dialog.getByText('Stake (H$) *')).toBeVisible();
  await dialog.getByLabel('Stake').fill('20');
  await dialog.getByLabel('Odds').fill('2');
  await expect(dialog.getByTestId('potential-return')).toHaveText('H$ 40,00');
  await dialog.getByLabel('Bet text').fill(`${tag} form`);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.betText.endsWith('form'))?.money).toBe('hypothetical');

  // Bets: Real (the default) never shows or counts H$; the top bar's switch picks Hypothetical or Both
  await page.getByLabel('Search bets').fill(tag);
  const money = page.getByRole('banner').getByRole('radiogroup', { name: 'Money shown' });
  const net = page.getByTestId('stat-net-value');
  await expect(money.getByRole('radio', { name: 'Real R$' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator(`[data-bet-id="${hypo.id}"]`)).toHaveCount(0);
  await expect(net).toHaveText('+R$ 100,00');
  await expect(page.getByTestId('stat-wagered')).toContainText('1 of');
  await money.getByRole('radio', { name: 'Both' }).click();
  await expect(page.locator(`[data-bet-id="${hypo.id}"]`).getByRole('button', { name: 'Edit Stake' })).toHaveText('H$ 1.000,00');
  await expect(page.locator(`[data-bet-id="${hypo.id}"]`).getByTestId('profit')).toHaveText('+H$ 2.000,00');
  await expect(net).toHaveText('+R$+H$ 2.100,00');
  await money.getByRole('radio', { name: 'Hypothetical H$' }).click();
  await expect(page.locator(`[data-bet-id="${real.id}"]`)).toHaveCount(0);
  await expect(page.locator('[data-money="hypothetical"]').filter({ hasText: tag })).toHaveCount(3);
  await expect(net).toHaveText('+H$ 2.000,00');
  await expect(page.getByTestId('stat-wagered-value')).toHaveText('H$ 1.070,00');

  // Analytics shares the switch (remembered)
  await page.goto('/analytics');
  await expect(page.getByRole('radio', { name: 'Hypothetical H$' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('cell-wagered').first()).toContainText('H$');
  await page.getByRole('radio', { name: 'Real R$' }).click();
  await expect(page.getByTestId('cell-wagered').first()).not.toContainText('H$');
});

test('BT-17–22: combo rows with legs and counts, same styling on every row, tidy text, no repeated date, team twice warned', async ({ page, request, tag }) => {
  const d = tag.replace(/[^A-Za-z0-9_-]/g, '');
  // a settled combination with legs in two games (one written "@"), stat units in capitals, unrounded odds
  const combo = await createBet(request, {
    betText: `${tag} combo`,
    type: 'combination',
    odds: 4,
    result: 'lost',
    money: 'hypothetical',
    legs: [
      { sport: 'NBA', game: `${tag}Celtics @ ${tag}Warriors`, selection: 'McCain 25 PTS', odds: 2, result: 'won' },
      { sport: 'NBA', game: `${tag}Lakers vs ${tag}Nets`, selection: 'Lakers W', odds: 2, result: 'lost' },
    ],
  });
  const solo = await createBet(request, { betText: `${tag} solo mccain 20 pts`, stake: 100, odds: 1.9924, result: 'won', money: 'hypothetical', placedDate: '2000-01-01', gameDate: '2000-01-02' });
  await createBet(request, { betText: '', dutchId: d, odds: 3, result: 'won', money: 'hypothetical', legs: [{ game: `${tag} g`, selection: 'Home' }] });
  await createBet(request, { betText: '', dutchId: d, odds: 3, result: 'lost', money: 'hypothetical', legs: [{ game: `${tag} g`, selection: 'Away' }] });
  // BT-17: an API combination with one leg is saved as a solo
  const one = await createBet(request, { betText: `${tag} one`, type: 'combination', legs: [{ selection: 'Only leg' }] });
  expect(one.type).toBe('solo');

  await page.goto('/');
  await page.getByRole('radio', { name: 'Both' }).click();
  await page.getByLabel('Search bets').fill(tag);
  const c = page.locator(`[data-bet-id="${combo.id}"]`);
  const s = page.locator(`[data-bet-id="${solo.id}"]`);
  const dutch = page.locator(`[data-dutch-id="${d}"]`);

  // BT-17: Combo · 2, the legs' games and league, ▸, a 1/2 leg count; one-leg bet is a Solo
  await expect(c.getByRole('button', { name: 'Edit Type' })).toHaveText('Combo ×2');
  await expect(c.getByTestId('combo-games')).toHaveText(`${tag}Celtics @ ${tag}Warriors+1`);
  await expect(c).toContainText('NBA');
  await expect(c.getByTestId('loss-line')).toHaveText('✗ Lakers W');
  await expect(page.locator(`[data-bet-id="${one.id}"]`).getByTestId('type')).toHaveCount(0); // a Solo has no type tag

  // BT-18: same profit weight, same stake colour (H$ violet), same won-row tint; W/L/V only on unsettled rows
  for (const row of [c, s, dutch]) await expect(row.getByTestId('profit').locator('span')).toHaveClass(/font-semibold/);
  await expect(c.getByRole('button', { name: 'Edit Stake' })).toHaveCSS('color', await dutch.getByTestId('dutch-stake').locator('span').evaluate((e) => getComputedStyle(e).color));
  const bg = (l: typeof c) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg(s)).toBe(await bg(dutch));
  for (const row of [c, s]) await expect(row.getByRole('button', { name: 'Mark Won' })).toHaveCount(0);
  await expect(page.locator(`[data-bet-id="${one.id}"]`).getByRole('button', { name: 'Mark Won' })).toBeVisible();

  // BT-19: no "Dutch" chip in the Bet column; won with 1/2 hit is green
  await expect(dutch.getByTestId('bet-text')).toHaveText('Dutch ×2');
  await expect(page.locator(`[data-split-of="${d}"] [data-testid=bet-text]`)).toHaveText(['Home', 'Away']);
  await expect(dutch.getByTestId('result-sub')).toHaveText('1 of 2 splits hit');

  // BT-20: units and games tidy, proper names, odds as paid, full text on hover
  await c.getByRole('button', { name: 'Show legs' }).click();
  await expect(page.getByTestId('leg-row').first()).toContainText('McCain 25 pts');
  await expect(s.getByRole('button', { name: 'Edit Bet', exact: true })).toHaveText(`${tag} solo McCain 20 pts`);
  await expect(s.getByRole('button', { name: 'Edit Odds' })).toHaveText('1.9924');
  await expect(s.getByTestId('profit')).toHaveText('+H$ 99,24');
  await expect(c.getByTestId('several-games')).toHaveAttribute('title', new RegExp(`${tag}Lakers @ ${tag}Nets`));

  // BT-21: game date only when it differs from the bet date
  await expect(s.getByTestId('game-date')).toHaveText('game 2 Jan 2000');
  await expect(c.getByTestId('game-date')).toHaveCount(0);
  await expect(dutch.getByTestId('game-date')).toHaveCount(0);

  // BT-22: a new bet putting Celtics in a second game on the same date warns (saving still works)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await dialog.getByLabel('Type').selectOption('solo');
  await dialog.getByLabel('Game date').fill('01/01/2000');
  await dialog.getByLabel('Game', { exact: true }).fill(`${tag}Celtics x ${tag}Knicks`);
  await expect(dialog.getByTestId('team-clash')).toContainText(`${tag}Celtics play twice on 01/01/2000`);
  await dialog.getByLabel('Game', { exact: true }).fill(`${tag}Heat x ${tag}Knicks`);
  await expect(dialog.getByTestId('team-clash')).toHaveCount(0);
  // BT-17: one leg in a combination is flagged in the form
  await dialog.getByLabel('Type').selectOption('combination');
  await dialog.getByRole('button', { name: '+ Add leg' }).click();
  await expect(dialog.getByTestId('one-leg')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('BT-23 / BT-26: bets grouped by day, one pill per row, the muted line, splits under their dutch', async ({ page, request, tag }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  const book = `${tag} Book`;
  const day = { placedDate: '2000-01-03', gameDate: '2000-01-03', book };
  await createBet(request, { ...day, betText: `${tag} solo won`, stake: 100, odds: 2, result: 'won', gameDate: '2000-01-04', legs: [{ sport: 'NBA', game: 'Celtics vs Warriors', selection: 'Celtics' }] });
  await createBet(request, { ...day, betText: `${tag} paper`, stake: 50, result: 'lost', money: 'hypothetical' });
  const d = `${tag}-d`.replace(/[^A-Za-z0-9_-]/g, '');
  for (const [sel, result] of [['Home', 'won'], ['Away', 'lost']] as const)
    await createBet(request, { ...day, betText: '', dutchId: d, stake: 10, odds: 3, result, legs: [{ sport: 'Football', game: `${tag} A x B`, selection: sel }] });
  await createBet(request, {
    ...day,
    betText: `${tag} lost combo`,
    type: 'combination',
    odds: 4,
    result: 'lost',
    legs: [{ game: 'Celtics @ Warriors', selection: 'Celtics', market: 'ML', odds: 2, result: 'lost' }, { game: 'Lakers vs Nets', selection: 'Lakers', odds: 2, result: 'won' }],
  });
  await createBet(request, {
    ...day,
    betText: `${tag} open combo`,
    type: 'combination',
    odds: 4,
    legs: [{ selection: 'Lakers', odds: 2, result: 'won' }, { selection: 'Nets', odds: 2 }],
  });
  await createBet(request, { ...day, betText: `${tag} live one`, situation: 'live' });
  await createBet(request, { placedDate: '2000-01-04', gameDate: '2000-01-04', book, betText: `${tag} next day` });

  await page.goto('/');
  await page.getByRole('banner').getByRole('radio', { name: 'Both' }).click(); // the paper bet is H$
  await page.getByLabel('Search bets').fill(tag);
  const top = page.locator('[data-testid=bet-row]:not([data-nested]), [data-testid=dutch-row]');
  await expect(top).toHaveCount(7);

  // a header per day with its bets (a dutch once) and net per money
  await expect(page.getByTestId('day-label')).toHaveText(['Tue, 4 Jan 2000', 'Mon, 3 Jan 2000']);
  await expect(page.getByTestId('day-totals')).toHaveText(['1 bet', '6 bets · +R$ 100,00 · -H$ 50,00']);
  await expect(page.getByTestId('day-net-hypothetical')).toHaveClass(/violet/);

  // one pill per row, no row tint
  await page.mouse.move(0, 0);
  for (const row of await top.all()) {
    await expect(row.getByTestId('result')).toHaveCount(1);
    expect(await row.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  }
  const bet = (text: string) => page.getByTestId('bet-row').filter({ hasText: `${tag} ${text}` });
  const dutch = page.locator(`[data-dutch-id="${d}"]`);

  // the result sub-line, on the muted line
  await expect(dutch.getByTestId('result-sub')).toHaveText('1 of 2 splits hit');
  await expect(bet('lost combo').getByTestId('loss-line')).toHaveText('✗ Celtics'); // BT-27: the selection only, no market
  await expect(bet('open combo').getByTestId('result-sub')).toHaveText('1 of 2 legs hit');
  await expect(bet('solo won').getByTestId('result-sub')).toHaveCount(0);

  // game: "Away @ Home", a +1 chip, "+ add game", the game date when it is another day
  await expect(bet('solo won').getByRole('button', { name: 'Edit Game', exact: true })).toHaveText('Celtics @ Warriors');
  await expect(bet('solo won').getByTestId('game-date')).toHaveText('game 4 Jan 2000');
  await expect(bet('lost combo').getByTestId('combo-games')).toHaveText('Celtics @ Warriors+1');
  await expect(bet('paper').getByRole('button', { name: 'Edit Game', exact: true })).toHaveText('+ add game');

  // type tags: Combo ×n, Dutch ×n, LIVE only when live
  await expect(bet('lost combo').getByTestId('type')).toHaveText('Combo ×2');
  await expect(dutch.getByTestId('type')).toHaveText('Dutch ×2');
  await expect(bet('live one').getByTestId('live-tag')).toBeVisible();
  await expect(bet('solo won').getByTestId('live-tag')).toHaveCount(0);

  // actions: ✎ and ⋯ on hover only, W / L / V always on a pending row
  const actions = bet('live one').getByTestId('row-actions');
  await expect(actions).toHaveCSS('opacity', '0');
  await expect(bet('live one').getByRole('button', { name: 'Mark Won' })).toBeVisible();
  await bet('live one').hover();
  await expect(actions).toHaveCSS('opacity', '1');

  // the dutch's splits under it, "Split 1", "Split 2" with a connector; a book equal to the dutch's is not repeated
  const splits = page.locator(`[data-split-of="${d}"]`);
  await expect(splits.getByTestId('split-label')).toHaveText(['Split 1', 'Split 2']);
  await expect(splits.getByTestId('connector')).toHaveCount(2);
  await expect(splits.getByTestId('book')).toHaveCount(0);
  await expect(splits.getByTestId('result')).toHaveText(['Won', 'Lost']);

  // sticky header
  await expect(page.getByRole('columnheader', { name: 'Bet' })).toHaveCSS('position', 'sticky');
});

test('BT-24: the ⋯ menu opens fully visible on dutch and bet rows, stays while the mouse is on it, items clickable', async ({ page, request, tag }) => {
  const book = `${tag} Book`;
  const d = `${tag}-m`.replace(/[^A-Za-z0-9_-]/g, '');
  // the dutch and a bet on the newest days, more rows under them for the menu to overlap
  for (const sel of ['Celtics ML', 'Warriors ML'])
    await createBet(request, { placedDate: '2000-01-05', gameDate: '2000-01-05', book, betText: '', dutchId: d, legs: [{ game: `${tag} Celtics @ Warriors`, selection: sel, odds: 2 }] });
  const single = await createBet(request, { placedDate: '2000-01-04', gameDate: '2000-01-04', book, betText: `${tag} single` });
  for (const n of [1, 2, 3]) await createBet(request, { placedDate: '2000-01-03', gameDate: '2000-01-03', book, betText: `${tag} filler ${n}` });

  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag); // focus stays in the search box, as when the owner filters first
  /** Each item is the element on top at its centre (nothing drawn over it) and inside the window. */
  const itemsOnTop = () =>
    page.getByRole('menu').evaluate((m) =>
      [...m.querySelectorAll('[role=menuitem]')].map((it) => {
        const r = it.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return `${it.getAttribute('aria-label')}: ${top && it.contains(top) && r.bottom <= innerHeight ? 'on top' : 'covered'}`;
      }),
    );
  for (const [row, button, items, open] of [
    [page.locator(`[data-dutch-id="${d}"]`), 'More dutch actions', ['Duplicate dutch', 'Delete dutch', 'Label / result'], 'Log dutch'],
    [page.locator(`[data-bet-id="${single.id}"]`), 'More actions', ['Duplicate', 'Delete'], 'New bet'],
  ] as const) {
    await row.hover();
    await row.getByRole('button', { name: button }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    expect(await itemsOnTop()).toEqual(items.map((i) => `${i}: on top`));
    // the mouse leaves the row and goes onto the menu: it stays, fully visible
    const box = (await menu.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 8 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 4, { steps: 8 });
    await expect(menu).toBeVisible();
    expect(
      await menu.evaluate((m) => {
        let o = 1;
        for (let e: Element | null = m; e; e = e.parentElement) o *= +getComputedStyle(e).opacity;
        return o;
      }),
    ).toBe(1);
    expect(await itemsOnTop()).toEqual(items.map((i) => `${i}: on top`));
    await page.getByRole('menuitem', { name: items[0], exact: true }).click();
    const dialog = page.getByRole('dialog', { name: open });
    await expect(dialog).toBeVisible();
    // Cancel, not Esc: on the live site the form's first box opens its recent entries, which Esc closes first
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  }
});

test('BT-25: double click on the game edits it on every row type; "no game" bets get "+ add game"; a legless Combo is a Solo', async ({ page, request, tag }) => {
  const book = `${tag} Book`;
  const day = { placedDate: '2000-01-02', gameDate: '2000-01-02', book };
  // the owner's row: saved as a Combo with no legs, live, Old Book
  const jokic = await createBet(request, { ...day, type: 'combination', legs: [], situation: 'live', book: 'Old Book', betText: `${tag} Jokic 6 4Q pts` });
  const combo = await createBet(request, {
    ...day,
    type: 'combination',
    odds: 4,
    betText: `${tag} combo`,
    legs: [{ game: 'Celtics vs Warriors', selection: 'Celtics', odds: 2 }, { game: 'Lakers vs Nets', selection: 'Lakers', odds: 2 }, { selection: 'Tatum 25 pts', odds: 1.5 }],
  });
  const d = `${tag}-g`.replace(/[^A-Za-z0-9_-]/g, '');
  for (const sel of ['Home', 'Away']) await createBet(request, { ...day, betText: '', dutchId: d, legs: [{ game: `${tag} A vs B`, selection: sel, odds: 2 }] });
  const legsOf = async (id: string) => (await betsTagged(request, tag)).find((b) => b.id === id)!;

  await page.goto('/history');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();

  // the legless "Combo" shows as the Solo it is, with an obvious "+ add game"
  const row = page.locator(`[data-bet-id="${jokic.id}"]`);
  await expect(row.getByTestId('type')).toHaveCount(0);
  await expect(row.getByTestId('live-tag')).toBeVisible();
  const add = row.getByRole('button', { name: 'Edit Game' });
  await expect(add).toHaveText('+ add game');
  await add.dblclick();
  const editor = page.getByRole('dialog', { name: 'Edit game' });
  const box = editor.getByRole('combobox', { name: 'Game' });
  await expect(box).toBeFocused();
  await box.fill('Nuggets @ Lakers');
  await box.press('Enter');
  await expect(editor).toBeHidden();
  await expect(row.getByRole('button', { name: 'Edit Game' })).toHaveText('Nuggets @ Lakers');
  await expect.poll(async () => legsOf(jokic.id)).toMatchObject({ type: 'solo', situation: 'live', book: 'Old Book', legs: [{ game: 'Nuggets vs Lakers' }] });

  // a single click does not start editing; a double click does, and Esc cancels
  await row.getByRole('button', { name: 'Edit Game' }).click();
  await expect(editor).toBeHidden();
  await row.getByRole('button', { name: 'Edit Game' }).dblclick();
  await expect(editor.getByRole('combobox', { name: 'Game' })).toHaveValue('Nuggets @ Lakers');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  // a combination with two games and a leg with none: one box per game plus one for the leg with no game
  await page.locator(`[data-bet-id="${combo.id}"]`).getByRole('button', { name: 'Edit Game' }).dblclick();
  await expect(editor.getByRole('combobox')).toHaveCount(3);
  await expect(editor.getByRole('combobox', { name: 'Game 1' })).toHaveValue('Celtics @ Warriors');
  await expect(editor.getByRole('combobox', { name: 'Game 2' })).toHaveValue('Lakers @ Nets');
  await editor.getByRole('combobox', { name: 'Legs with no game' }).fill('Celtics @ Warriors');
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => (await legsOf(combo.id)).legs.map((l) => l.game)).toEqual(['Celtics vs Warriors', 'Lakers vs Nets', 'Celtics vs Warriors']);

  // a dutch: its one game changed on every split at once
  const dutch = page.locator(`[data-dutch-id="${d}"]`);
  await dutch.getByRole('button', { name: 'Edit Game' }).dblclick();
  await editor.getByRole('combobox', { name: 'Game' }).fill(`${tag} C @ D`);
  await editor.getByRole('combobox', { name: 'Game' }).press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag)).filter((b) => b.dutchId === d).map((b) => b.legs[0]!.game)).toEqual([`${tag} C vs D`, `${tag} C vs D`]);

  // a leg row: double click on its game
  await page.locator(`[data-bet-id="${combo.id}"]`).getByRole('button', { name: 'Show legs' }).click();
  const leg2 = page.getByRole('button', { name: 'Edit Leg 2 game' });
  await leg2.click();
  await expect(page.getByRole('combobox', { name: 'Leg 2 game' })).toHaveCount(0);
  await leg2.dblclick();
  await page.getByRole('combobox', { name: 'Leg 2 game' }).fill('Knicks @ Heat');
  await page.getByRole('combobox', { name: 'Leg 2 game' }).press('Enter');
  await expect.poll(async () => (await legsOf(combo.id)).legs.map((l) => l.game)).toEqual(['Celtics vs Warriors', 'Knicks vs Heat', 'Celtics vs Warriors']);
});

/** BT-26: throwaway bets with long text: a 3-split dutch of combinations, a long single (live), a combination. */
async function longBets(request: Parameters<typeof createBet>[0], tag: string) {
  const long = 'Nikola Jokic over 27.5 points and over 12.5 rebounds and over 9.5 assists in the fourth quarter only';
  const d = `${tag}-long`.replace(/[^A-Za-z0-9_-]/g, '');
  const day = { placedDate: '2000-01-03', gameDate: '2000-01-03', book: `${tag} Book with a long name` };
  for (const [i, s] of ['Denver Nuggets moneyline', 'Los Angeles Lakers +6.5 alternate spread', 'Golden State Warriors team total over 118.5'].entries())
    await createBet(request, {
      ...day,
      dutchId: d,
      type: 'combination',
      odds: 3 + i,
      stake: 30 + i,
      betText: `${tag} ${s} + ${long}`,
      legs: [
        { sport: 'NBA', game: 'Denver Nuggets vs Los Angeles Lakers', market: 'Moneyline', selection: s, odds: 1.8 },
        { sport: 'NBA', game: 'Denver Nuggets vs Los Angeles Lakers', market: 'Player props', selection: long, odds: 2 },
      ],
    });
  const single = await createBet(request, { ...day, situation: 'live', betText: `${tag} ${long} ${long}`, legs: [{ sport: 'NBA', game: 'Boston Celtics vs Golden State Warriors', market: 'Player props', selection: 'x' }] });
  const combo = await createBet(request, {
    ...day,
    type: 'combination',
    odds: 5.5,
    result: 'lost',
    betText: `${tag} combo ${long}`,
    legs: [
      { sport: 'NBA', game: 'Celtics vs Warriors', selection: 'Celtics ML', odds: 2, result: 'lost' },
      { sport: 'NBA', game: 'Lakers vs Nets', selection: long, odds: 2, result: 'won' },
    ],
  });
  return { d, single, combo };
}

for (const width of [1366, 1920])
  test(`BT-26: Bets table at ${width}px: bet text never cut, no sideways scroll, numbers aligned on every row type`, async ({ page, request, tag }) => {
    await page.setViewportSize({ width, height: 900 });
    const { d, single, combo } = await longBets(request, tag);
    await page.goto('/');
    await page.getByLabel('Search bets').fill(tag);
    const dutch = page.locator(`[data-dutch-id="${d}"]`);
    const splits = page.locator('[data-testid=bet-row][data-nested]');
    await expect(dutch).toBeVisible();
    await expect(splits).toHaveCount(3); // a dutch shows its splits, stacked
    await page.locator(`[data-bet-id="${combo.id}"]`).getByRole('button', { name: 'Show legs' }).click();
    await expect(page.getByTestId('leg-row')).toHaveCount(2);

    // columns: the Bet cell takes the width; Game, Book and Type are no longer columns
    await expect(page.getByRole('columnheader')).toHaveText(['', 'Bet', 'Stake', 'Odds', '+/-', 'Result', 'Actions']);

    // no bet text cut: every bet line fits (it wraps instead)
    const cut = await page.getByTestId('bet-text').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
    expect(cut).toEqual([]);
    const tall = await page.locator(`[data-bet-id="${single.id}"]`).getByTestId('bet-text').evaluate((e) => e.getBoundingClientRect().height);
    expect(tall).toBeGreaterThan(30); // the long single wrapped onto 2+ lines
    // "…" only on the muted line, and then with the full text on hover
    for (const sub of await page.getByTestId('bet-sub').all()) {
      const { cutOff, title } = await sub.evaluate((e) => ({ cutOff: e.scrollWidth > e.clientWidth, title: e.getAttribute('title') ?? '' }));
      if (cutOff) expect(title.length).toBeGreaterThan(20);
    }

    // no sideways scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // Stake, Odds, +/- end at the same x, and Result starts at the same x, on a single, a combination, a dutch and its splits
    const rows = [page.locator(`[data-bet-id="${single.id}"]`), page.locator(`[data-bet-id="${combo.id}"]`), dutch, splits.nth(0), splits.nth(2)];
    for (const col of ['stake', 'odds', 'profit']) {
      const rights = await Promise.all(rows.map((r) => r.locator(`[data-col=${col}]`).evaluate((e) => Math.round(e.getBoundingClientRect().right))));
      expect(new Set(rights).size, `${col}: ${rights}`).toBe(1);
    }
    const lefts = await Promise.all(rows.map((r) => r.getByTestId('result').evaluate((e) => Math.round(e.getBoundingClientRect().left))));
    expect(new Set(lefts).size, `result: ${lefts}`).toBe(1);

    // each split's own stake and odds on its line; the dutch's total and combined odds on its summary line
    await expect(splits.locator('[data-col=stake]')).toHaveText(['R$ 30,00', 'R$ 31,00', 'R$ 32,00']);
    await expect(splits.locator('[data-col=odds]')).toHaveText(['3.00', '4.00', '5.00']);
    await expect(dutch.getByTestId('dutch-stake')).toHaveText('R$ 93,00');
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `test-results/bt-26-bets-${width}.png`, fullPage: true });
  });

test('BT-26: settle three bets in a row from the To settle tab with the keyboard only', async ({ page, request, tag }) => {
  const single = await createBet(request, { betText: `${tag} single`, placedDate: '2000-01-01', gameDate: '2000-01-01' });
  const combo = await createBet(request, { betText: `${tag} combo`, type: 'combination', odds: 4, placedDate: '2000-01-02', gameDate: '2000-01-02', legs: [{ selection: 'A', odds: 2 }, { selection: 'B', odds: 2 }] });
  const d = `${tag}-k`.replace(/[^A-Za-z0-9_-]/g, '');
  for (const sel of ['Home', 'Away']) await createBet(request, { betText: '', dutchId: d, placedDate: '2000-01-03', gameDate: '2000-01-03', legs: [{ selection: `${tag} ${sel}`, odds: 2 }] });
  const selected = page.locator('[data-selected][data-key]').first();

  await page.goto('/?tab=settle');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  // the first row is selected, oldest first
  await expect(selected).toHaveAttribute('data-key', `bet:${single.id}`);
  await page.keyboard.press('w');
  await expect(selected).toHaveAttribute('data-key', `bet:${combo.id}`);
  await page.keyboard.press('l');
  await expect(selected).toHaveAttribute('data-key', `dutch:${d}`);
  await page.keyboard.press('2');
  await expect(page.getByRole('button', { name: /Toggle won/, pressed: true })).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Nothing to settle.')).toBeVisible();
  const byText = async () => Object.fromEntries((await betsTagged(request, tag)).map((b) => [b.betText.replace(`${tag} `, '') || b.legs[0]!.selection.replace(`${tag} `, ''), b.result]));
  await expect.poll(byText).toEqual({ single: 'won', combo: 'lost', Home: 'lost', Away: 'won' });
  // Z undoes the last one (the dutch), which comes back selected
  await page.keyboard.press('z');
  await expect(selected).toHaveAttribute('data-key', `dutch:${d}`);
  await expect.poll(byText).toEqual({ single: 'won', combo: 'lost', Home: 'pending', Away: 'pending' });
});

test('BT-26: one Bets page: stats strip, filters with ⋯ and ?, tabs, the money switch in the top bar, the chart on Analytics', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} won`, result: 'won', stake: 100, odds: 2 });
  await createBet(request, { betText: `${tag} paper`, money: 'hypothetical', stake: 50 });
  await createBet(request, { betText: `${tag} later`, placedDate: '2099-01-01', gameDate: '2099-01-01' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const money = page.getByRole('banner').getByRole('radiogroup', { name: 'Money shown' });
  await money.getByRole('radio', { name: 'Real R$' }).click();

  // Real only: the H$ bet is not shown; the strip follows filters and tab
  await expect(page.getByTestId('bet-row')).toHaveCount(2);
  await expect(page.getByTestId('stat-net-value')).toHaveText('+R$ 100,00');
  await expect(page.getByTestId('stat-wagered')).toContainText('2 of');
  await money.getByRole('radio', { name: 'Both' }).click();
  await expect(page.getByTestId('bet-row')).toHaveCount(3);
  await money.getByRole('radio', { name: 'Real R$' }).click();

  // tabs: Pending, To settle (game date today or earlier: the 2099 bet is not due)
  await page.getByRole('tab', { name: /Pending/ }).click();
  await expect(page).toHaveURL(/\?tab=pending$/);
  await expect(page.getByTestId('bet-row')).toHaveCount(1);
  await expect(page.getByTestId('bet-row')).toContainText('later');
  await page.getByRole('tab', { name: /To settle/ }).click();
  await expect(page.getByText('Nothing to settle.')).toBeVisible();
  await page.getByRole('tab', { name: 'All' }).click();

  // ⋯ holds export / import; ? shows the keys
  await page.getByRole('button', { name: 'Export and import' }).click();
  await expect(page.getByRole('button', { name: 'Export JSON' })).toBeVisible();
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await expect(page.getByTestId('key-help')).toContainText('Dutch: toggle a split that won');

  // full window width
  const table = await page.getByTestId('bet-table').boundingBox();
  expect(table!.width).toBeGreaterThan(page.viewportSize()!.width - 80);

  // Analytics: the chart, and the same money switch
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Performance Over Time' })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('radio', { name: 'Real R$' })).toHaveAttribute('aria-checked', 'true');
});

test('BT-26: a split line selected with a click settles alone with W; ↓ moves on from its dutch', async ({ page, request, tag }) => {
  const d = `${tag}-s`.replace(/[^A-Za-z0-9_-]/g, '');
  const home = await createBet(request, { betText: '', dutchId: d, placedDate: '2000-01-02', gameDate: '2000-01-02', legs: [{ selection: `${tag} Home`, odds: 2 }] });
  await createBet(request, { betText: '', dutchId: d, placedDate: '2000-01-02', gameDate: '2000-01-02', legs: [{ selection: `${tag} Away`, odds: 2 }] });
  const after = await createBet(request, { betText: `${tag} after`, placedDate: '2000-01-01', gameDate: '2000-01-01' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  await page.locator(`[data-bet-id="${home.id}"]`).getByTestId('bet-sub').click();
  await expect(page.locator(`[data-bet-id="${home.id}"]`)).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('w');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === home.id)?.result).toBe('won');
  await expect(page.locator(`[data-dutch-id="${d}"]`).getByTestId('result-sub')).toHaveText('1 of 2 splits hit');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator(`[data-bet-id="${after.id}"]`)).toHaveAttribute('data-selected', 'true');
});
