// BT-43: the day ends at 05:00. With the browser clock at 02:00 on the 25th, a new bet defaults to the 24th.
import { expect, test } from './helpers';

test('at 02:00 the add-bet form defaults to the day before', async ({ page, tag }) => {
  // São Paulo (the config's time zone): 02:00 on 25/11/2026
  await page.clock.setFixedTime(new Date('2026-11-25T02:00:00-03:00'));
  await page.goto('/');
  await page.getByTestId('quick-add').fill(`150 ${tag}`);
  await page.getByTestId('quick-add').press('Enter');
  const dialog = page.getByRole('dialog', { name: 'New bet' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Placed date')).toHaveValue('24/11/2026');
  await expect(dialog.getByLabel('Game date')).toHaveValue('24/11/2026');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // from 05:00 it is the 25th
  await page.clock.setFixedTime(new Date('2026-11-25T05:00:00-03:00'));
  await page.reload();
  await page.getByTestId('quick-add').fill(`150 ${tag}`);
  await page.getByTestId('quick-add').press('Enter');
  await expect(dialog.getByLabel('Placed date')).toHaveValue('25/11/2026');
  await page.keyboard.press('Escape');
});
