// BT-40: the Betting Tool's target odds mode. Nothing is saved, so there is nothing to clean up.
import { expect, test } from './helpers';

test('target odds: +280 known and a 1.6 target need 2.76 (+176); found odds, impossible target, hand-off to the dutch', async ({ page }) => {
  await page.goto('/betting-tool');
  await page.getByRole('button', { name: 'Clear all' }).click();
  await page.getByRole('button', { name: 'Target odds' }).click();
  await page.getByLabel('Total stake').fill('100');
  await page.getByLabel('Selection 1 name').fill('First leg');
  await page.getByLabel('Selection 1 odds').fill('+280');
  await page.getByLabel('Selection 2 name').fill('Second leg');
  await expect(page.getByTestId('target-message')).toHaveText('Enter the combined odds you want.');
  await page.getByLabel('Target combined odds').fill('1.6');

  await expect(page.getByTestId('target-needed-value')).toHaveText('2.76 +176');
  await expect(page.getByTestId('target-missing')).toContainText('needs 2.76 (+176)');
  await expect(page.getByTestId('target-stake')).toHaveText(['R$ 42,11', 'R$ 57,89']);
  await expect(page.getByTestId('target-return-value')).toHaveText('R$ 160,00');

  // what the book really offers: real combined odds next to the target
  await page.getByLabel('What I found odds').fill('+190');
  await expect(page.getByTestId('target-vs')).toHaveText(/^above by 0\.\d\d$/);
  await page.getByLabel('What I found odds').fill('2.5');
  await expect(page.getByTestId('target-vs')).toHaveText(/^below by 0\.\d\d$/);

  // impossible: never a negative number, NaN or Infinity
  await page.getByLabel('Target combined odds').fill('4');
  await expect(page.getByTestId('target-message')).toHaveText('Not possible: with these odds the combined odds can only go up to 3.80. Any target below 3.80 works.');
  await expect(page.getByTestId('target-result')).not.toContainText(/NaN|Infinity|-\d/);

  // hand-off: the found odds go to the missing split in the normal dutch
  await page.getByLabel('Target combined odds').fill('1.6');
  await page.getByLabel('What I found odds').fill('2.8');
  await page.getByRole('button', { name: 'Use in dutch' }).click();
  await expect(page.getByRole('button', { name: 'Dutch', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Selection 2 odds')).toHaveValue('2.8');
  await expect(page.getByTestId('dutch-stake')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Log as bets' })).toBeEnabled();
  await page.getByRole('button', { name: 'Clear all' }).click();
});
