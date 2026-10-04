// Static, headless demo: actual generated maps, explicitly drawn walls, no reservoir finder.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cpus, platform, arch } from 'node:os';
import { generate } from '../../src/core/gen/generate';
import { makeSpec } from '../../src/core/spec/mapspec';
import { fromTimber } from './maps';
import { SketchJob, install, type Result, type WeatherInput, type MapSnapshot } from './engine';
import type { Stroke } from './wall';
const dir = process.env.DAM_SKETCH_DIR ?? process.cwd();
mkdirSync(dir + '/local/maps', { recursive: true }); install(readFileSync(dir + '/local/water.wasm'));
const rows: any[] = [], panels: { map: MapSnapshot; row: any; filled: Result }[] = [];
function compact(r: Result) {
  return { phase: r.phase, backend: r.backend, fill: r.fill, runtimeMs: r.runtimeMs,
    totalWaterM3: r.totalWaterM3, controlWaterM3: r.controlWaterM3, additionalWaterM3: r.additionalWaterM3,
    reservoirs: r.reservoir.map(p => ({ tiles: p.tiles.length, volumeM3: p.volumeM3, surfaceRange: p.surfaceRange })),
    pieces: r.wall.counts, floods: { all: r.floods.all.length, newly: r.floods.newly.length,
      start: r.floods.start.length, farmland: r.floods.farmland?.length ?? null, objects: r.floods.objects.length },
    conflicts: r.conflicts.length, drought: r.drought };
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
for (const size of [128, 256]) {
  // Fixed, authored coordinates. Nothing searches the terrain for a beneficial wall.
  const cx = Math.floor(size * .55), y0 = Math.floor(size * .25), y1 = Math.floor(size * .75);
  const cases: { name: string; strokes: Stroke[] }[] = [
    { name: 'one dam across the valley', strokes: [{ path: [[cx, y0], [cx, y1]], stack: [{ kind: 'dam' }] }] },
    { name: 'three levees and a dam; a bent wall', strokes: [{ path: [[cx, y0], [cx, Math.floor(size / 2)],
      [cx + 4, Math.floor(size / 2) + 4], [cx + 4, y1]],
      stack: [{ kind: 'levee' }, { kind: 'levee' }, { kind: 'levee' }, { kind: 'dam' }] }] },
    { name: 'levee with a two-level gate at 1.5', strokes: [
      { path: [[cx, y0], [cx, Math.floor(size / 2) - 1]], stack: [{ kind: 'levee' }, { kind: 'levee' }] },
      { path: [[cx, Math.floor(size / 2)]], stack: [{ kind: 'floodgate', maxHeight: 2, height: 1.5 }] },
      { path: [[cx, Math.floor(size / 2) + 1], [cx, y1]], stack: [{ kind: 'levee' }, { kind: 'levee' }] }] }
  ];
  for (const theme of ['riverValley', 'lakeBasin'] as const) {
    const name = theme + '-' + size + '-4242', path = dir + '/local/maps/' + name + '.timber';
    let bytes: Uint8Array;
    try { bytes = readFileSync(path); }
    catch {
      console.log('Generating ' + name);
      const result = generate(makeSpec({ seed: 4242, theme, size: { x: size, y: size }, designedFor: 'normal' }));
      bytes = result.bytes; writeFileSync(path, bytes);
    }
    const map = fromTimber(bytes, name);
    const weather: WeatherInput = { provenance: 'Explicit Normal full-strength nine-day drought scenario; notes Q7. Map has no future schedule.',
      frames: [{ ticks: 9 * 768, kind: 'drought', strengths: map.model.emitters.map(() => 0),
        contamination: map.model.emitters.map(e => e.contamination) }] };
    for (const c of cases) {
      console.log('Sketch ' + name + ': ' + c.name);
      const samples: any[] = []; let filled!: Result, final!: Result;
      // One warm-up + three fresh measurements. Each starts from the same actual map water.
      for (let rep = 0; rep < 4; rep++) {
        const start = performance.now(), job = new SketchJob(map, c.strokes, weather);
        const constructMs = performance.now() - start;
        const previewStart = performance.now(), first = job.advance(16), previewMs = performance.now() - previewStart;
        let r = first; const previewTicks = [previewMs];
        while (r.phase === 'filling') {
          const t = performance.now(); r = job.advance(16); previewTicks.push(performance.now() - t);
        }
        filled = r; const fillMs = performance.now() - start;
        const droughtStart = performance.now();
        while (r.phase === 'weather') r = job.advance(128);
        final = r;
        if (rep) samples.push({ constructMs, previewMs, sliceMedianMs: median(previewTicks),
          sliceMaxMs: Math.max(...previewTicks), fillMs, droughtMs: performance.now() - droughtStart, totalMs: performance.now() - start });
        const fingerprint = JSON.stringify([r.totalWaterM3, r.fill, r.drought, r.reservoir.map(p => p.volumeM3)]);
        if (rep && samples[0].fingerprint && samples[0].fingerprint !== fingerprint) throw Error('Repeat changed result');
        samples[samples.length - 1] && (samples[samples.length - 1].fingerprint = fingerprint);
        job.dispose();
      }
      const row = { map: name, size, case: c.name, inputSha256: createHash('sha256').update(bytes).digest('hex'),
        strokes: c.strokes, samples: samples.map(({ fingerprint, ...sample }) => sample),
        fill: compact(filled), final: compact(final) };
      rows.push(row); console.log(JSON.stringify({ map: name, case: c.name, fillMs: median(samples.map(s => s.fillMs)),
        sliceMs: median(samples.map(s => s.sliceMedianMs)), addedM3: filled.additionalWaterM3, capped: filled.fill.capped }));
      writeFileSync(dir + '/local/demo-results.json', JSON.stringify(rows, null, 2));
      panels.push({ map, row, filled });
    }
  }
}
function median(v: number[]) { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
const summary = {
  environment: { cpu: cpus()[0].model, platform: platform(), arch: arch(), node: process.version,
    measurements: 'One warm-up, three fresh repetitions; concurrent machine load uncontrolled; Node Wasm, not browser.',
    timingScope: 'Constructor + paired wall/control physics + reports. Source preparation and map generation excluded.' },
  cases: rows, bySize: [128, 256].map(size => {
    const group = rows.filter(r => r.size === size);
    return { size, first16TicksMedianMs: median(group.flatMap(r => r.samples.map((s: any) => s.previewMs))),
      slice16TicksMedianMs: median(group.flatMap(r => r.samples.map((s: any) => s.sliceMedianMs))),
      worstSliceMs: Math.max(...group.flatMap(r => r.samples.map((s: any) => s.sliceMaxMs))),
      fillMedianMs: median(group.flatMap(r => r.samples.map((s: any) => s.fillMs))),
      drought9DaysMedianMs: median(group.flatMap(r => r.samples.map((s: any) => s.droughtMs))) };
  })
};
writeFileSync(dir + '/benchmarks.json', JSON.stringify(summary, null, 2) + '\n');
// Small self-contained visual demo; large maps never enter git.
const data = panels.map(({ map, row, filled }) => ({
  title: map.name + ' · ' + row.case, W: map.model.W, H: map.model.H,
  floor: [...map.model.floor], baselineWet: [...map.water.depth].map(d => d > 0 ? 1 : 0),
  floods: filled.floods.all, newly: filled.floods.newly, wall: filled.wall.tiles, start: map.startTiles,
  objects: filled.floods.objects.flatMap(o => o.tiles), summary: row.fill, drought: row.final.drought
}));
writeFileSync(dir + '/local/demo.html', `<!doctype html><meta charset="utf-8"><title>Dam sketch engine</title>
<style>body{background:#142425;color:#e5eee9;font:16px system-ui;margin:32px}h1{font-size:25px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:24px}
article{background:#233736;padding:20px;border-radius:10px}canvas{width:100%;image-rendering:pixelated}
pre{white-space:pre-wrap;font-size:13px}small{color:#b1c5bd}</style>
<h1>Drawn walls, simulated water</h1><p>Fixed sketches on actual generated maps. No site suggestions.</p>
<p><small>Blue: simulated water · cyan: newly flooded · orange: the drawn wall · red: flooded objects · yellow: start.
Farmland is unknown in these map files. Drought is an explicit nine-day scenario, not a forecast.</small></p><div class="grid" id="grid"></div>
<script>const panels=${JSON.stringify(data).replaceAll('<', '\\u003c')};
for(const p of panels){const a=document.createElement('article'),h=document.createElement('h2');h.textContent=p.title;a.append(h);
const c=document.createElement('canvas');c.width=p.W;c.height=p.H;const ctx=c.getContext('2d'),im=ctx.createImageData(p.W,p.H);
for(let i=0;i<p.floor.length;i++){const v=50+p.floor[i]*8;im.data.set([v*.65,v,v*.8,255],i*4)}
const paint=(list,color)=>{for(const i of list)im.data.set([...color,255],i*4)};
paint(p.floods,[32,114,161]);paint(p.newly,[74,200,209]);paint(p.objects,[230,92,88]);paint(p.wall,[234,152,62]);paint(p.start,[255,232,123]);ctx.putImageData(im,0,0);a.append(c);
const pre=document.createElement('pre');pre.textContent=JSON.stringify({...p.summary,drought:p.drought},null,2);a.append(pre);grid.append(a)}</script>`);
console.log(JSON.stringify(summary.bySize, null, 2));
console.log('Demo: ' + dir + '/local/demo.html');
