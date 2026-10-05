import { test, expect, type Page } from '@playwright/test';
import { openEditor, openDrawer, generateButton, openYourMaps } from './support';

const info = (page: Page) => page.evaluate(() => window.dgmEditor!.info());
const land = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
const idle = (page: Page) => page.evaluate(() => window.dgmEditor!.idle());
async function lower(page: Page) {
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await page.getByRole('button', { name: 'Lower brush (2)', exact: true }).click();
  await page.evaluate(() => { const r = window.dgm3d!.renderer; r.setView({ target: [70.5, r.getView().target[1], -12.5] }); });
  await page.waitForFunction(() => { const p = window.dgmEditor!.tileToClient(70, 12); return document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS' && window.dgm3d!.renderer.tool !== null; });
  const p = await page.evaluate(() => window.dgmEditor!.tileToClient(70, 12));
  await page.mouse.click(p.x, p.y);
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0);
  await idle(page);
  expect((await info(page)).edits).toBe(1);
}

// One regression for F2: replacement boundaries are a shared page-history failure.
test('F2: Generate, saved-map switch and real place each undo and redo without losing map edits', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
  await openEditor(page, 's=4243&z=96&d=n&t=riverValley');
  await lower(page);
  const old = await info(page);
  const oldLand = await land(page);
  await openDrawer(page);
  await page.locator('#seed').fill('4244');
  await generateButton(page).click();
  await page.waitForFunction(() => !document.querySelector('.making-backdrop') && window.dgmEditor?.info().spec?.seed === 4244);
  const next = await info(page);
  const nextLand = await land(page);
  await expect(page.getByRole('button', { name: 'Undo (Ctrl+Z)', exact: true })).toBeEnabled();
  await expect(page.getByText(`New map. Undo to get ${old.name} back.`, { exact: false })).toBeVisible();
  await page.keyboard.press('Control+z');
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, old.name);
  expect(await land(page)).toEqual(oldLand);
  expect((await info(page)).edits).toBe(old.edits);
  await page.keyboard.press('Control+y');
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, next.name);
  expect(await land(page)).toEqual(nextLand);
  const maps = await openYourMaps(page);
  await maps.locator('.ym-tile').filter({ hasText: old.name }).click();
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, old.name);
  // An edit on the old map has its own undo; replacement redo stays after it.
  // Undo this old edit first, then the map switch itself.
  await page.keyboard.press('Control+z'); await idle(page);
  expect((await info(page)).edits).toBe(0);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, next.name);
  await page.keyboard.press('Control+y');
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, old.name);
  expect((await info(page)).edits).toBe(0);
  await page.getByRole('button', { name: 'Real places', exact: true }).click();
  await page.locator('.places-panel .ym-tile').first().click();
  await page.waitForFunction(() => window.dgmEditor?.info().kind === 'import');
  const place = await info(page);
  const placeLand = await land(page);
  await page.keyboard.press('Control+z');
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, old.name);
  await page.keyboard.press('Control+y');
  await page.waitForFunction(name => window.dgmEditor?.info().name === name, place.name);
  expect(await land(page)).toEqual(placeLand);
  expect(page.url()).toContain('#place=');
});
