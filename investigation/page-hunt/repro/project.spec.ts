import { readFileSync } from 'node:fs';
import { gunzipSync, strFromU8 } from 'fflate';
import { expect, test } from '@playwright/test';
import { open, arm, held, release, lower } from './transport';
test('Save project includes the second stroke already painted while the first reply is pending', async ({ page }) => {
  await open(page);
  await arm(page, 'brush');
  await lower(page, 70, 12);
  await held(page);
  await lower(page, 60, 12);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: 'Save project', exact: true }).click();
  // A worker round trip makes the ordering explicit, independent of CPU speed. The first
  // stroke's acknowledgment remains held; the second stroke is still in the editor queue.
  await page.evaluate(() => window.dgmEditor!.worker.sessionInfo());
  await release(page);
  const d = await download;
  await page.evaluate(() => window.dgmEditor!.idle());
  const doc = JSON.parse(strFromU8(gunzipSync(readFileSync((await d.path())!))));
  expect(doc.edits.length).toBe(2);
  expect(doc.edits.length).toBe(await page.evaluate(() => window.dgmEditor!.info().edits));
});
