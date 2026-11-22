import { expect, test as setup } from '@playwright/test';

setup('log in', async ({ page }) => {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error('E2E_PASSWORD is not set (the live site password)');
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/state.json' });
});
