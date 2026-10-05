import { expect, test } from '@playwright/test';
import { open, arm, held, release } from './transport';
test('Cancel during the old-map snapshot keeps the recovery overlay and restores a live worker', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => window.dgmEditor!.info());
  await page.getByRole('button', { name: 'Map Generator', exact: true }).click();
  await arm(page, 'project');
  await page.getByRole('form', { name: 'Settings' }).locator('button[type=submit]').click();
  await held(page);
  try {
    await page.keyboard.press('Escape');
    // Recovery is pending. Removing the dialog here leaves the old editor on a terminated worker.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Opening your map');
  } finally {
    await release(page);
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const live = await page.evaluate(() => window.dgmEditor!.worker.sessionInfo());
  expect(live!.name).toBe(before.name);
  expect(live!.history).toEqual(before.history);
});
