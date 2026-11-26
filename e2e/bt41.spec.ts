// BT-41: the Analytics "Dutches" block. Two throwaway dutches are logged, settled and read back in the tiles. On the
// live site real dutches count too, so the test reads the tiles before and checks what its two dutches add.
import { createBet, expect, test } from './helpers';
import type { Page } from '@playwright/test';

async function tiles(page: Page) {
  await page.goto('/analytics?tab=dutches');
  const block = page.getByTestId('dutches');
  await expect(block).toBeVisible();
  if (await block.getByTestId('dutches-empty').isVisible()) return { count: 0, hit: 0, splits: 0 };
  const count = Number(await page.getByTestId('dutches-count-value').textContent());
  const [hit, splits] = (await page.getByTestId('dutches-splits-value').textContent())!.split('/').map(Number);
  return { count, hit: hit!, splits: splits! };
}

test('analytics: the Dutches block counts each settled dutch once and its splits hit / missed', async ({ page, request, tag }) => {
  const before = await tiles(page);

  const leg = (selection: string, odds: number) => [{ game: `${tag} game`, selection, odds }];
  const a = [
    await createBet(request, { betText: '', dutchId: `${tag}-a`, odds: 2, stake: 60, legs: leg('Home', 2) }),
    await createBet(request, { betText: '', dutchId: `${tag}-a`, odds: 4, stake: 40, legs: leg('Away', 4) }),
  ];
  const b = [
    await createBet(request, { betText: '', dutchId: `${tag}-b`, odds: 3, stake: 50, legs: leg('Over', 3) }),
    await createBet(request, { betText: '', dutchId: `${tag}-b`, odds: 3, stake: 50, legs: leg('Under', 3) }),
    await createBet(request, { betText: '', dutchId: `${tag}-b`, odds: 5, stake: 20, legs: leg('Push', 5) }),
  ];
  // pending dutches are not in the money tiles
  expect((await tiles(page)).count).toBe(before.count);

  const settle = async (id: string, result: string) => expect((await request.patch(`/api/bets/${id}`, { data: { result } })).ok()).toBe(true);
  await settle(a[0]!.id, 'won');
  await settle(a[1]!.id, 'lost');
  for (const x of b) await settle(x.id, 'lost');

  const after = await tiles(page);
  expect(after.count).toBe(before.count + 2);
  expect(after.hit).toBe(before.hit + 1);
  expect(after.splits).toBe(before.splits + 5);
  await expect(page.getByTestId('dutches').getByRole('table', { name: 'Which split hits' })).toContainText('Lowest-odds split');
  await expect(page.getByTestId('dutches').getByRole('table', { name: 'By number of splits' })).toContainText('3 splits');
  await expect(page.getByTestId('dutches')).not.toContainText('NaN');
});
