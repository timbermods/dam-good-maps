// Largest lake (wet tiles joined at one water surface, within 0.3) as a share of the map, from a .timber's stored water.
import { readFileSync } from "node:fs";
import { readTimber } from "../src/core/format/timber";
import { surfaceOf, storedWater } from "../src/core/format/world";
for (const p of process.argv.slice(2)) {
  const w = readTimber(new Uint8Array(readFileSync(p))).world;
  const W = w.sizeX, H = w.sizeY, N = W * H, h = surfaceOf(w);
  const sw = storedWater(w.singletons, W, H);
  const D = new Float64Array(N);
  for (let k = 0; k < sw.tile.length; k++) D[sw.tile[k]] = Math.max(D[sw.tile[k]], sw.depth[k]);
  const S = (i: number) => h[i] + D[i];
  const lab = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  let wet = 0;
  for (let s = 0; s < N; s++) {
    if (D[s] < 0.1) continue;
    wet++;
    if (lab[s] >= 0) continue;
    const q = [s]; lab[s] = s;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], x = c % W, y = (c - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] >= 0 || D[j] < 0.1 || Math.abs(S(j) - S(c)) > 0.3) continue;
        lab[j] = s; q.push(j);
      }
    }
    sizes.push(q.length);
  }
  sizes.sort((a, b) => b - a);
  console.log(`${p.split("/").pop()} wet ${(100 * wet / N).toFixed(1)}% biggest ${(sizes[0] / N).toFixed(3)} next ${((sizes[1] ?? 0) / N).toFixed(3)} ${((sizes[2] ?? 0) / N).toFixed(3)}`);
}
