// Debug for cycle-check: a picture of where a sheet stands a day into the badtide.
import { writeFileSync } from 'node:fs';
import { generate } from '../../src/core/gen/generate';
import { makeSpec, type ThemeId } from '../../src/core/spec/mapspec';
import { runModel } from '../probe/runner/model';
import { shadeTiles } from '../../src/core/render/shade';
import { encodePng } from '../../tools/png';
const [theme, seedS, dayS] = process.argv.slice(2);
const r = generate(makeSpec({ seed: Number(seedS), theme: theme as ThemeId, size: { x: 128, y: 128 } }));
const b = r.built;
const W = b.W, H = b.H, S = 4;
const day = Number(dayS ?? 11);
const run = runModel(r.bytes, 'x', [
  { temperateDays: 3, hazard: 'drought', hazardDays: 3 },
  { temperateDays: 3, hazard: 'badtide', hazardDays: 3 },
  { temperateDays: 60, hazard: 'drought', hazardDays: 0 },
], day + 0.01, [], [], [day]);
const m = run.maps[0];
const rgb = shadeTiles(b.heights, W, H, b.water);
const img = new Uint8Array(W * S * H * S * 3);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  let c = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
  if (!(b.water[i] > 0.05) && m.depth[i] > 0.05) c = m.depth[i] <= 0.12 ? [255, 60, 60] : [255, 170, 0];
  for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
    const k = (((H - 1 - y) * S + sy) * W * S + x * S + sx) * 3;
    img[k] = c[0]; img[k + 1] = c[1]; img[k + 2] = c[2];
  }
}
writeFileSync(`../../.scratch/sheet-${theme}-${seedS}.png`, encodePng(img, W * S, H * S));
console.log('written');
