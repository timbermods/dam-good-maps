// Water changes only through its causes (PLAN §20 D260). After an edit, the water no running source
// can reach on the new ground takes the canonical start (dry) in the preview's warm start, so it
// drains away in the edit's own journey from its first frame; a lake a force stored (RetainedWater)
// is its own cause and keeps its water while its hollow holds it (breached, it drains through the
// breach; filled in, it is gone). The preview's water once it stops agrees with the canonical
// settle's.

import { describe, expect, it } from "vitest";
import type { Orientation } from "../../src/core/format/footprints";
import { waterModel, type MapObject } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { PreviewJob, unfedTiles, type WarmState } from "../../src/core/sim/preview";
import type { WaterModel } from "../../src/core/sim/water";

const W = 40;
const H = 24;
const N = W * H;

function source(x: number, y: number, z: number, strength = 1, orientation: Orientation = "Cw0"): MapObject {
  return { template: "WaterSource", x, y, z, orientation, flipped: false, components: { WaterSource: { SpecifiedStrength: strength } } as MapObject["components"] };
}

/** Level ground at 8 with a hollow at level 4 (x 8–15, y 7–14) and a channel at level 6 (y 2–3)
 *  across the map, stepping down east of x 30, open at both edges. */
function ground(): Uint8Array {
  const h = new Uint8Array(N).fill(8);
  for (let y = 7; y <= 14; y++) for (let x = 8; x <= 15; x++) h[y * W + x] = 4;
  for (let y = 2; y <= 3; y++) for (let x = 0; x < W; x++) h[y * W + x] = x < 30 ? 6 : 5;
  return h;
}

const settled = (m: WaterModel): WarmState => ({ model: m, water: canonicalSettle(m) });
function preview(from: WarmState, m: WaterModel) {
  const job = new PreviewJob(from, m);
  const first = (job.advance(4), job.sim.D.slice());
  let r = job.advance(Infinity);
  while (!r) r = job.advance(Infinity);
  return { first, final: r };
}
const tiles = (x0: number, y0: number, x1: number, y1: number) => {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * W + x);
  return out;
};
const hollow = tiles(8, 7, 15, 14);
/** The preview's water once it stops against the canonical settle's: no water where the settle has
 *  none (nor the other way), and every depth close. */
function agrees(preview: ArrayLike<number>, canon: ArrayLike<number>) {
  for (let i = 0; i < N; i++) {
    expect(preview[i] > 0.05 && !(canon[i] > 0.01), `tile ${i}: water the settle doesn't have`).toBe(false);
    expect(canon[i] > 0.05 && !(preview[i] > 0.01), `tile ${i}: water the preview doesn't have`).toBe(false);
    expect(Math.abs(preview[i] - canon[i]), `tile ${i}`).toBeLessThan(0.1);
  }
}

describe("water no source feeds recedes at once (D260)", () => {
  it("a pool whose source is removed is unfed: it starts dry in the preview, and the preview ends as the canonical settle", () => {
    const h = ground();
    const fed = settled(waterModel(W, H, h, [source(11, 10, 4, 1)]));
    expect(Math.max(...hollow.map((i) => fed.water.depth[i]))).toBeGreaterThan(1);
    const next = waterModel(W, H, h, []);
    const unfed = unfedTiles(fed, next)!;
    for (const i of hollow) if (fed.water.depth[i] > 0) expect(unfed[i], `tile ${i}`).toBe(1);
    const p = preview(fed, next);
    // from its first frame (the water is gone from the start, not left to evaporate over days)
    expect(Math.max(...hollow.map((i) => p.first[i]))).toBeLessThan(0.01);
    agrees(p.final.depth, canonicalSettle(next).depth);
  });

  it("with two sources feeding it, removing one: less water flows there, so it starts as the canonical start has it, and settles to what the other keeps", () => {
    const h = ground();
    const both = settled(waterModel(W, H, h, [source(10, 10, 4, 1), source(13, 11, 4, 1)]));
    const next = waterModel(W, H, h, [source(13, 11, 4, 1)]);
    const p = preview(both, next);
    // (still a pool: the other source keeps it)
    expect(Math.max(...hollow.map((i) => p.final.depth[i]))).toBeGreaterThan(1);
    agrees(p.final.depth, canonicalSettle(next).depth);
  });

  it("a stretch of river cut off by raised ground is unfed below the cut; above it the water is fed", () => {
    const h = ground();
    const objects = [source(20, 2, 6, 1), source(20, 3, 6, 1)];
    const river = settled(waterModel(W, H, h, objects));
    expect(river.water.depth[2 * W + 35]).toBeGreaterThan(0);
    // a wall across the channel at x 26–27
    const cut = h.slice();
    for (let y = 1; y <= 4; y++) for (let x = 26; x <= 27; x++) cut[y * W + x] = 10;
    const next = waterModel(W, H, cut, objects);
    const unfed = unfedTiles(river, next)!;
    expect(unfed[2 * W + 30]).toBe(1);
    expect(unfed[2 * W + 22]).toBe(0);
    const p = preview(river, next);
    agrees(p.final.depth, canonicalSettle(next).depth);
  });

  it("a stored lake keeps its water while its hollow holds it; breached, it drains through the breach; filled in, it is gone", () => {
    const h = ground();
    // the hollow's water, stored (a carve's oxbow lake): no source feeds it
    const lakeDepth = 2.5;
    const retained = [{ tiles: hollow, floor: hollow.map(() => 4), depth: hollow.map(() => lakeDepth), contamination: hollow.map(() => 0) }];
    const withLake = (g: Uint8Array): WaterModel => ({ ...waterModel(W, H, g, []), retained });
    const kept = settled(withLake(h));
    expect(kept.water.depth[10 * W + 11]).toBeGreaterThan(2);
    // an edit elsewhere (a tile far from it raised): the lake is its own cause, and stays
    const far = h.slice();
    far[2 * W + 36] = 9;
    const next = withLake(far);
    expect(hollow.filter((i) => unfedTiles(kept, next)![i])).toEqual([]);
    const still = preview(kept, next);
    expect(still.final.depth[10 * W + 11]).toBeGreaterThan(2);
    // breached: a notch from the hollow to the map's east edge, below its floor, and it drains
    // through it
    const breach = h.slice();
    for (let x = 16; x < W; x++) breach[13 * W + x] = 3;
    const drained = preview(kept, withLake(breach));
    const canon = canonicalSettle(withLake(breach));
    expect(drained.final.depth[10 * W + 11]).toBeLessThan(kept.water.depth[10 * W + 11] - 1);
    expect(Math.abs(drained.final.depth[10 * W + 11] - canon.depth[10 * W + 11])).toBeLessThan(0.1);
    // filled in: the ground above its surface, and its water is gone
    const filled = h.slice();
    for (const i of hollow) filled[i] = 8;
    const gone = preview(kept, withLake(filled));
    expect(Math.max(...hollow.map((i) => gone.final.depth[i]))).toBeLessThan(0.01);
  });
});
