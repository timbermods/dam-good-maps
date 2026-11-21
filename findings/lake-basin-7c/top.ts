// Top-down level maps of .timber files, side by side, north up: level shaded, every step edge dark, water blue.
//   npx tsx .scratch/top.ts out.png a.timber b.timber ...
import { readFileSync, writeFileSync } from "node:fs";
import { readTimber } from "../src/core/format/timber";
import { surfaceOf, storedWater, storedSoil } from "../src/core/format/world";
import { encodePng } from "../tools/png";
const [out, ...files] = process.argv.slice(2);
const maps = files.map((p) => {
  const w = readTimber(new Uint8Array(readFileSync(p))).world;
  const W = w.sizeX, H = w.sizeY, h = surfaceOf(w);
  const sw = storedWater(w.singletons, W, H);
  const D = new Float64Array(W * H);
  for (let k = 0; k < sw.tile.length; k++) D[sw.tile[k]] = Math.max(D[sw.tile[k]], sw.depth[k]);
  const M = storedSoil(w.singletons, W, H).moisture;
  return { W, H, h, D, M };
});
const S = 2, gap = 6;
const TW = maps.reduce((a, m) => a + m.W * S + gap, -gap), TH = Math.max(...maps.map((m) => m.H * S));
const rgb = new Uint8Array(TW * TH * 3).fill(30);
let ox = 0;
for (const m of maps) {
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) {
    const i = y * m.W + x;
    let c: [number, number, number];
    if (m.D[i] >= 0.1) c = [40, 80, 170];
    else {
      const t = Math.max(0, Math.min(1, (m.h[i] - 3) / 14));
      const g = 70 + t * 170;
      c = [g * 0.95, g * (0.85 + 0.15 * t), g * 0.7];
      const e = (x + 1 < m.W && m.h[i + 1] !== m.h[i]) || (y + 1 < m.H && m.h[i + m.W] !== m.h[i]);
      if (m.M[i] > 0) c = [c[0] * 0.6, c[1] * 0.6 + 70, c[2] * 0.5];
      if (e) c = [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55];
    }
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const px = ox + x * S + dx, py = (m.H - 1 - y) * S + dy;
      const k = (py * TW + px) * 3;
      rgb[k] = c[0]; rgb[k + 1] = c[1]; rgb[k + 2] = c[2];
    }
  }
  ox += m.W * S + gap;
}
writeFileSync(out, encodePng(rgb, TW, TH));
