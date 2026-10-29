// An object of several tiles on open ground rides a brush stroke level (D249, D491): the game drops one whose
// ground is not level under it, so a stroke that would tilt it is given again with its rectangle kept level.
// Highlands 48² seed 5 on generator 0.10.5: a raise at (34, 30) once left its mine site at (33, 28) with part of its
// ground a level above the rest, and the export refused "Mine site floating" (the collab session spec's edit).
import { describe, expect, it } from "vitest";
import { entityTiles } from "../../src/core/features/edits";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("objects of several tiles ride a stroke level", () => {
  it("a raise over part of a mine site keeps its ground level, and the map exports", async () => {
    await runGenerate(makeSpec({ seed: 5, theme: "highlands", size: { x: 48, y: 48 } }));
    ed.refine();
    const W = ed.sessionInfo().W;
    const mine = () => ed.collabSession()!.built.entities.find((e) => e.template === "UndergroundRuins" && e.x === 33 && e.y === 28);
    expect(mine()).toBeDefined();
    const ground = () => {
      const h = ed.collabSession()!.built.heights;
      return entityTiles(mine()!).map(([x, y]) => h[y * W + x]);
    };
    const was = ground();
    expect(new Set(was).size).toBe(1);
    const u = ed.apply({ op: "brush", params: { tool: "raise", size: 4, strength: 10, dabs: [34 * 4, 30 * 4, 37 * 4, 30 * 4] } });
    expect(u.ok).toBe(true);
    // (the stroke reached its corner: the ground under it stays level, at its middle tile's level, and it stands on it)
    const now = ground();
    expect(new Set(now).size).toBe(1);
    expect(mine()!.z).toBe(now[0]);
    const out = await ed.exportTimber(true);
    expect(out.errors).toEqual([]);
  }, 120_000);
});
