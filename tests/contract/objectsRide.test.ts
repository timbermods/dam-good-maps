// An object of several tiles on open ground rides a brush stroke level (D249, D491): the game drops one whose
// ground is not level under it, so a stroke that would tilt it is given again with its rectangle kept level.
// Highlands 48² seed 5 on generator 0.10.5: a raise at (34, 30) once left its mine site at (33, 28) with part of its
// ground a level above the rest, and the export refused "Mine site floating" (the collab session spec's edit).
import { describe, expect, it } from "vitest";
import { caveFile, CAVE_W, LEDGE } from "./caveMap";
import { decodeProject } from "../../src/core/doc/document";
import { placeComponents } from "../../src/core/doc/objectOps";
import type { AppliedOp, EditOp } from "../../src/core/doc/ops";
import { planStrokeClearing } from "../../src/core/doc/strokes";
import { MapSession } from "../../src/core/doc/session";
import { entityTiles, placedEntity, ridingPieces } from "../../src/core/features/edits";
import { entityJson } from "../../src/core/format/entities";
import { startEntranceTile, type Orientation } from "../../src/core/format/footprints";
import { writeTimber } from "../../src/core/format/timber";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import { unsupportedVoxels } from "../../src/core/terrain/support";
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

describe("the start rides a stroke with the tile at its door (D491)", () => {
  it("a raise over the start's middle lifts the start and its door together, and the map exports", async () => {
    await runGenerate(makeSpec({ seed: 5, theme: "highlands", size: { x: 48, y: 48 } }));
    ed.refine();
    const W = ed.sessionInfo().W;
    const start = () => ed.collabSession()!.built.entities.find((e) => e.template === "StartingLocation")!;
    const s0 = start();
    const door = startEntranceTile(s0.x, s0.y, s0.orientation as Orientation);
    // (its middle tile, two from the door: a small raise there lifts the start, which rides at its middle's level, and
    // before it rode with its door it left the door below: the export's "Start entrance blocked")
    const tiles = entityTiles(s0);
    const cx = Math.round(tiles.reduce((a, t) => a + t[0], 0) / tiles.length);
    const cy = Math.round(tiles.reduce((a, t) => a + t[1], 0) / tiles.length);
    const h = () => ed.collabSession()!.built.heights;
    const was = h()[door[1] * W + door[0]];
    expect(entityTiles(s0).every(([x, y]) => h()[y * W + x] === was), "the start and its door on one level").toBe(true);
    const u = ed.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 10, dabs: [4 * cx + 2, 4 * cy + 2, 4 * cx + 2, 4 * cy + 2] } });
    expect(u.ok).toBe(true);
    const s1 = start();
    const level = h()[door[1] * W + door[0]];
    expect(entityTiles(s1).map(([x, y]) => h()[y * W + x]), "its ground and its door's, one level").toEqual(entityTiles(s1).map(() => level));
    expect(s1.z).toBe(level);
    expect((await ed.exportTimber(true)).errors).toEqual([]);
  }, 120_000);
});

describe("the start's piece takes the row before its door only where nothing there stands above it (D491)", () => {
  const W = 20;
  const bbox = (t: readonly (readonly [number, number])[]) => [Math.min(...t.map((c) => c[0])), Math.min(...t.map((c) => c[1])), Math.max(...t.map((c) => c[0])), Math.max(...t.map((c) => c[1]))];
  for (const orientation of ["Cw0", "Cw90", "Cw180", "Cw270"] as Orientation[]) {
    it(`facing ${orientation}`, () => {
      const start = { template: "StartingLocation", x: 9, y: 9, z: 2, orientation };
      const own = entityTiles(start);
      const door = startEntranceTile(start.x, start.y, orientation);
      const flat = () => new Uint8Array(W * W).fill(2);
      // (open ground: the 3 × 3 with the door's row)
      const grown = bbox([...own, door]);
      expect(ridingPieces([start], W, W, flat())).toEqual([grown]);
      expect((grown[2] - grown[0] + 1) * (grown[3] - grown[1] + 1)).toBe(12);
      // (a roof over the door, or higher ground beside it: the 3 × 3, so the row is never cut down)
      const row: number[] = [];
      for (let y = grown[1]; y <= grown[3]; y++) for (let x = grown[0]; x <= grown[2]; x++) if (!own.some(([a, b]) => a === x && b === y)) row.push(y * W + x);
      expect(row).toHaveLength(3);
      for (const t of row) {
        const h = flat();
        h[t] = 5;
        expect(ridingPieces([start], W, W, h), `tile ${t % W}, ${Math.floor(t / W)} above`).toEqual([bbox(own)]);
      }
      // (a roof over the start itself: it is held, not ridden)
      const h = flat();
      h[own[4][1] * W + own[4][0]] = 5;
      expect(ridingPieces([start], W, W, h)).toEqual([]);
    });
  }
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

  it("a Lower over a cave's two-thick roof above a badwater source on its floor: the page's stroke is the map built", () => {
    // (the official Canyon's: a 3 � 3 source on a cave floor under a roof two layers thick, a Lower to one over the
    // roof's underside across part of it; the page once levelled the roof over the source to its middle tile)
    const s = withObject("BadwaterSource", 16, 16, 3, "Cw0");
    const W = CAVE_W;
    const settings: Omit<BrushParams, "dabs"> = { tool: "lower", size: 1, strength: 5, shape: "area", target: 7 };
    const dabs = [...tile(17, 15), ...tile(19, 19)];
    const shown = s.built.heights.slice();
    const preview = new StrokePreview(settings, s.terrainState(), shown, W, W);
    preview.add(dabs);
    const rigid = preview.rides(s.built.entities);
    expect(rigid).toEqual([]);
    expect(preview.falls()).toEqual([]);
    const u = s.apply({ op: "brush", params: { ...settings, dabs } });
    expect(u.errors).toEqual([]);
    expect((u.applied[0] as AppliedOp & { op: "brush" }).params.rigid ?? []).toEqual([]);
    expect(Array.from(shown)).toEqual(Array.from(s.built.heights));
    // (the roof comes down to one over its underside where the stroke reached, the cave under it as it was)
    for (const x of [17, 18]) expect(s.terrain.runs(17 * W + x)).toEqual([0, 3, 6, 7]);
    expect(s.terrain.runs(17 * W + 16)).toEqual([0, 3, 6, 8]);
    expect(s.built.entities.find((e) => e.template === "BadwaterSource")).toMatchObject({ x: 16, y: 16, z: 3 });
    expect(unsupportedVoxels(s.terrain).some((v) => v === 1)).toBe(false);
  });
});

describe("a source a Clear stroke takes does not ride it (D249, D322)", () => {
  it("a raise with Clear over a badwater source's corner leaves its ground as the stroke paints it", () => {
    const s = withObject("BadwaterSource", 5, 5, 8, "Cw0");
    // (a raise held on (4, 4) and the source's corner (5, 5): with the source riding it, its ground is levelled back)
    const dabs: number[] = [];
    for (let k = 0; k < 6; k++) dabs.push(4 * 4 + 2, 4 * 4 + 2, 4 * 5 + 1, 4 * 5 + 1);
    const op = { op: "brush", params: { tool: "raise", size: 2, strength: 10, dabs } } as EditOp;
    const p = planStrokeClearing(s, op, "Raise", [5 * CAVE_W + 5]);
    expect(p.ok && p.cleared).toBe(1);
    const u = s.applyAll(p.ok ? p.ops : [], "user", "Raise");
    expect(u.errors).toEqual([]);
    expect(s.built.entities.some((e) => e.template === "BadwaterSource")).toBe(false);
    expect((u.applied.find((o) => o.op === "brush") as AppliedOp & { op: "brush" }).params.rigid ?? []).toEqual([]);
    // (the page paints it so: with Clear it lists no source to ride, useReady `rides`)
    const plain = MapSession.importMap(writeTimber(caveFile()), "plain.timber");
    plain.setWaterMode("defer");
    expect(plain.apply(op, "user", "Raise").errors).toEqual([]);
    expect(Buffer.from(s.built.heights).equals(Buffer.from(plain.built.heights))).toBe(true);
  });
});
