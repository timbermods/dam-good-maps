// Moist share from a .timber's stored soil (the game's own SoilMoistureSimulator): land tiles not under water with
// moisture > 0 (the page's land shares rule), as % of land not under water.  npx tsx .scratch/moist.ts <file.timber>...
import { readFileSync } from "node:fs";
import { readTimber } from "../src/core/format/timber";
import { storedWater, storedSoil } from "../src/core/format/world";
for (const p of process.argv.slice(2)) {
  const w = readTimber(new Uint8Array(readFileSync(p))).world;
  const W = w.sizeX, H = w.sizeY, N = W * H;
  const sw = storedWater(w.singletons, W, H);
  const D = new Float64Array(N);
  for (let k = 0; k < sw.tile.length; k++) D[sw.tile[k]] = Math.max(D[sw.tile[k]], sw.depth[k]);
  const m = storedSoil(w.singletons, W, H).moisture;
  let land = 0, moist = 0, any = 0;
  for (let i = 0; i < N; i++) { if (m[i] > 0) any++; if (D[i] >= 0.1) continue; land++; if (m[i] > 0) moist++; }
  console.log(`${p.split("/").pop()} ${W}x${H} moist ${(100 * moist / land).toFixed(1)}% of land; stored>0 tiles ${any}`);
}
