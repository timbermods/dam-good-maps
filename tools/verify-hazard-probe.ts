// The Drought and Badtide day strip against the game (PLAN §20 D267 (7); PERFECT, Water 1): a DGM
// Probe run's maps opened in the editor's worker as the page opens them, their drought and badtide
// worked out as the day strip works them out (worker/session.ts `showHazard`), and each moment
// compared with the game's own snapshot of the same moment. The probe's weather: 3 temperate days
// from a new game's 04:00, then a 3-day drought; then 3 temperate days and a 3-day badtide.
// "Before" is the run as it was first built: from the file's water at rest, the sources off at once
// when the drought starts.
//
//   npx tsx tools/verify-hazard-probe.ts <probe results dir> <maps dir> [mapId…]
//
// The probe's tolerance (investigation/probe/runner/compare.ts, cal-timeline): water and wet tiles
// within 5% of the larger of the two.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { MapSession } from "../src/core/doc/session";
import { storedWater } from "../src/core/format/world";
import { readTimber } from "../src/core/format/timber";
import { HazardRun } from "../src/core/sim/hazard";
import { TICKS_PER_DAY } from "../src/core/sim/water";
import type { WaterView } from "../src/render3d/model";
import * as ed from "../src/worker/session";

const [results, maps, ...ids] = process.argv.slice(2);
if (!results || !maps) throw new Error("usage: verify-hazard-probe.ts <probe results dir> <maps dir> [mapId…]");
const games = ids.length ? ids : ["m9a-canyon-128", "m9a-no-badwater", "m9a-delta-128"];
const TOL = 0.05;
/** The probe's game starts at 04:00 of day 1: its first cycle's 3 temperate days leave this long
 *  before the drought. */
const LEAD = 3 - 128 / TICKS_PER_DAY;

interface Snap {
  momentId: string;
  tick: number;
  depth: number[];
  contamination: number[];
  moisture: number[];
}
const snap = (id: string, moment: string): Snap => JSON.parse(gunzipSync(readFileSync(join(results, `${id}-${moment}.snapshot.json.gz`))).toString()) as Snap;

interface Counts {
  water: number;
  wet: number;
  moist?: number;
}
function countsOf(depth: ArrayLike<number>, moisture?: ArrayLike<number>): Counts {
  let water = 0;
  let wet = 0;
  let moist = 0;
  for (let i = 0; i < depth.length; i++) {
    water += depth[i];
    if (depth[i] > 0.05) wet++;
    if (moisture && moisture[i] > 0) moist++;
  }
  return { water, wet, ...(moisture ? { moist } : {}) };
}
function fromView(w: WaterView, N: number): Float64Array {
  const d = new Float64Array(N);
  for (let k = 0; k < w.count; k++) if (w.depth[k] > d[w.tile[k]]) d[w.tile[k]] = w.depth[k];
  return d;
}
const off = (a: number, b: number) => Math.abs(a - b) / Math.max(1, a, b);
const fmt = (c: Counts) => `water ${c.water.toFixed(0)}, wet ${c.wet}${c.moist !== undefined ? `, moist ${c.moist}` : ""}`;

// (the worker's yields are unref'd message ports: keep Node's loop alive between them)
const alive = setInterval(() => undefined, 1000);
let worst = 0;
for (const id of games) {
  const bytes = new Uint8Array(readFileSync(join(maps, `${id}.timber`)));
  ed.openTimber(bytes, `${id}.timber`);
  const W = ed.sessionView().view.W;
  const N = W * W;
  console.log(`\n## ${id} (${W}²)`);
  for (const hazard of ["drought", "badtide"] as const) {
    // the game's moments: ticks from the hazard's start, and its snapshot
    const start = hazard === "drought" ? snap(id, "drought1-start").tick : snap(id, "badtide2-start").tick;
    const moments = (hazard === "drought" ? ["drought1-start", "day_3", "drought1-day1", "day_4", "day_5", "drought1-end"] : ["badtide2-start", "badtide2-day1", "day_10", "day_11", "badtide2-end"]).map((m) => snap(id, m));
    const sum = (await ed.showHazard(hazard, 3, { framesCap: 24, lead: LEAD }))!;
    const gap = TICKS_PER_DAY / 24;
    /** The strip's water `t` ticks from the hazard's start (a frame of its days). */
    const after = (t: number): { depth: Float64Array; moisture?: Uint8Array } => {
      if (t <= 0) {
        if (hazard === "drought" && sum.leadFrames > 0) return { depth: fromView(ed.hazardSteps(1)![sum.leadFrames - 1], N) };
        const d0 = ed.hazardDay(0)!;
        return { depth: fromView(d0.water, N) };
      }
      const day = Math.ceil(t / TICKS_PER_DAY);
      const k = (t - (day - 1) * TICKS_PER_DAY) / gap - 1;
      if (t % TICKS_PER_DAY === 0) {
        const d = ed.hazardDay(day)!;
        return { depth: fromView(d.water, N), moisture: d.soil.moisture };
      }
      return { depth: fromView(ed.hazardSteps(day)![(day === 1 ? sum.leadFrames : 0) + k], N) };
    };
    // before: the first build's run, from the file's water at rest, the sources off at once at the
    // drought's start (as the diagnosis compared it)
    const s0 = MapSession.importMap(bytes, `${id}.timber`).built;
    const file = readTimber(bytes);
    const w = storedWater(file.world.singletons, W, W);
    const depth = new Float64Array(N);
    const contamination = new Float64Array(N);
    for (let k = 0; k < w.tile.length; k++) if (!(w.floor[k] >= 0) || Math.abs(w.floor[k] - s0.heights[w.tile[k]]) < 0.01) {
      depth[w.tile[k]] = w.depth[k];
      contamination[w.tile[k]] = w.contamination[k];
    }
    const before = new HazardRun({ model: s0.waterModel, depth, contamination, hazard, days: 3, framesPerDay: 24, lead: 0 });
    const beforeAt = new Map<number, Float64Array>();
    beforeAt.set(0, depth);
    for (let f = before.step(); f; f = before.step()) beforeAt.set(before.ticks, before.sim.D.slice());
    console.log(`\n${hazard} (the game | the strip now | before)`);
    for (const m of moments) {
      const t = m.tick - start;
      const game = countsOf(m.depth, m.moisture);
      const now = after(t);
      const c = countsOf(now.depth, now.moisture);
      const b = countsOf(beforeAt.get(t) ?? depth);
      const e = Math.max(off(game.water, c.water), off(game.wet, c.wet));
      if (hazard === "drought") worst = Math.max(worst, e);
      console.log(`  ${m.momentId.padEnd(15)} ${(t / TICKS_PER_DAY).toFixed(2).padStart(5)} d: ${fmt(game)} | ${fmt(c)} | ${fmt(b)}   ${e <= TOL ? "within" : "OUT"} (${(100 * e).toFixed(1)}%)`);
    }
    ed.endHazard();
  }
}
clearInterval(alive);
console.log(`\nlargest drought difference: ${(100 * worst).toFixed(1)}% (tolerance ${100 * TOL}%)`);
