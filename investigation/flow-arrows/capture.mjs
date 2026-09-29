import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('captures', { recursive: true });
await mkdir('local', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { window.dgmLookTest = { gpu: true }; });
try {
  await page.goto('http://127.0.0.1:5184/');
  await page.waitForFunction(() => window.flowDemo?.ready, null, { timeout: 120000 });
  if (await page.locator('#toggle').isChecked()) throw new Error('Toggle must default off');
  await page.locator('#toggle').check();
  const fields = await page.evaluate(async () => {
    const { arrowGeometry } = await import('/arrows.ts');
    const W = 16, N = W * W;
    const water = { count: N, tile: Int32Array.from({length:N}, (_,i)=>i), floor: new Float32Array(N).fill(1), depth: new Float32Array(N).fill(1), contamination: new Float32Array(N) };
    const v = { W, H: W, water };
    const still = arrowGeometry(v);
    const stillCount = still.count; still.geometry.dispose();
    for (let i=0;i<N;i++) water.depth[i] = 1 + (i%W)*.002;
    const west = arrowGeometry(v);
    const westOK = west.count > 0 && west.velocity.every((n,i) => i%2 ? Math.abs(n)<.001 : n<0);
    west.geometry.dispose();
    for (let i=0;i<N;i++) water.depth[i] = 1 + (W-1-i%W)*.002;
    const east = arrowGeometry(v);
    const eastOK = east.count > 0 && east.velocity.every((n,i) => i%2 ? Math.abs(n)<.001 : n>0);
    east.geometry.dispose();
    return { stillCount, westOK, eastOK };
  });
  if (fields.stillCount !== 0 || !fields.westOK || !fields.eastOK) throw new Error('Still/reversed slope checks failed');
  const rows = [];
  for (const [name, map, close] of [['river-overview','riverValley',false],['delta-split','delta',false],['close-view','riverValley',true]]) {
    if (await page.locator('#map').inputValue() !== map) {
      const rev = await page.evaluate(() => window.flowDemo.revision);
      await page.locator('#map').selectOption(map);
      await page.waitForFunction(r => window.flowDemo.revision > r, rev);
    }
    if (close) await page.locator('#close').click();
    else await page.locator('#overview').click();
    if (map === 'delta') await page.evaluate(() => window.flowDemo.renderer.setView({ target: [105, 7, -53], distance: 100 }));
    const panels = [];
    for (const look of ['high','standard']) {
      await page.locator('#look').selectOption(look);
      await page.waitForFunction(() => window.flowDemo.renderer.highSettled, null, { timeout: 120000 });
      await page.waitForTimeout(700);
      await page.evaluate(() => { window.flowDemo.renderer.setClock(12.5); window.flowDemo.renderer.renderNow(); });
      const state = await page.evaluate(() => ({ count: window.flowDemo.count, look: window.flowDemo.renderer.look, vertices: window.flowDemo.arrows.geometry.attributes.position.count }));
      if (!state.count || state.look !== look) throw new Error(`Bad rendered state ${JSON.stringify(state)}`);
      rows.push({ name, ...state });
      const file = `local/${name}-${look}.png`;
      await page.screenshot({ path: file });
      panels.push(await sharp(file).resize(864,600).png().toBuffer());
    }
    await sharp({ create: { width: 1728, height: 600, channels: 3, background: '#26312f' } })
      .composite(panels.map((input, i) => ({ input, left: i*864, top: 0 }))).jpeg({ quality: 85 }).toFile(`captures/${name}.jpg`);
  }
  // One bounded smoke check of the actual edited fixture, camera/toggle retained, then undo.
  const before = await page.evaluate(() => ({ depth: Array.from(window.flowDemo.current.water.depth), positions: Array.from(window.flowDemo.arrows.geometry.attributes.position.array), view: window.flowDemo.renderer.getView(), revision: window.flowDemo.revision }));
  await page.locator('#edit').click();
  const after = await page.evaluate(() => ({ depth: Array.from(window.flowDemo.current.water.depth), positions: Array.from(window.flowDemo.arrows.geometry.attributes.position.array), view: window.flowDemo.renderer.getView(), revision: window.flowDemo.revision, visible: window.flowDemo.arrows.visible }));
  if (JSON.stringify(before.positions) === JSON.stringify(after.positions)) throw new Error('Arrows did not update');
  if (JSON.stringify(before.depth) === JSON.stringify(after.depth) || before.revision + 1 !== after.revision || !after.visible || JSON.stringify(before.view) !== JSON.stringify(after.view)) throw new Error('Edit update check failed');
  await page.locator('#edit').click();
  await page.locator('#toggle').uncheck();
  if (await page.evaluate(() => window.flowDemo.arrows.visible)) throw new Error('Toggle off failed');
  if (errors.length) throw new Error(errors.join('\n'));
  await writeFile('local/smoke.json', JSON.stringify({ rows, fields, editUpdate: true, defaultOff: true, toggleOff: true, errors }, null, 2));
  console.log(JSON.stringify(rows, null, 2));
} finally { await browser.close(); }
