// The official maps with caves or overhangs against their own saved water: rerun it after any change to the
// water (the stacked engine, its pre-fill, the soil rules) and compare with docs/progress/3d-foundations.md.
//
//   npx tsx tools/official-water-match.ts [dir] [--only <name part>]
//
// `dir` holds the official .timber files (default the dedicated machine's copy, C:/Users/krams/code/DamGoodMaps/
// .scratch/official/; they are not redistributable and are never committed). Per map with caves: the canonical
// stacked settle of the unedited map against its own saved water, wet columns deeper than 0.05 (IoU over all
// columns, each tile's top column, the columns under it); whether it settled, its ticks and seconds; and the
// soil rules per run on the map's own water against its stored moisture slots (moist or dry agrees, and within
// 0.05). Heightfield maps are skipped.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTimber } from "../src/core/format/timber";
import { storedWater, type WorldModel } from "../src/core/format/world";
import { isObject, type JsonObject } from "../src/core/format/json";
import { mapObjects } from "../src/core/sim/model";
import { waterColumns } from "../src/core/sim/columns";
import { canonicalSettle } from "../src/core/sim/prefill";
import { soil3d } from "../src/core/sim/soil3d";
import { storedStack, worldWaterModel } from "../src/core/sim/stackWater";
import { ColumnTerrain } from "../src/core/terrain/runs";

const args = process.argv.slice(2);
const at = args.indexOf("--only");
const only = at >= 0 ? args[at + 1] : undefined;
const dir = args.find((a, k) => !a.startsWith("--") && args[k - 1] !== "--only") ?? "C:/Users/krams/code/DamGoodMaps/.scratch/official/";
if (!existsSync(dir)) throw new Error(`no official maps at ${dir}`);
const r4 = (v: number) => (Math.round(v * 1e4) / 1e4).toString();
console.log("map | IoU all | IoU top | IoU under | settled | ticks | seconds | soil moist-or-dry agrees | soil within 0.05");
for (const f of readdirSync(dir).filter((f) => f.endsWith(".timber") && (!only || f.includes(only)))) {
  const w: WorldModel = readTimber(new Uint8Array(readFileSync(join(dir, f)))).world;
  const W = w.sizeX, H = w.sizeY, N = W * H;
  const terrain = ColumnTerrain.fromVoxels(w.voxels, W, H, w.layers);
  if (terrain.allPlain()) continue;
  const objects = mapObjects(w);
  const cols = waterColumns(terrain, objects);
  const own = storedStack(cols, storedWater(w.singletons, W, H));
  const t0 = performance.now();
  const s = canonicalSettle(worldWaterModel(w));
  const secs = (performance.now() - t0) / 1000;
  const st = s.stack!;
  const iou = [0, 0, 0, 0, 0, 0]; // inter, union: all, top, under
  for (let i = 0; i < N; i++)
    for (let q = 0; q < cols.count[i]; q++) {
      const c = q * N + i;
      const a = own.depth[c] > 0.05, b = st.depth[c] > 0.05;
      const k = q === cols.count[i] - 1 ? 2 : 4;
      for (const j of [0, k]) {
        if (a && b) iou[j]++;
        if (a || b) iou[j + 1]++;
      }
    }
  const ratio = (j: number) => (iou[j + 1] ? r4(iou[j] / iou[j + 1]) : "1");
  // soil on the map's own water against its stored slots
  const soil = soil3d(terrain, cols, { depth: own.depth, contamination: own.contamination }, objects);
  const sm = w.singletons.SoilMoistureSimulator as JsonObject;
  const toks = isObject(sm) && isObject(sm.MoistureLevels) ? String((sm.MoistureLevels as JsonObject).Array).split(" ") : [];
  let agree = 0, close = 0, n = 0;
  for (let c = 0; c < soil.moisture.length && c < toks.length; c++) {
    if (Math.floor(c / N) >= soil.runs.count[c % N]) continue;
    const a = Number(toks[c]) || 0, b = soil.moisture[c];
    n++;
    if ((a > 0) === (b > 0)) agree++;
    if (Math.abs(a - b) <= 0.05) close++;
  }
  console.log([f.replace(/builtin_\d+_MapMetadata|Name\.timber|\.timber/g, ""), ratio(0), ratio(2), ratio(4), s.settled ? "yes" : "no", s.ticks, secs.toFixed(1), (100 * agree / n).toFixed(2) + "%", (100 * close / n).toFixed(2) + "%"].join(" | "));
}
