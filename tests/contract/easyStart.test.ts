// Easy start (D495): the setting's link key, the ground the generator shapes for it, and a generated map with it on
// holding every target (analysis/easyStart.ts `EASY_START`), each a row of the generate profile's checks.

import { describe, expect, it } from "vitest";
import { EASY_START, easyStartMeasures, easyTargets } from "../../src/core/analysis/easyStart";
import { surfaceOf } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { showcaseSpec } from "../../src/core/gen/showcase";
import { cutLevel, pondWater, shapeEasyStart } from "../../src/core/land/easyStart";
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
    // the pond two levels under the cut, its near shore 5 tiles or more out, and the cut joining it to the river
    for (const i of s.pond) {
      expect(h[i]).toBeLessThanOrEqual(cut - 2);
      expect(Math.max(Math.abs((i % W) - p.x), Math.abs(Math.floor(i / W) - p.y))).toBeGreaterThan(4);
    }
    for (const i of s.cut) expect(h[i]).toBeLessThanOrEqual(cut);
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
});
