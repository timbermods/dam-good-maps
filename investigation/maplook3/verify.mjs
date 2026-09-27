import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { openDemo } from './browser.mjs';
import { measureColour, assertColour } from './colour.mjs';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync('captures', { recursive: true });
mkdirSync('local', { recursive: true });
const { browser, page, errors } = await openDemo();
const report = { date: new Date().toISOString(), renderer: await page.evaluate(() => window.maplook3.standard.gpu()), maps: [], captures: [], checks: {}, errors };
try {
  console.log('Renderer', report.renderer);
  assert.equal(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.length - new Set(ids).size; }), 0, 'Duplicate HTML ids');
  if (process.argv.includes('--smoke')) {
    await page.screenshot({ path: 'local/smoke.jpg', type: 'jpeg', quality: 83 });
    console.log(await page.locator('#status').textContent());
  } else {
    report.checks.parity = await page.evaluate(() => {
      const a = window.maplook3; a.all(false); a.freeze();
      function pixels(r) { r.renderNow(); const gl = r.canvas.getContext('webgl2'); const p = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; }
      const left = pixels(a.standard), right = pixels(a.high); let different = 0, max = 0;
      for (let i = 0; i < left.length; i++) { if (left[i] !== right[i]) different++; max = Math.max(max, Math.abs(left[i] - right[i])); }
      a.all(true); a.freeze(); return { channels: left.length, different, max };
    });
    console.log('Parity', report.checks.parity);
    assert.equal(report.checks.parity.different, 0, 'Disabled High must exactly match Standard');
    report.checks.toggles = await page.evaluate(() => {
      const a = window.maplook3; a.setPose('cliff');
      function hash(r) { r.renderNow(); const g = r.canvas.getContext('webgl2'); const p = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4); g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, p); let h = 2166136261; for (const v of p) h = Math.imul(h ^ v, 16777619); return h >>> 0; }
      const out = []; a.all(true); a.freeze(); const baseline = { high: hash(a.high), standard: hash(a.standard) };
      for (const name of Object.keys(a.flags).filter(k => !['specimens', 'wind'].includes(k))) { a.setEffects({ [name]: false }); a.freeze(); out.push({ name, high: hash(a.high), standard: hash(a.standard) }); a.setEffects({ [name]: true }); }
      return { baseline, off: out };
    });
    for (const t of report.checks.toggles.off) { assert.equal(t.standard, report.checks.toggles.baseline.standard, `${t.name} touched Standard`); assert.notEqual(t.high, report.checks.toggles.baseline.high, `${t.name} has no visible effect`); }
    const box = await page.locator('#high').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 + 20, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(200);
    report.checks.cameraSync = await page.evaluate(() => JSON.stringify(window.maplook3.standard.getView()) === JSON.stringify(window.maplook3.high.getView()));
    assert.ok(report.checks.cameraSync);
    const left = await page.locator('#standard').boundingBox();
    await page.mouse.move(left.x + left.width / 2, left.y + left.height / 2); await page.mouse.down();
    await page.mouse.move(left.x + left.width / 2 - 45, left.y + left.height / 2 + 15, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(200);
    report.checks.cameraSyncReverse = await page.evaluate(() => JSON.stringify(window.maplook3.standard.getView()) === JSON.stringify(window.maplook3.high.getView()));
    assert.ok(report.checks.cameraSyncReverse);
    await page.mouse.move(5, 5);
    await page.evaluate(() => document.activeElement?.blur());
    report.checks.vegetation = await page.evaluate(() => {
      const a = window.maplook3;
      function hash() { a.high.renderNow(); const canvas = document.getElementById('trees'); const g = canvas.getContext('webgl2'); const p = new Uint8Array(g.drawingBufferWidth * g.drawingBufferHeight * 4); g.readPixels(0, 0, g.drawingBufferWidth, g.drawingBufferHeight, g.RGBA, g.UNSIGNED_BYTE, p); let h = 2166136261; for (const v of p) h = Math.imul(h ^ v, 16777619); return h >>> 0; }
      a.all(true); a.freeze(8); const wind8 = hash(); a.freeze(11); const wind11 = hash();
      a.setEffects({ wind: false }); a.freeze(8); const still8 = hash(); a.freeze(11); const still11 = hash();
      a.setEffects({ specimens: false }); const hidden = document.getElementById('specimen-panel').hidden;
      a.all(true); a.freeze(); return { triangles: a.vegetation.triangles, wind8, wind11, still8, still11, hidden };
    });
    assert.notEqual(report.checks.vegetation.wind8, report.checks.vegetation.wind11);
    assert.equal(report.checks.vegetation.still8, report.checks.vegetation.still11);
    assert.ok(report.checks.vegetation.hidden);
    async function capture(name, kind) {
      const found = await page.evaluate(kind => { const a = window.maplook3; a.all(true); const p = a.setPose(kind); a.freeze(); return p; }, kind);
      assert.ok(found, `Missing ${kind}`);
      await page.waitForTimeout(150);
      await page.locator('#comparison').screenshot({ path: `captures/${name}.jpg`, type: 'jpeg', quality: 78 });
      const colour = await measureColour(page);
      report.captures.push({ file: `${name}.jpg`, camera: await page.evaluate(() => window.maplook3.standard.getView()), colour });
      assertColour(colour, name);
      console.log('Captured', name, 'map brightness / saturation vs Standard:', colour.map.ratio.brightness.toFixed(3), colour.map.ratio.saturation.toFixed(3));
    }
    for (const [name, kind] of [['overview-128', 'overview'], ['cliff', 'cliff'], ['forest-edge', 'forest'], ['riverbank', 'shore'], ['contaminated-ground', 'contaminated']]) await capture(name, kind);
    await page.screenshot({ path: 'captures/demo.jpg', type: 'jpeg', quality: 76 });
    await page.locator('#specimen-panel').screenshot({ path: 'captures/vegetation.jpg', type: 'jpeg', quality: 90 });
    for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      if (index) await page.evaluate(i => window.maplook3.load(i), index);
      const entry = await page.evaluate(() => { const a = window.maplook3; a.freeze(); return { label: a.label, W: a.map.W, H: a.map.H, objects: a.map.entities.count, ...a.lighting.stats, water: a.map.water.count }; });
      report.maps.push(entry); console.log('Loaded', index, entry);
      if (index === 1) await capture('overview-256', 'overview');
      if (index === 12) await capture('real-victoria', 'falls');
      if (index === 13) await capture('real-yosemite', 'cliff');
      if (index === 14) await capture('real-danube', 'overview');
    }
  }
  assert.deepEqual(errors, [], 'Browser/shader errors');
} finally {
  writeFileSync(process.argv.includes('--smoke') ? 'local/smoke.json' : 'captures/verification.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
