// The Block tool's view update (D335): a hollow under a surface that did not move still reaches the
// renderer, as the columns it dug, with the heights and the rectangle they changed in; a stroke on plain
// ground sends no columns.

import { describe, expect, it } from "vitest";
import { writeTimber } from "../../src/core/format/timber";
import * as ed from "../../src/worker/session";
import { CAVE_W as W, caveFile } from "./caveMap";

describe("a hollow's view update", () => {
  it("carries the hollowed columns, and a stroke on plain ground sends none", () => {
    ed.openTimber(writeTimber(caveFile()), "cave.timber");
    const before = ed.sessionView().view.columns.tiles.length;
    // a stroke far from the cave and the ledge: heights, no columns
    const stroke = ed.apply({ op: "brush", params: { tool: "raise", size: 1, strength: 5, dabs: [4 * 5 + 2, 4 * 5 + 2] } }, "user", "Raise");
    expect(stroke.errors).toEqual([]);
    expect(stroke.view.columns).toBeUndefined();
    // a 3 x 3 hole in the cave's west wall: the surface is where it was, the columns come
    const u = ed.apply({ op: "blocks", params: { mode: "remove", side: "+x", at: [[14, 17, 4]], size: 3 } }, "user", "Remove blocks");
    expect(u.errors).toEqual([]);
    const v = u.view;
    expect(v.columns).toBeDefined();
    const tiles = Array.from(v.columns!.tiles);
    expect(tiles.length).toBe(before + 3);
    for (const y of [16, 17, 18]) expect(tiles).toContain(y * W + 14);
    // (the land goes with its columns over the hollow, so its tiles are drawn again: as the rectangle the edit changed,
    // since #922 step 4, not the whole land)
    expect(v.land?.heights).toBeDefined();
    const r = v.land!.rect;
    expect(r.x0 <= 14 && r.x1 >= 14 && r.y0 <= 16 && r.y1 >= 18).toBe(true);
    expect((r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1)).toBeLessThan(W * W);
    const k = tiles.indexOf(17 * W + 14);
    for (const z of [3, 4, 5]) expect(v.columns!.voxels[k * 23 + z]).toBe(0);
    expect(v.columns!.voxels[k * 23 + 2]).toBe(1);
    expect(v.columns!.voxels[k * 23 + 6]).toBe(1);
    // undo sends the columns back as they were
    const back = ed.undo();
    expect(back.view.columns).toBeDefined();
    expect(back.view.columns!.tiles.length).toBe(before);
    ed.closeSession();
  });
});
