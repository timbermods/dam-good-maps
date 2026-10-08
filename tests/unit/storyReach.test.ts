// The water story's reach counts the main water, badwater or not (D480, with D476): land beside the
// main river below a badwater join is near water; land beside badwater that stands on its own is not.
import { describe, expect, it } from "vitest";
import { waterStory } from "../../src/core/analysis/story";
import type { Feature } from "../../src/core/features/schema";

const W = 64;
const H = 64;

const river = (id: string, role: string, path: [number, number][]): Feature =>
  ({ id, kind: "river", origin: "generated", role, locked: false, params: { path, width: 3, bedDepth: 1, bedProfile: { start: 4, steps: [] }, flow: 2, style: "straight", entry: { edge: "west" }, exit: { edge: "east" }, badwater: false } }) as unknown as Feature;

describe("the water story's reach (D480)", () => {
  // (the main river along the south, west to east; a pond of its own in the north-east corner)
  const depth = new Float64Array(W * H);
  for (let x = 0; x < W; x++) for (let y = 7; y <= 9; y++) depth[y * W + x] = 0.6;
  for (let y = 54; y <= 60; y++) for (let x = 54; x <= 60; x++) depth[y * W + x] = 1;
  const main = river("main", "river/main", [[-1, 8], [64, 8]]);

  it("counts the main river's water below a badwater join", () => {
    const clean = waterStory(W, H, depth, [main], new Float64Array(W * H));
    // (badwater joins at x 12: the river carries it from there to the edge)
    const joined = new Float64Array(W * H);
    for (let x = 12; x < W; x++) for (let y = 7; y <= 9; y++) joined[y * W + x] = 0.6;
    expect(waterStory(W, H, depth, [main], joined).reach).toBe(clean.reach);
    // (and on a map without a main river, the system holding the most water)
    expect(waterStory(W, H, depth, [], joined).reach).toBe(clean.reach);
  });

  it("keeps the main water in the story however much badwater has joined it (D480's extension)", () => {
    const clean = waterStory(W, H, depth, [main], new Float64Array(W * H));
    // (badwater from x 12 on: four fifths of the main river carries it)
    const joined = new Float64Array(W * H);
    for (let x = 12; x < W; x++) for (let y = 7; y <= 9; y++) joined[y * W + x] = 0.6;
    const s = waterStory(W, H, depth, [main], joined);
    expect(s.mainShare).toBe(clean.mainShare);
    expect(s.wet).toBe(clean.wet);
    // (a badwater pond of its own is still none of the story)
    const pond = joined.slice();
    for (let y = 54; y <= 60; y++) for (let x = 54; x <= 60; x++) pond[y * W + x] = 1;
    expect(waterStory(W, H, depth, [main], pond).wet).toBe(clean.wet - 49);
  });

  it("does not count badwater standing in a system of its own", () => {
    const clean = waterStory(W, H, depth, [main], new Float64Array(W * H));
    const pond = new Float64Array(W * H);
    for (let y = 54; y <= 60; y++) for (let x = 54; x <= 60; x++) pond[y * W + x] = 1;
    expect(waterStory(W, H, depth, [main], pond).reach).toBeLessThan(clean.reach);
  });
});
