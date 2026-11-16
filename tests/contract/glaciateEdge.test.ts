// A glacier drawn to the map's edge carves its valley (PLAN §20 D356: a force always has a visible
// effect). The aimed route's search never steps onto the map's border tiles, so an end drawn there was
// never reached: the route was the end tile alone, and the glacier left a pit of 6 to 8 tiles there,
// even at Power 100, while one tile inside the edge it carved over a thousand. About one drawn glacier in
// five ended on the edge (64² sweeps of River Valley and Highlands). The route now aims at the nearest
// tile inside the edge (rust/forces `glacier_route`). investigation/core-hunt-2, finding 2.

import { beforeAll, expect, it } from "vitest";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

beforeAll(async () => {
  await runGenerate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 64, y: 64 } }));
  ed.refine();
}, 120_000);

/** Tiles a glacier drawn from `origin` to `end` changes by a level or more (then taken back). */
function glacier(origin: [number, number], end: [number, number], power: number): number {
  return lowered(origin, end, power).reduce((n, v) => n + (v ? 1 : 0), 0);
}

/** Whether each tile a glacier drawn from `origin` to `end` changes by a level or more (then taken back). */
function lowered(origin: [number, number], end: [number, number], power: number): boolean[] {
  const before = ed.terrainNow().heights.slice();
  const r = ed.forceStart({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "flow", power, size: null, benches: null, steps: null, tarn: null, scree: null, seed: 1 } as never, origin, end, via: [], cut: null, natural: true });
  expect(r.errors).toEqual([]);
  for (let k = 0; k < 100_000; k++) {
    const f = ed.forceAdvance(50);
    if (!f || f.done) break;
  }
  expect(ed.forceStop(r.gesture).kept).toBe(true);
  const after = ed.terrainNow().heights.slice();
  ed.undo();
  return Array.from(after, (v, i) => Math.abs(v - before[i]) >= 1);
}

it.each([
  ["the east edge", [38, 32], [63, 31]],
  ["a corner", [54, 57], [63, 63]],
  ["the west edge", [3, 45], [0, 36]],
  ["the north edge", [15, 15], [21, 0]],
] as [string, [number, number], [number, number]][])("drawn to %s, it carves as it does a tile inside it", (_where, origin, end) => {
  for (const power of [0, 100]) {
    const inside: [number, number] = [Math.min(62, Math.max(1, end[0])), Math.min(62, Math.max(1, end[1]))];
    const n = glacier(origin, end, power);
    expect(n).toBeGreaterThanOrEqual(9);
    expect(n).toBeGreaterThan(glacier(origin, inside, power) * 0.5);
  }
});

// One test says whether a glacier runs off the map, for its width and its trough's open end alike
// (rust/forces `glacier_runs_off`, #1204): the width once freed at an end that came to the edge on a slant
// while the trough, its line aimed along the edge, stayed closed, and a glacier drawn so ended short of the
// edge (12 tiles of the edge's line cut beside its end, 0 before). Where it runs off, the trough reaches the
// edge open and as wide there as three tiles in: never a lip, never a slot.
it.each([
  ["into a corner", [54, 57], [63, 63]],
  ["to the north edge on a slant", [10, 12], [40, 2]],
] as [string, [number, number], [number, number]][])("drawn %s, it runs off the map open and at its width", (_how, origin, end) => {
  // (the tiles cut on an edge's line, and on the line three tiles in from it, within 9 tiles of the end)
  const near = (x: number, y: number) => Math.hypot(x - end[0], y - end[1]) <= 9;
  const line = (cut: boolean[], edge: number, inset: number) => {
    let n = 0;
    for (let t = 0; t < 64; t++) {
      const [x, y] = [[t, inset], [t, 63 - inset], [inset, t], [63 - inset, t]][edge];
      if (near(x, y) && cut[y * 64 + x]) n++;
    }
    return n;
  };
  for (const power of [0, 100]) {
    const cut = lowered(origin, end, power);
    const edge = [0, 1, 2, 3].reduce((a, b) => (line(cut, b, 0) > line(cut, a, 0) ? b : a));
    expect(line(cut, edge, 0)).toBeGreaterThanOrEqual(3);
    expect(line(cut, edge, 0)).toBeGreaterThanOrEqual(line(cut, edge, 3) * 0.5);
  }
});
