// Execute M9b's unchanged measures; capture its exact first map after its timing ends.
const fs = require('node:fs');
const path = require('node:path');
require('./runtime.cjs');
const { generate } = require('../../src/core/gen/generate.ts');
const gen = require('../../src/core/gen/generate.ts');
let result, shownHeights;
gen.generate = (spec, opts = {}) => (result = generate(spec, {
  ...opts,
  onLand: land => { shownHeights = land.heights.slice(); opts.onLand?.(land); },
}));
process.on('exit', () => {
  if (!result) return;
  const { shadeTiles } = require('../../src/core/render/shade.ts');
  const { encodePng } = require('../../tools/png.ts');
  const r = result, b = r.built, W = b.W, H = b.H;
  const key = `${W}-${r.spec.seed}`;
  const phase = process.argv.includes('--prototype') ? 'after' : 'before';
  const dir = path.join(__dirname, 'local', phase);
  fs.mkdirSync(dir, { recursive: true });
  const rgb = shadeTiles(b.heights, W, H, b.water);
  const img = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, j = ((H - 1 - y) * W + x) * 3;
    img.set(rgb.subarray(i * 3, i * 3 + 3), j);
    if (b.water[i] > 0.05 && b.contamination[i] >= 0.05) img.set([150, 60, 170], j);
    if (b.start && Math.abs(x - b.start.x) <= 1 && Math.abs(y - b.start.y) <= 1) img.set([230, 20, 20], j);
  }
  fs.writeFileSync(path.join(dir, `${key}.png`), encodePng(img, W, H));
  fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({
    spec: r.spec, checks: r.report.checks, info: r.info, timings: r.timings, outcomes: r.outcomes,
    intentions: r.intentions, features: r.features, failures: r.failures, analysis: r.analysis,
    evaluated: require('../../src/core/gen/outcomes.ts').outcomesOf(r),
    sha256: require('node:crypto').createHash('sha256').update(r.bytes).digest('hex'),
    heights: [...b.heights], water: [...b.water], contamination: [...b.contamination], start: b.start,
    ...(shownHeights ? { shownHeights: [...shownHeights] } : {}),
  }));
});
require('../m9b/measures.ts');
