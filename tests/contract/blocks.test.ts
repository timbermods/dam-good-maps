// The Block tool's core (3D step 3, D335, D342): the `blocks` operation adds blocks against a face and
// removes blocks, in a click or a drag, across a footprint; it is never clamped (a cell off the map or the
// layers, on an object, or nothing to change, is refused with one line); ground the game's support rule
// would drop is refused with its count, which the query `blockFalls` gives first; undo gives back the
// exact runs; the log replays onto the same runs through the project file; and the export writes the
// ground as it stands. On the hand-made cave map (caveMap.ts) and on a generated map.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { blockFalls, type BlocksParams } from "../../src/core/doc/blockTool";
import { MapSession } from "../../src/core/doc/session";
import { masksOf } from "../../src/core/features/build";
import { generate } from "../../src/core/gen/generate";
import { decodeWorld } from "../../src/core/format/world";
import { makeSpec } from "../../src/core/spec/mapspec";
import { BLOCK_TOP_LAYER } from "../../src/core/terrain/blocks";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { strFromU8, unzipSync } from "fflate";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { mulberry } from "./brushRandom";
import { CAVE_W as W, CAVE_H as H, caveSession } from "./caveMap";
import { randomBrush, STROKE_TOOLS } from "./strokeRandom";

const at = (x: number, y: number) => y * W + x;
const op = (params: BlocksParams) => ({ op: "blocks" as const, params });
const add = (side: BlocksParams["side"], cells: [number, number, number][], size = 1, shape?: "round"): BlocksParams => ({ mode: "add", side, at: cells, size, ...(shape ? { shape } : {}) });
const remove = (side: BlocksParams["side"], cells: [number, number, number][], size = 1, shape?: "round"): BlocksParams => ({ mode: "remove", side, at: cells, size, ...(shape ? { shape } : {}) });
const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];
const area = (tool: "raise" | "lower", target: number, x0: number, y0: number, x1: number, y1: number): BrushParams => ({ tool, size: 1, strength: 5, shape: "area", target, dabs: [...tile(x0, y0), ...tile(x1, y1)] });
const voxelsOut = (s: MapSession) => decodeWorld(strFromU8(unzipSync(s.exportTimber().bytes)["world.json"]).replace(/^﻿/, "")).voxels;
const maskList = (s: MapSession) => [...masksOf(s.built.cache.terrain)];

describe("the Block tool on a map with a cave and a ledge", () => {
  it("a click adds one block on the face pointed at, on top and against a wall", () => {
    const s = caveSession();
    expect(s.terrain.runs(at(10, 10))).toEqual([0, 8]);
    const top = s.apply(op(add("+z", [[10, 10, 7]])));
    expect(top.errors).toEqual([]);
    expect(s.terrain.runs(at(10, 10))).toEqual([0, 9]);
    expect(s.built.heights[at(10, 10)]).toBe(9);
    expect(s.terrain.runs(at(11, 10))).toEqual([0, 8]);
    // against the cliff's face, over the lowland: the cell beyond the face
    const wall = s.apply(op(add("+x", [[29, 5, 3]])));
    expect(wall.errors).toEqual([]);
    expect(s.terrain.runs(at(30, 5))).toEqual([0, 2, 3, 4]);
    expect(s.built.heights[at(30, 5)]).toBe(4);
    expect(s.columns.has(at(30, 5))).toBe(true);
    expect(s.plainAt(at(30, 5))).toBe(false);
    expect(s.plainAt(at(10, 10))).toBe(true);
    expect(s.history().map((h) => h.label)).toEqual(["Add blocks", "Add blocks"]);
  });

  it("a click removes one block, and hollows a cave under the surface", () => {
    const s = caveSession();
    expect(s.apply(op(remove("+z", [[10, 10, 7]]))).errors).toEqual([]);
    expect(s.terrain.runs(at(10, 10))).toEqual([0, 7]);
    expect(s.built.heights[at(10, 10)]).toBe(7);
    // a 3 × 3 hole three layers under the surface of solid ground
    const dig = s.apply(op(remove("+z", [[24, 24, 4]], 3)));
    expect(dig.errors).toEqual([]);
    for (let y = 23; y <= 25; y++) for (let x = 23; x <= 25; x++) {
      expect(s.terrain.runs(at(x, y))).toEqual([0, 4, 5, 8]);
      expect(s.built.heights[at(x, y)]).toBe(8);
    }
    // (the cave's 6 × 6 and the ledge's 3 × 5 tiles are columns too)
    expect(s.columns.size).toBe(6 * 6 + 3 * 5 + 9);
    expect(Array.from(voxelsOut(s))).toEqual(Array.from(s.terrain.voxels()));
  });

  it("a drag paints a layer outward from the face across the cells swept, and a round footprint is a disc", () => {
    const s = caveSession();
    const swept: [number, number, number][] = [[5, 12, 7], [6, 12, 7], [7, 12, 7], [8, 12, 7]];
    expect(s.apply(op(add("+z", swept))).errors).toEqual([]);
    for (let x = 5; x <= 8; x++) expect(s.built.heights[at(x, 12)]).toBe(9);
    expect(s.built.heights[at(4, 12)]).toBe(8);
    expect(s.built.heights[at(9, 12)]).toBe(8);
    expect(s.built.heights[at(6, 11)]).toBe(8);
    // a size 3 round footprint on a layer: the plus of five tiles at size 3 reaches 3 across
    const big = caveSession();
    const r = big.apply(op(remove("+z", [[10, 10, 7]], 5, "round")));
    expect(r.errors).toEqual([]);
    const cut = [] as number[];
    for (let y = 6; y <= 14; y++) for (let x = 6; x <= 14; x++) if (big.built.heights[at(x, y)] === 7) cut.push(at(x, y));
    // a disc of diameter 5 (the centre tile's offsets −2..2 within 2.5): 21 tiles
    expect(cut.length).toBe(21);
    expect(big.built.heights[at(8, 8)]).toBe(8);
    expect(big.built.heights[at(10, 8)]).toBe(7);
  });

  it("refuses, never clamps: off the map, above the top layer, on an object, nothing to change", () => {
    const s = caveSession();
    const before = s.terrain.mask.slice();
    const seq = s.nextSeq;
    const refused = (p: BlocksParams, line: string | RegExp) => {
      const u = s.apply(op(p));
      expect(u.ok).toBe(false);
      expect(u.errors).toHaveLength(1);
      if (typeof line === "string") expect(u.errors[0]).toBe(line);
      else expect(u.errors[0]).toMatch(line);
      expect(Array.from(s.terrain.mask)).toEqual(Array.from(before));
      expect(s.canUndo).toBe(false);
      expect(s.nextSeq).toBe(seq);
      expect(blockFalls(s, p).reason).toBe(u.errors[0]);
    };
    refused(add("+z", [[0, 0, 7]], 3), "(-1, -1) is outside the map");
    refused(add("+x", [[W - 1, 5, 1]]), "(40, 5) is outside the map");
    // the top layer: raise a column to the ceiling, then build on it
    expect(s.apply({ op: "brush", params: area("raise", 22, 5, 5, 5, 5) }).errors).toEqual([]);
    expect(s.built.heights[at(5, 5)]).toBe(22);
    const raised = s.terrain.mask.slice();
    const seq2 = s.nextSeq;
    const u = s.apply(op(add("+z", [[5, 5, BLOCK_TOP_LAYER]])));
    expect(u.errors).toEqual(["layer 22 is above the highest layer (21)"]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(raised));
    expect(s.nextSeq).toBe(seq2);
    expect(s.apply(op(add("+z", [[5, 5, 22]]))).errors).toEqual(["layer 22 is above the highest layer (21)"]);
    // nothing to change, and no block to point at
    const flat = caveSession();
    expect(flat.apply(op(add("-z", [[10, 10, 7]]))).errors).toEqual(["there is no room for a block there"]);
    expect(flat.apply(op(remove("+z", [[10, 10, 9]]))).errors).toEqual(["(10, 10) has no block in layer 9 to point at"]);
    expect(flat.apply(op({ mode: "add", side: "+z", at: [[10, 10, 7]], size: 9 })).errors[0]).toMatch(/size/);
    expect(flat.canUndo).toBe(false);
  });

  it("refuses ground an object stands on or in", () => {
    const s = caveSession();
    expect(s.apply({ op: "placeEntity", params: { id: "11111111-2222-4333-8444-555555555555", template: "Pine", x: 8, y: 30, orientation: "Cw0" } }).errors).toEqual([]);
    const tree = s.built.entities.find((e) => e.id === "11111111-2222-4333-8444-555555555555")!;
    expect(tree.z).toBe(8);
    const steps = s.history().length;
    expect(s.apply(op(add("+z", [[8, 30, 7]]))).errors).toEqual(["an object stands at (8, 30) in layer 8"]);
    expect(s.apply(op(remove("+z", [[8, 30, 7]]))).errors).toEqual(["an object stands on the block at (8, 30) in layer 7"]);
    expect(s.apply(op(remove("+z", [[7, 29, 7]], 3))).errors).toEqual(["an object stands on the block at (8, 30) in layer 7"]);
    expect(s.history().length).toBe(steps);
    // (lower in the same column the tree stands over: allowed, the tree stays on its top block)
    expect(s.apply(op(remove("+z", [[8, 30, 3]]))).errors).toEqual([]);
    expect(s.built.entities.find((e) => e.id === tree.id)!.z).toBe(8);
  });

  it("ground that would fall is refused with its count, which blockFalls shows first", () => {
    const s = caveSession();
    const before = s.terrain.mask.slice();
    const seq = s.nextSeq;
    // the cliff that holds the ledge, cut away (layers 4–7 of five tiles of the wall)
    const cut = remove("+x", [[29, 12, 5]], 5);
    const q = blockFalls(s, cut);
    expect(q.errors).toEqual([]);
    expect(q.removed.length).toBe(5 * 5);
    expect(q.falls.length).toBeGreaterThan(0);
    // every block named is a solid block of the ledge
    for (const [x, y, z] of q.falls) expect(s.terrain.solid(at(x, y), z)).toBe(true);
    const u = s.apply(op(cut));
    expect(u.ok).toBe(false);
    expect(u.errors).toEqual([`${q.falls.length} blocks of ground would fall: nothing would hold them up`]);
    expect(q.reason).toBe(u.errors[0]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(before));
    expect(s.canUndo).toBe(false);
    expect(s.nextSeq).toBe(seq);
    // an add of ground three tiles past what holds it up falls; one within reach does not
    const far = add("+z", [[34, 12, 7]]);
    expect(blockFalls(s, far).errors).toEqual(["(34, 12) has no block in layer 7 to point at"]);
    const out = add("+x", [[32, 12, 5]]);
    expect(blockFalls(s, out).reason).toBe("1 block of ground would fall: nothing would hold it up");
    expect(s.apply(op(out)).errors).toEqual(["1 block of ground would fall: nothing would hold it up"]);
    // a query changes nothing, and a block that holds still shows nothing falling
    const ok = add("+z", [[10, 10, 7]]);
    const fine = blockFalls(s, ok);
    expect(fine.reason).toBeNull();
    expect(fine.falls).toEqual([]);
    expect(fine.added).toEqual([[10, 10, 8]]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(before));
  });

  it("a hollow whose roof spans too far is refused, a narrower one is not", () => {
    const s = caveSession();
    // a hole 8 wide under a roof one layer thick: the roof's middle 2 × 2 is four tiles from any wall
    const wide = remove("+z", [[9, 30, 6]], 8);
    const q = blockFalls(s, wide);
    expect(q.errors).toEqual([]);
    expect(q.removed.length).toBe(64);
    expect(q.falls.length).toBe(4);
    expect(s.apply(op(wide)).errors).toEqual(["4 blocks of ground would fall: nothing would hold them up"]);
    expect(s.canUndo).toBe(false);
    expect(s.columns.size).toBe(6 * 6 + 3 * 5);
    // six wide (the game's flat roof spans six) holds
    expect(s.apply(op(remove("+z", [[9, 30, 6]], 6))).errors).toEqual([]);
    expect(s.columns.size).toBe(6 * 6 + 3 * 5 + 36);
  });

  it("what the query names is what the step changes", () => {
    const s = caveSession();
    const rand = mulberry(3);
    let taken = 0;
    for (let k = 0; k < 40; k++) {
      const p = randomBlocks(rand, 14);
      const was = s.terrain.mask.slice();
      const q = blockFalls(s, p);
      const u = s.apply(op(p));
      if (q.reason === null) {
        expect(u.errors, `step ${k}`).toEqual([]);
        const now = s.terrain;
        const gained = [] as string[];
        const lost = [] as string[];
        for (let i = 0; i < now.N; i++) for (let z = 0; z < 23; z++) {
          const a = !!(was[i] & (1 << z));
          const b = now.solid(i, z);
          if (!a && b) gained.push(`${i % W},${Math.floor(i / W)},${z}`);
          if (a && !b) lost.push(`${i % W},${Math.floor(i / W)},${z}`);
        }
        const key = (c: [number, number, number][]) => c.map(([x, y, z]) => `${x},${y},${z}`).sort();
        expect(gained.sort()).toEqual(key(q.added));
        expect(lost.sort()).toEqual(key(q.removed));
        taken++;
      } else {
        expect(u.ok, `step ${k}`).toBe(false);
        expect(u.errors).toEqual([q.reason]);
        expect(Array.from(s.terrain.mask)).toEqual(Array.from(was));
      }
    }
    expect(taken).toBeGreaterThan(5);
  });
});

/** A random block operation near the cave and the ledge. */
function randomBlocks(rand: () => number, r: number): BlocksParams {
  const sides: BlocksParams["side"][] = ["+x", "-x", "+y", "-y", "+z", "-z"];
  const side = sides[Math.floor(rand() * 6)];
  const mode = rand() < 0.5 ? "add" : "remove";
  const cx = rand() < 0.6 ? 18 : 31;
  const cy = rand() < 0.6 ? 18 : 12;
  const pos = (): [number, number, number] => [cx + Math.round((rand() - 0.5) * 2 * r), cy + Math.round((rand() - 0.5) * 2 * r), 1 + Math.floor(rand() * 8)];
  const first = pos();
  const axis = side[1] === "x" ? 0 : side[1] === "y" ? 1 : 2;
  const at: [number, number, number][] = [first];
  const drag = rand() < 0.4 ? 1 + Math.floor(rand() * 6) : 0;
  for (let k = 0; k < drag; k++) {
    const p = pos();
    p[axis] = first[axis];
    at.push(p);
  }
  return { mode, side, at, size: 1 + Math.floor(rand() * 4), ...(rand() < 0.4 ? { shape: "round" as const } : {}) };
}

describe("the Block tool's steps undo, replay and save exactly", () => {
  it("random blocks and strokes: nothing falls, an incremental build equals a full one, undo and redo give each state's exact runs, the project replays onto the same runs", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    const rand = mulberry(8);
    const states: { mask: Uint32Array; masks: [number, number][] }[] = [{ mask: s.terrain.mask.slice(), masks: maskList(s) }];
    let blocks = 0;
    for (let k = 0; k < 60; k++) {
      let u;
      if (rand() < 0.2) u = s.apply({ op: "brush", params: randomBrush(rand, W, H, STROKE_TOOLS[Math.floor(rand() * STROKE_TOOLS.length)], { x: 18, y: 18, r: 8 }) });
      else {
        u = s.apply(op(randomBlocks(rand, 12)));
        if (u.ok) blocks++;
      }
      if (!u.ok) {
        expect(u.errors[0], `step ${k}`).not.toMatch(/^$/);
        expect(Array.from(s.terrain.mask)).toEqual(Array.from(states.at(-1)!.mask));
        continue;
      }
      expect(unsupportedVoxels(s.terrain).some((v) => v === 1), `step ${k}`).toBe(false);
      states.push({ mask: s.terrain.mask.slice(), masks: maskList(s) });
    }
    expect(blocks).toBeGreaterThan(8);
    // an incremental build equals a full one: the surface and every tile the tool touched
    const full = s.fullBuild();
    expect(Array.from(full.heights)).toEqual(Array.from(s.built.heights));
    expect(masksOf(full.cache.terrain)).toEqual(masksOf(s.built.cache.terrain));
    // the surface and the runs agree
    for (let i = 0; i < W * H; i++) expect(s.terrain.surface(i)).toBe(s.built.heights[i]);
    // the project replays onto the same runs and the same file
    s.settleCanonical();
    const again = MapSession.open(decodeProject(s.project()), { rebuild: true });
    expect(Array.from(again.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(MapSession.replayMatchesStored(decodeProject(s.project()))).toBe(true);
    expect(Array.from(voxelsOut(again))).toEqual(Array.from(voxelsOut(s)));
    expect(Array.from(voxelsOut(s))).toEqual(Array.from(s.terrain.voxels()));
    // saved, reopened, saved: the same bytes
    const bytes = s.project();
    const reopened = MapSession.open(decodeProject(bytes));
    expect(Array.from(reopened.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(Buffer.from(reopened.project()).equals(Buffer.from(bytes))).toBe(true);
    // undo, step by step, gives back each state's exact runs; redo brings them back
    for (let k = states.length - 2; k >= 0; k--) {
      expect(s.undo()).toBe(true);
      expect(Array.from(s.terrain.mask), `undo to ${k}`).toEqual(Array.from(states[k].mask));
      expect(maskList(s), `undo to ${k}`).toEqual(states[k].masks);
    }
    expect(s.canUndo).toBe(false);
    for (let k = 1; k < states.length; k++) {
      expect(s.redo()).toBe(true);
      expect(Array.from(s.terrain.mask), `redo to ${k}`).toEqual(Array.from(states[k].mask));
    }
  });

  it("a stroke after a block shapes the top and nothing under it, and a block after a stroke builds on it", () => {
    const s = caveSession();
    expect(s.apply(op(remove("+z", [[24, 24, 4]], 3))).errors).toEqual([]);
    expect(s.terrain.runs(at(24, 24))).toEqual([0, 4, 5, 8]);
    expect(s.apply({ op: "brush", params: area("raise", 10, 23, 23, 25, 25) }).errors).toEqual([]);
    expect(s.terrain.runs(at(24, 24))).toEqual([0, 4, 5, 10]);
    expect(s.apply({ op: "brush", params: area("lower", 0, 23, 23, 25, 25) }).errors).toEqual([]);
    // (the roof keeps its lowest layer, as on any roof)
    expect(s.terrain.runs(at(24, 24))).toEqual([0, 4, 5, 6]);
    expect(s.apply(op(add("+z", [[24, 24, 5]]))).errors).toEqual([]);
    expect(s.terrain.runs(at(24, 24))).toEqual([0, 4, 5, 7]);
    // a plain tile a block dug a cave under becomes plain again when it is filled
    expect(s.apply(op(add("+z", [[24, 24, 3]], 3))).errors).toEqual([]);
    expect(s.plainAt(at(24, 24))).toBe(true);
    expect(s.terrain.runs(at(24, 24))).toEqual([0, 7]);
  });

  it("a block edit settles the water as a stroke does, and a saved project opens from the settled map", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    expect(s.apply(op(remove("+z", [[10, 10, 7]], 3))).errors).toEqual([]);
    s.setWaterMode("canonical");
    s.settleCanonical();
    expect(s.waterPending).toBe(false);
    // (a project saved after the settle carries the map as it stands, and opens from it)
    const again = MapSession.open(decodeProject(s.project()));
    expect(again.openedFromStored).toBe(true);
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    expect(Array.from(again.terrain.mask)).toEqual(Array.from(s.terrain.mask));
  });
});

describe("the Block tool on a generated map", () => {
  const spec = makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } });
  const r = generate(spec);

  /** A dry tile with dry neighbours, no object near, on high enough ground. */
  function spot(s: MapSession): { x: number; y: number } {
    const b = s.built;
    const Wg = b.W;
    const near = new Set<number>();
    for (const e of b.entities) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near.add((e.y + dy) * Wg + e.x + dx);
    for (let y = 8; y < b.H - 8; y++)
      for (let x = 8; x < Wg - 8; x++) {
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3 && ok; dx++) {
          const i = (y + dy) * Wg + x + dx;
          if (b.water[i] > 0 || b.channel[i] || near.has(i) || b.heights[i] < 7 || b.heights[i] !== b.heights[y * Wg + x]) ok = false;
        }
        if (ok) return { x, y };
      }
    throw new Error("no spot");
  }

  it("builds up, hollows a cave and exports the ground as it stands", () => {
    const s = MapSession.fromGenerated(r, r.file);
    expect(s.mode).toBe("live");
    expect(s.columns.size).toBe(0);
    const { x, y } = spot(s);
    const Wg = s.built.W;
    const h = s.built.heights[y * Wg + x];
    expect(s.apply(op(add("+z", [[x, y, h - 1]], 3))).errors).toEqual([]);
    expect(s.built.heights[y * Wg + x]).toBe(h + 1);
    expect(s.columns.size).toBe(0);
    // a 3 × 3 hole two layers under the new surface
    const dig = s.apply(op(remove("+z", [[x, y, h - 3]], 3)));
    expect(dig.errors).toEqual([]);
    expect(s.columns.size).toBe(9);
    expect(s.plainAt(y * Wg + x)).toBe(false);
    expect(s.terrain.runs(y * Wg + x)).toEqual([0, h - 3, h - 2, h + 1]);
    const out = voxelsOut(s);
    expect(Array.from(out)).toEqual(Array.from(s.terrain.voxels()));
    expect(out[(h - 3) * Wg * s.built.H + y * Wg + x]).toBe(0);
    // an object in the way is refused, wherever the block would stand
    const tree = s.built.entities.find((e) => e.template === "Pine" || e.template === "Birch" || e.template === "Oak");
    if (tree) {
      const u = s.apply(op(add("+z", [[tree.x, tree.y, s.built.heights[tree.y * Wg + tree.x] - 1]])));
      expect(u.errors[0]).toMatch(/^an object stands at/);
    }
    // undo takes the hole, then the build-up, back to the heightfield
    expect(s.undo()).toBe(true);
    expect(s.columns.size).toBe(0);
    expect(s.undo()).toBe(true);
    expect(s.built.heights[y * Wg + x]).toBe(h);
    expect(s.canUndo).toBe(false);
  });

  it("saved, reopened and saved is the same file, and the log replays onto the same runs", () => {
    const s = MapSession.fromGenerated(r, r.file);
    const { x, y } = spot(s);
    const Wg = s.built.W;
    const h = s.built.heights[y * Wg + x];
    expect(s.apply(op(remove("+z", [[x, y, h - 3]], 3))).errors).toEqual([]);
    expect(s.apply(op(add("+z", [[x + 5, y, h - 1]], 2, "round"))).errors).toEqual([]);
    s.settleCanonical();
    const bytes = s.project();
    const again = MapSession.open(decodeProject(bytes));
    expect(Array.from(again.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(Buffer.from(again.project()).equals(Buffer.from(bytes))).toBe(true);
    const replayed = MapSession.open(decodeProject(bytes), { rebuild: true });
    expect(Array.from(replayed.terrain.mask)).toEqual(Array.from(s.terrain.mask));
    expect(MapSession.replayMatchesStored(decodeProject(bytes))).toBe(true);
    expect(Array.from(voxelsOut(again))).toEqual(Array.from(voxelsOut(s)));
  });
});
