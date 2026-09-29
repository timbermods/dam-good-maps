import { writeFileSync } from 'node:fs';
import { generate } from '../../src/core/gen/generate';
import { buildMap } from '../../src/core/features/build';
import { makeSpec } from '../../src/core/spec/mapspec';
import { emptyColumns, entityView, soilView, waterFromDepth, surfaceWater } from '../../src/render3d/model';
import { settledVelocity } from './flow';
import { lifeOf, variantOf } from '../../src/worker/api';

function view(b: any) {
  if (!b.settle.out) throw new Error('Canonical settle did not retain outflows');
  return { W: b.W, H: b.H, heights: b.heights, columns: emptyColumns(),
    water: waterFromDepth(b.heights, b.water, b.contamination),
    flow: { source: 'canonical-settle.out' as const, out: b.settle.out.slice(), depth: b.settle.depth.slice() },
    entities: entityView(b.entities.map((e: any) => ({ ...e, ...lifeOf(e.components), ...variantOf(e.components) }))),
    soil: soilView(b.moisture, b.soilContamination) };
}
const encode = (_: string, v: any) => ArrayBuffer.isView(v) ? Array.from(v as any) : v;
for (const [theme, seed] of [['riverValley', 4242], ['delta', 5]] as const) {
  console.log(`Generating ${theme} 128 x 128, seed ${seed}`);
  const spec = makeSpec({ theme, seed, size: { x: 128, y: 128 } });
  if (theme === "delta") spec.settings.hazards.badwater = "off";
  const r = generate(spec);
  if (!r.report.passed) throw new Error(`${theme} failed generation`);
  console.log(r.spec.theme, r.spec.settings.water.riverStyle, r.features.filter(f => f.kind === "river").map(f => f.id));
  writeFileSync(`local/${theme}-features.json`, JSON.stringify(r.features, null, 2));
  const original = view(r.built);
  const sw = surfaceWater(128, 128, original.water);
  const flow = settledVelocity(128, 128, original.flow)!;
  // Pick an interior moving-water tile near the map centre; a real 5 x 5 bed-lowering edit.
  let at = -1, best = Infinity;
  for (let y = 12; y < 116; y++) for (let x = 12; x < 116; x++) {
    const i = y * 128 + x;
    const d = Math.hypot(x - 64, y - 64);
    if (sw.depth[i] > .3 && Math.hypot(flow[i*2], flow[i*2+1]) > 1 && d < best) { at = i; best = d; }
  }
  if (at < 0) throw new Error('No moving water for edit');
  const x = at % 128, y = Math.floor(at / 128);
  const edited = view(buildMap({ W: 128, H: 128, seed, features: r.features,
    sculpts: [{ params: { mode: 'lower', amount: 2, cells: Array.from({ length: 5 }, (_, k) => [y - 2 + k, x - 2, x + 2] as [number, number, number]) } }] }));
  writeFileSync(`local/${theme}.json`, JSON.stringify({ theme, seed, edit: { x, y, description: 'Lower a 5 x 5 riverbed patch by two blocks' }, original, edited }, encode));
  console.log(`${theme}: ${original.water.count} wet tiles; edit at ${x},${y}`);
}
