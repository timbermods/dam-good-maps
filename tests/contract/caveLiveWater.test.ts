// Live water on a map with caves or overhangs (D99, D197; D280's amendment lifted, from #579's review): an edit's
// water and a stroke's water flow on screen frame by frame, as on a plain map, by the stacked engine
// (core/sim/stackLive.ts `StackLive`), and the journey ends on the canonical stacked settle, byte for byte: the live
// water is only shown, never the map's (src/worker/session.ts `kickStack`, `draftStack`).
//
// The map: ground at level 10, a trench three rows wide (floor 6) running east to the map's edge, its source placed
// by an edit, and a cave opening south off the trench under a roof two layers thick (air z 6–7), which the river's
// water fills.

import { afterEach, describe, expect, it } from "vitest";
import { writeTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { carryStack, StackLive } from "../../src/core/sim/stackLive";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { WaterView } from "../../src/render3d/model";
import * as ed from "../../src/worker/session";

const W = 40;
const H = 40;
const N = W * H;
const GROUND = 10;
const TRENCH = { y0: 18, y1: 20, x0: 2, floor: 6 };
const CAVE = { x0: 21, x1: 25, y0: 21, y1: 23, air: [6, 8] as const };
const SOURCE = { x: 3, y: 19 };
/** The dam a stroke raises across the trench, and its top. */
const DAM_X = 12;
const DAM = 9;

function file(): Uint8Array {
  const v = voxelsFromHeights(new Uint8Array(N).fill(GROUND), W, H);
  for (let y = TRENCH.y0; y <= TRENCH.y1; y++) for (let x = TRENCH.x0; x < W; x++) for (let z = TRENCH.floor; z < GROUND; z++) v[z * N + y * W + x] = 0;
  for (let y = CAVE.y0; y <= CAVE.y1; y++) for (let x = CAVE.x0; x <= CAVE.x1; x++) for (let z = CAVE.air[0]; z < CAVE.air[1]; z++) v[z * N + y * W + x] = 0;
  const f: TimberFile = {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-27 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: v, singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
  return writeTimber(f);
}

type Frame = { draft: boolean; ticks: number; done: number; water: WaterView; version: number };

/** The map open in the editor's session with its river settled (canonically), the frames it sends from then on. */
function openRiver(): Frame[] {
  ed.openTimber(file(), "cave-river.timber");
  const u = ed.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-000000000001", template: "WaterSource", x: SOURCE.x, y: SOURCE.y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } });
  expect(u.errors).toEqual([]);
  ed.settleWater();
  const s = ed.collabSession()!;
  expect(s.built.waterModel.stacked, "the map has caves").toBeTruthy();
  expect(s.waterStale).toBe(false);
  const frames: Frame[] = [];
  ed.listen((e) => {
    if (e.kind === "water") frames.push({ draft: !!e.draft, ticks: e.ticks, done: e.done, water: e.water, version: e.version });
  });
  return frames;
}

/** Wait (real time) until `ok`, or fail after `ms`. */
async function until(ok: () => boolean, ms = 60_000): Promise<void> {
  const t0 = Date.now();
  while (!ok()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

/** The water the view shows from above, per tile: each tile's highest wet column. */
function topOf(v: WaterView): Float64Array {
  const d = new Float64Array(N);
  const f = new Float64Array(N).fill(-1);
  for (let k = 0; k < v.count; k++) {
    const i = v.tile[k];
    if (v.floor[k] > f[i]) {
      f[i] = v.floor[k];
      d[i] = v.depth[k];
    }
  }
  return d;
}

/** The map's settled water, every column, as bytes. */
function settledBytes(s: MapSession): string[] {
  const st = s.built.settle.stack!;
  return [Buffer.from(s.built.settle.depth.buffer).toString("base64"), Buffer.from(st.depth.buffer).toString("base64"), Buffer.from(st.overflow.buffer).toString("base64"), Buffer.from(st.contamination.buffer).toString("base64")];
}

afterEach(() => {
  ed.listen(null);
  ed.setAutoWater(false);
  ed.cancelDraft();
  ed.closeSession();
});

describe("live water on a map with caves (D99, D197)", () => {
  it("a stroke's water flows frame by frame while it is painted and after it is let go, and ends on the canonical settle's bytes", async () => {
    const frames = openRiver();
    ed.setAutoWater(true);
    const s0 = ed.collabSession()!;
    const before = topOf(ed.sessionView().view.water);
    expect(before[19 * W + DAM_X], "the river runs through the dam's place").toBeGreaterThan(0.05);
    // the page paints a dam across the trench, three levels high (the water spills over it): its ground first, a
    // tile row at a time
    for (let y = TRENCH.y0; y <= TRENCH.y1; y++) {
      ed.draftStroke({ x0: DAM_X, y0: y, x1: DAM_X, y1: y }, new Uint8Array([DAM]));
      await new Promise((r) => setTimeout(r, 60));
    }
    const upstream = 19 * W + DAM_X - 3;
    await until(() => frames.filter((f) => f.draft).length >= 5 && topOf(frames[frames.length - 1].water)[upstream] > before[upstream] + 0.5);
    const drafts = frames.filter((f) => f.draft);
    expect(drafts.length, "the stroke's water, frame by frame while it is painted").toBeGreaterThanOrEqual(5);
    // (the stroke's own ground holds the water back: it rises behind the dam)
    expect(topOf(drafts[drafts.length - 1].water)[upstream]).toBeGreaterThan(before[upstream] + 0.5);
    // let go: the stroke's operation, and its water flows on from the stroke's
    const cells: [number, number, number][] = [];
    for (let y = TRENCH.y0; y <= TRENCH.y1; y++) cells.push([y, DAM_X, DAM_X]);
    const u = ed.apply({ op: "sculpt", params: { mode: "flatten", cells, level: DAM } }, "user", "Raise");
    expect(u.errors).toEqual([]);
    expect(u.waterSettled, "the edit's water is on its way").toBe(false);
    const v = ed.sessionInfo().version;
    await until(() => !ed.waterSettling());
    const journey = frames.filter((f) => !f.draft && f.version === v);
    expect(journey.length, "the water's journey after the edit, frame by frame").toBeGreaterThanOrEqual(5);
    expect(journey[0].ticks, "its first frame at its first ticks").toBeLessThanOrEqual(4);
    // the frames move (the stroke's, then the edit's journey flowing on from them), and from the stroke's water on:
    // never back to the map's water before the stroke
    const all = [...drafts, ...journey];
    let moving = 0;
    for (let k = 1; k < all.length; k++) {
      const a = topOf(all[k - 1].water);
      const b = topOf(all[k].water);
      if (a.some((d, i) => Math.abs(d - b[i]) > 0.01)) moving++;
    }
    expect(moving).toBeGreaterThanOrEqual(4);
    expect(topOf(journey[0].water)[upstream]).toBeGreaterThan(before[upstream] + 0.5);
    // the live water was only shown: the map still carries its last settle until the canonical one replaces it
    const s = ed.collabSession()!;
    expect(s).toBe(s0);
    expect(s.waterStale).toBe(true);
    const shown = topOf(journey[journey.length - 1].water);
    ed.settleWater();
    expect(s.waterStale).toBe(false);
    // the canonical settle, byte for byte: the same as a fresh settle of the map as it stands, and as the project
    // reopened and settled from scratch
    const fresh = canonicalSettle(s.built.waterModel);
    expect(Buffer.from(s.built.settle.depth.buffer).equals(Buffer.from(fresh.depth.buffer))).toBe(true);
    expect(Buffer.from(s.built.settle.stack!.depth.buffer).equals(Buffer.from(fresh.stack!.depth.buffer))).toBe(true);
    const reopened = MapSession.open(decodeProject(ed.project().bytes), { rebuild: true });
    expect(settledBytes(reopened)).toEqual(settledBytes(s));
    // and the live water came to stand where the canonical settle does: the same tiles wet, near the same depth
    const canon = s.built.settle.depth;
    let differ = 0;
    for (let i = 0; i < N; i++) if (canon[i] > 0.05 !== shown[i] > 0.05 || Math.abs(canon[i] - shown[i]) > 0.1) differ++;
    expect(differ, "tiles where the live water's end differs from the settle").toBeLessThanOrEqual(N * 0.01);
  });

  it("an edit's water starts flowing at once, the cave included, from the water in flight", async () => {
    const frames = openRiver();
    ed.setAutoWater(true);
    // a second source upstream: its water reaches the cave through the trench
    const u = ed.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-000000000002", template: "WaterSource", x: SOURCE.x + 2, y: SOURCE.y - 1, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } });
    expect(u.errors).toEqual([]);
    const v = ed.sessionInfo().version;
    await until(() => frames.some((f) => f.version === v));
    // a newer edit while it flows: the water flows on from where it was, never from the map's older water
    const u2 = ed.apply({ op: "placeEntity", params: { id: "00000000-0000-4000-8000-000000000003", template: "WaterSource", x: SOURCE.x + 4, y: SOURCE.y + 1, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 3, CurrentStrength: 3 } } } });
    expect(u2.errors).toEqual([]);
    const v2 = ed.sessionInfo().version;
    await until(() => !ed.waterSettling());
    const journey = frames.filter((f) => f.version === v2);
    expect(journey.length).toBeGreaterThanOrEqual(5);
    // the cave's columns hold water in the frames (a column under the roof, its floor at the cave's)
    const cave = (f: Frame) => [...f.water.tile].some((t, k) => t === 22 * W + 23 && f.water.floor[k] === CAVE.air[0] && f.water.depth[k] > 0.01);
    expect(journey.some(cave)).toBe(true);
    ed.settleWater();
    const s = ed.collabSession()!;
    const fresh = canonicalSettle(s.built.waterModel);
    expect(Buffer.from(s.built.settle.stack!.depth.buffer).equals(Buffer.from(fresh.stack!.depth.buffer))).toBe(true);
  });

  it("stays as it was where nothing changed: from the settle, rebuilt again and again on the same ground, and after an edit far away (its flows carried, never from rest)", async () => {
    const frames = openRiver();
    const s = ed.collabSession()!;
    const st = s.built.settle.stack!;
    const most = (d: ArrayLike<number>) => {
      let m = 0;
      for (let c = 0; c < d.length; c++) m = Math.max(m, Math.abs(d[c] - st.depth[c]));
      return m;
    };
    // from the settle, its flows taken from the settle's own (as a heightfield's warm start takes its outflows)
    const fresh = new StackLive(s.built.waterModel, st, st, 1000);
    // rebuilt on the same ground every 4 ticks, as a stroke rebuilds it: the momentum carried over each time
    const rebuilt = new StackLive(s.built.waterModel, st, st, 1000);
    try {
      let worst = 0;
      let worstRebuilt = 0;
      for (let t = 4; t <= 600; t += 4) {
        fresh.advance(4);
        rebuilt.advance(4);
        rebuilt.reshape(s.built.waterModel.stacked!.mask.slice());
        worst = Math.max(worst, most(fresh.state().depth));
        worstRebuilt = Math.max(worstRebuilt, most(rebuilt.state().depth));
      }
      expect(worst, "the water run on from its settle").toBeLessThan(0.05);
      expect(worstRebuilt, "the same, rebuilt every 4 ticks").toBeLessThan(0.05);
    } finally {
      fresh.close();
      rebuilt.close();
    }
    // an edit far from the water: the live water's frames hold the river as it was
    ed.setAutoWater(true);
    const before = topOf(ed.sessionView().view.water);
    expect(ed.apply({ op: "sculpt", params: { mode: "flatten", cells: [[4, 34, 36]], level: GROUND - 2 } }, "user", "Lower").errors).toEqual([]);
    const v = ed.sessionInfo().version;
    await until(() => !ed.waterSettling());
    const journey = frames.filter((f) => f.version === v);
    expect(journey.length).toBeGreaterThan(0);
    let worst = 0;
    for (const f of journey) {
      const t = topOf(f.water);
      for (let i = 0; i < N; i++) if (Math.floor(i / W) > 8) worst = Math.max(worst, Math.abs(t[i] - before[i]));
    }
    expect(worst, "the river's water in the frames of an edit far from it").toBeLessThan(0.05);
  });

  it("carries water over to new columns by its floors: the same columns give the same water", () => {
    openRiver();
    const s = ed.collabSession()!;
    const st = s.built.settle.stack!;
    const live = new StackLive(s.built.waterModel, st);
    try {
      const again = carryStack(st, live);
      expect(Array.from(again.depth)).toEqual(Array.from(st.depth));
      expect(Array.from(again.contamination)).toEqual(Array.from(st.contamination));
      // the settle stands still: its run on stops at its first check, the water as it was
      let n = 0;
      while (!live.advance(64) && n++ < 100);
      expect(live.done).toBe(true);
    } finally {
      live.close();
    }
  });
});
