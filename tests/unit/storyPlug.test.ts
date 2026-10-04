// The water story joins the water above a plug and below it (the plug-lake intention, D274; Codex's
// Highlands audit, D370): the plug's river runs dry below it until the plug is opened, and the
// systems along its course are one water system once it is.
import { describe, expect, it } from "vitest";
import { waterStory } from "../../src/core/analysis/story";
import type { Feature } from "../../src/core/features/schema";

const W = 48;
const H = 48;

describe("the water story over a plug", () => {
  it("reads the lake above a plug and the river below it as one system", () => {
    const depth = new Float64Array(W * H);
    // (the plug's lake, west; the plug at x 20–21, the river dry there; the river below it, east,
    // fed by its own tributary)
    for (let y = 14; y <= 26; y++) for (let x = 2; x <= 18; x++) depth[y * W + x] = 2;
    for (let x = 24; x < W; x++) for (let y = 19; y <= 21; y++) depth[y * W + x] = 0.6;
    for (let y = 2; y < 19; y++) for (let x = 34; x <= 36; x++) depth[y * W + x] = 0.5;
    const river = (id: string, role: string, path: [number, number][]): Feature =>
      ({ id, kind: "river", origin: "generated", role, locked: false, params: { path, width: 3, bedDepth: 1, bedProfile: { start: 4, steps: [] }, flow: 2, style: "straight", entry: { edge: "west" }, exit: { edge: "east" }, badwater: false } }) as unknown as Feature;
    const plug = { id: "plug", kind: "mapObject", origin: "generated", role: "mapObject/plug/primary", locked: false, params: { kind: "plug", placement: { area: [[19, 20, 21], [20, 20, 21], [21, 20, 21]] } } } as unknown as Feature;
    const features = [river("main", "river/main", [[-1, 20], [48, 20]]), river("trib", "river/inflow/1", [[35, -1], [35, 20]]), plug];
    const s = waterStory(W, H, depth, features);
    expect(s.separate).toBe(0);
    expect(s.mainShare).toBe(1);
    // (and without the plug, the two are apart)
    const apart = waterStory(W, H, depth, features.slice(0, 2));
    expect(apart.mainShare).toBeLessThan(1);
  });
});
