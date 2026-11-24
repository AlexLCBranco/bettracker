// The live smoke check after a push (npm run e2e:smoke): tens of Vercel requests, not the whole suite's thousands.
// The site loads, it runs the version in package.json, and one tagged bet can be added and is deleted again.
import { readFileSync } from 'node:fs';
import { betsTagged, expect, test } from './helpers';

test('smoke: the version is live, and a bet can be added (then deleted)', async ({ page, request, tag }) => {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
  const res = await request.get('/version.json');
  expect(res.ok()).toBe(true);
  expect(((await res.json()) as { version: string }).version).toBe(version);

  await page.goto('/');
  await expect(page.getByTestId('site-version')).toHaveText(`v${version}`);
  await page.getByTestId('quick-add').fill(`1 @2 ${tag} smoke`);
  await page.getByTestId('quick-add').press('Enter');
  await expect(page.getByRole('status')).toContainText('Saved');
  // the test fixture deletes it (by id) when the test ends
  await expect.poll(async () => (await betsTagged(request, tag)).length).toBe(1);
});
