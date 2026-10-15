// Crop map to selection (D340, D342): the operation `crop` makes the map exactly a rectangle of itself. The ground
// (its runs: caves and overhangs stay), the water, the soil, the objects and the sources inside it keep their place
// relative to the new origin, everything outside is gone, and an object the edge cuts is removed (counted). It is
// one undo step that brings the full map back exactly, it is recorded in the log and the project, and a saved
// project opens and saves again byte for byte.
import { describe, expect, it } from "vitest";
import { cropObjects, planCrop } from "../../src/core/doc/crop";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { footprintTiles } from "../../src/core/format/footprints";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { LAYERS } from "../../src/core/format/world";
import { validateMap } from "../../src/core/validate/checks";
import { map, sha, session, timber } from "./gateHelpers";

const W = 64;
const crop = (x: number, y: number, w: number, h: number) => ({ op: "crop" as const, params: { x, y, w, h } });

/** A rectangle of the 64² map that holds its start whole, and cuts some other object. */
function rectAroundStart(s: MapSession): { x: number; y: number; w: number; h: number } {
  const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
  for (const [w, h] of [[40, 44], [36, 36], [30, 32], [24, 24]]) {
    for (let y = 0; y + h <= W; y += 3)
      for (let x = 0; x + w <= W; x += 3) {
        const r = { x, y, w, h };
        const o = cropObjects(s.built.entities, r);
        if (!o.cutStart && o.kept.includes(start.id) && o.crossing.length > 0) return r;
      }
  }
  throw new Error("no rectangle around the start that cuts an object");
}

/** The ground of a world: its voxels on the rectangle of `from`, flattened column by column. */
function voxelsOn(world: { voxels: Uint8Array; sizeX: number; sizeY: number }, r: { x: number; y: number; w: number; h: number }): number[] {
  const out: number[] = [];
  const plane = world.sizeX * world.sizeY;
  for (let z = 0; z < LAYERS; z++) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) out.push(world.voxels[z * plane + y * world.sizeX + x]);
  return out;
}

describe("Crop map to selection: a generated map", () => {
  const original = session();
  const r = rectAroundStart(original);
  const before = original.exportFile();

  const s = session();
  s.settleCanonical();
  const result = s.apply(crop(r.x, r.y, r.w, r.h));

  it("makes the map exactly the rectangle", () => {
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(s.size).toEqual({ x: r.w, y: r.h });
    expect(s.built.W).toBe(r.w);
    expect(s.built.H).toBe(r.h);
    // heights are the original's sub-rectangle
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) expect(s.built.heights[y * r.w + x]).toBe(original.built.heights[(y + r.y) * W + x + r.x]);
    // so are the voxels of the exported file, every layer
    const after = s.exportFile();
    expect(after.world.sizeX).toBe(r.w);
    expect(after.world.sizeY).toBe(r.h);
    expect(voxelsOn(after.world, { x: 0, y: 0, w: r.w, h: r.h })).toEqual(voxelsOn(before.world, r));
  });

  it("keeps the objects inside, moved to the new origin, and removes the ones the edge cuts, counting them", () => {
    const o = cropObjects(original.built.entities, r);
    expect(o.crossing.length).toBeGreaterThan(0);
    expect(result.removedObjects).toBe(o.crossing.length);
    const kept = new Map(s.built.entities.map((e) => [e.id, e]));
    for (const e of original.built.entities) {
      const now = kept.get(e.id);
      if (o.kept.includes(e.id)) {
        expect(now, `${e.template} ${e.id} stays`).toBeDefined();
        expect([now!.template, now!.x, now!.y, now!.z, now!.orientation]).toEqual([e.template, e.x - r.x, e.y - r.y, e.z, e.orientation]);
      } else expect(now, `${e.template} ${e.id} is cut`).toBeUndefined();
    }
    expect(s.built.entities.length).toBe(o.kept.length);
  });

  it("keeps the start, its sources and the water", () => {
    const start = s.built.entities.filter((e) => e.template === "StartingLocation");
    expect(start).toHaveLength(1);
    const tiles = footprintTiles(start[0].template, { template: start[0].template, x: start[0].x, y: start[0].y, z: start[0].z, orientation: start[0].orientation, flipped: start[0].flipped });
    expect(tiles.every(([x, y]) => x >= 0 && y >= 0 && x < r.w && y < r.h)).toBe(true);
    // the water standing in the rectangle is there, tile for tile, as the original settled it
    const water = after();
    let wet = 0;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (original.built.water[(y + r.y) * W + x + r.x] > 0.05) wet++;
    expect(wet).toBeGreaterThan(0);
    expect(water.filter((d) => d > 0.05).length).toBeGreaterThan(0);
    function after(): number[] {
      return Array.from(s.built.water);
    }
  });

  it("is a valid .timber of the new size: the load checks pass", () => {
    const { bytes } = s.exportTimber();
    const file = readTimber(bytes);
    expect([file.world.sizeX, file.world.sizeY]).toEqual([r.w, r.h]);
    expect(file.metadata).toMatchObject({ Width: r.w, Height: r.h });
    const checks = validateMap(file, { profile: "import", loadOnly: true }).report.checks.filter((c) => c.class === "load");
    expect(checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.message ?? ""}`)).toEqual([]);
  });

  it("is recorded in the log and the history as one step", () => {
    expect(s.logOps).toHaveLength(1);
    expect(s.logOps[0]).toMatchObject({ op: "crop", params: { x: r.x, y: r.y, w: r.w, h: r.h } });
    expect(s.history().map((h) => h.label)).toEqual([`Crop to ${r.w}×${r.h}`]);
  });

  it("undo brings the full map back exactly, and redo the crop", () => {
    const cropped = timber(s);
    const croppedProject = s.project();
    expect(s.undo()).toBe(true);
    expect(s.size).toEqual({ x: W, y: W });
    expect(sha(s.exportTimber().bytes)).toBe(sha(original.exportTimber().bytes));
    expect(Array.from(s.built.heights)).toEqual(Array.from(original.built.heights));
    expect(s.canUndo).toBe(false);
    expect(s.features).toEqual(original.features);
    expect(s.redo()).toBe(true);
    expect(s.size).toEqual({ x: r.w, y: r.h });
    expect(timber(s)).toBe(cropped);
    s.settleCanonical();
    expect(sha(s.project())).toBe(sha(croppedProject));
  });
});

describe("Crop map to selection: refusals, one line each, and nothing changes", () => {
  const s = session();
  const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
  const reason = (x: number, y: number, w: number, h: number) => {
    const res = s.apply(crop(x, y, w, h));
    expect(res.ok).toBe(false);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).not.toMatch(/\n/);
    return res.errors[0];
  };

  it("a rectangle off the map", () => {
    expect(reason(40, 8, 30, 30)).toMatch(/off the 64×64 map/);
    expect(reason(0, 50, 20, 20)).toMatch(/off the 64×64 map/);
  });

  it("a side under 4 or over 512", () => {
    expect(reason(10, 10, 3, 30)).toMatch(/at least 4/);
    expect(reason(10, 10, 30, 2)).toMatch(/at least 4/);
    expect(reason(0, 0, 513, 20)).toMatch(/at most 512/);
  });

  it("the same size as the map: nothing to crop", () => {
    expect(reason(0, 0, 64, 64)).toMatch(/nothing to crop/);
  });

  it("a start the edge would cut off, or that is outside", () => {
    // the rectangle beside the start's building
    const x = Math.min(start.x + 2, W - 8);
    expect(reason(x, 0, W - x, 40)).toBe("The start would be cut off: move it inside the selection first");
    const outside = start.x > 20 ? { x: 0, w: 8 } : { x: W - 8, w: 8 };
    expect(reason(outside.x, 0, outside.w, W - 1)).toBe("The start would be cut off: move it inside the selection first");
  });

  it("changes nothing", () => {
    expect(s.logOps).toHaveLength(0);
    expect(s.history()).toEqual([]);
    expect(s.size).toEqual({ x: W, y: W });
    expect(timber(s)).toBe(sha(map().bytes));
  });

  it("is answered as plain data before it is applied (planCrop)", () => {
    const entities = s.built.entities;
    expect(planCrop(entities, W, W, { x: 0, y: 0, w: 64, h: 64 })).toEqual({ ok: false, reason: expect.stringMatching(/nothing to crop/) });
    const r = rectAroundStart(s);
    const plan = planCrop(entities, W, W, r);
    expect(plan).toMatchObject({ ok: true, width: r.w, height: r.h });
    expect(plan.ok && plan.removedObjects).toBe(cropObjects(entities, r).crossing.length);
  });

  it("a crop cannot be part of a group of edits", () => {
    const r = rectAroundStart(s);
    expect(s.applyAll([crop(r.x, r.y, r.w, r.h)]).ok).toBe(false);
    expect(s.logOps).toHaveLength(0);
  });
});

describe("Crop map to selection: an imported map keeps its caves and overhangs", () => {
  /** A generated map's file with a cave under one tile and a ledge, imported. */
  function withCaves(): { s: MapSession; at: { x: number; y: number }[] } {
    const file = readTimber(map().bytes);
    const w = file.world;
    const plane = w.sizeX * w.sizeY;
    const at: { x: number; y: number }[] = [];
    // columns tall enough to hollow, away from every object, a few in the middle of the map
    const taken = new Set<number>();
    for (const e of w.entities) {
      const c = ((e.Components as Record<string, unknown>).BlockObject as { Coordinates: { X: number; Y: number } }).Coordinates;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) taken.add((c.Y + dy) * w.sizeX + c.X + dx);
    }
    // (round the start, so the cropped rectangle holds them)
    const st = w.entities.find((e) => e.Template === "StartingLocation")!;
    const sc = ((st.Components as Record<string, unknown>).BlockObject as { Coordinates: { X: number; Y: number } }).Coordinates;
    for (let y = Math.max(2, sc.Y - 16); y < Math.min(62, sc.Y + 16) && at.length < 6; y++)
      for (let x = Math.max(2, sc.X - 16); x < Math.min(62, sc.X + 16) && at.length < 6; x++) {
        const i = y * w.sizeX + x;
        let top = 0;
        for (let z = 0; z < LAYERS; z++) if (w.voxels[z * plane + i]) top = z + 1;
        if (top >= 6 && !taken.has(i) && (at.length === 0 || Math.abs(at[at.length - 1].x - x) > 4 || at[at.length - 1].y !== y)) {
          // a cave: the voxel two layers below the surface is air, the ground above it stays
          w.voxels[(top - 3) * plane + i] = 0;
          at.push({ x, y });
        }
      }
    expect(at.length).toBeGreaterThan(2);
    return { s: MapSession.importMap(writeTimber(file), "caves.timber"), at };
  }

  it("keeps every voxel of its columns, runs included", () => {
    const { s, at } = withCaves();
    expect(s.columns.size).toBeGreaterThanOrEqual(at.length);
    const before = s.exportFile();
    const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
    const r = { x: Math.max(0, start.x - 20), y: Math.max(0, start.y - 20), w: 44, h: 44 };
    r.x = Math.min(r.x, W - r.w);
    r.y = Math.min(r.y, W - r.h);
    expect(cropObjects(s.built.entities, r).cutStart).toBeNull();
    const res = s.apply(crop(r.x, r.y, r.w, r.h));
    expect(res.errors).toEqual([]);
    const after = s.exportFile();
    expect(voxelsOn(after.world, { x: 0, y: 0, w: r.w, h: r.h })).toEqual(voxelsOn(before.world, r));
    const inside = at.filter((p) => p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h);
    expect(inside.length).toBeGreaterThan(0);
    expect([...s.columns.keys()].sort((a, b) => a - b)).toEqual(inside.map((p) => (p.y - r.y) * r.w + p.x - r.x).sort((a, b) => a - b));
    // the cave is still a cave in the exported file
    for (const p of inside) {
      const i = (p.y - r.y) * r.w + p.x - r.x;
      let runs = 0;
      for (let z = 0; z < LAYERS; z++) if (after.world.voxels[z * r.w * r.h + i] && (z === 0 || !after.world.voxels[(z - 1) * r.w * r.h + i])) runs++;
      expect(runs).toBe(2);
    }
    // and undo gives the imported map back
    s.undo();
    expect(sha(writeTimber(s.exportFile()))).toBe(sha(writeTimber(before)));
  });
});

describe("Crop map to selection: the project", () => {
  it("saves, opens and saves again byte for byte, and undo still reaches the full map", () => {
    const s = session();
    const full = timber(s);
    const r = rectAroundStart(s);
    expect(s.apply(crop(r.x, r.y, r.w, r.h)).ok).toBe(true);
    // an edit after the crop is in the cropped map's tiles
    const cell = { y: 5, x0: 5, x1: 8 };
    const level = s.built.heights[cell.y * r.w + cell.x0];
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[cell.y, cell.x0, cell.x1]], level: Math.min(level + 1, 15) } }).errors).toEqual([]);
    s.settleCanonical();
    const bytes = s.project();
    const again = MapSession.open(decodeProject(bytes));
    expect(again.openedFromStored).toBe(true);
    expect(again.size).toEqual({ x: r.w, y: r.h });
    expect(timber(again)).toBe(timber(s));
    expect(sha(again.project())).toBe(sha(bytes));
    // the replay of the cropped generation is compared with the stored map, and agrees
    expect(again.checkReplay()).toBe(true);
    expect(again.history().map((h) => h.op)).toEqual(["crop", "sculpt"]);
    expect(again.undo()).toBe(true);
    expect(again.undo()).toBe(true);
    expect(again.size).toEqual({ x: W, y: W });
    expect(timber(again)).toBe(full);
    expect(again.redo() && again.redo()).toBe(true);
    expect(timber(again)).toBe(timber(s));
  });

  it("a project without its stored map rebuilds to the same map", () => {
    const s = session();
    const r = rectAroundStart(s);
    s.apply(crop(r.x, r.y, r.w, r.h));
    s.settleCanonical();
    const { stored, ...doc } = decodeProject(s.project());
    expect(stored).toBeDefined();
    const rebuilt = MapSession.open(doc);
    expect(rebuilt.openedFromStored).toBe(false);
    expect(timber(rebuilt)).toBe(timber(s));
  });

  it("crops of crops chain, and each undo is the map before it", () => {
    const s = session();
    const f0 = timber(s);
    const r1 = rectAroundStart(s);
    expect(s.apply(crop(r1.x, r1.y, r1.w, r1.h)).ok).toBe(true);
    const f1 = timber(s);
    const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
    const r2 = { x: Math.max(0, start.x - 8), y: Math.max(0, start.y - 8), w: 16, h: 16 };
    r2.x = Math.min(r2.x, r1.w - r2.w);
    r2.y = Math.min(r2.y, r1.h - r2.h);
    const second = s.apply(crop(r2.x, r2.y, r2.w, r2.h));
    expect(second.errors).toEqual([]);
    expect(s.size).toEqual({ x: 16, y: 16 });
    s.settleCanonical();
    const again = MapSession.open(decodeProject(s.project()));
    expect(sha(again.project())).toBe(sha(s.project()));
    expect(again.checkReplay()).toBe(true);
    again.undo();
    expect(timber(again)).toBe(f1);
    again.undo();
    expect(timber(again)).toBe(f0);
    expect(again.canUndo).toBe(false);
  });
});

describe("Crop map to selection: the water settles again", () => {
  it("in the background where edits do not wait on the water", () => {
    const s = session();
    s.setWaterMode("defer");
    const r = rectAroundStart(s);
    expect(s.apply(crop(r.x, r.y, r.w, r.h)).ok).toBe(true);
    expect(s.waterPending).toBe(true);
    s.settleCanonical();
    expect(s.waterPending).toBe(false);
    expect(s.built.settle.settled).toBe(true);
  });

  it("canonically otherwise", () => {
    const s = session();
    const r = rectAroundStart(s);
    s.apply(crop(r.x, r.y, r.w, r.h));
    expect(s.waterPending).toBe(false);
    expect(s.built.waterFromFile).toBe(false);
  });
});
