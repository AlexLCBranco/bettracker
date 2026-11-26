// A combination's total odds fill in from its legs (multiplied, "estimated") until the book's price is typed over.
import { betsTagged, expect, saved, test } from './helpers';

test("combination total odds: legs multiplied, marked estimated; the book's typed price wins", async ({ page, request, tag }) => {
  await page.goto('/');
  await page.keyboard.press('n');
  const d = page.getByRole('dialog', { name: 'New bet' });
  await d.getByLabel('Stake').fill('10');
  await d.getByLabel('Type').selectOption('combination');
  await d.getByLabel('Placed date').fill('01/01/2000');
  await d.getByLabel('Game date').fill('01/01/2000');
  await d.getByRole('button', { name: '+ Add leg' }).click();
  await d.getByRole('button', { name: '+ Add leg' }).click();
  // a total typed before the legs are complete still follows them (the owner's case: 1.33 = leg 1)
  await d.getByLabel('Odds', { exact: true }).fill('1.33');
  await d.getByLabel('Leg 1 odds').fill('1.33');
  await expect(d.getByLabel('Odds', { exact: true })).toHaveValue('1.33');
  await d.getByLabel('Leg 2 odds').fill('1.45');
  await expect(d.getByLabel('Odds', { exact: true })).toHaveValue('1.93');
  await expect(d.getByTestId('total-odds-estimated')).toBeVisible();
  await expect(d.getByTestId('potential-return')).toContainText('19,30');

  // the book's price typed over it stays when a leg changes; one click goes back to the legs
  await d.getByLabel('Odds', { exact: true }).fill('1.90');
  await expect(d.getByTestId('total-odds-estimated')).toHaveCount(0);
  await d.getByLabel('Leg 2 odds').fill('1.5');
  await expect(d.getByLabel('Odds', { exact: true })).toHaveValue('1.9');
  await d.getByTestId('total-odds-use-legs').click();
  await expect(d.getByLabel('Odds', { exact: true })).toHaveValue('2');
  await d.getByLabel('Odds', { exact: true }).fill('1.95');

  await d.getByLabel('Bet text').fill(`${tag} a + b`);
  await d.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(d).toHaveCount(0);
  await saved(page);
  const [b] = await betsTagged(request, tag);
  expect(b!.odds).toBe(1.95);
  expect(b!.legs.map((l) => l.odds)).toEqual([1.33, 1.5]);
});
