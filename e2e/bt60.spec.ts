// BT-60: the money scope and the units view live in one top-bar menu whose label shows the current state.
import { expect, test, viewMenu } from './helpers';

test('BT-60: scope and units from the menu on two pages; the label always shows them', async ({ page }) => {
  await page.goto('/');
  const button = page.getByTestId('view-menu');
  // the switches are not in the top bar until the menu opens
  await expect(page.getByRole('radiogroup', { name: 'Money shown' })).toHaveCount(0);
  await expect(page.getByTestId('view-menu-scope')).toHaveText('Real R$');
  await expect(page.getByTestId('view-menu-units')).toHaveCount(0);

  await (await viewMenu(page)).getByRole('radio', { name: 'Hypothetical H$' }).click();
  await expect(page.getByTestId('view-menu-scope')).toHaveText('Hypothetical H$');
  await (await viewMenu(page)).getByRole('radio', { name: 'Units' }).click();
  await expect(page.getByTestId('view-menu-units')).toHaveText('u');
  // a pick closes it; Esc closes it too
  await expect(page.getByTestId('view-menu-panel')).toHaveCount(0);
  await viewMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('view-menu-panel')).toHaveCount(0);

  // another page: same state, changed from its menu
  await page.getByRole('link', { name: 'Analytics' }).click();
  await expect(page.getByTestId('view-menu-scope')).toHaveText('Hypothetical H$');
  await expect(page.getByTestId('view-menu-units')).toHaveText('u');
  await (await viewMenu(page)).getByRole('radio', { name: 'All' }).click();
  await (await viewMenu(page)).getByRole('radio', { name: 'Money' }).click();
  await expect(page.getByTestId('view-menu-scope')).toHaveText('All');
  await expect(page.getByTestId('view-menu-units')).toHaveCount(0);

  // U still toggles units, shown on the button
  await page.getByRole('heading', { level: 1 }).first().click();
  await page.keyboard.press('u');
  await expect(page.getByTestId('view-menu-units')).toHaveText('u');
  await page.keyboard.press('u');
  await expect(page.getByTestId('view-menu-units')).toHaveCount(0);

  // back to Real for the next tests' default
  await (await viewMenu(page)).getByRole('radio', { name: 'Real R$' }).click();
  await expect(button).toContainText('Real R$');
});
