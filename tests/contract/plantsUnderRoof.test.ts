// Plants under a roof live or die by the run top they stand on (D235, D491; #553's review): the game keeps one soil
// value per run top (`SoilMoistureSimulator`, `SoilContaminationSimulator`) and spawns or kills a plant by the moisture,
// contamination and water on its own, never its roof's. So the brush's warning (core/doc/paint.ts `paintDying`,
// plantSoil.ts `dyingTiles`, on the session's soil per run top: `MapSession.runGrounds`) and the check
// (`plants.survive`, rust/checks/src/playability.rs, fed each plant's run top by validate/rust.ts) read a cave floor's
// plant by its floor, and agree on which die.

import { describe, expect, it } from "vitest";
import { paintDying, planPaintObjects } from "../../src/core/doc/paint";
import type { PaintParams } from "../../src/core/doc/paintParams";
import { diesOnSoil } from "../../src/core/doc/plantSoil";
import { MapSession } from "../../src/core/doc/session";
import { stackedSimulationSingletons } from "../../src/core/format/world";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { tilesToRuns } from "../../src/core/math/grid";
import { waterColumns } from "../../src/core/sim/columns";
import { columnSaturation, soil3d } from "../../src/core/sim/soil3d";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { checksCases } from "../../tools/rust/checks-jobs";
import { CAVE, CAVE_H as H, CAVE_W as W, caveFile, caveVoxels, dig, hillsides } from "./caveMap";

/** The cave's east half, a step two levels up: its floor at level 5 under the roof. */
const STEP_X = CAVE.x0 + 3;
const Z = CAVE.air[0] + 2;
const caveTiles: number[] = [];
for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = STEP_X; x <= CAVE.x1; x++) caveTiles.push(y * W + x);

/** The cave map with a pool of clean water on its cave's floor (its west half, level 3, 1.2 deep) beside the step,
 *  which it keeps moist and dry, under a dry roof; with the game's soil per run top, stored as the game saves it. */
function steppedCave(): Uint8Array {
  const voxels = caveVoxels();
  const N = W * H;
  for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = STEP_X; x <= CAVE.x1; x++) for (let z = CAVE.air[0]; z < Z; z++) voxels[z * N + y * W + x] = 1;
  const mask = new Uint32Array(N);
  for (let z = 0; z < 23; z++) for (let i = 0; i < N; i++) if (voxels[z * N + i]) mask[i] |= 1 << z;
  const masks = { W, H, mask };
  const cols = waterColumns(masks, []);
  const depth = new Float64Array(cols.L * N);
  const contamination = new Float64Array(cols.L * N);
  for (let y = CAVE.y0; y <= CAVE.y1; y++)
    for (let x = CAVE.x0; x < STEP_X; x++) {
      const i = y * W + x;
      for (let k = 0; k < cols.count[i]; k++) if (cols.floor[k * N + i] === CAVE.air[0]) depth[k * N + i] = 1.2;
    }
  const sat = columnSaturation(cols, depth);
  const soil = soil3d(masks, cols, { depth, contamination, sat });
  const file = caveFile(voxels);
  file.world.singletons = stackedSimulationSingletons(W, H, { cols, depth, overflow: new Float64Array(depth.length), contamination, sat, runs: soil.runs, moisture: soil.moisture, soilContamination: soil.contamination });
  return writeTimber(file);
}

/** A stroke over `tiles` of a map `w` wide, at level `z` under a roof when one is given. */
const stroke = (kind: PaintParams["kind"], template: string | undefined, z?: number, tiles = caveTiles, w = W): PaintParams => ({
  kind,
  ...(template ? { template } : {}),
  area: tilesToRuns(tiles, w),
  density: 1,
  seed: 11,
  ...(z !== undefined ? { levels: [{ z, area: tilesToRuns(tiles, w) }] } : {}),
});

/** The plants `plants.survive` flags on the map as it stands. */
function flagged(s: MapSession): Set<string> {
  const c = s.validate().report.checks.find((k) => k.id === "plants.survive")!;
  expect(c.applicable, c.message).not.toBe(false);
  return new Set(c.where?.entities ?? []);
}

describe("plants under a roof: their run top's soil, for the warning and the check alike (D235, D491)", () => {
  for (const settled of [false, true]) {
    it(`the warning: bushes on a moist cave floor under a dry roof live, succulents die (${settled ? "the settled water" : "the file's own water"})`, () => {
      const s = MapSession.importMap(steppedCave(), "cave.timber");
      // (an edit away from the cave: the water is then the stacked settle's, the soil on every run top with it)
      if (settled) {
        expect(s.apply({ op: "brush", params: { tool: "raise", size: 2, strength: 5, shape: "area", target: 10, dabs: [6, 6, 10, 10] } } as never).errors).toEqual([]);
        s.settleCanonical();
        expect(s.built.waterFromFile).toBe(false);
      }
      const runs = s.runGrounds();
      expect(runs, "the ground per run top is known").not.toBeNull();
      // the step's floor: dry, moist beside the pool, under a dry roof
      expect(caveTiles.every((i) => runs!(i, Z) !== null && runs!(i, Z)!.depth <= 0.05)).toBe(true);
      expect(caveTiles.filter((i) => runs!(i, Z)!.moisture > 0 && runs!(i, Z)!.contamination === 0).length).toBeGreaterThan(caveTiles.length / 2);
      expect(caveTiles.every((i) => !(runs!(i, 8)!.moisture > 0))).toBe(true);
      // on the floor only the tiles whose own run kills a bush are named; on the roof's top, every tile
      const dying = new Set(paintDying(s, stroke("bushes", "BlueberryBush", Z)));
      const ground = { moisture: s.built.moisture, contamination: s.built.soilContamination, depth: s.built.water, runs };
      expect(caveTiles.filter((i) => !dying.has(i)).length).toBeGreaterThan(caveTiles.length / 2);
      for (const i of caveTiles) expect(dying.has(i), `tile ${i % W},${Math.floor(i / W)}`).toBe(diesOnSoil("BlueberryBush", ground, i, Z));
      expect(new Set(paintDying(s, stroke("bushes", "BlueberryBush")))).toEqual(new Set(caveTiles));
      // (succulents the other way round: they die on the moist floor, live on the dry roof)
      expect(paintDying(s, stroke("succulents", undefined, Z)).length).toBe(caveTiles.length - dying.size);
      expect(paintDying(s, stroke("succulents", undefined))).toEqual([]);
    });
  }

  it("the check: a bush in a moist hollow under a dry hillside lives, one on the hillside's top dies, as the warning says", () => {
    // (the hollows are this test's own: the map without its 3D forms, D488, so none stands where one is dug; seed 29 for seed 5 on generator 0.10.7's maps, D502: seeds 1 to 9 have fewer than three moist dry feet of a hillside, and seed 29 has six)
    const r = generate(makeSpec({ seed: 29, theme: "riverValley", size: { x: 64, y: 64 } }), { forms: false });
    const s = MapSession.fromGenerated(r, r.file);
    const M = s.size.x;
    // hollows dug at the feet of hillsides on moist ground, each a roof over it, the hillside's top dry
    const feet = hillsides(s, 2)
      .filter((h) => s.built.moisture[h.y * M + h.x - 1] > 0 && !(s.built.moisture[h.y * M + h.x] > 0))
      .slice(0, 6);
    expect(feet.length).toBeGreaterThanOrEqual(3);
    for (const h of feet) expect(s.apply(dig(h.x, h.y, h.z, "-x")).errors).toEqual([]);
    s.settleCanonical();
    const runs = s.runGrounds()!;
    const level = new Map(feet.map((h) => [h.y * M + h.x, h.z]));
    const hollows = [...level.keys()];
    const ground = { moisture: s.built.moisture, contamination: s.built.soilContamination, depth: s.built.water, runs };
    expect(
      hollows.some((i) => runs(i, level.get(i)!)!.moisture > 0 && !(s.built.moisture[i] > 0)),
      "a moist hollow under a dry top",
    ).toBe(true);
    // a bush in each hollow (the stroke's levels: each its own floor), and some on the tops east of them
    const under: PaintParams = { ...stroke("bushes", "BlueberryBush", undefined, hollows, M), levels: feet.map((h) => ({ z: h.z, area: tilesToRuns([h.y * M + h.x], M) })) };
    const dying = new Set(paintDying(s, under));
    const p = planPaintObjects(s, under);
    expect(p.ok && s.applyBatch(p.ops, "user", p.label).errors).toEqual([]);
    const tops = feet.map((h) => h.y * M + h.x + 1);
    const t = planPaintObjects(s, { ...stroke("bushes", "BlueberryBush", undefined, tops, M), seed: 12 });
    expect(t.ok && s.applyBatch(t.ops, "user", t.label).errors).toEqual([]);
    const mine = new Set([...(p.ok ? p.ops : []), ...(t.ok ? t.ops : [])].map((o) => (o.op === "placeEntity" ? o.params.id : "")));
    const bushes = s.built.entities.filter((e) => mine.has(e.id));
    const inHollows = bushes.filter((e) => level.get(e.y * M + e.x) === e.z);
    const onTops = bushes.filter((e) => tops.includes(e.y * M + e.x));
    expect(inHollows.length).toBe(feet.length);
    expect(onTops.length).toBeGreaterThan(0);
    const bad = flagged(s);
    for (const e of inHollows) {
      expect(bad.has(e.id), `the bush in the hollow at ${e.x},${e.y},${e.z}`).toBe(dying.has(e.y * M + e.x));
      expect(bad.has(e.id)).toBe(diesOnSoil("BlueberryBush", ground, e.y * M + e.x, e.z));
    }
    for (const e of onTops) expect(bad.has(e.id), `the bush on the top at ${e.x},${e.y},${e.z}`).toBe(diesOnSoil("BlueberryBush", ground, e.y * M + e.x));
    expect(inHollows.some((e) => !bad.has(e.id)), "a bush in a moist hollow lives though the top over it is dry").toBe(true);
    expect(onTops.some((e) => bad.has(e.id)), "a bush on a dry top dies").toBe(true);
  }, 120_000);

  it("the start's food counts the bushes plants.survive keeps: on a cave's step by the start, by their run top (the pinned fixture)", () => {
    // (tools/rust/checks-jobs.ts: 12 bushes on a step beside a pool under a dry roof, 3 on the roof's top)
    const c = checksCases().find((k) => k.name === "a cave by the start: plants on its run tops")!;
    const checks = validateMap(c.file, c.opts).report.checks;
    const ids = c.file.world.entities.map((e) => String(e.Id)).filter((id) => id.startsWith("00000000"));
    const bad = new Set(checks.find((k) => k.id === "plants.survive")!.where?.entities ?? []);
    expect(ids.filter((id) => !bad.has(id)).length, "the bushes on the moist step live").toBe(12);
    expect(ids.filter((id) => bad.has(id)).length, "the bushes on the dry roof die").toBe(3);
    // (the fixture's own bushes stand on dry ground: only the step's count)
    expect(checks.find((k) => k.id === "start.food")!.value).toBe(12);
  });
});
