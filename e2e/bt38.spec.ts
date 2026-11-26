// BT-38: units. Set a unit size on the Bankroll page, quick-add a stake in units, toggle U and read the row and the
// totals in units; nothing in the table moves between money view and units view. The unit settings are global, so
// each test puts back exactly what was there (the live site's own settings included).
import { betsTagged, createBet, expect, saved, test, viewMenu } from './helpers';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { UnitSettings } from '../src/lib/units';

test.describe.configure({ mode: 'serial' });
const LIVE = !!process.env.E2E_BASE_URL;

let original: UnitSettings | null = null;
async function units(request: APIRequestContext): Promise<UnitSettings> {
  const res = await request.get('/api/units');
  expect(res.ok()).toBe(true);
  return (await res.json()) as UnitSettings;
}
async function putUnits(request: APIRequestContext, s: UnitSettings) {
  const res = await request.put('/api/units', { data: s });
  expect(res.ok(), await res.text()).toBe(true);
}
test.beforeEach(async ({ request }) => {
  original = await units(request);
});
test.afterEach(async ({ request }) => {
  if (original) await putUnits(request, original);
});

async function setUnitSize(page: Page, label: string, value: string) {
  await page.goto('/bankroll');
  const box = page.getByLabel(`Unit size ${label}`);
  await box.fill(value);
  await box.press('Enter');
}

/** Every cell's left edge and the row's height. */
const layout = (row: Locator) =>
  row.evaluate((tr) => ({ xs: [...tr.querySelectorAll(':scope > td')].map((td) => Math.round(td.getBoundingClientRect().left * 10) / 10), h: Math.round(tr.getBoundingClientRect().height * 10) / 10 }));

test('BT-38: unit size → quick-add "H$1,5u" → U shows units, nothing moves; the stats strip counts units', async ({ page, request, tag }) => {
  // no offer in this test: hypothetical counts as already offered
  await putUnits(request, { unitSizes: { ...original!.unitSizes, hypothetical: null }, offered: [...new Set([...original!.offered, 'hypothetical' as const])] });
  await setUnitSize(page, 'Hypothetical', '100');
  await expect.poll(async () => (await units(request)).unitSizes.hypothetical).toBe(100);
  await expect(page.getByTestId('unit-offer')).toHaveCount(0);

  await page.goto('/');
  // units view off to start (remembered per browser)
  await page.evaluate(() => localStorage.setItem('bettracker:units-view', 'money'));
  await page.reload();
  const quick = page.getByLabel('Quick add');
  await quick.fill(`H$1,5u @2 ${tag} units`);
  await expect(page.getByTestId('unit-preview')).toHaveText(/^1,5u = H\$\s150,00$/);
  await quick.press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ stake: 150, money: 'hypothetical', unitSize: 100 });
  const [b] = await betsTagged(request, tag);

  await page.evaluate(() => localStorage.setItem('bettracker:money-scope', 'hypothetical'));
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  const row = page.locator(`[data-bet-id="${b!.id}"]`);
  await expect(row.getByTestId('stake')).toHaveText(/H\$\s150,00/);
  await row.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('w');
  await expect(row.getByTestId('profit')).toHaveText(/\+H\$\s150,00/);
  await saved(page);
  const money = await layout(row);

  await page.keyboard.press('u');
  await expect((await viewMenu(page)).getByRole('radio', { name: 'Units' })).toHaveAttribute('aria-checked', 'true');
  await expect(row.getByTestId('stake')).toHaveText('1,5u');
  await expect(row.getByTestId('profit')).toHaveText('+1,5u');
  // the strip shows only this bet (search): counted in units; ROI unchanged
  await expect(page.getByTestId('stats')).toHaveAttribute('data-units', 'true');
  await expect(page.getByTestId('stat-net-value')).toHaveText('+1,5u');
  await expect(page.getByTestId('stat-roi')).toContainText('+100.0%');
  await expect(page.getByTestId(`day-net-hypothetical`).first()).toHaveText(/u$/);
  expect(await layout(row)).toEqual(money);

  // remembered across a reload; U again goes back to money
  await page.reload();
  await expect((await viewMenu(page)).getByRole('radio', { name: 'Units' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('body').click({ position: { x: 1, y: 300 } });
  await page.keyboard.press('u');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
  await expect(row.getByTestId('stake')).toHaveText(/H\$\s150,00/);
  expect(await layout(row)).toEqual(money);

  // Analytics follows the toggle: units when every H$ bet has a unit size, else money (never a mix)
  await page.keyboard.press('u');
  const all = (await (await request.get('/api/bets')).json()) as { money: string; unitSize: number | null }[];
  const allHaveUnits = all.filter((x) => x.money === 'hypothetical').every((x) => x.unitSize != null);
  await page.goto('/analytics');
  const wagered = page.getByTestId('cell-wagered').first();
  if (allHaveUnits) await expect(wagered).toHaveText(/u$/);
  else await expect(wagered).toHaveText(/H\$/);
  await page.evaluate(() => {
    localStorage.setItem('bettracker:units-view', 'money');
    localStorage.setItem('bettracker:money-scope', 'real');
  });
});

test('BT-38: "1u" with no unit size set says where to set it and saves nothing', async ({ page, request, tag }) => {
  await putUnits(request, { unitSizes: { ...original!.unitSizes, bonus: null }, offered: original!.offered });
  await page.goto('/');
  const quick = page.getByLabel('Quick add');
  await quick.fill(`B$1u @2 ${tag} no size`);
  await expect(page.getByTestId('unit-preview')).toHaveText('No unit size for B$: set it on the Bankroll page');
  await quick.press('Enter');
  await expect(page.getByRole('status')).toContainText('No unit size for B$');
  await expect(quick).toHaveValue(`B$1u @2 ${tag} no size`);
  expect(await betsTagged(request, tag)).toHaveLength(0);
});

test('BT-38: the cash-out box takes units: "1,45u" returns 145', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} cash units`, stake: 100, odds: 1.88, money: 'hypothetical', unitSize: 100 });
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('bettracker:money-scope', 'hypothetical'));
  await page.reload();
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  await row.getByTestId('cashout-button').click();
  await row.getByLabel('Cash-out amount').fill('1,45u');
  await expect(row.getByTestId('cashout-preview')).toContainText(/^1,45u = H\$\s145,00 returned/);
  await row.getByLabel('Cash-out amount').press('Enter');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ result: 'cash-out', cashout: 145 });
  await page.evaluate(() => localStorage.setItem('bettracker:money-scope', 'real'));
});

test('BT-38: the first unit size offers once to give it to older bets', async ({ page, request, tag }) => {
  // the live site's older bets are real data: answering the offer there would change them (or use up the one offer)
  test.skip(LIVE, 'local only: it applies a unit size to older bets');
  await putUnits(request, { unitSizes: { ...original!.unitSizes, hypothetical: null }, offered: original!.offered.filter((m) => m !== 'hypothetical') });
  const older = await createBet(request, { betText: `${tag} older`, stake: 100, odds: 2, money: 'hypothetical' });
  expect(older.unitSize).toBeNull();
  await setUnitSize(page, 'Hypothetical', '50');
  const offer = page.getByTestId('unit-offer');
  await expect(offer).toBeVisible();
  await offer.getByRole('button', { name: 'Apply to older bets' }).click();
  await expect(offer).toHaveCount(0);
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ unitSize: 50 });
  expect((await units(request)).offered).toContain('hypothetical');
  // asked once: a new size does not ask again
  await setUnitSize(page, 'Hypothetical', '80');
  await expect(page.getByTestId('unit-sizes')).toBeVisible();
  await expect(offer).toHaveCount(0);
  // a later change never rewrites the bets placed before
  expect((await betsTagged(request, tag))[0]).toMatchObject({ unitSize: 50 });
});
