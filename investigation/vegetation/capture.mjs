import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync('captures', { recursive: true });
mkdirSync('out', { recursive: true });
const url = process.env.VEGETATION_URL ?? (existsSync('.demo-url') ? readFileSync('.demo-url', 'utf8').trim() : undefined);
if (!url) throw new Error('Start npm run demo first; it records the free port.');
const smoke = process.argv.includes('--smoke');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-vulkan'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1080 }, deviceScaleFactor: 1 });
page.setDefaultTimeout(300_000);
const errors = [];
page.on('pageerror', e => { errors.push(String(e)); console.log('PAGE ERROR', String(e)); });
page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); console.log('CONSOLE ERROR', m.text().slice(0, 1200)); } });
const report = { renderer: '', maps: [], captures: [], checks: {}, errors };
async function snap(file, pose) {
  await page.mouse.move(10, 10);
  const info = await page.evaluate(pose => { const a = window.vegetation; a.setPose(pose); a.freeze(); return { label: a.label, camera: a.old.getView(), stats: a.stats() }; }, pose);
  // Let the normal UI readout catch up after LOD changes before recording its draw counts.
  await page.waitForFunction(() => window.vegetation.stats().observations.every((o, i) => document.getElementById(`${i ? 'new' : 'old'}-fps`).textContent === `Paused · ${o.draws} draws`));
  await page.locator('#comparison').screenshot({ path: `captures/${file}.jpg`, type: 'jpeg', quality: 83 });
  report.captures.push({ file: `${file}.jpg`, ...info }); console.log('Captured', file);
}
try {
  await page.goto(url); await page.waitForFunction(() => window.vegetation?.ready);
  await page.evaluate(() => { document.getElementById('adaptive').checked = false; window.vegetation.freeze(); });
  report.renderer = await page.evaluate(() => window.vegetation.stats().gpu); console.log('Renderer:', report.renderer);
  await snap('variants', 'garden'); await snap('growth-and-dead', 'stages');
  await page.evaluate(() => { window.vegetation.camera({ target: [10.8, 2.7, -4.4], distance: 10, pitch: 0.55 }); window.vegetation.freeze(); });
  await page.locator('#comparison').screenshot({ path: 'captures/models-close.jpg', type: 'jpeg', quality: 85 });
  report.checks.rendering = await page.evaluate(() => {
    const a = window.vegetation;
    function pixels(renderer) { renderer.renderNow(); const gl = renderer.canvas.getContext('webgl2'); const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; }
    function depth() { const b = a.fresh, target = a.effects[1].target, p = new Uint8Array(target.width * target.height * 4); b.gl.readRenderTargetPixels(target, 0, 0, target.width, target.height, p); return p; }
    function changed(x, y) { let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; }
    a.configure({ sway: true, low: false, shadows: true }); a.freeze(0);
    const first = pixels(a.fresh), oldFirst = pixels(a.old), depthFirst = depth();
    a.freeze(4); const movingChannels = changed(first, pixels(a.fresh)), oldMovingChannels = changed(oldFirst, pixels(a.old)), movingDepthChannels = changed(depthFirst, depth());
    a.configure({ sway: false }); a.freeze(0); const still = pixels(a.fresh); a.freeze(4); const stillChannels = changed(still, pixels(a.fresh));
    const matrixVersion = a.forest.batches.map(b => b.mesh.instanceMatrix.version);
    a.freeze(7); const stationaryUploads = a.forest.batches.every((b, i) => b.mesh.instanceMatrix.version === matrixVersion[i]);
    const passes = a.effects[1].passes; a.freeze(8); const stillDepthCached = a.effects[1].passes === passes;
    a.configure({ low: true }); a.freeze(); const low = { near: a.forest.stats.near, far: a.forest.stats.far, shadows: a.effects[1].shadows, wind: a.material.uniforms.vegSway.value };
    a.configure({ low: false, sway: true }); a.freeze();
    return { movingChannels, oldMovingChannels, movingDepthChannels, stillChannels, stationaryUploads, stillDepthCached, low };
  });
  assert.ok(report.checks.rendering.movingChannels > 0, 'wind moves visible foliage');
  assert.ok(report.checks.rendering.movingDepthChannels > 0, 'wind moves the shadow depth');
  assert.equal(report.checks.rendering.oldMovingChannels, 0, 'baseline does not sway');
  assert.equal(report.checks.rendering.stillChannels, 0, 'sway off is actually static');
  assert.ok(report.checks.rendering.stationaryUploads && report.checks.rendering.stillDepthCached);
  assert.deepEqual([report.checks.rendering.low.near, report.checks.rendering.low.shadows, report.checks.rendering.low.wind], [0, false, 0]);
  // Real pointer drags in both directions, not just copying state through the capture API.
  for (const id of ['new', 'old']) {
    const rect = await page.locator(`#${id}`).boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); await page.mouse.move(rect.x + rect.width / 2 + 45, rect.y + rect.height / 2 + 12, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => JSON.stringify(window.vegetation.old.getView()) === JSON.stringify(window.vegetation.fresh.getView())), `${id} drag synchronizes`);
  }
  report.checks.cameraSync = 'pointer drag in both directions';
  await page.locator('#shelf button').nth(2).click(); await page.locator('#new').hover({ position: { x: 470, y: 330 } });
  report.checks.ghost = await page.evaluate(() => window.vegetation.fresh.scene.children.some(c => c.userData.vegetationGhost));
  assert.ok(report.checks.ghost); await page.locator('#comparison').screenshot({ path: 'captures/placement-ghost.jpg', type: 'jpeg', quality: 80 }); await page.keyboard.press('Escape');
  await page.evaluate(() => window.vegetation.setPose('garden'));
  await page.screenshot({ path: 'captures/demo.jpg', type: 'jpeg', quality: 80, fullPage: true });
  await page.evaluate(() => window.vegetation.load(11)); await snap('types-top-down', 'types');
  await snap('types-side', 'side');
  await page.evaluate(() => window.vegetation.configure({ low: true }));
  await snap('types-top-down-laptop', 'types'); await snap('types-side-laptop', 'side');
  await page.evaluate(() => window.vegetation.configure({ low: false }));
  if (!smoke) {
    for (const index of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      console.log('Loading', index); await page.evaluate(index => window.vegetation.load(index), index);
      const info = await page.evaluate(() => { window.vegetation.freeze(); return { label: window.vegetation.label, stats: window.vegetation.stats() }; }); report.maps.push(info);
      if (index === 1) { await snap('forest-edge', 'edge'); await snap('grove', 'grove'); await snap('map-growth-and-dead', 'stages'); }
      if (index === 2) await snap('whole-map-top-down', 'overview');
      if (index >= 7) await snap(['real-victoria-falls', 'real-yosemite', 'real-danube-delta'][index - 7], 'edge');
    }
    console.log('Loading dense stress'); await page.evaluate(() => window.vegetation.load(10));
    await snap('dense-forest-256', 'overview');
    await page.evaluate(() => window.vegetation.setPose('edge'));
    report.benchmark = await page.evaluate(() => window.vegetation.benchmark(4));
    console.log('Benchmark', JSON.stringify(report.benchmark));
    for (const [index, seed] of [[1, 17], [2, 73]]) {
      console.log('Additional seed', seed); await page.evaluate(([index, seed]) => window.vegetation.load(index, seed), [index, seed]);
      report.maps.push(await page.evaluate(() => ({ label: window.vegetation.label, stats: window.vegetation.stats() })));
    }
  }
  report.final = await page.evaluate(() => window.vegetation.stats());
} finally {
  writeFileSync(smoke ? 'out/smoke.json' : 'captures/verification.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
if (errors.length) throw new Error(`${errors.length} browser errors; see capture report`);
