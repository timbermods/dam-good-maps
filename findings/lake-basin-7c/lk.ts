// The lake's sill and depth from .timber files: npx tsx .scratch/lk.ts a.timber ...
//   lake: the largest body of water 0.1+ deep; level: its surface's median; sill: the dry-or-flowing ground beside it at or
//   under that level (where its water leaves), widest cluster; depth: the level less the lowest floor under it.
import { readFileSync } from "node:fs";
import { readTimber } from "../src/core/format/timber";
import { surfaceOf, storedWater } from "../src/core/format/world";
for (const p of process.argv.slice(2)) {
  const w = readTimber(new Uint8Array(readFileSync(p))).world;
  const W = w.sizeX, H = w.sizeY, N = W * H, h = surfaceOf(w);
  const sw = storedWater(w.singletons, W, H);
  const D = new Float64Array(N);
  for (let k = 0; k < sw.tile.length; k++) D[sw.tile[k]] = Math.max(D[sw.tile[k]], sw.depth[k]);
  const lab = new Int32Array(N).fill(-1);
  let best: number[] = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0 || D[s] < 0.1) continue;
    const q = [s]; lab[s] = s;
    for (let k = 0; k < q.length; k++) { const c = q[k], x = c % W, y = (c - x) / W;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) if (n >= 0 && lab[n] < 0 && D[n] >= 0.1) { lab[n] = s; q.push(n); } }
    if (q.length > best.length) best = q;
  }
  const surf = best.map((i) => h[i] + D[i]).sort((a, b) => a - b);
  const level = surf[Math.floor(surf.length / 2)];
  let floor = 99; for (const i of best) floor = Math.min(floor, h[i]);
  const inL = new Uint8Array(N); for (const i of best) inL[i] = 1;
  // the deep part: tiles of the body standing at the lake's level (within 0.3), not its rivers' sloping water
  const lakeT = best.filter((i) => Math.abs(h[i] + D[i] - level) < 0.3);
  const lakeM = new Uint8Array(N); for (const i of lakeT) lakeM[i] = 1;
  // where it leaves: body tiles beside the lake part whose surface is lower than the lake's by 0.15 or more
  const out = new Uint8Array(N);
  for (const i of lakeT) { const x = i % W, y = (i - x) / W;
    for (const n of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (n >= 0 && inL[n] && !lakeM[n] && h[n] + D[n] < level - 0.15) out[n] = 1; }
  const seen = new Uint8Array(N); const sills: number[] = [];
  for (let s = 0; s < N; s++) { if (!out[s] || seen[s]) continue; const q = [s]; seen[s] = 1;
    for (let k = 0; k < q.length; k++) { const c = q[k], x = c % W, y = (c - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const n = (y + dy) * W + x + dx; if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && out[n] && !seen[n]) { seen[n] = 1; q.push(n); } } }
    sills.push(q.length); }
  sills.sort((a, b) => b - a);
  console.log(`${p.split(/[\/]/).pop()}\tlake ${lakeT.length} (${(100 * lakeT.length / N).toFixed(1)}%)\tlevel ${level.toFixed(2)}\tdepth ${(level - floor).toFixed(2)}\tsills ${sills.slice(0, 4).join(",") || "none"}`);
}
