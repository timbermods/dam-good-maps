import assert from "node:assert/strict";
import { checkSupport } from "../../terrain3d/proto/support";
import { landAt, planErode } from "../core/erode";
import { washMap } from "../core/map";
import { LAYERS, Terrain } from "../core/terrain";
import { UNEVEN_CASES, unevenMap } from "../demo/uneven";
import { bottomCheck, drainageMetrics, shelterMetrics } from "./round2";

export function round5Checks() {
  const rows: Record<string, unknown>[] = [];
  for (const id of ["wash-terraces-down", "wash-rise"]) for (const power of [10, 30, 85, 100]) {
    const c = UNEVEN_CASES.find(c => c.id === id)!, m = unevenMap(c.map)!;
    const before = Terrain.fromHeights(m.W, m.H, m.heights), input = { terrain: before, rock: m.rock, keep: m.keep, water: m.water };
    const settings = { power, size: 100, seed: 1 }, p = planErode(input, { points: c.points }, settings);
    const drainage = drainageMetrics(before, p), bottom = bottomCheck(before, p), cap = 1 + Math.round(2 * (power / 100) ** 2);
    const maxDepth = Math.max(...Array.from(m.heights, (h, i) => h - p.final.run0Top(i)));
    assert.ok(maxDepth > 0 && maxDepth <= cap, "uneven wash exceeds its local depth cap");
    assert.deepEqual(p.final.cols, planErode(input, { points: c.points.slice().reverse() }, settings).final.cols);
    const runs = p.wash!.runs!;
    for (const run of runs) for (let k = 1; k < run.path.length; k++)
      assert.ok(m.heights[run.path[k]] <= m.heights[run.path[k - 1]], "a run cuts uphill through a rise");
    if (id === "wash-rise") {
      assert.equal(runs.length, 2, "the crest must feed two runs");
      assert.equal(runs[0].path[0], runs[1].path[0]);
      assert.deepEqual(runs.map(r => r.outlet % m.W).sort((a, b) => a - b), [0, m.W - 1]);
    }
    const floor = Math.min(...p.wash!.bedTiles.map(i => p.final.run0Top(i)));
    const debris = shelterMetrics(before, { ...p, focus: { ...p.focus!, z: floor } });
    assert.equal(debris.leftoverSingleBlocks + debris.leftoverSmallClusters, 0);
    for (let b = 0; b < p.buckets; b++) {
      const shown = landAt(before, p, b);
      assert.equal(checkSupport(m.W, m.H, shown.voxels(), LAYERS).unsupported.length, 0);
      for (let i = 0; i < before.N; i++) assert.ok(shown.at(i, 0));
    }
    rows.push({ case: id, power, size: 100, result: "PASS", ...drainage, bottomVoxelsRemoved: bottom,
      cap, maxDepth, runs: runs.length, leftoverSingleBlocks: 0, leftoverSmallClusters: 0 });
  }
  let thinGestures = 0;
  for (const level of [1, 2, 3]) for (const power of [10, 30, 100]) for (const stepped of [false, true]) {
    const m = washMap();
    m.heights = Uint8Array.from(m.heights, (_, i) => level + (stepped && i % m.W < 64 ? 2 : 0));
    let terrain = Terrain.fromHeights(m.W, m.H, m.heights);
    for (let repeat = 0; repeat < 3; repeat++) {
      const p = planErode({ terrain, rock: m.rock }, { points: [{ x: 24.5, y: 58.5 }, { x: 103.5, y: 66.5 }] }, { power, size: 100, seed: repeat + 1 });
      bottomCheck(terrain, p);
      assert.ok(p.final.cols.every(c => (c & 1) === 1), "thin ground lost its floor");
      assert.equal(checkSupport(m.W, m.H, p.final.voxels(), LAYERS).unsupported.length, 0);
      if (p.wash && !p.reason) drainageMetrics(terrain, p);
      terrain = p.final; thinGestures++;
    }
  }
  const wet = unevenMap("rise")!, source = 53 * wet.W + 18;
  wet.keep[source] = 1; wet.water[source] = wet.water[source - 1] = 2;
  const terrain = Terrain.fromHeights(wet.W, wet.H, wet.heights);
  const protectedPlan = planErode({ terrain, rock: wet.rock, keep: wet.keep, water: wet.water },
    { points: UNEVEN_CASES.find(c => c.id === "wash-rise")!.points }, { power: 100, size: 100, seed: 1 });
  assert.equal(protectedPlan.final.cols[source], terrain.cols[source], "water source ground was worn");
  drainageMetrics(terrain, protectedPlan); bottomCheck(terrain, protectedPlan);
  const result = { result: "PASS", cases: rows, thinGroundRepeatedGestures: thinGestures, protectedSource: "PASS",
    bottomLayer: "PASS: no bottom voxels removed or scheduled", animationSupport: "PASS" };
  console.log(JSON.stringify(result)); return result;
}
