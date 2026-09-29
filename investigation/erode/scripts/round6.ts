import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkSupport } from "../../terrain3d/proto/support";
import { erosionFloor, landAt, planErode, type ErodePlan } from "../core/erode";
import type { ErodeMap } from "../core/map";
import { LAYERS, Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";
import { bottomCheck, drainageMetrics } from "./round2";

export function floorCheck(before: Terrain, plan: ErodePlan, floor: number) {
  bottomCheck(before, plan);
  const mask = (1 << floor) - 1;
  for (let i = 0; i < before.N; i++)
    assert.equal(plan.final.cols[i] & mask, before.cols[i] & mask, `tile ${i}: ground below Floor ${floor} changed`);
  assert.ok(plan.removed.every(v => v >= floor * before.N), "animation cuts below Floor");
}

export function round6Checks(load: (id: string) => ErodeMap) {
  // Existing rounds lock the six flat/cliff fixtures; lock round 5's uneven results too.
  const unchanged: Record<string, string> = {
    "wash-terraces-up": "e90d45ae6a5f4aadad8c3690a21954db37de884edf7e973fe17627b9390db467",
    "wash-terraces-down": "e90d45ae6a5f4aadad8c3690a21954db37de884edf7e973fe17627b9390db467",
    "wash-step": "83de60b347154154b40b9dec918c435b616a73b29c8a73abfd5165009f6b3a7a",
    "wash-rise": "6bd4c264abd355b4d0b9c8e71a6d352aed94afe76f371612b68640fad99efb3c",
  };
  let gestures = 0, animated = 0, shallowWashes = 0;
  for (const c of CASES) {
    const m = load(c.map), before = Terrain.fromHeights(m.W, m.H, m.heights);
    const input = { terrain: before, rock: m.rock, keep: m.keep, water: m.water };
    const baseline = planErode(input, { points: c.points }, c);
    if (unchanged[c.id]) assert.equal(createHash("sha256").update(new Uint8Array(baseline.final.cols.buffer)).digest("hex"), unchanged[c.id]);
    for (let floor = 1; floor < LAYERS; floor++) {
      const p = planErode(input, { points: c.points }, { ...c, floor });
      floorCheck(before, p, floor);
      assert.equal(checkSupport(m.W, m.H, p.final.voxels(), LAYERS).unsupported.length, 0, `${c.id}, Floor ${floor}: support`);
      if (floor === 1) assert.deepEqual(p.final.cols, baseline.final.cols, "default Floor changed the result");
      if (floor === LAYERS - 1) assert.equal(p.worn, 0, "ceiling Floor must leave all ground intact");
      if (p.wash && p.worn) {
        drainageMetrics(before, p);
        if (floor > 1 && p.worn < baseline.worn) shallowWashes++;
      }
      // A raised rule crosses each gallery/opening or wash bed; check every displayed bucket.
      if (floor === Math.min(...baseline.removed.map(v => Math.floor(v / before.N))) + 1) {
        for (let b = 0; b < p.buckets; b++) {
          const shown = landAt(before, p, b);
          floorCheck(before, { ...p, final: shown }, floor);
          assert.equal(checkSupport(m.W, m.H, shown.voxels(), LAYERS).unsupported.length, 0);
          animated++;
        }
        assert.deepEqual(landAt(before, p, p.buckets - 1).cols, p.final.cols);
      }
      // A second gesture must respect a changed rule on terrain with existing cavities.
      if (floor === 8 || floor === 14) {
        const next = planErode({ ...input, terrain: baseline.final }, { points: c.points }, { ...c, floor, seed: c.seed + 1 });
        floorCheck(baseline.final, next, floor);
        assert.equal(checkSupport(m.W, m.H, next.final.voxels(), LAYERS).unsupported.length, 0);
        gestures++;
      }
      gestures++;
    }
  }
  assert.ok(shallowWashes > 0, "Floor should shallow washes without stopping them");
  for (const [floor, expected] of [[-5, 1], [99, 22], [7.7, 8], [NaN, 1]])
    assert.equal(erosionFloor({ power: 100, size: 100, seed: 1, floor }), expected);
  const result = { result: "PASS", floorRange: "1–22 on all ten cases", gestures, animationBuckets: animated,
    support: "PASS", bottomLayer: "PASS", chosenFloor: "PASS", belowFloorVoxelsRemoved: 0,
    defaultResultsUnchanged: "PASS", shallowerWashesWithDrainage: shallowWashes };
  console.log(JSON.stringify(result)); return result;
}
