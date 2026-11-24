// BT-42: a game's page link, pasted once in the game editor, shows as a mark on every bet on that game.
import { createBet, expect, test } from './helpers';

test('game link: paste a Sofascore link on one bet, both bets on that game show the mark', async ({ page, request, tag }) => {
  const game = `${tag} Celtics vs Lakers`;
  const day = { placedDate: '2000-01-01', gameDate: '2000-01-01' };
  const one = await createBet(request, { ...day, betText: '', legs: [{ game, selection: `${tag} Tatum 25+`, odds: 2 }] });
  const two = await createBet(request, { ...day, betText: '', legs: [{ game, selection: `${tag} LeBron 8+ ast`, odds: 2 }] });
  const url = `https://www.sofascore.com/basketball/match/celtics-lakers/${tag}`;
  try {
    await page.goto('/history');
    await page.getByLabel('Search bets').fill(tag);
    await page.getByLabel('Search bets').blur();
    const row1 = page.locator(`[data-bet-id="${one.id}"]`);
    const row2 = page.locator(`[data-bet-id="${two.id}"]`);
    await expect(row1.getByTestId('game-link')).toHaveCount(0);

    await row1.getByRole('button', { name: 'Edit Game' }).dblclick();
    const editor = page.getByRole('dialog', { name: 'Edit game' });
    const box = editor.getByLabel('Game link');
    await box.fill('not a link');
    await box.press('Enter');
    await expect(editor.getByTestId('game-link-error')).toContainText('Not a web address');
    await box.fill(url);
    await box.press('Enter');
    await expect(editor).toBeVisible(); // Enter in the link box saves the link only
    await expect(editor.getByTestId('game-links-saved')).toHaveText(/Sofascore/);
    await page.keyboard.press('Escape');

    for (const row of [row1, row2]) {
      const mark = row.getByTestId('game-link');
      await expect(mark).toHaveCount(1);
      await expect(mark).toHaveAttribute('href', url);
      await expect(mark).toHaveAttribute('target', '_blank');
      await expect(mark).toHaveAttribute('rel', 'noopener noreferrer');
    }
    // saved: still there after a reload
    await page.reload();
    await page.getByLabel('Search bets').fill(tag);
    await expect(row2.getByTestId('game-link')).toHaveAttribute('href', url);
  } finally {
    const all = (await (await request.get('/api/game-links')).json()) as { game: string; date: string; site: string }[];
    for (const l of all.filter((x) => x.game.includes(tag.toLowerCase()))) await request.delete('/api/game-links', { data: l });
  }
});
