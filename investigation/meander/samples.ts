import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { generate } from '../../src/core/gen/generate';
import { makeSpec } from '../../src/core/spec/mapspec';
import { fullMap, plainEntities } from '../../src/core/forces/force';
import { river } from './meander';
mkdirSync('maps', { recursive: true });
for (const [name, theme, seed, style] of [['young', 'riverValley', 1, 'straight'], ['narrow', 'canyon', 9, 'straight'], ['long', 'canyon', 5, 'straight']] as const) {
  if (process.argv[3] && process.argv[3] !== name)
    continue;
  const spec = makeSpec({ theme, seed, size: { x: 128, y: 128 } });
  spec.settings.water.riverStyle = style;
  const t = performance.now(), g = generate(spec), b = g.built;
  const m = fullMap({ W: b.W, H: b.H, maxHeight: 22, heights: b.heights, entities: plainEntities(b.entities), water: { depth: b.water, contamination: b.contamination } });
  // Whole-map elevation translation, documented in fixture provenance. The existing river and
  // its sources are unchanged horizontally; +3 leaves room for Floor 1 to move its bed.
  const rise = 3;
  for (let i = 0; i < m.heights.length; i++)
    m.heights[i] += rise;
  for (const e of m.entities) {
    e.z += rise;
    delete e.raw;
  }
  const r = river(m);
  const json = { source: { generator: 'Dam Good Maps', base: '9e14f189', spec, elevationTranslation: rise }, ...m, heights: [...m.heights], lava: [...m.lava], water: { depth: [...m.water.depth], contamination: [...m.water.contamination] } };
  writeFileSync(`maps/${name}.json.gz`, gzipSync(JSON.stringify(json), { level: 9 }));
  console.log(name, 'passed', g.report.passed, 'ms', Math.round(performance.now() - t), 'river', r.path.length, 'width', r.width, 'beds', [...new Set(r.path.map(p => m.heights[Math.round(p.y) * 128 + Math.round(p.x)]))]);
}
