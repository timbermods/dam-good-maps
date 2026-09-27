import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { openDemo } from './browser.mjs';
import { measureColour, assertColour } from './colour.mjs';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync('local', { recursive: true });
const { browser, page, errors } = await openDemo();
const views = [[0, 'overview', 'overview-128'], [0, 'cliff', 'cliff'], [0, 'forest', 'forest-edge'], [0, 'shore', 'riverbank'], [0, 'contaminated', 'contaminated-ground'], [1, 'overview', 'overview-256'], [12, 'falls', 'real-victoria'], [13, 'cliff', 'real-yosemite'], [14, 'overview', 'real-danube']];
const report = { date: new Date().toISOString(), renderer: await page.evaluate(() => window.maplook3.standard.gpu()), views: [], errors };
try {
  let loaded = 0;
  for (const [index, pose, name] of views) {
    if (index !== loaded) { await page.evaluate(i => window.maplook3.load(i), index); loaded = index; }
    await page.evaluate(p => { const a = window.maplook3; a.all(true); a.setPose(p); a.freeze(); }, pose);
    const colour = await measureColour(page);
    report.views.push({ name, colour });
    console.log(name, Object.fromEntries(Object.entries(colour).map(([region, c]) => [region, Object.fromEntries(Object.entries(c.ratio).map(([m, v]) => [m, +v.toFixed(4)]))])));
    if (process.argv.includes('--capture')) await page.locator('#comparison').screenshot({ path: `local/colour-${name}.jpg`, type: 'jpeg', quality: 85 });
  }
  assert.deepEqual(errors, []);
  if (!process.argv.includes('--baseline')) for (const { name, colour } of report.views) assertColour(colour, name);
} finally {
  writeFileSync('local/colour.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
