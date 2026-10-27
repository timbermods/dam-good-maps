// Release gate (D385), forces: the working area (D254, D259; EDITOR_PLAN "The working area is Select's
// open selection"): "While a selection is open, the brushes, the forces and a brush's Clear work only
// inside it; everything outside is locked, exactly as it is". A force that breaks the start's ground
// carries the start to level ground in the same step (D257), clearing the generation's objects under
// its new place (`startClears`). The release gate's bug hunt (D385) found that carry ignoring the
// working area: the start landed on the locked land outside it, and the trees standing there were
// removed. The same with the layer showing (D207, "the ground above it was left as it was"): the
// start was carried onto ground above the layer, which the player cannot see.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { areaDepth } from "../../src/core/features/raster/brush";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const open = () => MapSession.open(decodeProject(ed.project().bytes));

describe("a force leaves the locked land, and the ground above the layer showing, as they are (D254, D259, D207)", () => {
  // (on M9b's map, D148: its start stands at (19, 22), so the area lies east of it, across its west edge,
  // and the Erupt 9 tiles from it; 25 tiles wide, not 27, for 0.8.1's map, D148: a derived slope at (46, 15)
  // climbs to ground inside a 27-wide area, so the Erupt rightly drops it with that ground, and no force or lock
  // touched anything outside the area; for 0.8.3's map, D148, its start at (21, 20): the area from (23, 14),
  // 23 wide to keep off that slope, and the Erupt 5 tiles from the start, which carries it to (42, 22);
  // for 0.8.8's map, the Canyon and Highlands height round, D148, its start at (17, 16) on the top bench,
  // facing the other way (its ground (15–17, 14–16)): the area from (17, 10), 29 wide, and the Erupt 9
  // tiles from the start, which carries it to (39, 19); nearer, or in an area 23 wide, the cone leaves
  // no level ground inside the area and the start has nowhere to go)
  it("Highlands 64², seed 3: an Erupt (Power 69) at (26, 16) inside a 29 × 12 area from (17, 10) breaks the start's ground; the objects outside the area all stay where they stood", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const area: [number, number, number][] = [];
    for (let y = 10; y < 22; y++) area.push([y, 17, 45]);
    const inside = areaDepth(area, W, W);
    const before = open().built;
    const start = before.entities.find((e) => e.template === "StartingLocation")!;
    // (the start stands across the area's west edge, partly inside it)
    expect([start.x, start.y]).toEqual([17, 16]);
    const locked = before.entities.filter((e) => e.template !== "StartingLocation" && !inside[e.y * W + e.x]);
    expect(locked.length).toBeGreaterThan(100);

    expect(ed.forceStart({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 69 }, origin: [26, 16], cut: null, natural: true, area }).errors).toEqual([]);
    for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
    expect(ed.forceStop().kept).toBe(true);
    const after = open().built;

    // the land outside the area is as it was
    for (let i = 0; i < W * W; i++) if (!inside[i]) expect(after.heights[i], `(${i % W}, ${Math.floor(i / W)})`).toBe(before.heights[i]);
    // and so is every object standing on it
    const now = new Map(after.entities.map((e) => [e.id, e]));
    const changed = locked.filter((e) => now.get(e.id)?.x !== e.x || now.get(e.id)?.y !== e.y).map((e) => `${e.template} at (${e.x}, ${e.y})`);
    expect(changed).toEqual([]);
  });

  // (seed 10 on M9b's maps, D148: seed 3's start stands at level 13, with few objects above it; seed 10's
  // at (50, 29), level 10, with 149; seed 7 for 0.8.8's maps, the Canyon and Highlands height round, D148:
  // seed 10's start stands at level 13 on the tall terraces, with 60 objects above it; seed 7's at (41, 31),
  // level 11, with 208, and the Craterize carries it to (37, 34))
  it("Highlands 64², seed 7: a Craterize (Power 44) at (42, 30) with the layer cut at level 11 breaks the start's ground; the ground above the layer and every object on it stay as they were", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const cut = 11;
    const before = open().built;
    const hidden = (i: number) => before.heights[i] > cut;
    const above = before.entities.filter((e) => e.template !== "StartingLocation" && hidden(e.y * W + e.x));
    expect(above.length).toBeGreaterThan(100);

    expect(ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 44 }, origin: [42, 30], cut, natural: true }).errors).toEqual([]);
    for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
    expect(ed.forceStop().kept).toBe(true);
    const after = open().built;

    for (let i = 0; i < W * W; i++) if (hidden(i)) expect(after.heights[i], `(${i % W}, ${Math.floor(i / W)})`).toBe(before.heights[i]);
    const now = new Map(after.entities.map((e) => [e.id, e]));
    const changed = above.filter((e) => now.get(e.id)?.x !== e.x || now.get(e.id)?.y !== e.y).map((e) => `${e.template} at (${e.x}, ${e.y})`);
    expect(changed).toEqual([]);
  });
});
