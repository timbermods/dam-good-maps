// The High look's visible seasons (render3d/seasons.ts, D250 (1)): on a held drought or badtide day the plants that live
// on the map's own soil but not on the day's are drawn withered; the map's own plants and Day 0 never change.

import { describe, expect, it } from "vitest";
import { DEAD, entityView, soilView } from "../../src/render3d/model";
import { flagsDigest, livesOn, witheredEntities } from "../../src/render3d/seasons";

const W = 4;
/** Four tiles in a row: moist and clean; moist and clean; dry; moist and poisoned (a day's soil is what the core hands over). */
const own = soilView([8, 8, 0, 8], [0, 0, 0, 0]);
const plants = (templates: string[], dead: boolean[] = []) =>
  entityView(templates.map((template, i) => ({ id: `e${i}`, template, x: i, y: 0, z: 1, orientation: "Cw0", owner: "", dead: dead[i] })));

describe("the plants a held day withers", () => {
  it("a plant lives where the ground is moist and clean", () => {
    expect([0, 1, 2, 3].map((i) => livesOn(soilView([8, 1, 0, 8], [0, 0, 0, 0.2]), i))).toEqual([true, true, false, false]);
  });

  it("a drought withers the plants whose ground dried; a badtide those on poisoned ground, even if still moist", () => {
    const e = plants(["Pine", "Birch", "Oak", "BlueberryBush"]);
    const drought = soilView([8, 0, 0, 8], [0, 0, 0, 0]);
    const d = witheredEntities(e, own, drought, W);
    expect([0, 1, 2, 3].map((k) => !!(d.flags[k] & DEAD))).toEqual([false, true, false, false]);
    const badtide = soilView([8, 0, 0, 8], [0, 0, 0, 0.5]);
    const b = witheredEntities(e, own, badtide, W);
    expect([0, 1, 2, 3].map((k) => !!(b.flags[k] & DEAD))).toEqual([false, true, false, true]);
  });

  it("the map's own plants are never changed: the view shares everything but its flags, and Day 0 returns the map itself", () => {
    const e = plants(["Pine", "Oak"]);
    const w = witheredEntities(e, own, soilView([0, 0, 0, 0], [0, 0, 0, 0]), W);
    expect(w).not.toBe(e);
    expect(w.x).toBe(e.x);
    expect(w.flags).not.toBe(e.flags);
    expect(Array.from(e.flags)).toEqual([0, 0]);
    expect(witheredEntities(e, own, own, W)).toBe(e);
  });

  it("what is already dead, a plant on ground that was dry, a succulent and anything that is not a plant stay as they are", () => {
    const e = plants(["Pine", "Pine", "Succulent", "StartingLocation"], [true, false, false, false]);
    const day = soilView([0, 0, 0, 0], [0, 0, 0, 0]);
    // (tile 1's ground is dry in this map's own soil; tile 2 holds the succulent, tile 3 a building)
    const w = witheredEntities(e, soilView([8, 0, 8, 8], [0, 0, 0, 0]), day, W);
    expect(Array.from(w.flags)).toEqual([DEAD, 0, 0, 0]);
  });

  it("the digest tells different withered sets apart", () => {
    const e = plants(["Pine", "Birch"]);
    const a = witheredEntities(e, own, soilView([0, 8, 0, 0], [0, 0, 0, 0]), W).flags;
    const b = witheredEntities(e, own, soilView([8, 0, 0, 0], [0, 0, 0, 0]), W).flags;
    expect(flagsDigest(a)).not.toBe(flagsDigest(b));
    expect(flagsDigest(a)).toBe(flagsDigest(a.slice()));
  });
});
