// An object of several tiles on open ground rides a brush stroke level (D249, D491): the game drops one whose
// ground is not level under it, so a stroke that would tilt it is given again with its rectangle kept level.
// Highlands 48² seed 5 on generator 0.10.5: a raise at (34, 30) once left its mine site at (33, 28) with part of its
// ground a level above the rest, and the export refused "Mine site floating" (the collab session spec's edit).
import { describe, expect, it } from "vitest";
import { caveFile, CAVE_W, LEDGE } from "./caveMap";
import { decodeProject } from "../../src/core/doc/document";
import { placeComponents } from "../../src/core/doc/objectOps";
import type { AppliedOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { entityTiles, placedEntity } from "../../src/core/features/edits";
import { entityJson } from "../../src/core/format/entities";
import type { Orientation } from "../../src/core/format/footprints";
import { writeTimber } from "../../src/core/format/timber";
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
    const project = ed.project().bytes;
    const u = ed.apply({ op: "brush", params: { tool: "raise", size: 4, strength: 10, dabs: [34 * 4, 30 * 4, 37 * 4, 30 * 4] } });
    expect(u.ok).toBe(true);
    // (the stroke reached its corner: the ground under it stays level, at its middle tile's level, and it stands on it)
    const now = ground();
    expect(new Set(now).size).toBe(1);
    expect(mine()!.z).toBe(now[0]);
    const out = await ed.exportTimber(true);
    expect(out.errors).toEqual([]);
    // (a replica given the logged step takes it as it stands: the same rectangle once, the same land)
    const op = decodeProject(ed.project().bytes).edits.at(-1) as (AppliedOp & { op: "brush" }) | undefined;
    expect(op?.params.rigid).toHaveLength(1);
    const replica = MapSession.open(decodeProject(project));
    const r = replica.applyAll([{ op: "brush", params: op!.params }], "user", "Raise");
    expect(r.errors).toEqual([]);
    expect((r.applied[0] as AppliedOp & { op: "brush" }).params.rigid).toEqual(op!.params.rigid);
    expect(Buffer.from(replica.built.heights).equals(Buffer.from(ed.collabSession()!.built.heights))).toBe(true);
  }, 120_000);
});

/** The cave fixture (caveMap.ts: a ledge at x 30–32, y 10–14 over lowland at level 2; a cave at x 15–20, y 15–20 under a
 *  roof at level 8, its floor at 3) with one object the file holds where it stands. */
function withObject(template: string, x: number, y: number, z: number, orientation: Orientation): MapSession {
  const file = caveFile();
  file.world.entities = [entityJson(placedEntity({ id: "00000000-0000-4000-8000-0000000000b1", template, x, y, orientation, components: placeComponents(template) }, z))];
  const s = MapSession.importMap(writeTimber(file), `${template}.timber`);
  s.setWaterMode("defer");
  return s;
}
const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];

describe("an object under a roof does not ride: the roof's top over it is the stroke's (D491)", () => {
  it("a Raise along a ledge over a ruin half under it raises the ledge, never levels it down", () => {
    const s = withObject("UndergroundRuins", 35, 14, 2, "Cw180");
    const before = s.built.heights.slice();
    const u = s.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 5, dabs: [...tile(31, 11), ...tile(31, 13)] } });
    expect(u.errors).toEqual([]);
    expect((u.applied[0] as AppliedOp & { op: "brush" }).params.rigid ?? []).toEqual([]);
    const h = s.built.heights;
    for (let y = LEDGE.y0; y <= LEDGE.y1; y++) for (let x = LEDGE.x0; x <= LEDGE.x1; x++) expect(h[y * CAVE_W + x], `(${x}, ${y})`).toBeGreaterThanOrEqual(before[y * CAVE_W + x]);
  });

  it("a Raise over a cave's roof above a relic on its floor raises the roof as painted", () => {
    const s = withObject("LargeRelic", 16, 16, 3, "Cw0");
    const before = s.built.heights.slice();
    const u = s.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 5, dabs: [...tile(16, 16), ...tile(16, 16)] } });
    expect(u.errors).toEqual([]);
    expect((u.applied[0] as AppliedOp & { op: "brush" }).params.rigid ?? []).toEqual([]);
    expect(s.built.heights[16 * CAVE_W + 16]).toBeGreaterThan(before[16 * CAVE_W + 16]);
  });
});
