// M9b (PLAN §20 D302): two of M9a's probe findings measured on M9b's maps with the weather-cycle model
// the probe compares the game against (it followed the game on both: docs/progress/m9a.md, "The DGM
// Probe re-run 20260927-1443-batch"). The probe's weather: 3 temperate days, a 3-day drought, 3
// temperate days, a 3-day badtide.
//
// 1. Badwater's way down keeps clear of stagnant pools (D273 (1), (5)): just before the badtide,
//    water over 10% badwater more than 3 tiles from the file's badwater (the probe's m9a-badwater
//    measure: a clean side pool empties in the drought and fills again with badwater).
// 2. Flats that spread a sheet (D273 (2), Delta): a day into the badtide, tiles 0.05–0.12 deep that
//    were dry in the file and more than 2 tiles from its water.
//
//   node investigation/probe/run.cjs ../m9b/cycle-check.ts any:1 delta:1 [--size 128]
//
// Needs no game: the model runs in process (investigation/probe/runner/model.ts, from git at its
// commit into the probe's ignored cache).

import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { runModel } from '../probe/runner/model';

const CYCLES = [
  { temperateDays: 3, hazard: 'drought' as const, hazardDays: 3 },
  { temperateDays: 3, hazard: 'badtide' as const, hazardDays: 3 },
  { temperateDays: 60, hazard: 'drought' as const, hazardDays: 0 },
];
const sizeArg = process.argv.indexOf('--size');
const size = sizeArg >= 0 ? Number(process.argv[sizeArg + 1]) : 128;
const maps = process.argv.slice(2).filter((a, k, all) => a.includes(':') && all[k - 1] !== '--size');

const near = (W: number, H: number, mask: (i: number) => boolean, r: number): Uint8Array => {
  const out = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!mask(i)) continue;
    const x0 = i % W;
    const y0 = (i - x0) / W;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = x0 + dx;
        const y = y0 + dy;
        if (x >= 0 && y >= 0 && x < W && y < H) out[y * W + x] = 1;
      }
  }
  return out;
};

for (const m of maps) {
  const [theme, seedS] = m.split(':');
  const r = generate(makeSpec({ seed: Number(seedS), theme: theme as ThemeId, size: { x: size, y: size } }));
  const b = r.built;
  const W = b.W;
  const H = b.H;
  // (the model's weather starts at day 1, 00:00, a new game at 04:00: the badtide begins on day 10)
  const before = 1 + 9 - 0.01;
  const badtide1 = 1 + 10;
  const run = runModel(r.bytes, `${theme}-${seedS}`, CYCLES, badtide1 + 0.01, [], [], [before, badtide1]);
  const [s1, s2] = run.maps;
  // 1. badwater outside its way down, just before the badtide
  const fileBad = near(W, H, (i) => b.water[i] > 0.05 && b.contamination[i] > 0.1, 3);
  let bad = 0;
  let outside = 0;
  const ex: string[] = [];
  for (let i = 0; i < W * H; i++)
    if (s1.depth[i] > 0.05 && s1.contamination[i] > 0.1) {
      bad++;
      if (!fileBad[i]) {
        outside++;
        if (ex.length < 4) ex.push(`(${i % W}, ${Math.floor(i / W)}) ${Math.round(100 * s1.contamination[i])}%`);
      }
    }
  const ok1 = outside <= Math.max(2, 0.02 * bad);
  // 2. a sheet over dry flats a day into the badtide
  const fileWet = near(W, H, (i) => b.water[i] > 0.05, 2);
  let sheet = 0;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let i = 0; i < W * H; i++)
    if (!fileWet[i] && s2.depth[i] > 0.05 && s2.depth[i] <= 0.12) {
      sheet++;
      const x = i % W;
      const y = (i - x) / W;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  console.log(`${theme} ${seedS} ${size}²: ${r.name} | badwater before the badtide: ${bad} tiles, ${outside} outside its way down${ex.length ? ` (${ex.join(', ')})` : ''} ${ok1 ? 'ok' : 'FAIL'} | a sheet a day into the badtide: ${sheet} tiles${sheet ? ` (x ${x0}–${x1}, y ${y0}–${y1})` : ''} | model ${Math.round(run.cpuSeconds)} s`);
}
