import { readFileSync, writeFileSync } from 'node:fs';
import { SketchJob, install } from './engine';
import { fromTimber } from './maps';
const dir = process.env.DAM_SKETCH_DIR ?? process.cwd();
install(readFileSync(dir + '/local/water.wasm'));
const full = JSON.parse(readFileSync(dir + '/benchmarks.json', 'utf8')), rows: any[] = [];
const median = (a: number[]) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
for (const c of full.cases) {
  const map = fromTimber(readFileSync(dir + '/local/maps/' + c.map + '.timber'), c.map), samples = [];
  for (let rep = 0; rep < 4; rep++) {
    const t0 = performance.now(), job = new SketchJob(map, c.strokes), constructMs = performance.now() - t0;
    const slices = [];
    for (let k = 0; k < 12; k++) { const t = performance.now(); job.advance(8); slices.push(performance.now() - t); }
    if (rep) samples.push({ constructMs, firstPreviewMs: constructMs + slices[0], sliceMedianMs: median(slices), sliceMaxMs: Math.max(...slices) });
    job.cancel();
  }
  rows.push({ map: c.map, case: c.case, size: c.size, samples });
}
const summary = { scope: 'Same actual maps and 12 strokes as benchmarks.json. First 96 ticks only; 8-tick publications. One warm-up, three fresh repetitions. Node Wasm; shared host load uncontrolled.',
  bySize: [128, 256].map(size => {
    const samples = rows.filter(r => r.size === size).flatMap(r => r.samples);
    return { size, slice8TicksMedianMs: median(samples.map(s => s.sliceMedianMs)),
      sliceWorstMs: Math.max(...samples.map(s => s.sliceMaxMs)),
      newSketchFirstPreviewMedianMs: median(samples.map(s => s.firstPreviewMs)) };
  }), cases: rows };
writeFileSync(dir + '/live-benchmarks.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary.bySize, null, 2));
