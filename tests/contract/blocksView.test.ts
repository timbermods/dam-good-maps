// The Block tool's view update (D335): a hollow under a surface that did not move still reaches the
// renderer, as the columns it dug, with the heights and the rectangle they changed in; a stroke on a
// heightfield map sends no columns.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import * as ed from "../../src/worker/session";

describe("a hollow's view update", () => {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));

  it("carries the hollowed columns, and a stroke sends none", () => {
    const s0 = MapSession.fromGenerated(r, r.file);
    const b = s0.built;
    // a dry spot of level ground, away from objects
    const near = new Set<number>();
    for (const e of b.entities) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) near.add((e.y + dy) * b.W + e.x + dx);
    let at: [number, number] | null = null;
    for (let y = 8; y < b.H - 8 && !at; y++)
      for (let x = 8; x < b.W - 8 && !at; x++) {
        let ok = true;
        for (let dy = -3; dy <= 3 && ok; dy++) for (let dx = -3; dx <= 3 && ok; dx++) {
          const i = (y + dy) * b.W + x + dx;
          if (b.water[i] > 0 || b.channel[i] || near.has(i) || b.heights[i] < 7 || b.heights[i] !== b.heights[y * b.W + x]) ok = false;
        }
        if (ok) at = [x, y];
      }
    expect(at).not.toBeNull();
    const [x, y] = at!;
    const h = b.heights[y * b.W + x];
    ed.openProject(s0.project());
    // a stroke on the heightfield: heights, no columns
    const dabs = [4 * x + 2, 4 * y + 2];
    const stroke = ed.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 5, dabs } }, "user", "Raise");
    expect(stroke.errors).toEqual([]);
    expect(stroke.view.columns).toBeUndefined();
    // a hollow two layers under the surface: the surface is where it was, the columns come
    const u = ed.apply({ op: "blocks", params: { mode: "remove", side: "+z", at: [[x + 5, y, h - 3]], size: 3 } }, "user", "Remove blocks");
    expect(u.errors).toEqual([]);
    const v = u.view;
    expect(v.columns).toBeDefined();
    expect(Array.from(v.columns!.tiles).sort((a, c) => a - c)).toEqual([-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => (y + dy) * b.W + x + 5 + dx)).sort((a, c) => a - c));
    expect(v.heights).toBeDefined();
    expect(v.terrainRect).toEqual({ x0: x + 4, y0: y - 1, x1: x + 6, y1: y + 1 });
    // each column has the hole
    const k = Array.from(v.columns!.tiles).indexOf(y * b.W + x + 5);
    expect(v.columns!.voxels[k * 23 + h - 3]).toBe(0);
    expect(v.columns!.voxels[k * 23 + h - 4]).toBe(1);
    // undo sends the heightfield back: no tile is a column any more
    const back = ed.undo();
    expect(back.view.columns).toBeDefined();
    expect(back.view.columns!.tiles.length).toBe(0);
    ed.closeSession();
  });
});
