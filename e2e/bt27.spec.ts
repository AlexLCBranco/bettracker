// BT-27: label chip and actual results on a bet.
import { betsTagged, createBet, expect, test } from './helpers';
import type { Page } from '@playwright/test';

async function search(page: Page, tag: string) {
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await page.getByLabel('Search bets').blur();
}

test('BT-27: T on a solo row: "24 pts #label" saves the actual and the label; Esc closes without saving; W still settles at once', async ({ page, request, tag }) => {
  const label = `${tag} lost by one`;
  const solo = await createBet(request, { betText: `${tag} McCain 25+ pts`, result: 'lost', legs: [{ sport: 'NBA', selection: 'McCain 25+ pts' }] });
  const other = await createBet(request, { betText: `${tag} other`, placedDate: '2000-01-01', gameDate: '2000-01-01' });
  const row = page.locator(`[data-bet-id="${solo.id}"]`);
  await search(page, tag);
  // nothing extra on a row with no label and no actual
  await expect(row.getByTestId('label-chip')).toHaveCount(0);
  await expect(row.getByTestId('actual')).toHaveCount(0);

  await row.getByTestId('bet-sub').click();
  await page.keyboard.press('t');
  const box = page.getByRole('combobox', { name: 'Actual result and label' });
  await expect(box).toBeFocused();
  await box.fill(`24 pts #${label}`);
  await box.press('Escape');
  await expect(page.getByTestId('annotator')).toHaveCount(0);
  expect((await betsTagged(request, tag)).find((b) => b.id === solo.id)!.label).toBe(''); // Esc saved nothing

  await page.keyboard.press('t');
  await box.fill(`24 pts #${label}`);
  await box.press('Enter');
  await expect(page.getByTestId('annotator')).toHaveCount(0);
  await expect
    .poll(async () => {
      const b = (await betsTagged(request, tag)).find((x) => x.id === solo.id)!;
      return [b.label, b.legs[0]!.actual];
    })
    .toEqual([label, '24 pts']);
  await expect(row.getByTestId('label-chip')).toHaveText(label);
  await expect(row.getByTestId('label-chip')).toHaveCSS('text-transform', 'uppercase');
  await expect(row.getByTestId('label-chip')).toHaveClass(/text-red-/); // owner, 2026-11-27: a label is red until made positive
  await expect(row.getByTestId('actual')).toHaveText('→ 24 pts');

  // the label is suggested on the next bet (matched anywhere after "#"), picked with ↓ Enter
  const otherRow = page.locator(`[data-bet-id="${other.id}"]`);
  await otherRow.hover();
  await otherRow.getByRole('button', { name: 'Label and actual result' }).click();
  await box.fill(`#${label.slice(6)}`);
  await expect(page.getByRole('option', { name: `#${label}` })).toBeVisible();
  await box.press('ArrowDown');
  await box.press('Enter');
  await expect(box).toHaveValue(`#${label}`);
  await box.press('Enter');
  await expect(otherRow.getByTestId('label-chip')).toHaveText(label);

  // settling never opens the editor
  await otherRow.getByTestId('bet-sub').click();
  await page.keyboard.press('w');
  await expect.poll(async () => (await betsTagged(request, tag)).find((b) => b.id === other.id)!.result).toBe('won');
  await expect(page.getByTestId('annotator')).toHaveCount(0);
});

test('BT-27: a lost combination lists every losing leg with what happened; no "lost by" text, the market never glued on', async ({ page, request, tag }) => {
  const combo = await createBet(request, {
    betText: `${tag} Jokic + Celtics + Lakers`,
    type: 'combination',
    odds: 6,
    result: 'lost',
    legs: [
      { sport: 'NBA', game: 'Nuggets vs Jazz', market: 'ast', selection: 'Jokic 12+ ass', odds: 2 },
      { sport: 'NBA', game: 'Celtics vs Knicks', market: 'ML / pts / ASS', selection: 'Celtics ML', odds: 1.5 },
      { sport: 'NBA', game: 'Lakers vs Nets', market: 'ML', selection: 'Lakers ML', odds: 2, result: 'won' },
    ],
  });
  const row = page.locator(`[data-bet-id="${combo.id}"]`);
  await search(page, tag);
  await expect(row.getByTestId('loss-line')).toHaveCount(0); // two legs not set: nothing to list yet
  await row.getByTestId('bet-sub').click();
  await page.keyboard.press('t');
  await page.getByLabel('Actual: Jokic 12+ ass').fill('11'); // a stat line under 12+: that leg lost on its own
  await page.getByLabel('Actual: Celtics ML').fill('111-112');
  await page.getByRole('button', { name: 'Celtics ML result: pending' }).click(); // → won
  await page.getByRole('button', { name: 'Celtics ML result: won' }).click(); // → lost
  await page.getByRole('combobox', { name: 'Label' }).fill(`${tag} bad beat`);
  await page.getByLabel('Actual: Celtics ML').press('Enter');
  await expect(row.getByTestId('loss-line')).toHaveText('✗ Jokic 12+ ass 11 · ✗ Celtics ML 111-112');
  await expect(row.getByTestId('result-sub')).toHaveCount(0);
  await expect(row).not.toContainText('lost by');
  await expect(row.getByTestId('label-chip')).toHaveText(`${tag} bad beat`);
  await expect
    .poll(async () => (await betsTagged(request, tag))[0]!.legs.map((l) => [l.result, l.actual]))
    .toEqual([
      ['lost', '11'],
      ['lost', '111-112'],
      ['won', ''],
    ]);
  // legs show their actual in the expanded legs list
  await row.getByRole('button', { name: 'Show legs' }).click();
  await expect(page.getByTestId('leg-row').filter({ hasText: 'Jokic' }).getByTestId('actual')).toHaveText('→ 11');
});

test('BT-27: dutch: settling 1 of 2 lists the lost split’s own leg; one label for every split; a shared leg typed once fills the other split', async ({ page, request, tag }) => {
  const d = `${tag}-a`.replace(/[^A-Za-z0-9_-]/g, '');
  const mk = (own: string, stake: number) =>
    createBet(request, {
      betText: `${tag} ${own} + Celtics ML`,
      dutchId: d,
      type: 'combination',
      odds: 3,
      stake,
      legs: [
        { sport: 'NBA', game: 'Nuggets vs Jazz', selection: own, odds: 1.8 },
        { sport: 'NBA', game: 'Celtics vs Knicks', selection: 'Celtics ML', odds: 1.6 },
      ],
    });
  const s1 = await mk('Mitchell 30+ pts', 10);
  const s2 = await mk('Garland 20+ pts', 11);
  const dutch = page.locator(`[data-dutch-id="${d}"]`);
  const split2 = page.locator(`[data-bet-id="${s2.id}"]`);
  await search(page, tag);

  // split 1 won, split 2 lost: the shared Celtics ML won, so Garland is the leg that lost
  await dutch.getByTestId('bet-sub').click();
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  await expect(split2.getByTestId('loss-line')).toHaveText('✗ Garland 20+ pts');

  // the dutch row's editor (mouse): one label for every split, each distinct leg once
  await dutch.hover();
  await dutch.getByRole('button', { name: 'Label and actual result' }).click();
  await expect(page.getByTestId('annotator').getByLabel(/^Actual: /)).toHaveCount(3);
  await page.getByLabel('Actual: Garland 20+ pts').fill('19');
  await page.getByRole('combobox', { name: 'Label' }).fill(`${tag} so close`);
  await page.getByRole('combobox', { name: 'Label' }).press('Enter');
  await expect(dutch.getByTestId('label-chip')).toHaveText(`${tag} so close`);
  await expect(page.locator('[data-testid=bet-row][data-nested]').getByTestId('label-chip')).toHaveCount(0); // shared: shown once, on the dutch row
  await expect(split2.getByTestId('loss-line')).toHaveText('✗ Garland 20+ pts 19');

  // a split's own editor: the shared leg typed on split 1 fills split 2 too
  const split1 = page.locator(`[data-bet-id="${s1.id}"]`);
  await split1.hover();
  await split1.getByRole('button', { name: 'Label and actual result' }).click();
  await page.getByLabel('Actual: Celtics ML').fill('112-108');
  await page.getByLabel('Actual: Celtics ML').press('Enter');
  await expect
    .poll(async () => (await betsTagged(request, tag)).map((b) => [b.label, b.legs[1]!.actual]))
    .toEqual([
      [`${tag} so close`, '112-108'],
      [`${tag} so close`, '112-108'],
    ]);
});

for (const width of [1366, 1920])
  test(`BT-27: Bets table at ${width}px: label and actuals keep every column where it was`, async ({ page, request, tag }) => {
    await page.setViewportSize({ width, height: 900 });
    const day = { placedDate: '2000-01-03', gameDate: '2000-01-03', book: 'E2E Book' };
    const long = 'Nikola Jokic over 27.5 points and over 12.5 rebounds and over 9.5 assists in the fourth quarter only';
    const solo = (over: Record<string, unknown>, actual = '') =>
      createBet(request, { ...day, result: 'lost', betText: `${tag} McCain 25+ pts`, legs: [{ sport: 'NBA', game: 'Celtics vs Cavs', selection: 'McCain 25+ pts', actual }], ...over });
    const plain = await solo({});
    const withLabel = await solo({ label: 'lost by one' });
    const withActual = await solo({}, '24 pts');
    const withBoth = await solo({ label: 'lost by one in the final second of overtime again' }, '24 pts');
    const comboLegs = [
      { sport: 'NBA', game: 'Nuggets vs Jazz', selection: `Jokic 12+ ass ${long}`, odds: 2, result: 'lost', actual: '11' },
      { sport: 'NBA', game: 'Celtics vs Knicks', selection: 'Celtics ML', odds: 1.5, result: 'lost', actual: '111-112' },
    ];
    const combo = await createBet(request, { ...day, type: 'combination', odds: 3, result: 'lost', betText: `${tag} combo`, label: 'bad beat', legs: comboLegs });
    const d = `${tag}-al`.replace(/[^A-Za-z0-9_-]/g, '');
    for (const stake of [20, 21]) await createBet(request, { ...day, dutchId: d, type: 'combination', odds: 3, stake, result: 'lost', betText: `${tag} split ${stake}`, label: 'both lost', legs: comboLegs });
    await search(page, tag);
    await page.mouse.move(0, 0);
    const byId = (id: string) => page.locator(`[data-bet-id="${id}"]`);
    const dutch = page.locator(`[data-dutch-id="${d}"]`);
    const splits = page.locator('[data-testid=bet-row][data-nested]');
    await expect(splits).toHaveCount(2);
    await expect(byId(plain.id).getByTestId('label-chip')).toHaveCount(0);
    await expect(byId(plain.id).getByTestId('loss-line')).toHaveCount(0);
    await expect(dutch.getByTestId('label-chip')).toHaveText('both lost');

    const rows = [byId(plain.id), byId(withLabel.id), byId(withActual.id), byId(withBoth.id), byId(combo.id), dutch, splits.nth(0), splits.nth(1)];
    for (const col of ['stake', 'odds', 'profit']) {
      const rights = await Promise.all(rows.map((r) => r.locator(`[data-col=${col}]`).evaluate((e) => Math.round(e.getBoundingClientRect().right))));
      expect(new Set(rights).size, `${col}: ${rights}`).toBe(1);
    }
    // the result pill: same x on every row, top-aligned with the first line however tall the row grows
    const pills = await Promise.all(
      rows.map((r) =>
        r.evaluate((tr) => {
          const p = tr.querySelector('[data-testid=result]')!.getBoundingClientRect();
          return { left: Math.round(p.left), top: Math.round(p.top - tr.getBoundingClientRect().top) };
        }),
      ),
    );
    expect(new Set(pills.map((p) => p.left)).size, `result left: ${JSON.stringify(pills)}`).toBe(1);
    expect(new Set(pills.map((p) => p.top)).size, `result top: ${JSON.stringify(pills)}`).toBe(1);
    // the chip and the actual do not change the first line's height
    const lineH = await Promise.all([plain, withLabel, withActual].map((b) => byId(b.id).getByTestId('bet-text').evaluate((e) => Math.round(e.getBoundingClientRect().height))));
    expect(new Set(lineH).size, `first line: ${lineH}`).toBe(1);
    // a chip is never cut (it wraps whole)
    for (const chip of await page.getByTestId('label-chip').all()) expect(await chip.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    // the losing legs line: same left edge as its row's sub-line (nested splits keep their indent), wraps, never "…"
    for (const r of [byId(combo.id), splits.nth(0), splits.nth(1)]) {
      const m = await r.evaluate((tr) => {
        const loss = tr.querySelector('[data-testid=loss-line]') as HTMLElement;
        const sub = tr.querySelector('[data-testid=bet-sub]') as HTMLElement;
        const cs = getComputedStyle(loss);
        return {
          lossLeft: Math.round(loss.getBoundingClientRect().left),
          subLeft: Math.round(sub.getBoundingClientRect().left),
          cut: loss.scrollWidth > loss.clientWidth || cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap',
        };
      });
      expect(m.lossLeft).toBe(m.subLeft);
      expect(m.cut).toBe(false);
    }
    await expect(byId(combo.id).getByTestId('loss-line')).toContainText('✗ Celtics ML 111-112');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/bt-27-bets-${width}.png`, fullPage: true });
  });
