import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cpus, totalmem, platform, release } from 'node:os';
import { openDemo } from './browser.mjs';
process.chdir(fileURLToPath(new URL('.', import.meta.url)));
mkdirSync('captures', { recursive: true });
const { browser, page, errors } = await openDemo();
const overviewOnly = process.argv.includes('--overview-only');
const report = {
  date: new Date().toISOString(), browser: browser.version(),
  gpu: await page.evaluate(() => window.maplook3.standard.gpu()),
  cpu: cpus()[0].model, logicalCores: cpus().length, memoryGiB: totalmem() / 2 ** 30, os: `${platform()} ${release()}`,
  viewport: { width: 1440, height: 980 }, dpr: 1,
  scope: overviewOnly ? 'Mode cadence after grade-only revision; per-effect GPU costs in gpu-profile.json.' : 'Modes and individual effect switches.',
  method: '700 ms warm-up then 2200 ms orbit per case; two rounds in opposite order. rAF presentation cadence, gl.finish completion wall time, and EXT_disjoint_timer_query_webgl2 GPU elapsed time (each context separately, summed for High and both). Disjoint results discarded. Both panes use the same dimensions. No synthetic FPS extrapolation. UI specimen included in High; map generation excluded.',
  maps: [], errors,
};
try {
  for (const index of [0, 1]) {
    if (index) await page.evaluate(i => window.maplook3.load(i, 4242, true), index);
    await page.evaluate(() => { window.maplook3.setPose('overview'); window.maplook3.freeze(); });
    const entry = await page.evaluate(() => { const a = window.maplook3; const e = a.map.entities; let trees = 0; for (let k = 0; k < e.count; k++) if (/^(Pine|Birch|Oak)/.test(e.templates[e.template[k]])) trees++; return { label: a.label, W: a.map.W, H: a.map.H, objects: e.count, totalTrees: trees, ambient: a.lighting.stats, samples: [] }; });
    report.maps.push(entry);
    const effects = ['sunlight', 'ao', 'tone', 'grade', 'haze', 'sky', 'strata', 'blend', 'variation', 'specimens', 'wind'];
    const cases = overviewOnly ? ['standard', 'full', 'both'] : ['standard', 'foundation', 'full', 'both', ...effects.map(k => `without-${k}`)];
    for (let round = 0; round < 2; round++) for (const name of (round ? [...cases].reverse() : cases)) {
      const result = await page.evaluate(async ({ name }) => {
        const a = window.maplook3; a.all(true);
        if (name === 'foundation') { a.all(false); a.setEffects({ water: true, shadows: true }); }
        if (name.startsWith('without-')) a.setEffects({ [name.slice(8)]: false });
        return a.measure(name === 'standard' ? 'standard' : name === 'both' ? 'both' : 'high');
      }, { name });
      entry.samples.push({ name, round, ...result });
      console.log(`${entry.W}² ${round + 1} ${name}: ${result.fps.toFixed(1)} fps, ${result.gpuP50?.toFixed(3)} ms GPU p50, ${result.gpuP95?.toFixed(3)} ms GPU p95`);
      writeFileSync('captures/performance.json', JSON.stringify(report, null, 2) + '\n');
    }
    await page.evaluate(() => { const a = window.maplook3; a.all(true); a.setPose('forest'); });
    entry.closeUp = await page.evaluate(() => window.maplook3.measure('high'));
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  writeFileSync('captures/performance.json', JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
