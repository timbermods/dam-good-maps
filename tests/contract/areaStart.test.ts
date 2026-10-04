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
  // and the Erupt 9 tiles from it)
  it("Highlands 64², seed 3: an Erupt (Power 69) at (28, 22) inside a 27 × 12 area from (21, 16) breaks the start's ground; the objects outside the area all stay where they stood", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const area: [number, number, number][] = [];
    for (let y = 16; y < 28; y++) area.push([y, 21, 47]);
    const inside = areaDepth(area, W, W);
    const before = open().built;
    const start = before.entities.find((e) => e.template === "StartingLocation")!;
    // (the start stands across the area's west edge, partly inside it)
    expect([start.x, start.y]).toEqual([19, 22]);
    const locked = before.entities.filter((e) => e.template !== "StartingLocation" && !inside[e.y * W + e.x]);
    expect(locked.length).toBeGreaterThan(100);

    expect(ed.forceStart({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 69 }, origin: [28, 22], cut: null, natural: true, area }).errors).toEqual([]);
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
  // at (50, 29), level 10, with 149)
  it("Highlands 64², seed 10: a Craterize (Power 44) at (51, 28) with the layer cut at level 10 breaks the start's ground; the ground above the layer and every object on it stay as they were", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 10, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const cut = 10;
    const before = open().built;
    const hidden = (i: number) => before.heights[i] > cut;
    const above = before.entities.filter((e) => e.template !== "StartingLocation" && hidden(e.y * W + e.x));
    expect(above.length).toBeGreaterThan(100);

    expect(ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 44 }, origin: [51, 28], cut, natural: true }).errors).toEqual([]);
    for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
    expect(ed.forceStop().kept).toBe(true);
    const after = open().built;

    for (let i = 0; i < W * W; i++) if (hidden(i)) expect(after.heights[i], `(${i % W}, ${Math.floor(i / W)})`).toBe(before.heights[i]);
    const now = new Map(after.entities.map((e) => [e.id, e]));
    const changed = above.filter((e) => now.get(e.id)?.x !== e.x || now.get(e.id)?.y !== e.y).map((e) => `${e.template} at (${e.x}, ${e.y})`);
    expect(changed).toEqual([]);
  });
});
