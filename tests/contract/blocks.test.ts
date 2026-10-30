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
/** A 3 × 3 hole in the cave's west wall, dug from the cave: the open face of the wall's blocks looks at the cave's air. */
const hollow = (): BlocksParams => remove("+x", [[14, 17, 4]], 3);

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
    // a 3 × 3 hole in the wall, dug from the cave
    const dig = s.apply(op(hollow()));
    expect(dig.errors).toEqual([]);
    for (let y = 16; y <= 18; y++) {
      expect(s.terrain.runs(at(14, y))).toEqual([0, 3, 6, 8]);
      expect(s.built.heights[at(14, y)]).toBe(8);
    }
    // (the cave's 6 × 6 and the ledge's 3 × 5 tiles are columns too)
    expect(s.columns.size).toBe(6 * 6 + 3 * 5 + 3);
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
    refused(add("+x", [[W - 1, 5, 1]]), "X 40 · Y 5 is outside the map");
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
    expect(flat.apply(op(remove("+z", [[10, 10, 9]]))).errors).toEqual(["X 10 · Y 10 has no block in layer 9 to point at"]);
    expect(flat.apply(op({ mode: "add", side: "+z", at: [[10, 10, 7]], size: 9 })).errors[0]).toMatch(/size/);
    expect(flat.canUndo).toBe(false);
  });

  it("refuses ground an object stands on or in", () => {
    const s = caveSession();
    expect(s.apply({ op: "placeEntity", params: { id: "11111111-2222-4333-8444-555555555555", template: "Blockage", x: 8, y: 30, orientation: "Cw0" } }).errors).toEqual([]);
    const tree = s.built.entities.find((e) => e.id === "11111111-2222-4333-8444-555555555555")!;
    expect(tree.z).toBe(8);
    const steps = s.history().length;
    expect(s.apply(op(add("+z", [[8, 30, 7]]))).errors).toEqual(["an object stands at X 8 · Y 30 in layer 8"]);
    expect(s.apply(op(remove("+z", [[8, 30, 7]]))).errors).toEqual(["an object stands on the block at X 8 · Y 30 in layer 7"]);
    expect(s.apply(op(remove("+z", [[7, 29, 7]], 3))).errors).toEqual(["an object stands on the block at X 8 · Y 30 in layer 7"]);
    expect(s.history().length).toBe(steps);
    // (deeper in the same column the blocks are buried: a remove takes only what a viewer sees)
    expect(s.apply(op(remove("+z", [[8, 30, 3]]))).errors).toEqual(["there is no block there to remove"]);
    expect(s.built.entities.find((e) => e.id === tree.id)!.z).toBe(8);
  });

  it("a step that would move a mine site or leave it for the game to remove is refused, with the line blockFalls gives first (D491)", () => {
    const s = caveSession();
    // a 5 × 5 mine site on the cliff's top, its east row at the cliff's edge over the lowland
    const id = "11111111-2222-4333-8444-555555555555";
    expect(s.apply({ op: "placeEntity", params: { id, template: "UndergroundRuins", x: 25, y: 30, orientation: "Cw0" } }).errors).toEqual([]);
    const site = () => s.built.entities.find((e) => e.id === id)!;
    expect(site().z).toBe(8);
    // a pillar beside it, two blocks high, and a block out from it over the site: over its corner tile, which
    // it takes its level from, the build would carry it up; over another tile it stays under the block
    for (const z of [7, 8]) expect(s.apply(op(add("+z", [[24, 30, z]]))).errors).toEqual([]);
    for (const z of [7, 8]) expect(s.apply(op(add("+z", [[24, 32, z]]))).errors).toEqual([]);
    const corner = add("+x", [[24, 30, 9]]);
    const q0 = blockFalls(s, corner);
    expect(q0.added).toEqual([[25, 30, 9]]);
    expect(q0.reason).toBe("a mine site stands under it at X 25 · Y 30");
    expect(s.apply(op(corner)).errors).toEqual([q0.reason]);
    const over = add("+x", [[24, 32, 9]]);
    expect(blockFalls(s, over).reason).toBeNull();
    expect(s.apply(op(over)).errors).toEqual([]);
    expect(site().z).toBe(8);
    const steps = s.history().length;
    const held = s.terrain.mask.slice();
    // a block dug from the cliff's face, deep under the site's east row: nothing falls, but the game keeps a
    // mine site only on ground that reaches the bottom of the map, so it would remove it
    const under = remove("+x", [[29, 32, 4]]);
    const q = blockFalls(s, under);
    expect(q.falls).toEqual([]);
    expect(q.removed).toEqual([[29, 32, 4]]);
    expect(q.reason).toBe("it would leave a mine site at X 25 · Y 30 inside the ground or floating, and the game would remove it");
    expect(s.apply(op(under)).errors).toEqual([q.reason]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(held));
    expect(s.history().length).toBe(steps);
    // the same dig beside it is taken
    const beside = remove("+x", [[29, 36, 4]]);
    expect(blockFalls(s, beside).reason).toBeNull();
    expect(s.apply(op(beside)).errors).toEqual([]);
  });

  it("ground that would fall is refused with its count, which blockFalls shows first", () => {
    const s = caveSession();
    // the cliff that holds the ledge, taken from the top down, a layer at a time (each is open once the one above is gone)
    const wall = (z: number) => remove("+z", [10, 11, 12, 13, 14].map((y): [number, number, number] => [29, y, z]));
    expect(s.apply(op(wall(7))).errors).toEqual([]);
    expect(s.apply(op(wall(6))).errors).toEqual([]);
    const held = s.terrain.mask.slice();
    const cut = wall(5);
    const q = blockFalls(s, cut);
    expect(q.errors).toEqual([]);
    expect(q.removed.length).toBe(5);
    // the ledge: three tiles out, three layers, five rows
    expect(q.falls.length).toBe(3 * 3 * 5);
    for (const [x, y, z] of q.falls) expect(s.terrain.solid(at(x, y), z)).toBe(true);
    const seq = s.nextSeq;
    const u = s.apply(op(cut));
    expect(u.ok).toBe(false);
    expect(u.errors).toEqual([`${q.falls.length} blocks of ground would fall: nothing would hold them up`]);
    expect(q.reason).toBe(u.errors[0]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(held));
    expect(s.nextSeq).toBe(seq);
    // an add of ground three tiles past what holds it up falls; one within reach does not
    const far = add("+z", [[34, 12, 7]]);
    expect(blockFalls(s, far).errors).toEqual(["X 34 · Y 12 has no block in layer 7 to point at"]);
    const out = add("+x", [[32, 12, 5]]);
    expect(blockFalls(s, out).reason).toBe("1 block of ground would fall: nothing would hold it up");
    expect(s.apply(op(out)).errors).toEqual(["1 block of ground would fall: nothing would hold it up"]);
    // a query changes nothing, and a block that holds still shows nothing falling
    const ok = add("+z", [[10, 10, 7]]);
    const fine = blockFalls(s, ok);
    expect(fine.reason).toBeNull();
    expect(fine.falls).toEqual([]);
    expect(fine.added).toEqual([[10, 10, 8]]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(held));
  });

  it("a drag over air chains: each block that touches the ground or one added earlier grows a span", () => {
    const s = caveSession();
    // (29, 20) is the cliff's top, (30, 20) the lowland beside it: air at layer 7
    const span = add("+z", [[29, 20, 7], [30, 20, 7], [31, 20, 7], [32, 20, 7]]);
    const q = blockFalls(s, span);
    expect(q.errors).toEqual([]);
    expect(q.added).toEqual([[29, 20, 8], [30, 20, 8], [31, 20, 8], [32, 20, 8]]);
    expect(q.falls).toEqual([]);
    expect(s.apply(op(span)).errors).toEqual([]);
    expect(s.built.heights[at(32, 20)]).toBe(9);
    expect(s.terrain.runs(at(32, 20))).toEqual([0, 2, 8, 9]);
    // in sweep order: a position reached before the span gets to it has nothing to touch yet
    const skipped = blockFalls(caveSession(), add("+z", [[29, 20, 7], [31, 20, 7], [30, 20, 7]]));
    expect(skipped.errors).toEqual([]);
    expect(skipped.added).toEqual([[29, 20, 8], [30, 20, 8]]);
    // the support rule still limits it: the fifth block of a span is four tiles out
    const long = add("+z", [[29, 20, 7], [30, 20, 7], [31, 20, 7], [32, 20, 7], [33, 20, 7]]);
    const q5 = blockFalls(caveSession(), long);
    expect(q5.falls).toEqual([[33, 20, 8]]);
    const fresh = caveSession();
    expect(fresh.apply(op(long)).errors).toEqual(["1 block of ground would fall: nothing would hold it up"]);
    // the operation keeps the blocks it changed
    expect(s.logOps.at(-1)!.op === "blocks" && (s.logOps.at(-1)!.params as BlocksParams).cells).toEqual([at(29, 20), 1 << 8, at(30, 20), 1 << 8, at(31, 20), 1 << 8, at(32, 20), 1 << 8]);
  });

  it("a footprint chains on its own: the whole footprint goes in wherever it is held, whatever the order of its cells", () => {
    const s = caveSession();
    // a lone pillar one block high, and a size 3 click on its top: the 3 × 3 above it, symmetric
    expect(s.apply(op(add("+z", [[10, 10, 7]]))).errors).toEqual([]);
    const q = blockFalls(s, add("+z", [[10, 10, 8]], 3));
    expect(q.errors).toEqual([]);
    const cells = q.added.map(([x, y, z]) => `${x},${y},${z}`).sort();
    expect(cells).toEqual([9, 10, 11].flatMap((y) => [9, 10, 11].map((x) => `${x},${y},9`)).sort());
    expect(q.falls).toEqual([]);
    // a round one is as symmetric: the plus at size 3 is not (the disc of diameter 3 holds the corners), size 4 loses them
    const round = blockFalls(s, add("+z", [[10, 10, 8]], 4, "round"));
    const mirror = (c: [number, number, number]) => `${21 - c[0]},${21 - c[1]}`;
    const xy = new Set(round.added.map(([x, y]) => `${x},${y}`));
    // (the footprint of an even size is centred between four tiles: its disc maps onto itself through that centre)
    for (const c of round.added) expect(xy.has(mirror(c)), `${c}`).toBe(true);
  });

  it("the same click over the edge of a cliff overhangs the same way on a west- and an east-facing one", () => {
    const s = caveSession();
    // a pit 8 wide (x 7 to 14): the ground at x = 6 faces east into it, the ground at x = 15 faces west
    expect(s.apply(op(remove("+z", [[10, 10, 7]], 8))).errors).toEqual([]);
    expect(s.built.heights[at(10, 10)]).toBe(7);
    const east = blockFalls(s, add("+z", [[6, 10, 7]], 3));
    const west = blockFalls(s, add("+z", [[15, 10, 7]], 3));
    expect(east.errors).toEqual([]);
    expect(west.errors).toEqual([]);
    // 3 × 3 on layer 8, each over a pit tile or the rim: all nine
    expect(east.added.length).toBe(9);
    expect(west.added.length).toBe(9);
    const mirrored = east.added.map(([x, y, z]) => `${21 - x},${y},${z}`).sort();
    expect(west.added.map(([x, y, z]) => `${x},${y},${z}`).sort()).toEqual(mirrored);
    expect(east.falls.length).toBe(west.falls.length);
  });

  it("a footprint over the edge of the map is clipped, not refused", () => {
    const s = caveSession();
    const q = blockFalls(s, add("+z", [[0, 0, 7]], 3));
    expect(q.errors).toEqual([]);
    expect(q.added).toEqual([[0, 0, 8], [1, 0, 8], [0, 1, 8], [1, 1, 8]]);
    expect(s.apply(op(add("+z", [[0, 0, 7]], 3))).errors).toEqual([]);
    expect(s.built.heights[at(1, 1)]).toBe(9);
    // (in the direction of the face the map still ends)
    expect(s.apply(op(add("+x", [[W - 1, 5, 1]], 3))).errors).toEqual(["X 40 · Y 4 is outside the map"]);
  });

  it("Select's working area: a cell outside it refuses the operation, with the same line from the query", () => {
    const s = caveSession();
    const area: [number, number, number][] = [[10, 8, 12], [11, 8, 12], [12, 8, 12], [13, 8, 12], [14, 8, 12]];
    const inside = { ...remove("+z", [[10, 12, 7]], 3), area };
    expect(blockFalls(s, inside).errors).toEqual([]);
    expect(s.apply(op(inside)).errors).toEqual([]);
    expect(s.built.heights[at(10, 12)]).toBe(7);
    expect(s.built.heights[at(7, 12)]).toBe(8);
    const over = { ...remove("+z", [[8, 12, 7]], 3), area };
    const before = s.terrain.mask.slice();
    const u = s.apply(op(over));
    expect(u.errors).toEqual(["X 7 · Y 11 is outside the selection"]);
    expect(blockFalls(s, over).reason).toBe(u.errors[0]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(before));
    // an add's cell beyond the face is checked too
    expect(blockFalls(s, { ...add("+x", [[12, 12, 7]]), area }).reason).toBe("X 13 · Y 12 is outside the selection");
  });

  it("the view's cut: nothing from the cut up is touched, and nothing below it to change is refused", () => {
    const s = caveSession();
    // the wall's 3 × 3 hole reaches layers 3 to 5
    expect(blockFalls(s, hollow()).removed.map(([, , z]) => z).sort()).toEqual([3, 3, 3, 4, 4, 4, 5, 5, 5]);
    const cut5 = { ...hollow(), cut: 5 };
    expect(blockFalls(s, cut5).removed.map(([, , z]) => z).sort()).toEqual([3, 3, 3, 4, 4, 4]);
    expect(s.apply(op(cut5)).errors).toEqual([]);
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 3, 5, 8]);
  });

  it("a remove takes what a viewer sees: buried blocks stay, a sweep across a step leaves them, and a layer cut opens what it hides", () => {
    const s = caveSession();
    // the plateau around (10, 10) is solid to layer 7 (surface 8): layer 6 is buried, layer 7 is the seen surface
    const sweep: [number, number, number][] = [[10, 10, 6], [11, 10, 6], [12, 10, 6]];
    expect(blockFalls(s, remove("+z", sweep)).reason).toBe("there is no block there to remove");
    expect(s.apply(op(remove("+z", sweep))).errors).toEqual(["there is no block there to remove"]);
    // the surface layer is open
    const top: [number, number, number][] = [[10, 10, 7], [11, 10, 7]];
    expect(blockFalls(s, remove("+z", top)).removed.length).toBe(2);
    // under a cut at 7 the layer 7 is cut away, so layer 6 is the seen surface
    expect(blockFalls(s, { ...remove("+z", sweep), cut: 7 }).removed.length).toBe(3);
    // a real step: the ground at x = 10 and 11 is one layer lower, so a sweep along layer 6 takes the two beside
    // the open air and leaves the one under the higher ground
    expect(s.apply(op(remove("+z", [[10, 10, 7]], 2))).errors).toEqual([]);
    expect(s.built.heights[at(10, 10)]).toBe(7);
    expect(s.built.heights[at(9, 10)]).toBe(8);
    expect(blockFalls(s, remove("+z", sweep)).removed).toEqual([[10, 10, 6], [11, 10, 6]]);
    // a cut below everything it could touch, and a bad cut, are refused with a line
    expect(blockFalls(s, { ...hollow(), cut: 3 }).reason).toBe("nothing below layer 3 would change");
    expect(blockFalls(s, { ...hollow(), cut: 23 }).reason).toBe("blocks/params/cut: must be <= 22");
    expect(blockFalls(s, { ...hollow(), cut: 22 }).removed.length).toBe(9);
  });

  it("a roof spans six and holds, and eight falls: the cave widened from inside, the wall's open faces taken", () => {
    const s = caveSession();
    // the cave is 6 × 6 under a roof two layers thick; its walls' faces look into its air
    expect(s.apply(op(remove("+x", [[14, 17, 4]], 6))).errors).toEqual([]);
    expect(s.apply(op(remove("-x", [[21, 17, 4]], 6))).errors).toEqual([]);
    // (8 wide one way, 6 the other: the roof is held from the sides it is 6 across)
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 3, 6, 8]);
    expect(s.terrain.runs(at(21, 17))).toEqual([0, 3, 6, 8]);
    const held = s.terrain.mask.slice();
    // one wall more: 8 across both ways, and the roof's middle is four tiles from any wall
    const north = remove("+y", [[17, 14, 4]], 6);
    const q = blockFalls(s, north);
    expect(q.errors).toEqual([]);
    expect(q.falls.length).toBeGreaterThan(0);
    const u = s.apply(op(north));
    expect(u.ok).toBe(false);
    expect(u.errors).toEqual([`${q.falls.length} blocks of ground would fall: nothing would hold them up`]);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(held));
  });

  it("what the query names is what the step changes", () => {
    const s = caveSession();
    const rand = mulberry(3);
    let taken = 0;
    for (let k = 0; k < 40; k++) {
      const p = randomBlocks(rand, 14, s.built.heights);
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
function randomBlocks(rand: () => number, r: number, heights?: ArrayLike<number>): BlocksParams {
  const sides: BlocksParams["side"][] = ["+x", "-x", "+y", "-y", "+z", "-z"];
  const side = sides[Math.floor(rand() * 6)];
  const mode = rand() < 0.5 ? "add" : "remove";
  const cx = rand() < 0.6 ? 18 : 31;
  const cy = rand() < 0.6 ? 18 : 12;
  // (near the surface when the heights are given: a remove takes only what is open to the air)
  const pos = (): [number, number, number] => {
    const x = Math.min(W - 1, Math.max(0, cx + Math.round((rand() - 0.5) * 2 * r)));
    const y = Math.min(H - 1, Math.max(0, cy + Math.round((rand() - 0.5) * 2 * r)));
    return [x, y, heights ? Math.max(0, heights[y * W + x] - 1 - Math.floor(rand() * 2)) : 1 + Math.floor(rand() * 8)];
  };
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

describe("the Block tool on a generated map after strokes", () => {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));

  it("what blockFalls names is what the step changes, and no other tile moves", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const Wg = s.built.W;
    const Hg = s.built.H;
    const rand = mulberry(21);
    const cx = 40;
    const cy = 24;
    let taken = 0;
    let refused = 0;
    let strokes = 0;
    for (let k = 0; k < 140; k++) {
      if (k < 20 || rand() < 0.15) {
        if (s.apply({ op: "brush", params: randomBrush(rand, Wg, Hg, STROKE_TOOLS[Math.floor(rand() * STROKE_TOOLS.length)], { x: cx, y: cy, r: 12 }) }).ok) strokes++;
        continue;
      }
      const sides: BlocksParams["side"][] = ["+x", "-x", "+y", "-y", "+z", "-z"];
      const side = sides[Math.floor(rand() * 6)];
      const axis = side[1] === "x" ? 0 : side[1] === "y" ? 1 : 2;
      const x = cx + Math.round((rand() - 0.5) * 24);
      const y = cy + Math.round((rand() - 0.5) * 24);
      const h = s.built.heights[y * Wg + x];
      const first: [number, number, number] = [x, y, Math.max(0, h - 1 - Math.floor(rand() * 4))];
      const list: [number, number, number][] = [first];
      for (let j = Math.floor(rand() * 6); j > 0; j--) {
        const c: [number, number, number] = [first[0] + Math.round((rand() - 0.5) * 8), first[1] + Math.round((rand() - 0.5) * 8), first[2] + Math.round((rand() - 0.5) * 4)];
        c[axis] = first[axis];
        list.push(c);
      }
      const params: BlocksParams = { mode: rand() < 0.5 ? "add" : "remove", side, at: list, size: 1 + Math.floor(rand() * 8), ...(rand() < 0.5 ? { shape: "round" as const } : {}) };
      const was = s.terrain.mask.slice();
      const wasH = s.built.heights.slice();
      const q = blockFalls(s, params);
      const u = s.apply(op(params));
      if (q.reason !== null) {
        // (the query's every reason a cell can't be taken, as the step gives them; or the ground that would fall)
        expect(u.errors, `step ${k}`).toEqual(q.errors.length ? q.errors : [q.reason]);
        expect(Array.from(s.terrain.mask)).toEqual(Array.from(was));
        expect(Array.from(s.built.heights)).toEqual(Array.from(wasH));
        refused++;
        continue;
      }
      expect(u.errors, `step ${k}`).toEqual([]);
      const now = s.terrain;
      const key = (c: [number, number, number][]) => c.map(([a, b, z]) => `${a},${b},${z}`).sort();
      const gained: string[] = [];
      const lost: string[] = [];
      const touched = new Set<number>();
      for (let i = 0; i < now.N; i++) {
        if (was[i] === now.mask[i]) {
          expect(s.built.heights[i], `step ${k} tile ${i}`).toBe(wasH[i]);
          continue;
        }
        touched.add(i);
        for (let z = 0; z < 23; z++) {
          const a = !!(was[i] & (1 << z));
          const b = now.solid(i, z);
          if (!a && b) gained.push(`${i % Wg},${Math.floor(i / Wg)},${z}`);
          if (a && !b) lost.push(`${i % Wg},${Math.floor(i / Wg)},${z}`);
        }
      }
      expect(gained.sort(), `step ${k}`).toEqual(key(q.added));
      expect(lost.sort(), `step ${k}`).toEqual(key(q.removed));
      // no tile outside the cells changed, its surface included
      for (let i = 0; i < now.N; i++) if (!touched.has(i)) expect(s.built.heights[i], `step ${k} tile ${i}`).toBe(wasH[i]);
      taken++;
    }
    expect(strokes).toBeGreaterThan(10);
    expect(taken).toBeGreaterThan(15);
    expect(refused).toBeGreaterThan(0);
    const full = s.fullBuild();
    expect(Array.from(full.heights)).toEqual(Array.from(s.built.heights));
    expect([...masksOf(full.cache.terrain)]).toEqual([...masksOf(s.built.cache.terrain)]);
  });

  it("the block an object stands on stays: a slope's too", () => {
    const s = MapSession.fromGenerated(r, r.file);
    const slope = s.built.entities.find((e) => e.template === "Slope");
    expect(slope).toBeDefined();
    const u = s.apply(op(remove("+z", [[slope!.x, slope!.y, slope!.z - 1]])));
    expect(u.errors).toEqual([`an object stands on the block at X ${slope!.x} · Y ${slope!.y} in layer ${slope!.z - 1}`]);
    expect(s.canUndo).toBe(false);
  });
});

describe("plants in the footprint ride, or go and are counted (D368 (10))", () => {
  const PINE = "11111111-2222-4333-8444-555555555555";
  const placed = () => {
    const s = caveSession();
    expect(s.apply({ op: "placeEntity", params: { id: PINE, template: "Pine", x: 8, y: 30, orientation: "Cw0" } }).errors).toEqual([]);
    return s;
  };
  const pine = (s: MapSession) => s.built.entities.find((e) => e.id === PINE);

  it("a plant on the top rises and sinks with it, and the click is never refused for it", () => {
    const s = placed();
    expect(pine(s)!.z).toBe(8);
    const up = add("+z", [[8, 30, 7]], 3);
    const q = blockFalls(s, up);
    expect(q.reason).toBeNull();
    expect(q.plantsRiding).toBe(1);
    expect(q.plantsRemoved).toBe(0);
    expect(s.apply(op(up)).errors).toEqual([]);
    expect(pine(s)!.z).toBe(9);
    expect(s.apply(op(remove("+z", [[8, 30, 8]], 3))).errors).toEqual([]);
    expect(pine(s)!.z).toBe(8);
    expect(s.apply(op(remove("+z", [[8, 30, 7]]))).errors).toEqual([]);
    expect(pine(s)!.z).toBe(7);
  });

  it("a plant a block fills in, off the top, goes with it, and undo, redo and a reopened project agree", () => {
    const s = placed();
    // three layers up beside it, so a block against that wall lands in the tree's second block
    for (const z of [7, 8, 9]) expect(s.apply(op(add("+z", [[7, 30, z]]))).errors).toEqual([]);
    expect(s.built.heights[at(7, 30)]).toBe(11);
    const fill = add("+x", [[7, 30, 9]]);
    const q = blockFalls(s, fill);
    expect(q.reason).toBeNull();
    expect(q.plantsRemoved).toBe(1);
    expect(q.plantsRiding).toBe(0);
    expect(s.apply(op(fill)).errors).toEqual([]);
    expect(pine(s)).toBeUndefined();
    expect((s.logOps.at(-1)!.params as BlocksParams).plants).toEqual([PINE]);
    const gone = s.terrain.mask.slice();
    expect(s.undo()).toBe(true);
    expect(pine(s)!.z).toBe(8);
    expect(s.redo()).toBe(true);
    expect(pine(s)).toBeUndefined();
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(gone));
    s.settleCanonical();
    const again = MapSession.open(decodeProject(s.project()), { rebuild: true });
    expect(again.built.entities.find((e) => e.id === PINE)).toBeUndefined();
    expect(Array.from(again.terrain.mask)).toEqual(Array.from(gone));
  });
});

describe("a plant stays on the top of the run it stands on (D368 (10))", () => {
  const PINE = "11111111-2222-4333-8444-555555555555";
  const walled = () => {
    const s = caveSession();
    expect(s.apply({ op: "placeEntity", params: { id: PINE, template: "Pine", x: 8, y: 30, orientation: "Cw0" } }).errors).toEqual([]);
    // the wall beside it at x = 7, up to layer 12
    for (let z = 7; z <= 11; z++) expect(s.apply(op(add("+z", [[7, 30, z]]))).errors).toEqual([]);
    expect(s.built.heights[at(7, 30)]).toBe(13);
    return s;
  };
  const pine = (s: MapSession) => s.built.entities.find((e) => e.id === PINE);

  it("a block built above it leaves it where it is, and blockFalls says so", () => {
    for (const layer of [12, 11]) {
      const s = walled();
      expect(pine(s)!.z).toBe(8);
      const over = add("+x", [[7, 30, layer]]);
      const q = blockFalls(s, over);
      expect(q.reason, `layer ${layer}`).toBeNull();
      expect(q.plantsRemoved).toBe(0);
      expect(q.plantsRiding).toBe(0);
      expect(s.apply(op(over)).errors).toEqual([]);
      // the tile's top is the new block's, the plant is under it
      expect(s.built.heights[at(8, 30)]).toBe(layer + 1);
      expect(pine(s)!.z, `layer ${layer}`).toBe(8);
      // the same after a reopen, a replay and an undo and redo
      s.settleCanonical();
      expect(pine(MapSession.open(decodeProject(s.project()), { rebuild: true }))!.z).toBe(8);
      expect(pine(MapSession.open(decodeProject(s.project())))!.z).toBe(8);
      expect(s.undo()).toBe(true);
      expect(pine(s)!.z).toBe(8);
      expect(s.redo()).toBe(true);
      expect(pine(s)!.z).toBe(8);
    }
  });

  it("a block into its cells takes it, and one that takes the top of its run sinks it under the block above", () => {
    const s = walled();
    const crown = add("+x", [[7, 30, 9]]);
    const q = blockFalls(s, crown);
    expect(q.plantsRemoved).toBe(1);
    expect(q.plantsRiding).toBe(0);
    const sunk = caveSession();
    expect(sunk.apply({ op: "placeEntity", params: { id: PINE, template: "Pine", x: 8, y: 30, orientation: "Cw0" } }).errors).toEqual([]);
    for (let z = 7; z <= 11; z++) expect(sunk.apply(op(add("+z", [[7, 30, z]]))).errors).toEqual([]);
    expect(sunk.apply(op(add("+x", [[7, 30, 12]]))).errors).toEqual([]);
    // the top block of the run it stands on goes: it sinks with the run, not up to the surface
    const down = remove("+z", [[8, 30, 7]]);
    expect(blockFalls(sunk, down).plantsRiding).toBe(1);
    expect(sunk.apply(op(down)).errors).toEqual([]);
    expect(pine(sunk)!.z).toBe(7);
    expect(sunk.built.heights[at(8, 30)]).toBe(13);
  });
});

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
        u = s.apply(op(randomBlocks(rand, 12, s.built.heights)));
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

  it("a step taken out of the log and put back (collaboration's undo) gives the land of the same log built afresh", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    for (const p of [hollow(), add("+z", [[10, 10, 7]], 2), remove("+z", [[8, 20, 7]], 2)]) expect(s.apply(op(p)).errors).toEqual([]);
    const all = s.terrain.mask.slice();
    const second = s.logOps[1];
    const kept = s.stepOps(second.seq);
    expect(s.spliceStep({ remove: second.seq })).toBe(true);
    const without = MapSession.open({ ...s.document, edits: s.document.edits }, { rebuild: true });
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(without.terrain.mask));
    expect(s.built.heights[at(10, 10)]).toBe(8);
    expect(s.spliceStep({ insert: kept })).toBe(true);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(all));
    expect(maskList(s)).toEqual(maskList(MapSession.open({ ...s.document, edits: s.document.edits }, { rebuild: true })));
    // undo and redo put the kept maps back
    expect(s.undo()).toBe(true);
    expect(s.built.heights[at(8, 20)]).toBe(8);
    expect(s.redo()).toBe(true);
    expect(Array.from(s.terrain.mask)).toEqual(Array.from(all));
  });

  it("a stroke after a block shapes the top and nothing under it, and a block after a stroke builds on it", () => {
    const s = caveSession();
    expect(s.apply(op(hollow())).errors).toEqual([]);
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 3, 6, 8]);
    expect(s.apply({ op: "brush", params: area("raise", 10, 14, 16, 14, 18) }).errors).toEqual([]);
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 3, 6, 10]);
    expect(s.apply({ op: "brush", params: area("lower", 0, 14, 16, 14, 18) }).errors).toEqual([]);
    // (the roof keeps its lowest layer, as on any roof)
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 3, 6, 7]);
    expect(s.apply(op(add("+z", [[14, 17, 6]]))).errors).toEqual([]);
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 3, 6, 8]);
    // a tile a block dug a cave under becomes plain again when it is filled
    expect(s.apply(op(add("+x", [[13, 17, 4]], 3))).errors).toEqual([]);
    expect(s.plainAt(at(14, 17))).toBe(true);
    expect(s.terrain.runs(at(14, 17))).toEqual([0, 8]);
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
  // (seed 6 since generator 0.10.6, D498, D148: the test builds up 5 tiles east of the spot, so the level, dry ground
  // must run from 3 tiles west of it to 5 east, at level 7 or more, away from every object; seed 3's River Valley holds
  // none any more, nor does any other of seeds 1–40 but seed 6, whose spot is at (46, 15), level 14)
  const spec = makeSpec({ seed: 6, theme: "riverValley", size: { x: 64, y: 64 } });
  const r = generate(spec);

  /** A dry tile with dry neighbours, no object near, on high enough ground, level out to the build-up 5 tiles east. */
  function spot(s: MapSession): { x: number; y: number } {
    const b = s.built;
    const Wg = b.W;
    const near = new Set<number>();
    for (const e of b.entities) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near.add((e.y + dy) * Wg + e.x + dx);
    for (let y = 8; y < b.H - 8; y++)
      for (let x = 8; x < Wg - 8; x++) {
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 5 && ok; dx++) {
          const i = (y + dy) * Wg + x + dx;
          if (b.water[i] > 0 || b.channel[i] || near.has(i) || b.heights[i] < 7 || b.heights[i] !== b.heights[y * Wg + x]) ok = false;
        }
        if (ok) return { x, y };
      }
    throw new Error("no spot");
  }

  /** A 3 × 3 pit two deep at (x, y), and a tunnel from its east side into the wall: a roof one block thick over a hollow. */
  function tunnel(s: MapSession, x: number, y: number, h: number): void {
    expect(s.apply(op(remove("+z", [[x, y, h - 1]], 3))).errors).toEqual([]);
    expect(s.apply(op(remove("+z", [[x, y, h - 2]], 3))).errors).toEqual([]);
    expect(s.apply(op(remove("-x", [[x + 2, y, h - 2]]))).errors).toEqual([]);
  }

  it("builds up, hollows a cave and exports the ground as it stands", () => {
    const s = MapSession.fromGenerated(r, r.file);
    expect(s.mode).toBe("live");
    expect(s.columns.size).toBe(0);
    const { x, y } = spot(s);
    const Wg = s.built.W;
    const h = s.built.heights[y * Wg + x];
    expect(s.apply(op(add("+z", [[x + 5, y, h - 1]], 1))).errors).toEqual([]);
    expect(s.built.heights[y * Wg + x + 5]).toBe(h + 1);
    expect(s.columns.size).toBe(0);
    // a pit two deep, and a tunnel from its side into the wall: a roof over a hollow, the surface where it was
    tunnel(s, x, y, h);
    expect(s.columns.size).toBe(1);
    expect(s.plainAt(y * Wg + x + 2)).toBe(false);
    expect(s.terrain.runs(y * Wg + x + 2)).toEqual([0, h - 2, h - 1, h]);
    expect(s.built.heights[y * Wg + x + 2]).toBe(h);
    const out = voxelsOut(s);
    expect(Array.from(out)).toEqual(Array.from(s.terrain.voxels()));
    expect(out[(h - 2) * Wg * s.built.H + y * Wg + x + 2]).toBe(0);
    // a plant on the top rides a block built under it
    const tree = s.built.entities.find((e) => e.template === "Pine" || e.template === "Birch" || e.template === "Oak");
    if (tree) {
      const top = s.built.heights[tree.y * Wg + tree.x];
      const u = s.apply(op(add("+z", [[tree.x, tree.y, top - 1]])));
      expect(u.errors).toEqual([]);
      expect(s.built.entities.find((e) => e.id === tree.id)?.z).toBe(top + 1);
      expect(s.undo()).toBe(true);
    }
    // undo takes the tunnel, the pit and the build-up back to the heightfield
    expect(s.undo()).toBe(true);
    expect(s.columns.size).toBe(0);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.undo()).toBe(true);
    expect(s.built.heights[y * Wg + x]).toBe(h);
    expect(s.built.heights[y * Wg + x + 5]).toBe(h);
    expect(s.canUndo).toBe(false);
  });

  it("saved, reopened and saved is the same file, and the log replays onto the same runs", () => {
    const s = MapSession.fromGenerated(r, r.file);
    const { x, y } = spot(s);
    const Wg = s.built.W;
    const h = s.built.heights[y * Wg + x];
    tunnel(s, x, y, h);
    expect(s.apply(op(add("+z", [[x + 5, y, h - 1]], 2, "round"))).errors).toEqual([]);
    s.settleCanonical();
    // (#435: the hollow makes terrain above terrain, whose water is the stacked engine's on every column)
    expect(s.built.waterModel.stacked).toBeDefined();
    expect(s.built.settle.stack?.stacked).toBe(true);
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
