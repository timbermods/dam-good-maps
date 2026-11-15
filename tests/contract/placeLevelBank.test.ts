// A placement's levelling leaves the bank that holds the water as it is (D(new-bank), planning's ruling of
// 2026-11-15): the natural edge of a levelled footprint stops short of the bank, so a stream beside it
// stays where it was; a footprint that stands on the bank where no level keeps it is refused with one
// plain line (D342), never a quiet spill. The case builds its own ground, so no generator version can move
// it: a blank 96² map at level 4 with
//   - a stream along y 40-42, fed by a source at its east end and running west off the map: its bed is at
//     level 6 east of x 32 (the ground beside it at 7) and at level 3 west of it (the ground at 4), so it
//     falls a step at x 32;
//   - a ledge at level 10 north of the stream (x 12-17, y 28-34), the uneven ground a placement there levels,
//     its bottom edge 5 rows from the water: the levelling's natural edge reaches the bank;
//   - a second ledge far from the water (x 40-45, y 6-11), where a placement levels as it always has.

import { describe, expect, it } from "vitest";
import { footprintTiles } from "../../src/core/format/footprints";
import { holdsWater } from "../../src/core/features/footprintLevel";
import { BANK_PROBLEM } from "../../src/core/doc/placing";
import * as ed from "../../src/worker/session";

const W = 96;
const ID = "11111111-2222-4333-8444-555555555555";
const flat = (y0: number, y1: number, x0: number, x1: number, level: number) => {
  const cells: [number, number, number][] = [];
  for (let y = y0; y <= y1; y++) cells.push([y, x0, x1]);
  expect(ed.apply({ op: "sculpt", params: { mode: "flatten", cells, level, exact: true } } as never).errors ?? []).toEqual([]);
};

function ground() {
  ed.newBlank(W, 4);
  flat(0, W - 1, 32, W - 1, 7);
  flat(40, 42, 32, W - 1, 6);
  flat(40, 42, 0, 31, 3);
  flat(28, 34, 12, 17, 10);
  flat(6, 11, 40, 45, 10);
  expect(ed.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-0000000000c1", template: "WaterSource", x: 93, y: 41, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1.5, CurrentStrength: 1.5 } } } } as never).errors ?? []).toEqual([]);
  ed.settleWater();
}

function snap() {
  const v = ed.sessionView();
  const d = new Float32Array(W * W);
  for (let k = 0; k < v.view.water.count; k++) d[v.view.water.tile[k]] = v.view.water.depth[k];
  return { h: v.view.heights.slice(), d };
}

/** The most the water that was there moved once it settled after the placement, or ran onto the dry tiles
 *  beside it (placeNoSpill.test.ts's measure and tolerance, 0.1). */
function moved(before: ReturnType<typeof snap>, after: ReturnType<typeof snap>, settled: ReturnType<typeof snap>): number {
  let biggest = 0;
  for (let i = 0; i < W * W; i++) {
    const ix = i % W;
    const iy = (i - ix) / W;
    if (before.d[i] > 0) {
      biggest = Math.max(biggest, Math.abs(settled.d[i] - after.d[i]));
      continue;
    }
    if (settled.d[i] <= 0.05) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx;
      const ny = iy + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < W && before.d[ny * W + nx] > 0) biggest = Math.max(biggest, settled.d[i]);
    }
  }
  return biggest;
}

const own = (template: string, x: number, y: number) => footprintTiles(template, { template, x, y, z: 0, orientation: "Cw0", flipped: false }).map(([a, b]) => b * W + a);

describe("a placement's levelling leaves the bank that holds the water as it is (D(new-bank))", () => {
  for (const [template, x, y] of [["UndergroundRuins", 13, 31], ["LargeRelic", 14, 33]] as const) {
    it(`a ${template} on the ledge beside the stream is placed and levelled, its edge stops short of the bank, and the stream stays where it was`, () => {
      ground();
      const before = snap();
      const tiles = own(template, x, y);
      expect(new Set(tiles.map((i) => before.h[i])).size, "it stands on uneven ground").toBeGreaterThan(1);
      const bank: number[] = [];
      for (let i = 0; i < W * W; i++) if (holdsWater(before.h, before.d, W, W, i)) bank.push(i);
      expect(bank.length, "the stream has a bank").toBeGreaterThan(50);
      expect(ed.footprintCheck({ tool: "entity", template, x, y, orientation: "Cw0" }).problem).toBeNull();
      const r = ed.applyTool({ tool: "entity", template, x, y, orientation: "Cw0" }, ID);
      expect(r.errors ?? []).toEqual([]);
      const after = snap();
      expect(new Set(tiles.map((i) => after.h[i])).size, "its footprint is level").toBe(1);
      let edge = 0;
      for (let i = 0; i < W * W; i++) if (after.h[i] !== before.h[i] && !tiles.includes(i)) edge++;
      expect(edge, "the natural edge meets the land").toBeGreaterThan(10);
      expect(bank.filter((i) => after.h[i] !== before.h[i]), "the bank is as it was").toEqual([]);
      ed.settleWater();
      expect(moved(before, after, snap()), "the stream stays where it was").toBeLessThan(0.1);
    });
  }

  it("an Underground Ruins whose footprint stands on the bank where the stream falls a step is refused with one plain line", () => {
    ground();
    const before = snap();
    const p = { tool: "entity" as const, template: "UndergroundRuins", x: 30, y: 35, orientation: "Cw0" as const };
    const tiles = own(p.template, p.x, p.y);
    expect(tiles.some((i) => before.d[i] > 0), "the footprint is dry").toBe(false);
    expect(ed.footprintCheck(p).problem).toBe(BANK_PROBLEM);
    const r = ed.applyTool(p, ID);
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([BANK_PROBLEM]);
    expect([...snap().h]).toEqual([...before.h]);
  });

  it("an Underground Ruins on the ledge far from the water is placed and levelled to the height most of it stands at", () => {
    ground();
    const before = snap();
    const tiles = own("UndergroundRuins", 42, 8);
    const r = ed.applyTool({ tool: "entity", template: "UndergroundRuins", x: 42, y: 8, orientation: "Cw0" }, ID);
    expect(r.errors ?? []).toEqual([]);
    const after = snap();
    expect(new Set(tiles.map((i) => after.h[i]))).toEqual(new Set([10]));
    let edge = 0;
    for (let i = 0; i < W * W; i++) if (after.h[i] !== before.h[i] && !tiles.includes(i)) edge++;
    expect(edge, "the natural edge meets the land").toBeGreaterThan(10);
  });
});
