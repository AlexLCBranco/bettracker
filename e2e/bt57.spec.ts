// BT-57: only Search is always visible; the other filters open from "Filters", and each one in use is a chip.
import { createBet, expect, test } from './helpers';

test('BT-57: filters panel, a chip per filter in use, × clears one, Clear clears all', async ({ page, request, tag }) => {
  await createBet(request, { betText: `${tag} won`, result: 'won', book: `${tag}book` });
  await createBet(request, { betText: `${tag} lost`, result: 'lost', situation: 'live' });
  await createBet(request, { betText: `${tag} combo`, type: 'combination', legs: [{ selection: 'A', odds: 2 }, { selection: 'B', odds: 2 }], placedDate: '2000-01-02', gameDate: '2000-01-02' });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  const rows = page.locator('[data-testid=bet-row]:not([data-nested])');
  const chips = page.getByTestId('filter-chip');
  const button = page.getByRole('button', { name: 'Filters' });
  await expect(rows).toHaveCount(3);
  await expect(chips).toHaveCount(0);
  await expect(page.getByTestId('filters-count')).toHaveCount(0);

  // the panel is closed: its fields are not on screen
  await expect(page.getByLabel('Filter result')).toBeHidden();
  await button.click();
  const panel = page.getByTestId('filters-panel');
  await expect(panel).toBeVisible();

  await page.getByLabel('Filter result').selectOption('won');
  await expect(rows).toHaveCount(1);
  await expect(chips).toHaveText(['Result: Won×']);
  await page.getByLabel('Filter result').selectOption('');
  await page.getByLabel('Filter situation').selectOption('live');
  await expect(chips).toHaveText(['Situation: Live×']);
  await expect(rows).toHaveCount(1);
  await page.getByLabel('Filter type').selectOption('combination');
  await expect(rows).toHaveCount(0);
  await page.getByLabel('Filter type').selectOption('');
  await page.getByLabel('Filter book').fill(`${tag}book`);
  await page.getByLabel('Filter situation').selectOption('');
  await page.getByLabel('To date').fill('01/01/2000');

  // close the panel: the chips stay on screen, with the count on the button
  await page.getByLabel('Search bets').click();
  await expect(panel).toBeHidden();
  await expect(chips).toHaveText([`To: 01/01/2000×`, `Book: ${tag}book×`]);
  await expect(page.getByTestId('filters-count')).toHaveText('2');
  await expect(rows).toHaveCount(1);

  // × clears one
  await page.getByRole('button', { name: `Clear Book: ${tag}book` }).click();
  await expect(chips).toHaveText(['To: 01/01/2000×']);
  await expect(rows).toHaveCount(2);
  await page.getByRole('button', { name: 'Clear To: 01/01/2000' }).click();
  await expect(chips).toHaveCount(0);
  await expect(rows).toHaveCount(3);

  // Clear clears every filter, the search too
  await button.click();
  await page.getByLabel('Filter result').selectOption('lost');
  await page.getByLabel('Search bets').click();
  await expect(rows).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(chips).toHaveCount(0);
  await expect(page.getByLabel('Search bets')).toHaveValue('');
});
