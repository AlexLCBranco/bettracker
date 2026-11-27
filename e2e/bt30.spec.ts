// BT-30: create a batch → add legs → add PPs → settle legs by keyboard → the PPs update themselves.
import type { Page } from '@playwright/test';
import { expect, test } from './helpers';

// each leg its own game: two legs from the same game are never on one PP
async function addLeg(page: Page, selection: string, odds: string, tier: string, game: string) {
  const f = page.getByRole('form', { name: 'Add leg' });
  await f.getByLabel('Leg game').fill(game);
  await f.getByLabel('Leg selection').fill(selection);
  await f.getByLabel('Leg odds').fill(odds);
  await f.getByLabel('Leg tier').selectOption({ label: tier });
  await f.getByRole('button', { name: 'Add leg' }).click();
  await expect(page.getByTestId('pp-leg').filter({ hasText: selection })).toBeVisible();
}

async function addPP(page: Page, legs: string[]) {
  await page.getByRole('button', { name: '+ Add PP' }).click();
  const f = page.getByRole('form', { name: /New PP/ });
  // Major-major legs come ticked; tick the rest
  for (const l of legs) await f.getByText(l, { exact: false }).first().click();
  await f.getByRole('button', { name: 'Save PP' }).click();
  await expect(f).toBeHidden();
}

test('BT-30: batch → legs → PPs → settle legs by keyboard → PPs follow; Z undoes', async ({ page, tag }) => {
  await page.goto('/pp');
  await page.getByRole('button', { name: 'New batch' }).click();
  const nb = page.getByRole('form', { name: 'New batch' });
  await nb.getByLabel('Batch name').fill(`${tag} batch`);
  await nb.getByLabel('Placed date').fill('01/01/2000');
  await nb.getByLabel('Stake per PP').fill('5');
  await nb.getByLabel('Money').selectOption('real');
  await nb.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/pp\/[^/?]+\?edit=1/);
  await expect(page.getByTestId('batch')).toHaveAttribute('data-editing', 'true');

  await addLeg(page, `${tag} MM`, '2', 'Major-major', 'G MM');
  await addLeg(page, `${tag} M1`, '2.5', 'Major', 'G M1');
  await addLeg(page, `${tag} M2`, '-150', 'Major', 'G M2'); // American odds → 1.67
  await addLeg(page, `${tag} S1`, '4', 'PP shot', 'G S1');

  await page.getByRole('tab', { name: /Tickets/ }).click();
  await addPP(page, [`${tag} M1`, `${tag} S1`]); // PP 1: MM M1 S1 = 20.00
  await addPP(page, [`${tag} M1`, `${tag} M2`]); // PP 2: MM M1 M2
  await addPP(page, [`${tag} M2`, `${tag} S1`]); // PP 3: MM M2 S1
  const tickets = page.getByTestId('ticket');
  await expect(tickets).toHaveCount(3);
  await expect(tickets.nth(0).getByTestId('ticket-odds')).toContainText('20.00');
  await expect(tickets.nth(0).getByTestId('ticket-odds')).toContainText('estimated');
  await expect(tickets.nth(0).getByTestId('ticket-potential')).toHaveText(/R\$\s100,00/);
  await page.getByTestId('edit-toggle').click(); // Done: read-only, settling still works

  await page.getByRole('tab', { name: /Legs/ }).click();
  const mm = page.getByTestId('pp-leg').filter({ hasText: `${tag} MM` });
  await expect(mm.getByTestId('leg-use')).toHaveText('on 3 PPs · 3 alive');
  await expect(page.getByRole('button', { name: 'Edit leg' })).toHaveCount(0);

  // keyboard: select MM, W (selection moves to the next leg), L on M1
  await mm.click();
  await page.keyboard.press('w');
  await expect(mm).toHaveAttribute('data-result', 'won');
  const m1 = page.getByTestId('pp-leg').filter({ hasText: `${tag} M1` });
  await expect(m1).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('l');
  await expect(m1).toHaveAttribute('data-result', 'lost');
  // PP 3 (MM M2 S1) is alive with two legs left; M2 and S1 do not decide anything yet
  await expect(page.getByTestId('sum-dead')).toHaveText('2');
  await expect(page.getByTestId('sum-alive')).toHaveText('1');

  // a settled leg changes from its result pill, outside Edit too (as on the Bets page)
  await m1.getByTestId('leg-result').click();
  await m1.getByLabel('Leg result').selectOption('won');
  await expect(m1).toHaveAttribute('data-result', 'won');
  await expect(page.getByTestId('sum-dead')).toHaveText('0');
  await m1.getByTestId('leg-result').click();
  await m1.getByLabel('Leg result').selectOption('lost');
  await expect(m1).toHaveAttribute('data-result', 'lost');
  await expect(page.getByTestId('sum-dead')).toHaveText('2');

  // S1 wins: PP 3 is one leg away and M2 decides it (flagged, sorted to the top of its tier)
  await page.getByTestId('pp-leg').filter({ hasText: `${tag} S1` }).click();
  await page.keyboard.press('w');
  const m2 = page.getByTestId('pp-leg').filter({ hasText: `${tag} M2` });
  await expect(m2.getByTestId('decides')).toHaveText(/decides 1 PP/i);
  await expect(page.getByTestId('tier-group').filter({ hasText: 'Major' }).nth(1).getByTestId('pp-leg').first()).toContainText(`${tag} M2`);

  // T: actual and note
  await m2.click();
  await page.keyboard.press('t');
  await page.getByLabel('Actual').fill('3 pts');
  await page.getByLabel('Leg note').fill('coin flip');
  await page.getByLabel('Leg note').press('Enter');
  await expect(m2.getByTestId('leg-actual')).toHaveText('→ 3 pts');
  await expect(m2.getByTestId('leg-note')).toContainText('coin flip');

  await m2.click();
  await page.keyboard.press('w');
  await expect(page.getByTestId('sum-won')).toHaveText('1');
  await page.getByRole('tab', { name: /Tickets/ }).click();
  await expect(tickets.filter({ has: page.getByText('PP 1', { exact: true }) }).getByTestId('ticket-status')).toHaveText('Dead');
  await expect(page.locator('[data-testid="ticket"][data-number="3"]').getByTestId('ticket-status')).toHaveText('Won');
  // filter chips and leg-chip filter
  await page.getByRole('button', { name: /^Won/ }).click();
  await expect(tickets).toHaveCount(1);
  await page.getByRole('button', { name: /^All/ }).click();
  await page.locator('[data-testid="ticket"][data-number="1"]').getByTestId('ticket-leg').filter({ hasText: `${tag} S1` }).click();
  await expect(page.getByTestId('leg-filter')).toContainText(`${tag} S1`);
  await expect(tickets).toHaveCount(2);

  // Z undoes M2's win: PP 3 is one leg away again
  await page.getByRole('tab', { name: /Legs/ }).click();
  await page.keyboard.press('z'); // the note
  await page.keyboard.press('z'); // the win
  await expect(m2).toHaveAttribute('data-result', 'pending');
  await expect(page.getByTestId('sum-alive')).toHaveText('1');
  await expect(page.getByTestId('batch-summary')).toContainText('1 one leg away');
  // the system beside the name: legs of each tier per PP (and the pool)
  await expect(page.getByTestId('batch-system')).toContainText('mjmj');
  await expect(page.getByTestId('batch-system')).toContainText('per PP');

  // the batch list row, and it survives a reload
  await page.goto('/pp');
  const row = page.getByTestId('batch-row').filter({ hasText: `${tag} batch` });
  await expect(row.getByTestId('batch-counts')).toHaveText('0 / 1 / 2');
  await row.getByRole('link').click();
  await expect(page.getByTestId('pp-leg').filter({ hasText: `${tag} M1` })).toHaveAttribute('data-result', 'lost');
});
