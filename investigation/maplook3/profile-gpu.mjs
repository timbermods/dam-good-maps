// Fine-grained costs: paired, repeated GPU workloads. These are NOT FPS measurements.
// Batching reduces query scheduling noise and desktop GPU clock changes at idle.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDemo } from './browser.mjs';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync('captures', { recursive: true });
const { browser, page, errors } = await openDemo();
const report = { date: new Date().toISOString(), method: 'Static overview, 32 draws per GPU query; 4 warm pairs and 12 measured alternating full/off pairs per effect. Times divided by 32. Specimens separately profiled on their own context. No FPS inferred from these batched workloads.', renderer: await page.evaluate(() => window.maplook3.standard.gpu()), maps: [], errors };
try {
  for (const index of [0, 1]) {
    if (index) await page.evaluate(i => window.maplook3.load(i, 4242, true), index);
    const result = await page.evaluate(async () => {
      const a = window.maplook3; a.setPose('overview'); a.freeze();
      const frame = () => new Promise(r => requestAnimationFrame(r));
      const median = v => [...v].sort((a,b) => a-b)[Math.floor(v.length / 2)];
      // Investigation-only access, like base-effects.ts's private-field bridge.
      const gl = a.high.gl.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      if (!ext) throw new Error('GPU profiling requires EXT_disjoint_timer_query_webgl2');
      async function sample(context, extension, draw) {
        await frame();
        const q = context.createQuery(); context.beginQuery(extension.TIME_ELAPSED_EXT, q);
        for (let i = 0; i < 32; i++) draw();
        context.endQuery(extension.TIME_ELAPSED_EXT); context.flush();
        for (let wait = 0; wait < 120; wait++) {
          await frame();
          if (context.getQueryParameter(q, context.QUERY_RESULT_AVAILABLE)) {
            const valid = !context.getParameter(extension.GPU_DISJOINT_EXT);
            const value = context.getQueryParameter(q, context.QUERY_RESULT) / 1e6 / 32;
            context.deleteQuery(q); if (!valid) throw new Error('Disjoint GPU sample; rerun when idle'); return value;
          }
        }
        context.deleteQuery(q); throw new Error('GPU timer did not settle');
      }
      const effects = [];
      for (const key of ['water', 'shadows', 'sunlight', 'ao', 'tone', 'grade', 'haze', 'sky', 'strata', 'blend', 'variation', 'finish-pass']) {
        const on = [], off = [], differences = [];
        for (let k = 0; k < 16; k++) {
          const samples = {};
          for (const enabled of (k % 2 ? [false,true] : [true,false])) {
            a.all(true); a.setEffects({ specimens: false });
            if (!enabled) a.setEffects(key === 'finish-pass' ? { tone: false, grade: false } : { [key]: false });
            samples[enabled ? 'on' : 'off'] = await sample(gl, ext, () => a.high.renderNow());
          }
          if (k >= 4) { on.push(samples.on); off.push(samples.off); differences.push(samples.on - samples.off); }
        }
        effects.push({ effect: key, onP50: median(on), offP50: median(off), deltaP50: median(differences), deltaMin: Math.min(...differences), deltaMax: Math.max(...differences) });
      }
      a.all(true); a.freeze();
      const vg = a.vegetation.context(), ve = vg.getExtension('EXT_disjoint_timer_query_webgl2');
      const tree = [], windOff = [];
      if (!ve) throw new Error('No specimen GPU timer');
      for (let i = 0; i < 16; i++) {
        a.vegetation.wind = true; const on = await sample(vg, ve, () => a.vegetation.render(8));
        a.vegetation.wind = false; const off = await sample(vg, ve, () => a.vegetation.render(8));
        if (i >= 4) { tree.push(on); windOff.push(off); }
      }
      a.vegetation.wind = true;
      return { W: a.map.W, H: a.map.H, effects, specimenGpuP50: median(tree), specimenWithoutWindGpuP50: median(windOff), specimenTriangles: a.vegetation.triangles };
    });
    report.maps.push(result); console.log(JSON.stringify(result, null, 2));
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally { writeFileSync('captures/gpu-profile.json', JSON.stringify(report, null, 2) + '\n'); await browser.close(); }
