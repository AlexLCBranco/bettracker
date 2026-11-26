// BT-37: on a cashed-out bet, W / L record "woulda won / woulda lost"; the row shows what the cash-out left or saved,
// the pill keeps its size, and Analytics sums it up as the Cash-out verdict.
import { betsTagged, createBet, expect, saved, test } from './helpers';
import type { Page } from '@playwright/test';

/** "+R$ 1.234,50" → 1234.5; "-" → null. */
const money = (t: string | null) => {
  const m = (t ?? '').match(/([+-])?R\$\s?([\d.]+,\d\d)/);
  return m ? (m[1] === '-' ? -1 : 1) * Number(m[2]!.replace(/\./g, '').replace(',', '.')) : null;
};

async function verdict(page: Page) {
  await page.goto('/analytics?tab=cashouts');
  const tile = page.getByTestId('cashout-verdict-net');
  await expect(tile).toBeVisible();
  const sub = (await tile.locator('div').last().textContent()) ?? '';
  const n = (re: RegExp) => Number(sub.match(re)?.[1] ?? NaN);
  return { net: money(await page.getByTestId('cashout-verdict-net-value').textContent()) ?? 0, won: n(/(\d+) woulda won/), lost: n(/(\d+) woulda lost/) };
}

test('BT-37: cash out, W, W again clears, L, Z, and the Analytics verdict', async ({ page, request, tag }) => {
  const before = await verdict(page);
  const b = await createBet(request, { betText: `${tag} cash me`, stake: 100, odds: 1.88, money: 'real' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const row = page.locator(`[data-bet-id="${b.id}"]`);
  await row.getByTestId('cashout-button').click();
  await row.getByLabel('Cash-out amount').fill('145');
  await row.getByLabel('Cash-out amount').press('Enter');
  const pill = row.getByTestId('result');
  await expect(pill).toContainText('Cash-out');
  // not forgotten: W / L stay beside the pill until answered (BT-51)
  await expect(row.getByTestId('woulda-keys')).toHaveAttribute('data-open', 'true');
  await expect(row.getByTestId('woulda-keys')).toHaveAttribute('title', 'W / L: what would have happened');
  const size = async () => {
    const r = (await pill.boundingBox())!;
    const h = (await row.boundingBox())!.height;
    return { w: r.width, h: r.height, row: h };
  };
  const plain = await size();

  await row.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('w');
  const chip = row.getByTestId('woulda-chip');
  await expect(chip).toHaveText(/^Woulda won · left R\$\s43,00$/);
  await expect(chip).toHaveCSS('text-transform', 'uppercase');
  await expect(row.getByTestId('woulda-keys')).not.toHaveAttribute('data-open', 'true');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ wouldHave: 'won' });
  // alignment: the pill and the row keep their size
  expect(await size()).toEqual(plain);

  await page.keyboard.press('w');
  await expect(chip).toHaveCount(0);
  await expect(row.getByTestId('woulda-keys')).toHaveAttribute('data-open', 'true');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ wouldHave: null });

  // mouse: the dim W / L beside the pill on hover
  await pill.hover();
  await row.getByRole('button', { name: 'Woulda lost' }).click();
  await expect(chip).toHaveText(/^Woulda lost · saved R\$\s145,00$/);
  expect(await size()).toEqual(plain);
  await page.keyboard.press('z');
  await expect(chip).toHaveCount(0);
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ wouldHave: null });

  await page.keyboard.press('l');
  await expect(chip).toHaveAttribute('data-kind', 'lost');
  await expect.poll(async () => (await betsTagged(request, tag))[0]).toMatchObject({ wouldHave: 'lost' });
  await saved(page);

  const after = await verdict(page);
  expect(after.lost).toBe(before.lost + 1);
  expect(after.won).toBe(before.won);
  expect(Math.round((after.net - before.net) * 100)).toBe(14500);
});

test('BT-37: changing the result off cash-out clears the would-have', async ({ page, request, tag }) => {
  const b = await createBet(request, { betText: `${tag} back`, stake: 100, odds: 1.88, result: 'cash-out', cashout: 145, wouldHave: 'won', money: 'real' });
  expect(b.wouldHave).toBe('won');
  const res = await request.patch(`/api/bets/${b.id}`, { data: { result: 'won', cashout: null } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).wouldHave).toBeNull();
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.locator(`[data-bet-id="${b.id}"]`).getByTestId('woulda-chip')).toHaveCount(0);
});
