import { test, expect } from '@playwright/test';
import { openEditor } from './support';

// One regression for F3: compare the actual 3D surface-water arrays, without a tolerance.
test('F3: an edited timber download reopens with identical displayed water values', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
  await openEditor(page, 's=4243&z=96&d=n&t=riverValley');
  await page.getByRole('button', { name: 'Top-down', exact: true }).click();
  await page.getByRole('button', { name: 'Lower brush (2)', exact: true }).click();
  await page.evaluate(() => { const r = window.dgm3d!.renderer; r.setView({ target: [70.5, r.getView().target[1], -12.5] }); });
  await page.waitForFunction(() => { const p = window.dgmEditor!.tileToClient(70, 12); return document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS' && window.dgm3d!.renderer.tool !== null; });
  const a = await page.evaluate(() => window.dgmEditor!.tileToClient(67, 12));
  const b = await page.evaluate(() => window.dgmEditor!.tileToClient(73, 12));
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(() => window.dgmEditor!.pendingTerrain() === 0);
  await page.evaluate(() => window.dgmEditor!.idle());
  await expect(page.getByRole('button', { name: /^Checks: Ready to play/ })).toBeVisible({ timeout: 120_000 });
  await page.waitForFunction(() => window.dgmEditor!.waterSettled());
  await page.evaluate(() => {
    const w = window as unknown as { qaFile?: { name: string; bytes: Promise<number[]> } };
    document.addEventListener('click', e => {
      const a = e.target;
      if (a instanceof HTMLAnchorElement && a.download && a.href.startsWith('blob:'))
        w.qaFile = { name: a.download, bytes: fetch(a.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b))) };
    }, true);
  });
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Download .timber', exact: true }).click();
  await page.waitForFunction(() => !!(window as unknown as { qaFile?: unknown }).qaFile, null, { timeout: 120_000 });
  const file = await page.evaluate(async () => { const f = (window as unknown as { qaFile: { name: string; bytes: Promise<number[]> } }).qaFile; return { name: f.name, bytes: await f.bytes }; });
  const shown = await page.evaluate(() => { const s = window.dgm3d!.renderer.mapState()!.surface; return { depth: Array.from(s.depth), bad: Array.from(s.contamination) }; });
  const version = await page.evaluate(() => window.dgmEditor!.info().version);
  await page.getByLabel('Open a map or project file').setInputFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.from(file.bytes) });
  await page.waitForFunction(v => (window.dgmEditor?.info().version ?? 0) > v && window.dgmEditor?.info().kind === 'import', version);
  const reopened = await page.evaluate(() => { const s = window.dgm3d!.renderer.mapState()!.surface; return { depth: Array.from(s.depth), bad: Array.from(s.contamination) }; });
  expect(reopened.depth.filter((d, i) => d !== shown.depth[i]).length, 'water depths changed on Download/open').toBe(0);
  expect(reopened.bad.filter((d, i) => d !== shown.bad[i]).length, 'badwater changed on Download/open').toBe(0);
});
