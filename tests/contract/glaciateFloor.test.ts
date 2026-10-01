// Glaciate's floor at every Power (PLAN §20 D368 (3), amended): lower Power makes the glacier shallower
// and changes nothing else. At Power 0, 50 and 100 the valley is U-shaped (walls rising from a floor),
// and the game's water, settled on it, lies in a channel or a tarn, never as a thin sheet over the
// floor. Round 4's glacier (#69's fixtures, its own clicks) run to its end in the core, its water
// settled with its springs and its tarn.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { snapshotMap, type FullForceMap } from "../../src/core/forces/force";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { GlaciateRun } from "../../src/core/forces/glaciate/run";
import { modelOf } from "../../src/core/forces/runs";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { storedMap } from "../../investigation/forces-core/core/map";

function fixture(id: string): FullForceMap {
  const raw = readFileSync(join(__dirname, "../../investigation/glaciate/maps", `${id}.json.gz`));
  return storedMap(JSON.parse(strFromU8(gunzipSync(raw)))) as unknown as FullForceMap;
}

/** The highest dry ground well inside the map (a glacier's head). */
function highGround(b: FullForceMap): number {
  let best = (b.H >> 1) * b.W + (b.W >> 1);
  let top = -1;
  for (let y = 14; y < b.H - 14; y += 2)
    for (let x = 14; x < b.W - 14; x += 2) {
      const i = y * b.W + x;
      if (b.water.depth[i] > 0 || b.heights[i] <= top) continue;
      top = b.heights[i];
      best = i;
    }
  return best;
}

export interface FloorWater {
  /** Floor tiles: the trough's ground it changed. */
  floor: number;
  /** Floor tiles under a thin sheet of settled water (wet, under 0.3 deep, outside its river's channel). */
  sheet: number;
  /** Floor tiles under water in a channel or a tarn (its river's channel, or 0.3 deep or more). */
  deep: number;
  /** Cross-sections, and how many are U-shaped: a floor at least three tiles wide within a level of
   *  its lowest, and the land rising at least two levels from it on both sides. */
  sections: number;
  u: number;
  /** The deepest any tile was cut, and the levels cut in all. */
  deepest: number;
  cut: number;
}

/** A glacier from `origin` at `power`, run to its end, its water settled. */
export function floorWater(m: FullForceMap, origin: number, power: number): FloorWater {
  const r = new GlaciateRun(snapshotMap(m), { ...GLACIATE_DEFAULTS, power }, { origin }).finishAll();
  const p = r.plan!;
  const map = r.final()!;
  const w = canonicalSettle({ ...modelOf(map), ...(p.retained.tiles.length ? { retained: [p.retained] } : {}) });
  const { W, H } = map;
  let floor = 0;
  let sheet = 0;
  let deep = 0;
  let deepest = 0;
  let cut = 0;
  for (let i = 0; i < map.heights.length; i++) {
    deepest = Math.max(deepest, m.heights[i] - map.heights[i]);
    cut += Math.max(0, m.heights[i] - map.heights[i]);
    // (its floor: the trough's ground it cut or laid; ground it left as it was keeps its own water)
    if (p.mask[i] !== 1 || map.heights[i] === m.heights[i]) continue;
    floor++;
    // (shallow water in its river's channel is the river)
    if (w.depth[i] >= 0.3 || (w.depth[i] > 0.02 && p.stream[i])) deep++;
    else if (w.depth[i] > 0.02) sheet++;
  }
  // cross-sections square to its path, between a fifth and four fifths of the way
  let sections = 0;
  let u = 0;
  const path = p.path;
  for (let k = 3; k < path.length - 3; k++) {
    const q = path[k];
    if (q.s < 0.2 || q.s > 0.8) continue;
    const a = path[k - 3];
    const b = path[k + 3];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const reach = Math.ceil(q.r * 1.6) + 3;
    const levels: number[] = [];
    for (let t = -reach; t <= reach; t++) {
      const x = Math.floor(q.x + nx * t);
      const y = Math.floor(q.y + ny * t);
      levels.push(x >= 0 && y >= 0 && x < W && y < H ? map.heights[y * W + x] : NaN);
    }
    if (levels.some((v) => Number.isNaN(v))) continue;
    sections++;
    const mid = reach;
    // the floor: from the centreline's lowest tile nearby, the run within a level of it
    let low = mid;
    for (let t = mid - 3; t <= mid + 3; t++) if (levels[t] < levels[low]) low = t;
    const base = levels[low];
    let lo = low;
    let hi = low;
    while (lo > 0 && levels[lo - 1] <= base + 1) lo--;
    while (hi < levels.length - 1 && levels[hi + 1] <= base + 1) hi++;
    const left = Math.max(...levels.slice(0, lo + 1));
    const right = Math.max(...levels.slice(hi));
    if (hi - lo + 1 >= 3 && left >= base + 2 && right >= base + 2) u++;
  }
  return { floor, sheet, deep, sections, u, deepest, cut };
}

const CASES: { id: string; origin: (m: FullForceMap) => number }[] = [
  { id: "canyon-128", origin: (m) => 22 * m.W + 22 },
  { id: "highlands-128", origin: highGround },
  { id: "river-128", origin: highGround },
];

describe("Glaciate's floor at every Power (D368 (3), amended)", () => {
  for (const c of CASES)
    it(`${c.id}: at Power 0, 50 and 100, a U-shaped valley whose water lies in a channel or a tarn, never a thin sheet over its floor`, () => {
      const m = fixture(c.id);
      const o = c.origin(m);
      const runs = [0, 50, 100].map((power) => ({ power, ...floorWater(m, o, power) }));
      const where = `${c.id}: ${JSON.stringify(runs)}`;
      for (const r of runs) {
        expect(r.sections, where).toBeGreaterThanOrEqual(5);
        // U-shaped: walls rising from a floor, on most of its sections
        expect(r.u / r.sections, `${where} (Power ${r.power}: U-shaped)`).toBeGreaterThanOrEqual(0.6);
        // no thin sheet of water over more than a small share of its floor
        expect(r.sheet / r.floor, `${where} (Power ${r.power}: sheet)`).toBeLessThanOrEqual(0.05);
      }
      // and Power is how deep
      expect(runs[0].deepest, where).toBeLessThan(runs[1].deepest);
      expect(runs[1].deepest, where).toBeLessThanOrEqual(runs[2].deepest);
      expect(runs[0].cut, where).toBeLessThan(runs[1].cut);
      expect(runs[1].cut, where).toBeLessThan(runs[2].cut);
    }, 600_000);
});
