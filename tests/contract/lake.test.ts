// The drawn lake (core/doc/lake.ts): a basin dug inside an outline, its rim made whole a level over the lake with one
// notch at its level; land that can't hold the level is refused with one line naming the lowest gap; a project with one
// reopens byte for byte (D455) and its export passes the load checks.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { applyDrawnLake, lakeTiles, planDrawnLake } from "../../src/core/doc/lake";
import { planEntity } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { startingLocation } from "../../src/core/format/entities";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { buildFileFromHeights } from "../../src/core/places/place";
import { validateMap } from "../../src/core/validate/checks";

const W = 96;
/** Level ground at 8 (or `ground`, its west edge at `west`), with a hollow down to 3 at X 70 · Y 30 and ground at 7 from X 20 to 24 along Y 49. */
function flat(ground = 8, west = ground): MapSession {
  const h = new Uint8Array(W * W).fill(ground);
  for (let y = 0; y < W; y++) h[y * W] = west;
  h[30 * W + 70] = 3;
  for (let x = 20; x <= 24; x++) h[49 * W + x] = 7;
  const start = startingLocation({ id: "00000000-0000-4000-8000-0000000000aa", owner: "t", x: 5, y: 80, z: 8, orientation: "Cw0" });
  return MapSession.importMap(writeTimber(buildFileFromHeights(W, W, h, [start], "").file), "flat.timber");
}
/** An outline around X 15–45, Y 40–48 (a long lake, east to west). */
const OUTLINE: [number, number][] = [[15, 40], [45, 40], [45, 48], [15, 48]];

describe("the drawn lake", () => {
  it("digs a shelving bed, makes its rim whole a level over the lake with one notch at its level, and holds a source's water", () => {
    const s = flat();
    const before = s.built.heights.slice();
    const r = applyDrawnLake(s, OUTLINE, 8, 3);
    expect(r.ok).toBe(true);
    expect(r.plan.fed).toBe(false);
    const h = s.built.heights;
    const basin = new Set(lakeTiles(OUTLINE, W, W));
    // the bed: a level under the lake at the shore, the channel along the long axis 3 under it, half of it beside
    expect(h[40 * W + 30]).toBe(7);
    expect(h[44 * W + 30]).toBe(5);
    expect(h[42 * W + 30]).toBe(6);
    // the rim: every tile of the ring a level over the lake but one, the notch, at it; and the notch is where the rim
    // was lowest (the ground at 7 along Y 49)
    const rim: number[] = [];
    for (const i of basin) for (const j of [i - W, i - 1, i + 1, i + W]) if (!basin.has(j) && !rim.includes(j)) rim.push(j);
    const low = rim.filter((j) => h[j] < 9);
    expect(low).toEqual([r.plan.notch]);
    expect(h[r.plan.notch]).toBe(8);
    expect(Math.floor(r.plan.notch / W)).toBe(49);
    // a source in the channel fills it to its level
    const at = 44 * W + 30;
    const src = planEntity(s, { template: "WaterSource", x: 30, y: 44, z: h[at], orientation: "Cw0", flipped: false }, "00000000-0000-4000-8000-000000000001");
    expect(src.ok && s.applyAll(src.ops).ok).toBe(true);
    const now = s.waterNow();
    const surface = now.model.floor[44 * W + 20] + now.depth[44 * W + 20];
    expect(surface).toBeGreaterThanOrEqual(8);
    expect(surface).toBeLessThan(9);
    // undo in one step each; a project with the lake reopens byte for byte, and its export loads
    const project = s.project();
    expect(MapSession.replayMatchesStored(decodeProject(project))).toBe(true);
    expect(MapSession.open(decodeProject(project)).project()).toEqual(project);
    const checks = validateMap(readTimber(s.exportTimber().bytes), { profile: "export", loadOnly: true }).report.checks.filter((c) => c.class === "load");
    expect(checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.message ?? ""}`)).toEqual([]);
    s.undo();
    s.undo();
    expect(s.built.heights).toEqual(before);
  });
  it("puts its notch where the player dragged out of the outline", () => {
    const p = planDrawnLake(flat(), OUTLINE, 8, 2, [10, 44]);
    expect(p.reason).toBeNull();
    expect([p.notch % W, Math.floor(p.notch / W)]).toEqual([14, 44]);
  });
  it("never spills off the map: an outline beside its edge puts its notch inside the map, or is refused", () => {
    // (beside the west and the east edge, dragged out toward it: the rim's tiles on the edge are never the notch, and a
    // rim tile's neighbours never wrap to the next row)
    for (const [x0, x1, out] of [[1, 10, 0], [W - 11, W - 2, W - 1]] as const) {
      const p = planDrawnLake(flat(), [[x0, 10], [x1, 10], [x1, 18], [x0, 18]], 8, 2, [out, 14]);
      expect(p.reason).toBeNull();
      const nx = p.notch % W;
      expect(nx).toBeGreaterThan(0);
      expect(nx).toBeLessThan(W - 1);
    }
    // ground at 12 everywhere but a low strip along the west edge: only the edge could take its water, so it's refused
    const s = flat(12, 6);
    expect(planDrawnLake(s, [[1, 10], [10, 10], [10, 18], [1, 18]], 8, 2).reason).toBe("no ground beyond the lake's rim lies at level 8 or lower: its water would have nowhere to spill");
  });
  it("refuses, in one line naming the lowest gap, land that can't hold the level", () => {
    const s = flat();
    expect(planDrawnLake(s, [[60, 25], [69, 25], [69, 35], [60, 35]], 8, 2).reason).toBe("the land can't hold a lake at level 8 there: its rim's lowest gap is at X 70 · Y 30, level 3");
    expect(planDrawnLake(s, OUTLINE, 8, 6).reason).toBe("a lake's depth must be a whole number from 1 to 5");
    expect(planDrawnLake(s, [[0, 10], [10, 10], [10, 20], [0, 20]], 8, 2).reason).toBe("the lake reaches the map's edge at X 0 · Y 10: its water would run off the map");
    expect(planDrawnLake(s, [[30, 30]], 8, 2).reason).toBe("a lake needs room: drag an outline around the ground it should take");
  });
});
