import assert from "node:assert/strict";
import { checkSupport } from "../../terrain3d/proto/support";
import { landAt, planErode, type ErodePlan } from "../core/erode";
import { settleThings } from "../core/objects";
import { hash } from "../core/random";
import { LAYERS, Terrain } from "../core/terrain";
import { waterPools } from "../core/water";
import type { ErodeMap } from "../core/map";
import { CASES } from "../demo/cases";
import { roofMap, ROOF_CASES } from "../demo/roofs";
import { bottomCheck, shelterMetrics } from "./round2";

export function round7Checks(load?: (id: string) => ErodeMap) {
  const { map: m, terrain: before } = roofMap(), input = { terrain: before, rock: m.rock, keep: m.keep, water: m.water };
  assert.equal(checkSupport(m.W, m.H, before.voxels(), LAYERS).unsupported.length, 0, "fixture support");
  let frames = 0, gestures = 0;
  const verify = (p: ErodePlan, floor: number, source = before, things = m.things, water = m.water) => {
    assert.ok(p.roof, "roof/ceiling gesture used the ground planner");
    bottomCheck(source, p);
    assert.ok(p.removed.every(v => v >= floor * source.N), "cut below Floor");
    const mask = (1 << floor) - 1;
    for (let i = 0; i < source.N; i++) assert.equal(source.cols[i] & ~p.final.cols[i] & mask, 0);
    for (let b = 0; b < p.buckets; b++) {
      const shown = landAt(source, p, b);
      assert.equal(checkSupport(source.W, source.H, shown.voxels(), LAYERS).unsupported.length, 0, `frame ${b} support`);
      for (const th of settleThings(shown, things, water)) {
        assert.ok(shown.solid(th.x, th.y, th.z - 1), "floating object");
        if (th.template === "StartingLocation") for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
          assert.ok(shown.solid(th.x + dx, th.y + dy, th.z - 1));
          for (let dz = 0; dz < 5; dz++) assert.ok(!shown.solid(th.x + dx, th.y + dy, th.z + dz));
        }
      }
      frames++;
    }
    assert.deepEqual(landAt(source, p, p.buckets - 1).cols, p.final.cols, "animation and final terrain differ");
    const floorUnder = Math.min(...p.removed.map(v => source.run0Top(v % source.N)));
    const singles = shelterMetrics(source, { ...p, focus: { ...p.focus!, z: Number.isFinite(floorUnder) ? floorUnder : 1 } }).leftoverSingleBlocks;
    assert.equal(singles, 0, "leftover single blocks");
    gestures++;
  };
  const cases = ROOF_CASES.map(c => {
    const p = planErode(input, { points: c.points }, c); verify(p, 1);
    assert.ok(p.worn > 0);
    const openings = Array.from({ length: before.N }, (_, i) => i).filter(i => !before.plain(i) && p.final.plain(i));
    const raised = Array.from({ length: before.N }, (_, i) => i).filter(i => !p.final.plain(i) &&
      p.final.runs(i)[2] > before.runs(i)[2]).length;
    if (c.id === "roof-skylight") assert.ok(openings.length > 1 && openings.length < 25, "low Power skylight should be a few tiles");
    if (c.id === "roof-bridge") {
      assert.ok(openings.length > 40 && p.added!.length >= 8, "high Power collapse needs openings and rubble");
      // A roofed cross-section survives between two openings, tied into both walls.
      assert.ok(Array.from({ length: 12 }, (_, k) => 60 * m.W + 58 + k).every(i => p.final.surface(i) > 10));
      assert.ok(!settleThings(p.final, m.things).some(th => th.id === "roof-pine"));
      assert.notDeepEqual(settleThings(p.final, m.things).find(th => th.id === "roof-start"), m.things.find(th => th.id === "roof-start"));
    }
    if (c.id === "roof-dome") assert.ok(raised > 10, "ceiling should wear into a higher vault");
    return { case: c.id, power: c.power, size: c.size, worn: p.worn, rubble: p.added!.length,
      skylightTiles: openings.length, raisedCeilingTiles: raised, dropped: 0, leftoverSingleBlocks: 0, result: "PASS" };
  });
  // Both surfaces, clicks and sweeps, on varied thicknesses; modest, medium and large forces.
  for (const nz of [-1, 1]) for (const power of [15, 50, 100]) for (const size of [25, 100]) for (let seed = 1; seed <= 4; seed++) {
    const x = 60 + Math.floor(hash(seed, 71) * 7), y = 45 + Math.floor(hash(seed, 81) * 28);
    const point = (x: number, y: number) => ({ x: x + 0.5, y: y + 0.5, z: nz < 0 ? before.runs(y * m.W + x)[2] + 0.5 : before.surface(y * m.W + x) - 0.5, nz });
    const points = [point(x, y), ...(seed % 2 ? [] : [point(x, Math.min(75, y + 5))])];
    const p = planErode(input, { points }, { power, size, seed });
    assert.ok(p.worn > 0, "reachable rock refused"); verify(p, 1);
  }
  for (const floor of [8, 12, 18, 22]) for (const c of ROOF_CASES) verify(planErode(input, { points: c.points }, { ...c, floor }), floor);
  let existingShelterGestures = 0;
  if (load) for (const c of CASES.slice(0, 3)) {
    const m = load(c.map), terrain = Terrain.fromHeights(m.W, m.H, m.heights);
    const source = planErode({ terrain, rock: m.rock, keep: m.keep }, { points: c.points }, c).final;
    const roofed = Array.from({ length: source.N }, (_, i) => i).filter(i => !source.plain(i) && !m.keep[i]);
    for (const nz of [-1, 1]) for (const power of [25, 100]) for (const size of [30, 100]) {
      const i = roofed[Math.floor(hash(power, size + nz) * roofed.length)], runs = source.runs(i);
      const points = [{ x: i % m.W + 0.5, y: Math.floor(i / m.W) + 0.5, z: nz < 0 ? runs[2] + 0.5 : source.surface(i) - 0.5, nz }];
      const p = planErode({ terrain: source, rock: m.rock, keep: m.keep, water: m.water }, { points }, { power, size, seed: 1 });
      assert.ok(p.worn > 0); verify(p, 1, source, m.things, m.water); existingShelterGestures++;
    }
  }
  // A source on a roof protects both its column and the original support chain beneath it.
  const source = 53 * m.W + 63; m.keep[source] = 1; m.water[source] = 1;
  const p = planErode(input, { points: ROOF_CASES[1].points }, ROOF_CASES[1]); verify(p, 1);
  assert.equal(p.final.cols[source], before.cols[source]);
  assert.ok(p.worn > 0, "a protected source should not stop all surrounding wear");
  assert.ok(waterPools(p.final, m.water).every(pool => p.final.at(pool.tile, pool.floor - 1)), "water has no ground");
  const result = { result: "PASS", cases, randomRoofCeilingGestures: 48, existingShelterGestures, totalGestures: gestures, animationFrames: frames,
    droppedVoxels: 0, leftoverSingleBlocks: 0, support: "PASS", floorAndBottom: "PASS", sourceGround: "PASS",
    objectsAndStart: "PASS", waterResettled: "PASS", fixturePreservation: "See round6 and round8 checks for local and mixed results" };
  console.log(JSON.stringify(result)); return result;
}
