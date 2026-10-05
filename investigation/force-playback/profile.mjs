import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const label = process.argv[2] ?? 'before';
const local = new URL('./local/', import.meta.url);
await mkdir(local, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--renderer-process-limit=1', '--num-raster-threads=2'], ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 3 });
  localStorage.setItem('dgm.look', 'high');
  localStorage.setItem('dgm.firstRun', '["brush","force","select","save"]');
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(...args) {
      super(...args);
      this.addEventListener('message', e => {
        const p = e.data?.value?.playbackProfile;
        if (window.playback?.active && p) window.playback.worker.push({ ...p, transferMs: performance.timeOrigin + performance.now() - p.sentAt, shown: e.data.value.shown, planned: e.data.value.planned, heightBytes: e.data.value.heights?.byteLength ?? e.data.value.heightPatch?.byteLength ?? 0 });
      });
    }
  };
});
const page = await context.newPage();
const results = [];
const cases = [{ name: 'Carve', key: '7', drag: true }, { name: 'Craterize', key: '8' }, { name: 'Erupt', key: '0' }, { name: 'Quake', key: '9', drag: true, mode: 'Slide' }, { name: 'Glaciate', key: '-' }];
try {
  const cdp = await browser.newBrowserCDPSession();
  const gpu = (await cdp.send('SystemInfo.getInfo')).gpu;
  await writeFile(new URL(`${label}-gpu.json`, local), JSON.stringify(gpu, null, 2));
  if (!gpu.auxAttributes.glRenderer.includes('RTX 2070 SUPER')) throw new Error(`Unexpected GPU: ${gpu.auxAttributes.glRenderer}`);
  for (const c of cases) {
    await page.goto('about:blank');
    await page.goto('http://127.0.0.1:5299/dam-good-maps/#s=4242&z=256&d=n&t=highlands');
    await page.getByRole('button', { name: 'Refine this map' }).waitFor({ state: 'visible', timeout: 180000 });
    await page.getByRole('button', { name: 'Refine this map' }).click();
    await page.waitForFunction(() => !!window.dgmEditor && !!window.dgm3d, null, { timeout: 180000 });
    await page.getByRole('button', { name: 'Top-down', exact: true }).click();
    await page.evaluate(() => window.dgmEditor.idle());
    await page.keyboard.press(c.key);
    const row = page.getByRole('group', { name: `${c.name} options`, exact: true });
    if (c.mode) await row.getByRole('button', { name: c.mode, exact: true }).click();
    await row.getByRole('slider').evaluateAll(els => els.forEach(i => { i.value = i.max; i.dispatchEvent(new Event('input', { bubbles: true })); }));
    const spots = await page.evaluate(() => {
      const m = window.dgm3d.renderer.mapState();
      const onMap = (x, y) => { const p = window.dgmEditor.tileToClient(x, y); return document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS'; };
      let high = [50, 160], low = [200, 160], top = -1, bottom = Infinity;
      for (let y = 30; y < 226; y += 2) for (let x = 30; x < 226; x += 2) {
        if (m.surface.depth[y * m.W + x] || !onMap(x, y)) continue;
        if (m.heights[y * m.W + x] > top) { top = m.heights[y * m.W + x]; high = [x, y]; }
      }
      for (let y = 30; y < 226; y += 2) for (let x = 30; x < 226; x += 2) {
        if (m.surface.depth[y * m.W + x] || !onMap(x, y) || Math.hypot(x - high[0], y - high[1]) < 85) continue;
        if (m.heights[y * m.W + x] < bottom) { bottom = m.heights[y * m.W + x]; low = [x, y]; }
      }
      return { high, low, mid: [128, 170], look: window.dgm3d.renderer.look };
    });
    console.log(`${label} ${c.name}: ready ${JSON.stringify(spots)}`);
    await page.evaluate(() => {
      const r = window.dgm3d.renderer;
      window.playback = { active: true, main: {}, raf: [], gpu: [], queries: [], worker: [], look: r.look };
      const p = window.playback;
      for (const name of ['renderNow','flushTerrain','meshTerrain','meshWater','updateEntities','setEntitiesInner','followGround','bakeShadows']) {
        const fn = r[name];
        r[name] = function(...args) { const t = performance.now(); try { return fn.apply(this, args); } finally { if (p.active) (p.main[name] ??= []).push(performance.now() - t); } };
      }
      const gl = r.gl.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      r.beginGpuTimer = () => { if (!p.active || !ext) return null; const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT,q); return q; };
      r.endGpuTimer = q => { if(q) { gl.endQuery(ext.TIME_ELAPSED_EXT); p.queries.push(q); } };
      r.beginCost = () => null;
      r.endCost = () => {};
      let last = 0;
      const frame = t => { if (!p.active) return; if(last) p.raf.push(t-last); last=t; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      p.collect = () => { if (!ext) return; for (const q of p.queries) { if(gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(ext.GPU_DISJOINT_EXT)) p.gpu.push(gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6); gl.deleteQuery(q); } p.queries=[]; };
    });
    const from = c.name === 'Quake' ? [90,170] : c.drag ? spots.high : c.name === 'Glaciate' ? spots.high : spots.mid;
    const to = c.name === 'Quake' ? [166,194] : spots.low;
    const a = await page.evaluate(at => window.dgmEditor.tileToClient(...at), from);
    if(c.drag) {
      const b = await page.evaluate(at => window.dgmEditor.tileToClient(...at), to);
      await page.mouse.move(a.x,a.y); await page.mouse.down();
      for(let k=1;k<=12;k++) await page.mouse.move(a.x+(b.x-a.x)*k/12,a.y+(b.y-a.y)*k/12);
      await page.mouse.up();
    } else await page.mouse.click(a.x,a.y);
    await page.waitForFunction(() => (window.dgmEditor.forceTiming()?.kept ?? 0) > 0, null, { timeout: 180000 });
    await page.evaluate(() => { window.playback.active=false; });
    await page.waitForTimeout(250);
    const raw = await page.evaluate(() => { const p=window.playback; p.collect(); return { main:p.main, raf:p.raf, gpu:p.gpu, worker:p.worker, look:p.look, timing:window.dgmEditor.forceTiming(), dimensions:[window.dgmEditor.info().W,window.dgmEditor.info().H] }; });
    await writeFile(new URL(`${label}-${c.name.toLowerCase()}.json`,local),JSON.stringify(raw));
    const pct = (a,q) => a.length ? [...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*q))] : null;
    const planned = raw.worker.filter(w=>w.planned);
    const result = { force:c.name, look:raw.look, dimensions:raw.dimensions, frameP95:pct(raw.raf,.95), frameP50:pct(raw.raf,.5), mainP95:pct(raw.main.renderNow ?? [],.95), gpuP95:pct(raw.gpu,.95), workerP95:pct(planned.map(w=>w.workerMs),.95), transferP95:pct(planned.map(w=>w.transferMs),.95), mainTotal:Object.fromEntries(Object.entries(raw.main).map(([k,a])=>[k,{calls:a.length,ms:a.reduce((s,v)=>s+v,0)}])), timing:raw.timing };
    results.push(result); console.log(JSON.stringify(result));
    await writeFile(new URL(`${label}-summary.json`,local),JSON.stringify(results,null,2));
  }
} catch(e) { await page.screenshot({path:new URL(`${label}-failure.png`,local).pathname.replace(/^\/(?=[A-Z]:)/,'')}).catch(()=>{}); console.error(String(e)); process.exitCode=1; }
finally { await browser.close(); }
