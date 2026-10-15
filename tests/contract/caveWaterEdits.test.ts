// Fill water and Remove unfed water on maps with caves or overhangs (D120, D387, D394, D413, D457): both
// ask every water column. A hollow under a roof fills to its level, a cave column whose roof is below the
// level full under the pressure of the water above it; a cave pool no source feeds is unfed and Remove
// unfed water takes it, leaving fed water and other pools as they are. Each result is water the stacked
// engine (the game's rules) keeps as it is: run on, nothing flows in or out, and the lakes only evaporate.
// Undo, redo and reopening give the same bytes, and the export passes both validators.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { PRESSURE } from "../../src/core/sim/stackFed";
import { StackRun, stackGraph, type StackSettle } from "../../src/core/sim/stackWater";
import { CAVE, CAVE_H, CAVE_W, caveFile, caveSession, caveVoxels } from "./caveMap";
import { dig, exportProblems } from "./caveChecks";

const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
/** A second sealed cave under the plateau, beside the first: air at z 3–5 under a roof at 6–7. */
const CAVE2 = { x0: 4, y0: 4, x1: 7, y1: 7 };
const N = CAVE_W * CAVE_H;
const cave = (x: number, y: number) => y * CAVE_W + x;

/** The map's water run on by the stacked engine for one of the settle's checks (128 ticks), as the game runs the file:
 *  the stored lakes' columns (`lakes`) are water the game keeps as it is: they only evaporate, and the dry columns
 *  beside them stay dry (nothing spills). With `before` (the settled water before the edit), the rest of the water is
 *  as it was, but for the settle's own share of columns (D27). */
function staysAsIs(s: MapSession, lakes: ReadonlySet<number> = new Set(), before?: StackSettle): void {
  s.settleCanonical();
  const st = s.built.settle.stack!;
  const run = new StackRun(s.size.x, s.size.y, s.built.waterModel.stacked!, st);
  run.run(128, 1);
  const after = run.state();
  run.close();
  const g = stackGraph(s.built.waterModel);
  let moved = 0;
  for (let c = 0; c < st.depth.length; c++) {
    if (!lakes.has(c)) {
      if (before && Math.abs(st.depth[c] - before.depth[c]) > 0.005) moved++;
      continue;
    }
    const d = after.depth[c] - st.depth[c];
    expect(d, `lake column ${c}`).toBeLessThanOrEqual(0.0005);
    expect(d, `lake column ${c}`).toBeGreaterThan(-0.02);
    for (let e = g.start[c]; e < g.start[c + 1]; e++) {
      const t = g.target[e];
      if (t >= 0 && !lakes.has(t) && st.depth[t] === 0) expect(after.depth[t], `beside the lake, column ${t}`).toBe(0);
    }
  }
  expect(moved).toBeLessThanOrEqual(0.005 * s.size.x * s.size.y);
}

/** The settled water's columns that hold a Fill's water (the lake's entries on their columns). */
function lakeColumns(s: MapSession): Set<number> {
  const st = s.built.settle.stack!;
  const M = s.size.x * s.size.y;
  const out = new Set<number>();
  for (const r of s.built.waterModel.retained ?? [])
    for (let k = 0; k < r.tiles.length; k++)
      for (let q = 0; q < st.count[r.tiles[k]]; q++) if (st.floor[q * M + r.tiles[k]] === r.floor[k]) out.add(q * M + r.tiles[k]);
  return out;
}

/** The export, which passes both validators' blocking checks (`allowed`: the test cave, a bare import, has no start). */
function exportsClean(s: MapSession, name: string, allowed: string[] = []): Uint8Array {
  const bytes = s.exportTimber().bytes;
  const p = exportProblems(bytes, name);
  const ids = (l: string[]) => l.map((m) => m.slice(0, m.indexOf(":")));
  expect(ids(p.ts)).toEqual(allowed);
  if (p.py) expect(ids(p.py)).toEqual(allowed);
  return bytes;
}
const NO_START = ["start.count"];

describe("Fill water and Remove unfed water on a cave import", () => {
  it("a Fill under the roof stands at its level and the game keeps it; removed, the cave is dry; undo, redo and reopen are byte-exact", () => {
    const s = caveSession();
    const [floor, roof] = CAVE.air;
    // the cave is sealed: water stands in it no higher than its roof, and a level on the ground above is another hollow
    expect(planFill(s, 17, 17, roof + 1, floor).reason).toBe(`the hollow is closed above at level ${roof}: fill it to ${roof} or lower`);
    expect(planFill(s, 17, 17, roof + 3).reason).toMatch(/^at level 9 the water would spill off the map at \(\d+, \d+\): the hollow doesn't hold it$/);
    // filled to its roof, where it would spill: by default from the cave, the tile's highest column below the level
    const p = planFill(s, 17, 17, roof);
    expect(p.reason).toBeNull();
    expect(p.op!.params.floor).toBe(floor);
    expect(p.tiles).toBe(36);
    expect(p.volume).toBe(36 * (roof - floor));
    expect(p.days).toBeGreaterThan(1);
    const dry = s.exportTimber().bytes;
    expect(s.apply(p.op!).errors).toEqual([]);
    s.settleCanonical();
    const st = s.built.settle.stack!;
    for (let y = CAVE.y0; y <= CAVE.y1; y++)
      for (let x = CAVE.x0; x <= CAVE.x1; x++) {
        // stored at exactly its level (D413), the ground above dry
        expect(st.depth[cave(x, y)]).toBe(roof - floor);
        expect(st.depth[N + cave(x, y)]).toBe(0);
      }
    staysAsIs(s, lakeColumns(s));
    const filled = exportsClean(s, "filled.timber", NO_START);
    // Remove unfed water: the Fill is a pool no source feeds, under the roof
    const u = unfedWater(s, { x0: 15, y0: 15, x1: 15, y1: 15 });
    expect([u.pools, u.tiles, u.volume]).toEqual([1, 36, 36 * (roof - floor)]);
    expect(s.apply(u.op!).errors).toEqual([]);
    s.settleCanonical();
    for (const d of s.built.settle.stack!.depth) expect(d).toBe(0);
    staysAsIs(s);
    const removed = exportsClean(s, "removed.timber", NO_START);
    expect(unfedWater(s).pools).toBe(0);
    // undo, redo, reopen
    expect(s.undo()).toBe(true);
    expect(same(s.exportTimber().bytes, filled)).toBe(true);
    expect(s.undo()).toBe(true);
    expect(same(s.exportTimber().bytes, dry)).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(same(s.exportTimber().bytes, removed)).toBe(true);
    const again = MapSession.open(decodeProject(s.project()));
    again.settleCanonical();
    expect(same(again.exportTimber().bytes, removed)).toBe(true);
    expect(again.undo()).toBe(true);
    again.settleCanonical();
    expect(same(again.exportTimber().bytes, filled)).toBe(true);
  });

  it("while the water settles in the background (live editing), a Fill shows at once and a removal takes its water at once (D260)", () => {
    const s = caveSession();
    s.setWaterMode("defer");
    const [floor, roof] = CAVE.air;
    expect(s.apply(planFill(s, 17, 17, roof, floor).op!).errors).toEqual([]);
    expect(s.waterStale).toBe(true);
    expect(s.built.settle.stack!.depth[cave(16, 18)]).toBe(roof - floor);
    s.settleCanonical();
    expect(s.apply(unfedWater(s).op!).errors).toEqual([]);
    expect(s.waterStale).toBe(true);
    expect(s.built.settle.stack!.depth[cave(16, 18)]).toBe(0);
  });

  it("an import's own cave pools no source feeds are its own (D457); Remove takes the one selected, the other stays exactly as the file has it", () => {
    const v = caveVoxels();
    for (let y = CAVE2.y0; y <= CAVE2.y1; y++) for (let x = CAVE2.x0; x <= CAVE2.x1; x++) for (let z = CAVE.air[0]; z < CAVE.air[1]; z++) v[z * N + cave(x, y)] = 0;
    // a map whose file holds water in both caves: two Fills, exported
    const a = MapSession.importMap(writeTimber(caveFile(v)), "caves.timber");
    for (const [x, y, level] of [[17, 17, 5], [5, 5, 4.5]] as const) expect(a.apply(planFill(a, x, y, level).op!).errors).toEqual([]);
    a.settleCanonical();
    const s = MapSession.importMap(a.exportTimber().bytes, "pools.timber");
    expect(s.showsStoredWater).toBe(true);
    const own = s.waterShown().stack!;
    expect(own.depth[cave(17, 17)]).toBeCloseTo(2, 5);
    expect(own.depth[cave(5, 5)]).toBeCloseTo(1.5, 5);
    // unedited: both pools are unfed; the selection over the first takes it alone
    expect(unfedWater(s).pools).toBe(2);
    const u = unfedWater(s, [cave(16, 16)]);
    expect([u.pools, u.tiles]).toEqual([1, 36]);
    expect(s.apply(u.op!).errors).toEqual([]);
    s.settleCanonical();
    const st = s.built.settle.stack!;
    for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = CAVE.x0; x <= CAVE.x1; x++) expect(st.depth[cave(x, y)]).toBe(0);
    for (let y = CAVE2.y0; y <= CAVE2.y1; y++) for (let x = CAVE2.x0; x <= CAVE2.x1; x++) expect(st.depth[cave(x, y)]).toBe(own.depth[cave(x, y)]);
    staysAsIs(s, lakeColumns(s));
    const bytes = exportsClean(s, "one-pool.timber", NO_START);
    expect(unfedWater(s).pools).toBe(1);
    expect(s.undo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(same(s.exportTimber().bytes, bytes)).toBe(true);
    const again = MapSession.open(decodeProject(s.project()));
    again.settleCanonical();
    expect(same(again.exportTimber().bytes, bytes)).toBe(true);
  });
});

describe("Fill water and Remove unfed water on a generated map with a Block dig", () => {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));

  /** A dry, level 3 × 3 patch of ground and its ring, nothing on or near it, well above the water and away from the
   *  edge: a pit is dug there, two deep, with a hollow under the ground beside it. */
  function patch(s: MapSession): { x: number; y: number; h: number } {
    const b = s.built;
    const W = b.W;
    const near = new Set<number>();
    for (const e of b.entities) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) near.add((e.y + dy) * W + e.x + dx);
    for (let y = 8; y < b.H - 8; y++)
      for (let x = 8; x < W - 8; x++) {
        const h = b.heights[y * W + x];
        let ok = h >= 6;
        for (let dy = -2; dy <= 2 && ok; dy++)
          for (let dx = -2; dx <= 4 && ok; dx++) {
            const i = (y + dy) * W + x + dx;
            if (b.heights[i] !== h || b.water[i] > 0 || b.channel[i] || near.has(i)) ok = false;
          }
        if (ok) return { x, y, h };
      }
    throw new Error("no patch");
  }

  it("a pit and the hollow under its edge fill to the pit's rim, the hollow full under pressure; removed, both are dry; undo, redo and reopen are byte-exact", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.settleCanonical();
    const W = s.built.W;
    const M = W * s.built.H;
    const { x, y, h } = patch(s);
    // the pit: 3 × 3, two deep; then the block east of its middle, at the pit's floor, dug from the pit (a roof stays over it)
    expect(s.apply({ op: "blocks", params: { mode: "remove", side: "+z", at: [[x, y, h - 1]], size: 3 } }).errors).toEqual([]);
    expect(s.apply({ op: "blocks", params: { mode: "remove", side: "+z", at: [[x, y, h - 2]], size: 3 } }).errors).toEqual([]);
    expect(s.apply(dig(x + 2, y, h - 2, "-x")).errors).toEqual([]);
    s.settleCanonical();
    expect(s.built.waterModel.stacked).toBeDefined();
    const hollow = y * W + x + 2;
    expect(s.built.settle.stack!.count[hollow]).toBe(2);
    // filled to the pit's rim, where it would spill onto the ground round it
    const p = planFill(s, x + 2, y, h, h - 2);
    expect(p.reason).toBeNull();
    expect(p.tiles).toBe(10);
    const before = s.exportTimber().bytes;
    const dug = s.built.settle.stack!;
    expect(s.apply(p.op!).errors).toEqual([]);
    s.settleCanonical();
    const st = s.built.settle.stack!;
    // the hollow's column (floor h - 2, roof h - 1) is full, under the pressure of the water standing at h
    expect(st.depth[hollow]).toBe(1);
    expect(st.overflow[hollow]).toBe(1 / PRESSURE);
    expect(st.depth[(st.count[y * W + x] - 1) * M + y * W + x]).toBe(2);
    staysAsIs(s, lakeColumns(s), dug);
    const filled = exportsClean(s, "dig-filled.timber");
    // the Fill is the only unfed pool there
    const u = unfedWater(s, [y * W + x]);
    expect([u.pools, u.tiles]).toEqual([1, 10]);
    expect(s.apply(u.op!).errors).toEqual([]);
    s.settleCanonical();
    const after = s.built.settle.stack!;
    expect(after.depth[hollow]).toBe(0);
    expect(after.overflow[hollow]).toBe(0);
    expect(after.depth[(after.count[y * W + x] - 1) * M + y * W + x]).toBe(0);
    staysAsIs(s, new Set(), dug);
    const removed = exportsClean(s, "dig-removed.timber");
    expect(s.undo()).toBe(true);
    expect(same(s.exportTimber().bytes, filled)).toBe(true);
    expect(s.undo()).toBe(true);
    expect(same(s.exportTimber().bytes, before)).toBe(true);
    expect(s.redo()).toBe(true);
    expect(s.redo()).toBe(true);
    expect(same(s.exportTimber().bytes, removed)).toBe(true);
    const again = MapSession.open(decodeProject(s.project()));
    again.settleCanonical();
    expect(same(again.exportTimber().bytes, removed)).toBe(true);
  }, 120000);
});
