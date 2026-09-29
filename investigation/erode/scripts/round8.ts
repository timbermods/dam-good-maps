import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkSupport } from "../../terrain3d/proto/support";
import { landAt, planErode, type ErodePlan, type ErodeSettings, type Gesture } from "../core/erode";
import type { ErodeMap } from "../core/map";
import { LAYERS, Terrain } from "../core/terrain";
import { settleThings } from "../core/objects";
import { CASES } from "../demo/cases";
import { ROOF_CASES, roofMap } from "../demo/roofs";
import { kylerCase, longSweep } from "../demo/sweeps";

const digest = (p: ErodePlan) => createHash("sha256").update(new Uint8Array(p.final.cols.buffer)).digest("hex");
export function round8Checks(load: (id: string) => ErodeMap) {
  let gestures = 0, frames = 0, longestMs = 0, longestTiles = 0, maxWorn = 0;
  const verify = (m: ErodeMap, before: Terrain, points: Gesture["points"], settings: ErodeSettings) => {
    const p = planErode({ terrain: before, rock: m.rock, keep: m.keep, water: m.water }, { points }, settings);
    const floor = settings.floor ?? 1, mask = (1 << floor) - 1;
    assert.ok(p.removed.every(v => v >= before.N * floor), "animation cuts below Floor");
    for (let b = 0; b < p.buckets; b++) {
      const t = landAt(before, p, b);
      assert.equal(checkSupport(t.W, t.H, t.voxels(), LAYERS).unsupported.length, 0, `sweep ${gestures}, bucket ${b}`);
      for (let i = 0; i < t.N; i++) {
        assert.equal(before.cols[i] & ~t.cols[i] & mask, 0, "cut below Floor/bottom");
        if (m.keep[i]) assert.equal(t.cols[i], before.cols[i], "worn source ground");
      }
      for (const thing of settleThings(t, m.things, m.water)) assert.ok(t.solid(thing.x, thing.y, thing.z - 1), "floating object");
      frames++;
    }
    assert.deepEqual(landAt(before, p, 23).cols, p.final.cols);
    // Independent count of one-voxel floor nubs in/next to the cut, at EVERY level.
    const t = p.final, adjacent = (i: number) => [i % t.W ? i - 1 : -1, i % t.W < t.W - 1 ? i + 1 : -1,
      i >= t.W ? i - t.W : -1, i < t.N - t.W ? i + t.W : -1].filter(j => j >= 0);
    const touched = new Set([...p.removed].flatMap(v => [v % t.N, ...adjacent(v % t.N)]));
    let singles = 0;
    for (const i of touched) for (let z = floor; z < LAYERS - 1; z++) {
      if (m.keep[i] || !t.at(i, z) || t.at(i, z + 1) || adjacent(i).some(j => t.at(j, z))) continue;
      const trial = t.clone(); trial.set(i, z, false);
      if (!checkSupport(t.W, t.H, trial.voxels(), LAYERS).unsupported.length) singles++;
    }
    assert.equal(singles, 0, `sweep ${gestures}: leftover single blocks`);
    longestMs = Math.max(longestMs, p.ms); maxWorn = Math.max(maxWorn, p.worn);
    longestTiles = Math.max(longestTiles, points.slice(1).reduce((s, p, k) => s + Math.hypot(p.x - points[k].x, p.y - points[k].y), 0));
    gestures++; return p;
  };
  const m = load("crater"), before = Terrain.fromHeights(m.W, m.H, m.heights), c = kylerCase(m);
  const pinned = verify(m, before, c.points, c);
  assert.ok(pinned.sweep!.galleries > 1 && pinned.sweep!.washes > 0);
  assert.ok(pinned.worn > 861 * 4, "long crater gesture still wears too little");
  const path: number[] = [];
  for (let k = 1; k < c.points.length; k++) {
    const a = c.points[k - 1], b = c.points[k], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let j = 0; j <= n; j++) path.push(Math.floor(a.y + (b.y - a.y) * j / n) * m.W + Math.floor(a.x + (b.x - a.x) * j / n));
  }
  const changed = path.filter(i => pinned.final.cols[i] !== before.cols[i]).length;
  assert.ok(changed > path.length * .7, "most of the long stroke still untouched");
  // Full local Power is retained if a gesture is made three times as long by retracing it.
  const repeated = verify(m, before, [...c.points, ...c.points.slice().reverse(), ...c.points], { ...c, power: 100, size: 100 });
  const once = verify(m, before, c.points, { ...c, power: 100, size: 100 });
  assert.ok(repeated.worn >= once.worn * .95, "stroke length diluted Power");
  assert.ok(once.worn > pinned.worn);
  for (const kind of ["crater", "plateau", "canyon"] as const) for (const power of [30, 72, 100]) for (let seed = 1; seed <= 4; seed++) {
    const map = load(kind === "plateau" ? "step" : kind), t = Terrain.fromHeights(map.W, map.H, map.heights);
    const p = verify(map, t, longSweep(map, kind, seed - 2), { power, size: seed % 2 ? 35 : 100, seed, floor: seed === 4 ? 6 : 1 });
    assert.ok(p.worn > 0, `${kind}: long sweep refused`);
  }
  // The round-7 all-roof dispatcher must no longer swallow the open part of a long gesture.
  const roof = roofMap();
  for (const nz of [1, -1]) {
    const top = (x: number, y: number) => ({ x: x + .5, y: y + .5, z: roof.terrain.surface(y * 128 + x) - .5, nz: 1 });
    const p = verify(roof.map, roof.terrain, [top(35, 53), { x: 63.5, y: 53.5,
      z: nz < 0 ? roof.terrain.runs(53 * 128 + 63)[2] + .5 : roof.terrain.surface(53 * 128 + 63) - .5, nz }, top(98, 65)],
      { power: 72, size: 68, seed: 1 });
    assert.ok(p.sweep!.roofs > 0 && p.sweep!.washes > 0);
    assert.ok(p.falling!.some(Boolean));
  }
  const kept = { ...m, keep: m.keep.slice(), water: m.water.slice() };
  const source = 114 * m.W + 109; kept.keep[source] = 1; kept.water[source] = 1;
  assert.notEqual(pinned.final.cols[source], before.cols[source], "source fixture must protect ground otherwise worn");
  verify(kept, before, c.points, c);
  // Previous suites lock the nine unchanged land fixtures. Add exact roof and new-step locks.
  const hashes = ["a85a6f36ba1bcdb0b9e13ab9649214cd194d0c3c10db9158fbaabddb5e4086a0",
    "192bf1d175ce3c27d151a72e4aec0f6ed5edaa96411ac0aa8785d03293527564", "92aba037582f48664ab41565a0ce3337b94ecfd996427235efbda2e050014996"];
  ROOF_CASES.forEach((c, k) => assert.equal(digest(planErode({ terrain: roof.terrain, rock: roof.map.rock, keep: roof.map.keep }, { points: c.points }, c)), hashes[k]));
  const step = CASES.find(c => c.id === "wash-step")!, sm = load(step.map);
  const sp = verify(sm, Terrain.fromHeights(sm.W, sm.H, sm.heights), step.points, step);
  assert.ok(sp.sweep!.galleries && sp.sweep!.washes && sp.final.multiRun() > 0, "step crossing lacks a gallery plus wash");
  const result = { result: "PASS", gestures, animationBuckets: frames, droppedVoxels: 0, leftoverSingleBlocks: 0,
    bottomLayer: "PASS", chosenFloor: "PASS", sourceGround: "PASS", supportedObjects: "PASS", powerUndiluted: "PASS",
    preservedRound7Fixtures: 12, deliberatelyChanged: ["wash-step: whole-face gallery plus the shallow wash"],
    longestStrokeTiles: Math.round(longestTiles), slowestPlannerMs: Math.round(longestMs), maxWorn,
    kyler: { power: 72, size: 68, beforeWorn: 861, worn: pinned.worn, beforeChangedSamples: 34, changedSamples: changed,
      strokeSamples: path.length, parts: pinned.sweep, sha256: digest(pinned) } };
  console.log(JSON.stringify(result)); return result;
}
