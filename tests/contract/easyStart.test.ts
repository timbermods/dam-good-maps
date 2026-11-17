// Easy start (D495): the setting's link key, the ground the generator shapes for it, and a generated map with it on
// holding every target (analysis/easyStart.ts `EASY_START`), each a row of the generate profile's checks.

import { describe, expect, it } from "vitest";
import { EASY_LAND, EASY_START, easyShortfall, easyStartMeasures, easyTargets } from "../../src/core/analysis/easyStart";
import { decodeProject, encodeProject, generatedDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { startEntity } from "../../src/core/features/build";
import type { StartFeature } from "../../src/core/features/schema";
import { entityJson, type EntitySpec } from "../../src/core/format/entities";
import { surfaceOf } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { planResources } from "../../src/core/gen/resources";
import { showcaseSpec } from "../../src/core/gen/showcase";
import { cutLevel, pondWater, shapeEasyStart } from "../../src/core/land/easyStart";
import { runsToTiles } from "../../src/core/math/grid";
import { stream } from "../../src/core/math/rng";
import { mapObjects } from "../../src/core/sim/model";
import { decodeSpecFragment, encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";

describe("Easy start's link key", () => {
  it("is written only when on, and an old link reads as off", () => {
    const spec = makeSpec({ seed: 7, theme: "any" });
    expect(encodeSpecFragment(spec)).not.toContain("es=");
    expect(decodeSpecFragment(encodeSpecFragment(spec))!.spec.settings.start.easyStart).toBeUndefined();
    spec.settings.start.easyStart = true;
    const link = encodeSpecFragment(spec);
    expect(link).toContain("es=1");
    const back = decodeSpecFragment(link)!;
    expect(back.problems).toEqual([]);
    expect(back.spec).toEqual(spec);
    // (off spelled out is off: no field at all)
    expect(decodeSpecFragment("s=7&t=any&es=0")!.spec.settings.start.easyStart).toBeUndefined();
    expect(decodeSpecFragment("s=7&t=any&es=x")!.problems.length).toBe(1);
  });

  it("goes with every map Showcase mode and Another like this make from the settings", () => {
    const spec = makeSpec({ seed: 7, theme: "any" });
    spec.settings.start.easyStart = true;
    for (const k of [0, 1, 2]) expect(showcaseSpec(spec, k).settings.start.easyStart).toBe(true);
  });
});

describe("Easy start's targets", () => {
  it("ask no more room than the disc they are read within holds, at every size", () => {
    // (the room is read within `roomRadius`; at 128² and up 400 tiles of its 14-tile disc, 65%, the share the clearing
    // gives once its pond is dug: smaller maps ask that share of their smaller disc, or less)
    const disc = (r: number) => {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) n++;
      return n;
    };
    const share = EASY_START.room / disc(EASY_START.roomRadius);
    for (let side = 64; side <= 256; side += 4) {
      const t = easyTargets(side, side);
      expect(t.room, `${side}²`).toBeLessThanOrEqual(Math.round(share * disc(t.roomRadius)));
      if (side >= 128) expect(t.room).toBe(EASY_START.room);
    }
    expect(easyTargets(96, 96).room).toBeLessThan(disc(easyTargets(96, 96).roomRadius) * 0.7);
  });

  it("say in one line what a map made in a late rescue round left short of them", () => {
    const m = (id: string, ok: boolean, value: number, limit: number) => ({ id: `start.easy_${id}`, ok, value, limit, message: id });
    expect(easyShortfall([m("room", true, 420, 400), m("water", true, 5, 6)])).toBeNull();
    expect(easyShortfall([m("room", false, 338, 400), m("water", false, 8, 6), m("food", true, 44, 40)])).toBe("Easy start fell short: 338 tiles of level ground (400 asked); water 8 tiles' walk away (6 asked)");
  });

  it("goes with the map's project, so a reopened map says it too", () => {
    const r = generate(makeSpec({ seed: 3, size: { x: 64, y: 64 }, theme: "riverValley" }), { maxAttempts: 1 });
    const short = "Easy start fell short: 338 tiles of level ground (400 asked)";
    const doc = generatedDocument({ ...r, easyShort: short });
    const back = decodeProject(encodeProject(doc));
    expect(back.meta.easyShort).toBe(short);
    expect(MapSession.open(back).meta.easyShort).toBe(short);
    // (a map that met them all carries nothing)
    expect(generatedDocument(r).meta.easyShort).toBeUndefined();
  });
});

describe("Easy start's ground (land/easyStart.ts)", () => {
  // a valley: a river along x = 50 with its bed at 5, the land rising a level every 12 tiles from it, the start
  // planned 16 tiles from the river two levels above the bed
  const W = 80;
  const H = 60;
  const valley = () => {
    const h = new Uint8Array(W * H);
    const depth = new Float64Array(W * H);
    const water = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const d = Math.abs(x - 50);
        if (d <= 1) {
          h[i] = 5;
          depth[i] = 0.55;
          water[i] = 1;
        } else h[i] = 6 + Math.floor((d - 2) / 12);
      }
    return { h, depth, water };
  };

  it("finds the water a pond joins, cuts the clearing a level above it and digs the pond two below", () => {
    const { h, depth, water } = valley();
    const p = { x: 34, y: 30, level: h[30 * W + 34] };
    expect(p.level).toBe(7);
    const j = pondWater(h, W, H, depth, water, p);
    expect(j).toBeGreaterThanOrEqual(0);
    const cut = cutLevel(h, depth, water, j);
    expect(cut).toBe(5);
    const s = shapeEasyStart(h, W, H, p, depth, water, stream(1, "easy-start-test"))!;
    expect(s).not.toBeNull();
    // the clearing a level above the cut, the start's 5×5 on it
    expect(s.level).toBe(cut + 1);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(h[(p.y + dy) * W + p.x + dx]).toBe(s.level);
    expect(s.clearing).toBeGreaterThan(EASY_START.room);
    // the pond two levels under the cut, its near shore 5 tiles or more from the start's middle, and the cut
    // joining it to the river, each tile beside the last
    expect(s.pond.length).toBeGreaterThanOrEqual(9);
    for (const i of s.pond) {
      expect(h[i]).toBeLessThanOrEqual(cut - 2);
      expect(Math.hypot((i % W) - p.x, Math.floor(i / W) - p.y)).toBeGreaterThanOrEqual(5);
    }
    for (const i of [...s.cut, ...s.mouth]) expect(h[i]).toBeLessThanOrEqual(cut);
    const near = (a: number, b: number) => Math.abs((a % W) - (b % W)) + Math.abs(Math.floor(a / W) - Math.floor(b / W)) === 1;
    expect(s.pond.some((i) => near(i, s.cut[0]))).toBe(true);
    for (let k = 1; k < s.cut.length; k++) expect(near(s.cut[k - 1], s.cut[k])).toBe(true);
    const last = s.cut[s.cut.length - 1];
    const lx = last % W;
    expect(Math.abs(lx - 50)).toBeLessThanOrEqual(2);
    // nothing filled beside the water
    for (let y = 0; y < H; y++) for (const x of [48, 52]) expect(h[y * W + x]).toBeLessThanOrEqual(6);
  });

  it("gives no pond where the water stands too far below the start", () => {
    const { h, depth, water } = valley();
    for (let i = 0; i < W * H; i++) if (!water[i]) h[i] += 4;
    const p = { x: 34, y: 30, level: h[30 * W + 34] };
    const before = h.slice();
    expect(pondWater(h, W, H, depth, water, p)).toBe(-1);
    expect(shapeEasyStart(h, W, H, p, depth, water, stream(1, "easy-start-test"))).toBeNull();
    expect(h).toEqual(before);
  });

  it("leaves the land as it was where the pond has no room, after finding its water", () => {
    // (shallow puddles, too thin for a pond's water, everywhere between the start and the river: no tile there
    // stands three from water)
    const { h, depth, water } = valley();
    for (let y = 0; y < H; y += 3) for (let x = 36; x < 48; x += 3) depth[y * W + x] = 0.05;
    const p = { x: 34, y: 30, level: h[30 * W + 34] };
    expect(pondWater(h, W, H, depth, water, p)).toBeGreaterThanOrEqual(0);
    const before = h.slice();
    expect(shapeEasyStart(h, W, H, p, depth, water, stream(1, "easy-start-test"))).toBeNull();
    expect(h).toEqual(before);
  });

  it("keeps off the ground another start's shape took, leaving the land as it was", () => {
    const { h, depth, water } = valley();
    const p = { x: 34, y: 30, level: h[30 * W + 34] };
    const s = shapeEasyStart(h, W, H, p, depth, water, stream(1, "easy-start-test"))!;
    const taken = new Uint8Array(W * H);
    for (const i of s.area) taken[i] = 1;
    const before = h.slice();
    const q = { x: 34, y: 40, level: h[40 * W + 34] };
    expect(shapeEasyStart(h, W, H, q, depth, water, stream(2, "easy-start-test"), null, taken)).toBeNull();
    expect(h).toEqual(before);
  });
});

describe("Easy start's ruins (gen/resources.ts)", () => {
  // (the long River Valley map of D453: a start on a wide green valley floor had only lone dry tiles on its walk, each
  // a level of its own; no field of five fitted one, none was placed, and the finished map was refused for its metal)
  const W = 64;
  const N = W * W;
  const fieldOn = (moist: (x: number, y: number) => boolean, taken: readonly [number, number][] = []) => {
    const heights = new Uint8Array(N).fill(4);
    const occupied = new Uint8Array(N);
    for (const [x, y] of taken) occupied[y * W + x] = 1;
    const g = {
      W,
      H: W,
      heights,
      water: new Float64Array(N),
      moisture: Float64Array.from({ length: N }, (_, i) => (moist(i % W, Math.floor(i / W)) ? 1 : 0)),
      soilContamination: new Float64Array(N),
      occupied,
      start: { x: 32, y: 32 },
      entities: [],
    };
    const spec = makeSpec({ seed: 5, size: { x: W, y: W }, theme: "riverValley" });
    const field = planResources(spec, g, 0, 0, { protect: null, easy: { safe: new Uint8Array(N).fill(1), bushes: 10, within: 15, ruins: 25 } }).find((f) => f.role === "ruinField/easyStart");
    return field && field.kind === "ruinField" ? runsToTiles(field.params.area, W).map((i) => ({ x: i % W, y: Math.floor(i / W), moist: g.moisture[i] > 0 })) : null;
  };
  // (as the crow flies: no further than the colony walks, on flat open ground)
  const away = (t: { x: number; y: number }) => Math.hypot(t.x - 32, t.y - 32);

  it("stand on dry ground where the start's walk has room for them", () => {
    const tiles = fieldOn((x) => x < 32)!;
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    expect(tiles.some((t) => !t.moist)).toBe(true);
  });

  it("stand on the green where the walk has no dry ground, within the walk the target asks", () => {
    const tiles = fieldOn(() => true)!;
    expect(tiles).not.toBeNull();
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const t of tiles) expect(away(t)).toBeLessThanOrEqual(25);
  });

  it("stand on the green where the walk's only dry ground is lone tiles no field fits", () => {
    // (three dry tiles on the walk, each with something standing on the four tiles beside it: no field grows from one)
    const lone: [number, number][] = [[50, 32], [32, 50], [14, 32]];
    const dryAt = new Set(lone.map(([x, y]) => y * W + x));
    const beside = lone.flatMap(([x, y]): [number, number][] => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]);
    const tiles = fieldOn((x, y) => !dryAt.has(y * W + x), beside)!;
    expect(tiles).not.toBeNull();
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const t of tiles) {
      expect(t.moist).toBe(true);
      expect(away(t)).toBeLessThanOrEqual(25);
    }
  });
});

describe("a generated map with Easy start on", () => {
  it("holds every target, each a passing row of its checks, and the map without it does not change", () => {
    const spec = makeSpec({ seed: 2, theme: "any" });
    spec.settings.start.easyStart = true;
    const r = generate(spec);
    expect(r.report.passed).toBe(true);
    expect(r.spec.settings.start.easyStart).toBe(true);
    const rows = r.report.checks.filter((c) => c.id.startsWith("start.easy_"));
    expect(rows.map((c) => c.id).sort()).toEqual(
      ["start.easy_badtide", "start.easy_badwater", "start.easy_calm", "start.easy_drought", "start.easy_farmland", "start.easy_food", "start.easy_hazards", "start.easy_metal", "start.easy_room", "start.easy_view", "start.easy_water", "start.easy_wood"].sort(),
    );
    for (const c of rows) expect(c.ok, c.message).toBe(true);
    // measured again on the map as its file holds it, against the targets themselves
    const W = r.spec.size.x;
    const H = r.spec.size.y;
    const v = validateMap(r.file, { profile: "generate", spec: r.spec, features: r.features, water: { model: r.built.waterModel, settled: r.built.settle } });
    const t = easyTargets(W, H);
    const m = Object.fromEntries(easyStartMeasures({ W, H, heights: surfaceOf(r.file.world), objects: mapObjects(r.file.world), water: r.built.settle, model: r.built.waterModel, moisture: v.analysis!.moisture, soilContamination: v.analysis!.soilContamination, woodNear: v.analysis!.woodNear }, t).map((x) => [x.id.replace("start.easy_", ""), x]));
    expect(m.room.value).toBeGreaterThanOrEqual(EASY_START.room);
    expect(m.calm.value).toBeLessThanOrEqual(EASY_START.calmSpare);
    expect(m.water.value).toBeLessThanOrEqual(EASY_START.water);
    expect(m.drought.value).toBeLessThanOrEqual(EASY_START.droughtWalk);
    expect(m.badtide.value).toBe(0);
    expect(m.badwater.value).toBeGreaterThanOrEqual(EASY_START.badwaterSource);
    expect(m.food.value).toBeGreaterThanOrEqual(EASY_START.bushes);
    expect(m.farmland.value).toBeGreaterThanOrEqual(EASY_START.farmland);
    expect(m.wood.value).toBeGreaterThanOrEqual(EASY_START.wood);
    expect(m.metal.value).toBeLessThanOrEqual(EASY_START.ruins);
    expect(m.hazards.value).toBe(0);
    expect(m.view.value).toBe(1);
    // (the map without it has no such rows: the setting changes nothing when off)
    const off = generate(makeSpec({ seed: 2, theme: "any" }), { maxAttempts: 1 });
    expect(off.report.checks.some((c) => c.id.startsWith("start.easy_"))).toBe(false);
  });

  // (D453, the long map that took minutes: the read on the start's build found no start, the build stopped before
  // its resources holding no start entity, so every miss was found only after the objects, the plants and the checks)
  it("reads the land's and water's targets on the start's build, given the start's entity as the whole build places it", () => {
    const r = generate(makeSpec({ seed: 3, size: { x: 64, y: 64 }, theme: "riverValley" }), { maxAttempts: 1 });
    const W = r.spec.size.x;
    const H = r.spec.size.y;
    const b = r.built;
    const start = r.features.find((f): f is StartFeature => f.kind === "start")!;
    const placed = b.entities.find((e) => e.template === "StartingLocation")!;
    expect(startEntity(start, b.heights, W)).toEqual(placed);
    const read = (entities: readonly EntitySpec[]) =>
      easyStartMeasures({ W, H, heights: b.heights, objects: mapObjects({ entities: entities.map(entityJson) }), water: b.settle, model: b.waterModel, moisture: b.moisture, soilContamination: b.soilContamination, woodNear: Infinity, badtide: false }, easyTargets(W, H), EASY_LAND);
    // (a build stopped before its resources holds no start entity: there is no start to read)
    const stopped = b.entities.filter((e) => e !== placed);
    expect(read(stopped)).toEqual([]);
    // (with it, the land's and water's rows are read, and only those)
    expect(read([...stopped, startEntity(start, b.heights, W)]).map((m) => m.id)).toEqual(EASY_LAND.filter((id) => id !== "start.easy_badtide"));
  });

  it("never plants a map whose start missed one of them", () => {
    // (River Valley 128², seed 3: its fourth attempt's start misses the badtide's day. A generator change that moves
    // this map takes another seed with such an attempt: tools/attempts.ts --easy lists them)
    const spec = makeSpec({ seed: 3, theme: "riverValley" });
    spec.settings.start.easyStart = true;
    const land = new Set<string>(EASY_LAND);
    const stages: string[] = [];
    let missed = 0;
    class Enough extends Error {}
    try {
      generate(spec, {
        onProgress: (p) => stages.push(p.stage),
        onAttempt: (a) => {
          if (!a.passed && land.has(a.failed[0])) {
            missed++;
            expect(stages, `attempt ${a.attempt + 1}, ${a.failed[0]}`).not.toContain("objects");
            throw new Enough();
          }
          stages.length = 0;
        },
      });
    } catch (e) {
      if (!(e instanceof Enough)) throw e;
    }
    expect(missed).toBe(1);
  });
});
