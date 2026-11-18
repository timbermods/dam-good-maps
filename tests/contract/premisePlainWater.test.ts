// The poisoned floodplain's stage 3, the water and the hazard (docs/design/poisoned-floodplain.md §2, §4, §7 "settled",
// §9 row 3): a map at 128² built and settled on its first attempt, its start passing every start check, the river
// clean, every water on its course, the bands by the game's soil inside their ranges, the Red Fall falling as one whole
// curtain, the levee holding a badtide, the dead band under dead trees; the same map for the same seed; and a
// hand-broken map for every settled invariant, `riverIn.green`'s flooded start among them. Seeds 1 to 12 at each size are
// premisePlainWater.heavy.test.ts.

import { describe, expect, it } from "vitest";
import { runsToTiles } from "../../src/core/math/grid";
import { modelOf } from "../../src/core/features/build";
import { startMiddleTile } from "../../src/core/format/footprints";
import { badtideReach, cleanWater, floorTiles, plainCourses, plainLeaks, plainMap, redFallCurtain, redFallDrop, riverInBands, riverInFailure, riverRed, settledBands, settledFailures, START_KEEP, WET, type PlainMap } from "../../src/core/premise/plainMap";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { DEAD_SHARE, DRY_LEAST, PLAIN_IDS, plainOf } from "../../src/core/premise/premises/poisonedPlain";
import { makeSpec } from "../../src/core/spec/mapspec";

// (seed 5: step 5 moved the start and the walls, and seed 2 at 128² now holds on its third attempt; the test is of a map
// that holds on its first)
const spec = makeSpec({ seed: 5, size: { x: 128, y: 128 }, theme: "any", premise: "any" });
const made = plainMap(spec);
if ("reason" in made) throw new Error(made.reason);
const good: PlainMap = made;
const { plan, water, relief } = good.land;
const b = good.map.built;
const W = plan.W;
const N = W * W;

describe("The poisoned floodplain's water", () => {
  it("holds on its first attempt: the start, the shared gate and every settled invariant", () => {
    expect(good.held).toBe(true);
    expect(good.attempt).toBe(0);
    expect(good.map.report.passed).toBe(true);
    for (const [id, n] of Object.entries(good.start)) expect(n.ok, `${id} ${n.value}/${n.limit}`).toBe(true);
    expect(good.settledFails).toEqual([]);
  });

  it("runs three sources: the river's springs, the start's brook and the red source at a share of the river", () => {
    const s = good.settled.sources;
    expect(s.river).toBeGreaterThan(s.brook);
    expect(s.red / s.river).toBeGreaterThanOrEqual(1 / 5 - 1e-9);
    expect(s.red / s.river).toBeLessThanOrEqual(1 / 3 + 1e-9);
    const red = b.waterModel.emitters.filter((e) => e.contamination > 0);
    expect(red.length).toBe(1);
  });

  it("lays its bands by the game's soil inside the design's ranges, the dead band under dead trees", () => {
    const { dead, dry } = good.settled.bands;
    expect(dead).toBeGreaterThanOrEqual(DEAD_SHARE[0]);
    expect(dead).toBeLessThanOrEqual(DEAD_SHARE[1]);
    expect(dry).toBeGreaterThanOrEqual(DRY_LEAST);
    const deadStands = good.map.features.filter((f) => f.kind === "forest" && f.role?.startsWith("premise/deadBand/"));
    expect(deadStands.length).toBeGreaterThan(0);
    for (const f of deadStands) {
      if (f.kind !== "forest") continue;
      expect(f.params.life).toBe("dead");
      for (const i of runsToTiles(f.params.area, W)) expect(b.soilContamination[i], `dead tree at ${i % W}, ${Math.floor(i / W)}`).toBeGreaterThan(0);
    }
  });

  it("runs its river in steps under its levees' crest, and reads the river's red on the file's water", () => {
    // (ruling 1 of step 3's round 2: the bed falls a level at riffles, as often as its length needs; the water stands
    // under the levees' crest and the plain beside it all along; a joined map reports the mix below its join, an exit
    // map has none)
    expect(good.settled.stand.steps).toBeGreaterThanOrEqual(1);
    expect(good.settled.stand.crest).toBeGreaterThan(0);
    expect(good.settled.stand.plain).toBeGreaterThan(0);
    expect(good.settled.river.tiles).toBe(0);
    if (plainOf(plan)!.red.end === "join") expect(good.settled.mix).not.toBeNull();
    else expect(good.settled.mix).toBeNull();
  });

  it("is the same map for the same seed", () => {
    const again = plainMap(spec);
    if ("reason" in again) throw new Error(again.reason);
    expect(Buffer.from(again.map.built.water.buffer).equals(Buffer.from(b.water.buffer))).toBe(true);
    expect(again.map.features.length).toBe(good.map.features.length);
  });
});

describe("Broken poisoned-floodplain water fails its settled invariants", () => {
  const ids = (s: Partial<typeof good.settled>) => settledFailures({ ...good.settled, ...s }).map((f) => f.id);
  const dryFloor = (): number => {
    const courses = plainCourses(plan, water, relief);
    const on = floorTiles(plan, relief.floor);
    for (let i = 0; i < N; i++) if (on[i] && !courses[i] && !(b.water[i] >= WET)) return i;
    throw new Error("no dry floor");
  };

  it("river.clean: one tile of the river at contamination 0.6", () => {
    const c = b.contamination.slice();
    const k = plan.links.findIndex((l) => l.id === PLAIN_IDS.river) + 1;
    let i = 0;
    while (!(water.raster.channel[i] === k && b.water[i] >= WET)) i++;
    c[i] = 0.6;
    expect(ids({ river: riverRed(cleanWater(plan, water), b.water, c) })).toContain("river.clean");
  });

  it("water.leaks: water standing on a dry tile of the floor", () => {
    const d = b.water.slice();
    d[dryFloor()] = 0.3;
    expect(ids({ leaks: plainLeaks(plainCourses(plan, water, relief), d, W) })).toContain("water.leaks");
  });

  it("plain.bands: the floor's soil poisoned everywhere, and nowhere", () => {
    const on = floorTiles(plan, relief.floor);
    expect(ids({ bands: settledBands(on, { ...b, soilContamination: new Float64Array(N).fill(1) }) })).toContain("plain.bands");
    expect(ids({ bands: settledBands(on, { ...b, soilContamination: new Float64Array(N) }) })).toContain("plain.bands");
  });

  it("fall.settled: the Red Pool's water raised two levels", () => {
    const d = b.water.slice();
    const k = plan.bodies.findIndex((x) => x.id === PLAIN_IDS.redPool) + 1;
    for (let i = 0; i < N; i++) if (water.raster.lake[i] === k && d[i] >= WET) d[i] += 2;
    expect(ids({ fall: redFallDrop(plan, water, b.heights, d) })).toContain("fall.settled");
  });

  it("fall.whole: a pillar of dry ground at the middle of the Red Fall's lip splits its curtain", () => {
    const lips = water.raster.lips[PLAIN_IDS.redFall] ?? [];
    const mid = lips[lips.length >> 1];
    const h = b.heights.slice();
    const d = b.water.slice();
    h[mid] += 3;
    d[mid] = 0;
    expect(ids({ curtain: redFallCurtain(plan, water, { heights: h, water: d }) })).toContain("fall.whole");
  });

  it("levee.holds: the levees' banks levelled to the plain", () => {
    const h = b.heights.slice();
    for (let i = 0; i < N; i++) h[i] -= relief.bank[i];
    expect(ids({ badtide: badtideReach(plan, water, relief, { ...b, heights: h }) })).toContain("levee.holds");
  });

  it("riverIn.green: a start moved onto ground the turn and the river in flood is refused (step 5)", () => {
    // (the made map's start is dry with both works built; the same map with its start's middle on the tile whose
    // ground the works' water covers most is refused by the generator's gate, as the proof's `start === 0` refuses it)
    const ri = riverInBands(good.land, good.ladder, b);
    expect(ri?.start).toBe(0);
    expect(riverInFailure(ri)).toBeNull();
    const h = Uint8Array.from(b.heights);
    for (const id of ["turn", "riverIn"]) {
      const s = good.ladder.works.find((x) => x.id === id)!;
      for (const i of s.tiles) h[i] = Math.max(h[i], s.level!);
    }
    const d = canonicalSettle(modelOf({ W, H: W, heights: h, entities: b.entities })).depth;
    const flooded = (i: number) => d[i] >= WET && !(b.water[i] >= WET);
    let at = -1;
    let most = 0;
    for (let i = 0; i < N; i++) {
      if (!flooded(i)) continue;
      let n = 0;
      for (let dy = -START_KEEP; dy <= START_KEEP; dy++)
        for (let dx = -START_KEEP; dx <= START_KEEP; dx++) {
          const x = (i % W) + dx;
          const y = Math.floor(i / W) + dy;
          if (x >= 0 && x < W && y >= 0 && y < W && flooded(y * W + x)) n++;
        }
      if (n > most) [at, most] = [i, n];
    }
    expect(at).toBeGreaterThanOrEqual(0);
    const st = good.land.frame.start;
    const [mx, my] = startMiddleTile(st);
    const moved = { ...st, x: st.x + (at % W) - mx, y: st.y + Math.floor(at / W) - my };
    const broken = riverInBands({ ...good.land, frame: { ...good.land.frame, start: moved } }, good.ladder, b);
    expect(broken?.start).toBe(most);
    expect(riverInFailure(broken)).toMatch(/^riverIn\.green: .*start's ground are under water/);
  });
});
