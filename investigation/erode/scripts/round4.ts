import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { checkSupport } from "../../terrain3d/proto/support";
import { landAt, planErode, planLocal, type ErodeSettings } from "../core/erode";
import { washMap, type ErodeMap } from "../core/map";
import { LAYERS, Terrain } from "../core/terrain";
import { CASES } from "../demo/cases";
import { UNEVEN_CASES, unevenMap } from "../demo/uneven";
import { bottomCheck, drainageMetrics, shelterMetrics } from "./round2";

export function round4Checks(load: (id: string) => ErodeMap) {
  // Round 8 composes tall cliff crossings with galleries. Keep these drainage/cap assertions
  // on the unchanged local wash; round8.ts checks the full mixed crossing independently.
  const run = (m: ErodeMap, points: { x: number; y: number; z?: number }[], settings: ErodeSettings, local = false) => {
    const before = Terrain.fromHeights(m.W, m.H, m.heights);
    const p = (local ? planLocal : planErode)({ terrain: before, rock: m.rock, keep: m.keep, water: m.water }, { points }, settings);
    bottomCheck(before, p);
    return { before, p };
  };
  // Supplement round 3's four preservation hashes with its improved arch and giant wash.
  for (const [id, expected] of Object.entries({
    "tall-arch": "4a71d8c73d6742474259532c8e0fa73ddafeb5156f9bd46d02a435b84b7fd3ac",
    "wash-giant": "7d3b3d849bd4f6eb1f23bb1f24f2efca4eb20f65ab28f4f2c55ec8b4b66fe170",
  })) {
    const c = CASES.find(c => c.id === id)!;
    assert.equal(createHash("sha256").update(new Uint8Array(run(load(c.map), c.points, c).p.final.cols.buffer)).digest("hex"), expected);
  }
  const flat = washMap(), digest = createHash("sha256"); flat.heights.fill(12);
  for (const power of [30, 100]) for (let seed = 1; seed <= 4; seed++) for (const click of [false, true]) {
    const points = [{ x: 35.5, y: 46.5, z: 11.9 }, ...(!click ? [{ x: 95.5, y: 77.5, z: 11.9 }] : [])];
    digest.update(new Uint8Array(run(flat, points, { power, size: power, seed }).p.final.cols.buffer));
  }
  assert.equal(digest.digest("hex"), "71d3abb647710b848db7c7f66e8cab09515a3e43b109721c9ea0a17601945aaa", "flat land changed from round 3");

  const cases = UNEVEN_CASES.filter(c => c.map !== "rise").map(c => {
    const m = load(c.map), { before, p } = run(m, c.points, c, true), a = p.final;
    const drainage = drainageMetrics(before, p), path = p.wash!.path;
    assert.deepEqual(a.cols, run(m, c.points.slice().reverse(), c, true).p.final.cols, "drawing direction changed the wash");
    const drops = path.slice(1).map((i, k) => a.run0Top(path[k]) - a.run0Top(i)).filter(d => d > 0);
    const depths = path.map(i => before.surface(i) - a.run0Top(i));
    assert.ok(Math.min(...depths) >= 1, "wash disappears on lower ground");
    assert.ok(new Set(path.map(i => a.run0Top(i))).size >= (c.map === "step" ? 3 : 5), "bed flattened the terrain's levels");
    assert.ok(Math.max(...drops) >= (c.map === "step" ? 10 : 3), "natural step needs a dry fall");
    const incision = 1 + Math.round(2 * (c.power / 100) ** 2);
    for (let i = 0; i < before.N; i++) assert.ok(before.surface(i) - a.run0Top(i) <= incision, "wash exceeds the shallow cap");
    const debris = shelterMetrics(before, { ...p, focus: { ...p.focus!, z: Math.min(...path.map(i => a.run0Top(i))) } });
    assert.equal(debris.leftoverSingleBlocks + debris.leftoverSmallClusters, 0);
    for (let b = 0; b < p.buckets; b++) assert.equal(checkSupport(m.W, m.H, landAt(before, p, b).voxels(), LAYERS).unsupported.length, 0);
    return { case: c.id, result: "PASS", ...drainage, minDepth: Math.min(...depths), maxStepDrop: Math.max(...drops),
      leftoverSingleBlocks: debris.leftoverSingleBlocks, leftoverSmallClusters: debris.leftoverSmallClusters };
  });

  // Slopes, an intervening rise, varied Power/Size and pinned extremes, both directions.
  let variants = 0;
  for (const id of ["terraces", "slope", "step", "rise"]) for (const power of [30, 85, 100]) for (let seed = 1; seed <= 4; seed++) {
    const m = unevenMap(id === "rise" ? "slope" : id)!;
    if (id === "rise") for (let i = 0; i < m.heights.length; i++) if (i % m.W >= 57 && i % m.W < 65) m.heights[i] = Math.min(22, m.heights[i] + 4);
    const points = Array.from({ length: 10 }, (_, k) => ({ x: 18.5 + k * 10, y: 53.5 + k * 2 }));
    const settings = { power, size: power, seed, ...(seed > 2 ? { details: { winding: seed === 3 ? 0 : 100,
      sideGullies: seed === 3 ? 0 : 100, dryFalls: seed === 3 ? 0 : 100, undercutBanks: seed === 3 ? 0 : 100 } } : {}) };
    const { before, p } = run(m, points, settings, true);
    drainageMetrics(before, p);
    assert.deepEqual(p.final.cols, run(m, points.slice().reverse(), settings, true).p.final.cols);
    variants++;
  }
  const cliff = unevenMap("step")!;
  const crossing = [UNEVEN_CASES[2].points[0], ...Array.from({ length: 5 }, (_, k) => ({ x: 64.5, y: 62.5, z: 20 - k * 2 })), UNEVEN_CASES[2].points[2]];
  const wallHits = run(cliff, crossing, { power: 85, size: 80, seed: 1 }, true);
  drainageMetrics(wallHits.before, wallHits.p); // intermediate pointer hits on the step still belong to one wash
  const gallery = run(cliff, [{ x: 65.5, y: 44.5, z: 10.5 }, { x: 65.5, y: 79.5, z: 10.5 }], { power: 85, size: 80, seed: 1 }).p;
  assert.equal(gallery.wash, undefined, "a sweep along the cliff foot switched to wash");
  assert.ok(gallery.worn > 0 && gallery.final.multiRun() > 0);
  assert.equal(checkSupport(cliff.W, cliff.H, gallery.final.voxels(), LAYERS).unsupported.length, 0);
  const row = { result: "PASS", scope: "Local washes; round 8 separately checks mixed cliff crossings", cases, unevenVariantsBothDirections: variants, preservedFlatVariants: 16,
    preservedRound3Cases: 6, cliffFootGallery: "PASS", stepFacePointerHits: "PASS", animationSupport: "PASS" };
  console.log(JSON.stringify(row)); return row;
}
