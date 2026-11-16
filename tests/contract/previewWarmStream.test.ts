// What you see is what you get (PERFECT): after an edit beside a flowing stream, the editor's water preview
// (the warm start and its settle, sim/preview.ts) ends where the full canonical settle does. The warm start
// starts again only the tiles whose floor, dam or emitters the edit changed, and the dry tiles round them; a
// wet tile round them keeps its water and its momentum (D(new-preview), planning's ruling of 2026-11-15).
// Starting a stretch of flowing river again with the pre-fill's depth and no momentum left a step in its
// surface that sloshed on past the preview's four-day cap: River Valley 96² seed 9 at generator 0.10.23, an
// Underground Ruins at 34,31, read 0.793 at 41,50 where the settle gives 0.657.
//
// Two lands: one built here, so no generator version moves it, and River Valley 96² seed 9. The generated lands
// (seeds 9 and 8) are fixtures, tests/fixtures/projects, `fixtureInEditor`: the land of generator 0.10.22 these
// cases were written on, byte for byte, so a land change moves nothing here (D148). The built land is
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
//
// Which water lost its feed depends on its cause (D260 as ruled 2026-11-15, sim/preview.ts `unfedTiles`): on a
// tile a removed or weakened source's walk reached, any fall over a tenth of the walk's flow (`LOST_SHARE`);
// where ground only turned a walk, only a fall below a tenth (`UNFED_SHARE`), and a channel that keeps more
// keeps its water and momentum while the preview's own steps lower it. Held here: on a land built for it,
// flattening one tile turns a spring's walk (two sources of 4) away from a river (three of 4), leaving the
// river 0.6 of its walk's flow; on River Valley 96² seed 8 an Underground Ruins at 82,52 leaves 0.12 of it on
// 363 wet tiles; and one edit that weakens a source and turns its walk takes each rule where it belongs.
// Neither turned case fails with the old line (any fall over a tenth restarted the tile dry); the one that
// does, seed 9's Ruins at 34,34 (0.105 against the settle, now 0.038), needs #1145's land and is held there.
// Not held, for a ruling: a trench a river filled that a turned walk leaves, another walk still crossing it
// with half the flow, keeps 1.90 in the preview against the settle's 0 (1.93 before: a pool tile is never
// judged by its flow).

import { describe, expect, it } from "vitest";
import { footprintTiles } from "../../src/core/format/footprints";
import * as ed from "../../src/worker/session";
import { flowThrough } from "../../src/core/sim/prefill";
import { UNFED_SHARE, unfedTiles } from "../../src/core/sim/preview";
import { fixtureInEditor, namedInEditor } from "../fixtureEditor";

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

  it("on River Valley 96² seed 9: every placement that levels, and a raise and a dig of every third tile, within 2 tiles of the river", () => {
    fixtureInEditor("riverValley", W, 9);
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

/** Make the edit and read, over the tiles wet before it that still carry some of the walk's flow
 *  (prefill.ts `flowThrough`), how many lose more than a tenth of it and the least share any keeps. */
function flowLeft(edit: () => boolean): () => boolean {
  return () => {
    const s = ed.collabSession()!;
    const from = s.lastSettled()!;
    if (!edit()) return false;
    const was = flowThrough(from.model).q;
    const now = flowThrough(s.built.waterModel).q;
    left = { least: 1, falls: 0 };
    for (let i = 0; i < W * W; i++) {
      if (!(from.water.depth[i] > 0) || !(now[i] > 0) || !(now[i] < was[i] * 0.9)) continue;
      left.falls++;
      left.least = Math.min(left.least, now[i] / was[i]);
    }
    return true;
  };
}
let left = { least: 1, falls: 0 };

/** A land for the turned walk: a blank 96² map at 12 with a river three wide down column 61, its bed at 9
 *  north of row 50 and at 6 from there (a fall of three), fed by three sources of 4, and a second channel
 *  down column 11, its bed at 1. On each of `rows` a spring's basin (7, columns 28-32, two rows either side)
 *  spills east along the row at 8 into the river; west, a channel at 7 runs to column 11, shut by a tile at
 *  11 on column 27. The first basin holds two sources of 4, any other one. Returns the sources' ids. */
function springs(rows: number[]): string[] {
  ed.newBlank(W, 12);
  for (let y = 0; y < W; y++) {
    flat(y, 60, 62, y < 50 ? 9 : 6);
    flat(y, 10, 12, 1);
  }
  const ids: string[] = [];
  const source = (x: number, y: number) => {
    const id = `00000000-0000-4000-8000-0000000000d${ids.length}`;
    expect(ed.apply({ op: "placeEntity", params: { id, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } } as never).errors ?? []).toEqual([]);
    ids.push(id);
  };
  for (const x of [60, 61, 62]) source(x, 1);
  rows.forEach((r, n) => {
    for (let y = r - 2; y <= r + 2; y++) flat(y, 28, 32, 7);
    flat(r, 33, 59, 8);
    flat(r, 13, 26, 7);
    flat(r, 27, 27, 11);
    source(30, r);
    if (n === 0) source(29, r);
  });
  return ids;
}

describe("a channel that still carries a tenth of its walk's flow keeps its water, and the preview ends where the settle does (D260 as ruled 2026-11-15)", () => {
  it("built here: a spring's walk turned away from the river it joined, the river left 0.6 of it", () => {
    springs([55]);
    settle();
    const before = snap();
    expect(before.d[70 * W + 61], "the river runs").toBeGreaterThan(1);
    expect(before.d[55 * W + 45], "the spring runs into it").toBeGreaterThan(0.1);
    expect(before.d[55 * W + 20], "and not west").toBe(0);
    // (flattening the shutting tile to the west channel's level: the basin now spills west, lower)
    const g = gap(before, flowLeft(() => (flat(55, 27, 27, 7), true)));
    expect(g).not.toBeNull();
    expect(left.falls, "the river's walk loses flow").toBeGreaterThan(100);
    expect(left.least, "the river keeps more than a tenth of its walk's flow").toBeGreaterThan(UNFED_SHARE);
    expect(left.least, "and loses more than a tenth").toBeLessThan(0.9);
    expect(g!, `the preview differs from the settle by ${g!.toFixed(3)}`).toBeLessThan(TOL);
  }, 120000);

  it("built here: one edit weakens a source and turns its walk: the source's rule on every tile its walk reached, the turned rule elsewhere", () => {
    // (two springs: the first, two sources of 4 on row 55, and the second, one of 4 on row 75 with a third
    // source of 4 on its run to the river at 45,75, which the turn leaves half the flow)
    const ids = springs([55, 75]);
    const third = "00000000-0000-4000-8000-0000000000e0";
    expect(ed.apply({ op: "placeEntity", params: { id: third, template: "WaterSource", x: 45, y: 75, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } } as never).errors ?? []).toEqual([]);
    settle();
    const s = ed.collabSession()!;
    const from = s.lastSettled()!;
    // the edit: both shutting tiles flattened to the west channels' level, and one of the first spring's two
    // sources (29,55) weakened from 4 to 2
    expect(ed.apply({ op: "sculpt", params: { mode: "flatten", cells: [[55, 27, 27], [75, 27, 27]], level: 7, exact: true } } as never).errors ?? []).toEqual([]);
    expect(ed.apply({ op: "setEntityProps", params: { id: ids[4], components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } } } as never).errors ?? []).toEqual([]);
    const next = s.built.waterModel;
    const weakened = from.model.emitters.filter((e) => e.cells.includes(55 * W + 29));
    expect(weakened.length, "the weakened source").toBe(1);
    const reached = flowThrough({ ...from.model, emitters: weakened }).path;
    const was = flowThrough(from.model).q;
    const now = flowThrough(next).q;
    const unfed = unfedTiles(from, next)!;
    const count = { source: 0, turned: 0 };
    for (let i = 0; i < W * W; i++) {
      // (the wet tiles that keep between a tenth and nine tenths of the walk's flow: unfed by the source's rule,
      // kept by the turned one)
      if (!(from.water.depth[i] > 0) || !(now[i] > was[i] * UNFED_SHARE) || !(now[i] < was[i] * 0.9)) continue;
      const at = `${i % W},${Math.floor(i / W)} (${(now[i] / was[i]).toFixed(2)} of its walk's flow left)`;
      if (reached[i]) {
        count.source++;
        expect(unfed[i], `${at}, which the weakened source's walk reached, is unfed`).toBe(1);
      } else {
        count.turned++;
        expect(unfed[i], `${at}, which it did not reach, keeps its water`).toBe(0);
      }
    }
    expect(count.source, "tiles under the source's rule").toBeGreaterThan(50);
    expect(count.turned, "tiles under the turned rule").toBeGreaterThan(5);
  }, 120000);

  it("River Valley 96² seed 8: an Underground Ruins at 82,52 leaves the river 0.12 of its walk's flow", () => {
    fixtureInEditor("riverValley", W, 8);
    settle();
    const before = snap();
    const g = gap(before, flowLeft(place("UndergroundRuins", 82, 52)));
    expect(g, "the ruins are placed").not.toBeNull();
    expect(left.falls, "the river's walk loses flow").toBeGreaterThan(100);
    expect(left.least, "the river keeps more than a tenth of its walk's flow").toBeGreaterThan(UNFED_SHARE);
    expect(g!, `the preview differs from the settle by ${g!.toFixed(3)}`).toBeLessThan(TOL);
  }, 120000);

  // (the case #1159's two causes were built for, on the land it was found on: #1145's River Valley 96² seed 9 at generator
  // 0.10.23, saved once from that branch's commit 8596797e as tools/fixture-projects.ts saves a fixture
  // (preview-riverValley-96-9-leaks). The old line, restarting every tile whose walk lost over a tenth, ended 0.105 off the
  // settle (0.112 on the code before #1159); the two rules end 0.038, the river keeping 0.77 of its walk's flow on 94 tiles)
  it("River Valley 96² seed 9 on the land it was found on: an Underground Ruins at 34,34 turns the river's walk, no source touched", () => {
    namedInEditor("preview-riverValley-96-9-leaks.damgoodmaps");
    settle();
    const before = snap();
    const g = gap(before, flowLeft(place("UndergroundRuins", 34, 34)));
    expect(g, "the ruins are placed").not.toBeNull();
    expect(left.falls, "the river's walk loses flow").toBeGreaterThan(50);
    expect(left.least, "the river keeps more than a tenth of its walk's flow").toBeGreaterThan(UNFED_SHARE);
    expect(left.least, "and loses more than a tenth").toBeLessThan(0.9);
    expect(g!, `the preview differs from the settle by ${g!.toFixed(3)}`).toBeLessThan(TOL);
  }, 120000);
});
