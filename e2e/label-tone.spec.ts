// Label tones (owner, 2026-11-27): a label is red (negative) by default; clicking its chip goes to green (positive),
// then grey (neutral), then red again, for every bet with that label; the label editor has the same three choices.
import { betsTagged, createBet, expect, saved, test } from './helpers';

const tonesOf = async (request: import('@playwright/test').APIRequestContext) => (await (await request.get('/api/label-tones')).json()) as Record<string, string>;

test('label tone: red by default, the chip flips it for every bet with that label, kept after a reload', async ({ page, request, tag }) => {
  const label = `${tag} nailed it`;
  const a = await createBet(request, { betText: `${tag} a`, label, result: 'won' });
  const b = await createBet(request, { betText: `${tag} b`, label, result: 'won' });
  try {
    await page.goto('/');
    await page.getByLabel('Search bets').fill(tag);
    const chipA = page.locator(`[data-bet-id="${a.id}"]`).getByTestId('label-chip');
    const chipB = page.locator(`[data-bet-id="${b.id}"]`).getByTestId('label-chip');
    await expect(chipA).toHaveAttribute('data-tone', 'negative');
    await expect(chipA).toHaveClass(/text-red-/);

    await chipA.click();
    await expect(chipA).toHaveAttribute('data-tone', 'positive');
    await expect(chipA).toHaveClass(/text-emerald-/);
    await expect(chipB).toHaveAttribute('data-tone', 'positive');
    await saved(page);
    expect(Object.values(await tonesOf(request)).length).toBeGreaterThan(0);

    await page.reload();
    await page.getByLabel('Search bets').fill(tag);
    await expect(chipB).toHaveAttribute('data-tone', 'positive');

    await chipB.click();
    await expect(chipA).toHaveAttribute('data-tone', 'neutral');
    await expect(chipA).toHaveClass(/text-zinc-/);
    await chipB.click();
    await expect(chipA).toHaveAttribute('data-tone', 'negative');
    await saved(page);
    await expect.poll(async () => Object.keys(await tonesOf(request)).some((k) => k.includes(tag.toLowerCase()))).toBe(false);
  } finally {
    const t = await tonesOf(request);
    for (const k of Object.keys(t)) if (k.includes(tag.toLowerCase())) delete t[k];
    await request.put('/api/label-tones', { data: t });
  }
});

test('label tone: "+ Positive" in the label editor makes a new label green', async ({ page, request, tag }) => {
  const s = await createBet(request, { betText: `${tag} solo`, legs: [{ selection: `${tag} solo`, odds: 2 }] });
  const label = `${tag} good read`;
  try {
    await page.goto('/');
    await page.getByLabel('Search bets').fill(tag);
    const row = page.locator(`[data-bet-id="${s.id}"]`);
    await row.hover();
    await row.getByRole('button', { name: 'Label and actual result' }).click();
    const box = page.getByLabel('Actual result and label');
    await box.fill(`#${label}`);
    const toggle = page.getByTestId('label-tone');
    await expect(toggle.getByRole('radio', { name: '− Negative' })).toHaveAttribute('aria-checked', 'true');
    await toggle.getByRole('radio', { name: '+ Positive' }).click();
    await page.getByTestId('annotator').getByRole('button', { name: 'Save' }).click();
    await expect.poll(async () => (await betsTagged(request, tag))[0]!.label).toBe(label);
    await expect(row.getByTestId('label-chip')).toHaveAttribute('data-tone', 'positive');
    await saved(page);
    await expect.poll(async () => Object.keys(await tonesOf(request)).some((k) => k.includes(tag.toLowerCase()))).toBe(true);
  } finally {
    const t = await tonesOf(request);
    for (const k of Object.keys(t)) if (k.includes(tag.toLowerCase())) delete t[k];
    await request.put('/api/label-tones', { data: t });
  }
});
