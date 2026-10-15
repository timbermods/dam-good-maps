// The High look's seasons on a held Drought or Badtide day (render3d/high/seasons.ts, D250, #67 stage 4): the tile mask the
// ground shader reads and what each effect draws.

import { describe, expect, it } from "vitest";
import { HIGH_EFFECTS, LOWER_COST_DROPS } from "../../src/render3d/high/effects";
import { SICKLY_SKY, seasonLook, seasonMask } from "../../src/render3d/high/seasons";
import { soilView } from "../../src/render3d/model";

describe("the mask of a held day", () => {
  it("is dry where the day's moisture is 0 and no water stands, water where it does, and grass where the map's own soil was moist", () => {
    // four tiles: moist both days, dried (was moist), dry both days, dry but under water now
    const own = soilView([8, 8, 0, 0], [0, 0, 0, 0]);
    const day = soilView([8, 0, 0, 0], [0, 0, 0, 0]);
    const m = seasonMask({ W: 4, H: 1, own, day, depth: [0, 0, 0, 0.5], contamination: [0, 0, 0, 0.7] });
    expect(Array.from(m.bytes)).toEqual([0, 0, 0, 255, /**/ 255, 0, 0, 255, /**/ 255, 0, 0, 0, /**/ 0, 255, 0, 0]);
    expect(m.dry).toBe(2);
    expect(m.badWater).toBe(1);
  });

  it("reuses the bytes it is given when they fit", () => {
    const soil = soilView([0, 0], [0, 0]);
    const first = seasonMask({ W: 2, H: 1, own: soil, day: soil, depth: [0, 0], contamination: [0, 0] });
    expect(seasonMask({ W: 2, H: 1, own: soil, day: soil, depth: [0, 0], contamination: [0, 0] }, first.bytes).bytes).toBe(first.bytes);
  });
});

describe("what each effect draws", () => {
  const on = { dryGround: true, heat: true, badtideSky: true };
  it("a drought gets dry ground and the shimmer, a badtide the sickly sky (when there is badwater), no day nothing", () => {
    expect(seasonLook("drought", on, true, 0)).toEqual({ dry: 1, heat: 1, sickly: 0 });
    expect(seasonLook("badtide", on, true, 12)).toEqual({ dry: 0, heat: 0, sickly: SICKLY_SKY });
    expect(seasonLook("badtide", on, true, 0).sickly).toBe(0);
    expect(seasonLook(null, on, true, 12)).toEqual({ dry: 0, heat: 0, sickly: 0 });
  });

  it("each effect has its own switch, and the shimmer is still for reduced motion", () => {
    expect(seasonLook("drought", { ...on, dryGround: false }, true, 0)).toEqual({ dry: 0, heat: 1, sickly: 0 });
    expect(seasonLook("drought", { ...on, heat: false }, true, 0)).toEqual({ dry: 1, heat: 0, sickly: 0 });
    expect(seasonLook("drought", on, false, 0)).toEqual({ dry: 1, heat: 0, sickly: 0 });
    expect(seasonLook("badtide", { ...on, badtideSky: false }, true, 9).sickly).toBe(0);
  });

  it("the three are High effects that can be switched, and the lower-cost tier drops the shimmer only", () => {
    const keys = HIGH_EFFECTS.map((e) => e.key);
    for (const k of ["dryGround", "heat", "badtideSky"] as const) expect(keys).toContain(k);
    expect(LOWER_COST_DROPS).toContain("heat");
    expect(LOWER_COST_DROPS).not.toContain("dryGround");
    expect(LOWER_COST_DROPS).not.toContain("badtideSky");
  });
});
