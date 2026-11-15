// What you see is what you get (PERFECT): after an edit beside a flowing stream, the editor's water preview
// (the warm start and its settle, sim/preview.ts) ends where the full canonical settle does. The warm start
// starts again only the tiles whose floor, dam or emitters the edit changed, and the dry tiles round them; a
// wet tile round them keeps its water and its momentum (D(new-preview), planning's ruling of 2026-11-15).
// Starting a stretch of flowing river again with the pre-fill's depth and no momentum left a step in its
// surface that sloshed on past the preview's four-day cap: River Valley 96² seed 9 at generator 0.10.23, an
// Underground Ruins at 34,31, read 0.793 at 41,50 where the settle gives 0.657.
//
// Two lands: one built here, so no generator version moves it, and River Valley 96² seed 9. The built land is
// a blank 96² map with a river running diagonally from the north-east corner (three tiles wide in each row,
// one tile over per row), fed by three sources of strength 4: north of row 40 the land is at 7 and the bed at
// 6, from row 40 on the land is at 4 and the bed at 3, so the river falls three levels there and runs fast
// below the fall. A hill (10, and 13 north of row 40) stands west of the river on rows 30-50, its edge two
// tiles off the bank, the uneven ground a placement there levels.
//
// The measure: the most a tile's water differs between the preview and the canonical settle, over the tiles
// that were wet before the edit or hold more than 0.05 in either; the tolerance is placeNoSpill.test.ts's, 0.1.
// Digging the bank tile beside the fall at (58, 39) is left out: it leaves a travelling wave in the preview
// (gap 0.285), with the code before this change too, a separate cause this test does not cover.

import { describe, expect, it } from "vitest";
import { footprintTiles } from "../../src/core/format/footprints";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const ID = "11111111-2222-4333-8444-555555555555";
const TOL = 0.1;

const flat = (y: number, x0: number, x1: number, level: number) => {
  expect(ed.apply({ op: "sculpt", params: { mode: "flatten", cells: [[y, x0, x1]], level, exact: true } } as never).errors ?? []).toEqual([]);
};

function stream() {
  ed.newBlank(W, 4);
  for (let y = 0; y < W; y++) {
    const c = W - 1 - y;
    const up = y < 40;
    if (up) flat(y, 0, W - 1, 7);
    if (y >= 30 && y <= 50) flat(y, Math.max(0, c - 14), c - 2, up ? 13 : 10);
    flat(y, Math.max(0, c - 1), Math.min(W - 1, c + 1), up ? 6 : 3);
  }
  let k = 0;
  for (const [x, y] of [[94, 1], [95, 1], [95, 0]])
    expect(ed.apply({ op: "placeEntity", params: { id: `00000000-0000-4000-8000-0000000000c${k++}`, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } } as never).errors ?? []).toEqual([]);
  settle();
}

/** The preview's water, settled as the editor settles it, then the canonical settle's in its place. */
function settle() {
  ed.settleWater();
  ed.collabSession()!.settleCanonical();
}

function snap() {
  const v = ed.sessionView();
  const d = new Float32Array(W * W);
  for (let k = 0; k < v.view.water.count; k++) d[v.view.water.tile[k]] = v.view.water.depth[k];
  return { h: v.view.heights.slice(), d };
}

/** Make the edit, settle its preview and then the canonical water, and undo it: the most the two differ. */
function gap(before: ReturnType<typeof snap>, edit: () => boolean): number | null {
  if (!edit()) return null;
  ed.settleWater();
  const preview = snap();
  ed.collabSession()!.settleCanonical();
  const canon = snap();
  let biggest = 0;
  for (let i = 0; i < W * W; i++) if (before.d[i] > 0 || canon.d[i] > 0.05 || preview.d[i] > 0.05) biggest = Math.max(biggest, Math.abs(canon.d[i] - preview.d[i]));
  ed.undo();
  settle();
  return biggest;
}

const own = (template: string, x: number, y: number) => footprintTiles(template, { template, x, y, z: 0, orientation: "Cw0", flipped: false }).map(([a, b]) => b * W + a);
/** Whether a tile within 2 (Chebyshev) of any of `tiles` was wet. */
const nearWater = (d: Float32Array, tiles: number[]) =>
  tiles.some((i) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < W && d[(y + dy) * W + x + dx] > 0) return true;
    return false;
  });

const place = (template: string, x: number, y: number) => () => ed.applyTool({ tool: "entity", template, x, y, orientation: "Cw0" }, ID).ok;
const sculpt = (mode: "raise" | "lower", x: number, y: number) => () => ed.apply({ op: "sculpt", params: { mode, cells: [[y, x, x]], amount: 1 } } as never).ok;

describe("the preview after an edit beside a stream ends where the canonical settle does (D(new-preview))", () => {
  it("on a fast river with a fall, built here: a placement's levelling, a one-tile raise and a one-tile dig", () => {
    stream();
    const before = snap();
    let wet = 0;
    for (let i = 0; i < W * W; i++) if (before.d[i] > 0) wet++;
    expect(wet, "the river runs").toBeGreaterThan(300);
    const tiles = own("UndergroundRuins", 46, 38);
    expect(new Set(tiles.map((i) => before.h[i])).size, "the ruins stand on uneven ground").toBeGreaterThan(1);
    expect(nearWater(before.d, tiles), "beside the river").toBe(true);
    expect(nearWater(before.d, [47 * W + 44]) && !(before.d[47 * W + 44] > 0), "the raised and dug tile is dry, beside the river").toBe(true);
    for (const [what, edit] of [
      ["an Underground Ruins at 46,38", place("UndergroundRuins", 46, 38)],
      ["a raise at 44,47", sculpt("raise", 44, 47)],
      ["a dig at 44,47", sculpt("lower", 44, 47)],
    ] as const) {
      const g = gap(before, edit);
      expect(g, `${what} is made`).not.toBeNull();
      expect(g!, `${what}: the preview differs from the settle by ${g!.toFixed(3)}`).toBeLessThan(TOL);
    }
  }, 120000);

  it("on River Valley 96² seed 9: every placement that levels, and a raise and a dig of every third tile, within 2 tiles of the river", async () => {
    await runGenerate(makeSpec({ seed: 9, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    settle();
    const before = snap();
    const counts = { placed: 0, raised: 0, dug: 0 };
    const worst: string[] = [];
    const check = (what: string, g: number | null) => {
      if (g !== null && g >= TOL) worst.push(`${what}: ${g.toFixed(3)}`);
      return g !== null;
    };
    for (let y = 10; y < W - 10; y += 3)
      for (let x = 10; x < W - 10; x += 3) {
        const i = y * W + x;
        if (!(before.d[i] > 0) && nearWater(before.d, [i])) {
          if (check(`a raise at ${x},${y}`, gap(before, sculpt("raise", x, y)))) counts.raised++;
          if (check(`a dig at ${x},${y}`, gap(before, sculpt("lower", x, y)))) counts.dug++;
        }
        const tiles = own("UndergroundRuins", x, y);
        if (tiles.every((t) => before.h[t] === before.h[tiles[0]]) || !nearWater(before.d, tiles)) continue;
        if (ed.footprintCheck({ tool: "entity", template: "UndergroundRuins", x, y, orientation: "Cw0" }).problem) continue;
        if (check(`an Underground Ruins at ${x},${y}`, gap(before, place("UndergroundRuins", x, y)))) counts.placed++;
      }
    expect(worst, "the preview differs from the settle").toEqual([]);
    // (the sweep is not vacuous)
    expect(counts.placed).toBeGreaterThan(3);
    expect(counts.raised).toBeGreaterThan(10);
    expect(counts.dug).toBeGreaterThan(10);
  }, 600000);
});
