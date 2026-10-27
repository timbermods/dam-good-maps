import { test, expect, type Page } from '@playwright/test';
import { openEditor } from './support';

const land = (page: Page) => page.evaluate(() => Array.from(window.dgm3d!.renderer.mapState()!.heights));
// Observe the real anchor's blob, without replacing the save handler or preventing its click.
// Chrome on the restricted PC cancels filesystem downloads after receiving all the bytes.
async function watchFiles(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { qaFiles: { name: string; bytes: Promise<number[]> }[] };
    w.qaFiles = [];
    document.addEventListener('click', e => {
      const a = e.target;
      if (a instanceof HTMLAnchorElement && a.download && a.href.startsWith('blob:'))
        w.qaFiles.push({ name: a.download, bytes: fetch(a.href).then(r => r.arrayBuffer()).then(b => Array.from(new Uint8Array(b))) });
    }, true);
  });
}

// One regression for F1; both file choices call the same missing force-commit barrier.
test('F1: both file saves keep a paused Fast force and reopen with the land now shown', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 2 }));
  for (const choice of ['Save project', 'Download .timber']) {
    await openEditor(page, 's=4242&z=256&d=n&t=highlands');
    await watchFiles(page);
    await page.getByRole('button', { name: 'Top-down', exact: true }).click();
    const slow = page.getByRole('button', { name: 'Slow forces', exact: true });
    if (await slow.getAttribute('aria-pressed') === 'true') await slow.click();
    await page.getByRole('button', { name: 'Craterize (8)', exact: true }).click();
    await page.evaluate(() => { const r = window.dgm3d!.renderer; r.setView({ target: [170.5, r.getView().target[1], -70.5] }); });
    await page.waitForFunction(() => { const p = window.dgmEditor!.tileToClient(170, 70); return document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS' && window.dgm3d!.renderer.tool !== null; });
    const before = await land(page);
    const p = await page.evaluate(() => window.dgmEditor!.tileToClient(170, 70));
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(before => window.dgmEditor!.force()?.verb === 'craterize' && window.dgm3d!.renderer.mapState()!.heights.some((h, i) => h !== before[i]), before);
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.dgmEditor!.force()?.paused)).toBe(true);
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await page.getByRole('menuitem', { name: choice, exact: true }).click();
    await page.waitForFunction(() => (window as unknown as { qaFiles: unknown[] }).qaFiles.length > 0, null, { timeout: 120_000 });
    const file = await page.evaluate(async () => { const f = (window as unknown as { qaFiles: { name: string; bytes: Promise<number[]> }[] }).qaFiles.at(-1)!; return { name: f.name, bytes: await f.bytes }; });
    const shown = await land(page);
    expect(shown).not.toEqual(before);
    const version = await page.evaluate(() => window.dgmEditor!.info().version);
    await page.getByLabel('Open a map or project file').setInputFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: Buffer.from(file.bytes) });
    await page.waitForFunction(v => (window.dgmEditor?.info().version ?? 0) > v, version);
    const reopened = await land(page);
    expect(reopened.filter((h, i) => h !== shown[i]).length, `${choice}: tiles omitted from the land shown when the file was offered`).toBe(0);
  }
});
