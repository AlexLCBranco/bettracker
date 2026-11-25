// BT-50: a day's "Games" toggle shows the games bet on; clicking one shows only its bets (Esc or × clears).
import { createBet, expect, test } from './helpers';

test('BT-50: Games toggle lists the day\'s games; a click filters the bets', async ({ page, request, tag }) => {
  const leg = (game: string, selection = `${tag} pick`) => ({ selection, game, sport: 'Basketball', market: 'Moneyline', odds: 2, result: 'pending' });
  const g1 = `${tag}home vs ${tag}away`;
  await createBet(request, { betText: `${tag} solo`, stake: 10, legs: [leg(g1)] });
  await createBet(request, { betText: `${tag} reversed`, stake: 20, legs: [leg(`${tag}away @ ${tag}home`)] });
  await createBet(request, { betText: `${tag} combo`, type: 'combination', stake: 5, odds: 4, legs: [leg(g1), leg(`${tag}other vs ${tag}team`)] });
  await page.goto('/');
  await page.getByLabel('Search bets').fill(tag);
  await expect(page.getByTestId('bet-row')).toHaveCount(3);

  const header = page.getByTestId('day-header');
  await header.getByTestId('day-games-toggle').click();
  await expect(header.getByTestId('day-games-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('bet-row')).toHaveCount(0);
  const rows = page.getByTestId('game-row');
  await expect(rows).toHaveCount(2);
  const first = rows.first();
  await expect(first.getByTestId('game-name')).toHaveText(new RegExp(`^${tag}home @ ${tag}away$`, 'i'));
  await expect(first.getByTestId('game-count')).toHaveText('3 bets');
  await expect(first.getByTestId('game-stake')).toHaveText(/R\$\s35,00/);
  await expect(first.getByTestId('game-status')).toHaveText('Pending');
  await expect(first.getByTestId('game-sub')).toHaveText('Basketball');
  await expect(rows.nth(1).getByTestId('game-count')).toHaveText('1 bet');

  // click the second game: only the combo
  await rows.nth(1).click();
  await expect(page.getByTestId('game-filter')).toContainText(`${tag}other @ ${tag}team`, { ignoreCase: true });
  await expect(page.getByTestId('game-row')).toHaveCount(0);
  await expect(page.getByTestId('bet-row')).toHaveCount(1);
  await expect(page.getByTestId('bet-row').getByTestId('bet-text').first()).toContainText(`${tag} combo`);
  await page.getByTestId('game-filter-clear').click();
  await expect(page.getByTestId('bet-row')).toHaveCount(3);

  // Esc clears too
  await header.getByTestId('day-games-toggle').click();
  await page.getByTestId('game-row').first().click();
  await expect(page.getByTestId('bet-row')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('game-filter')).toHaveCount(0);
  await expect(page.getByTestId('bet-row')).toHaveCount(3);
});
