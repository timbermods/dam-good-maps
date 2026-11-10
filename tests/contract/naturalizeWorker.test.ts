// Naturalize's weathering in a worker of its own (D422, #868): the page sends the stroke's start with its own
// terrain and shown heights, and the worker weathers on them. Before, the map's worker weathered it on the map as
// it held it. The operation is the same, byte for byte, and the map it builds is the land the page showed: on a
// generated map and on a map with a cave and an overhang.

import { describe, expect, it } from "vitest";
import { writeTimber } from "../../src/core/format/timber";
import type { BrushParams } from "../../src/core/features/raster/brush";
import { groundUnderObjects } from "../../src/core/features/raster/objectGround";
import { RemotePreview, WeatherStroke, type WeatherChannel, type WeatheredLand } from "../../src/core/features/raster/remoteStroke";
import { StrokePreview } from "../../src/core/features/raster/strokePreview";
import type { Rect } from "../../src/core/features/raster/brush";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { CAVE_H, CAVE_W, caveFile } from "./caveMap";

/** A worker's answer: after a turn, as a message's comes. */
const turn = <T>(f: () => T) => new Promise<T>((resolve) => setTimeout(() => resolve(f()), 0));

/** The map's worker weathering the stroke, as it did before #868 (session.ts `weatherBegin`, `weatherAdd`, …, taken
 *  out with it): a preview of its own on the map's terrain and heights as the session holds them. */
function mapWorker(W: number, H: number): WeatherChannel {
  let w: { preview: StrokePreview; shown: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null = null;
  const land = (r: Rect | null): WeatheredLand | null => {
    if (!r || !w) return null;
    const bw = r.x1 - r.x0 + 1;
    const heights = new Uint8Array(bw * (r.y1 - r.y0 + 1));
    for (let y = r.y0; y <= r.y1; y++) heights.set(w.shown.subarray(y * W + r.x0, y * W + r.x1 + 1), (y - r.y0) * bw);
    return { rect: r, heights, settings: { ...w.settings } };
  };
  return {
    begin: (settings, ground) =>
      turn(() => {
        const s = ed.collabSession()!;
        const shown = s.built.heights.slice();
        const own = { ...settings };
        w = { preview: new StrokePreview(own, s.terrainState(), shown, W, H, ground.map((r) => [r[0], r[1], r[2]])), shown, settings: own };
      }),
    add: (dabs, pressure) => turn(() => land(w!.preview.add(dabs, pressure))),
    finish: (rigid) => turn(() => land(w!.preview.finish(rigid))),
    end: () => turn(() => ({ pre: w!.preview.pre.slice(), protect: w!.preview.protect.slice(), settings: { ...w!.settings } })),
    cancel: () => void (w = null),
  };
}

/** Naturalize's own worker (naturalize.worker.ts): the page's terrain and shown heights go with the start, copied as
 *  a message copies them. */
function ownWorker(terrain: ReturnType<typeof ed.terrainNow>["terrain"], W: number, H: number): WeatherChannel {
  let w: WeatherStroke | null = null;
  return {
    begin: (settings, ground, ...rest) => {
      void rest;
      const sent = structuredClone({ settings, ground, terrain });
      return turn(() => void (w = new WeatherStroke(sent.settings, sent.terrain, structuredClone(shownAtBegin!), W, H, sent.ground.map((r) => [r[0], r[1], r[2]]))));
    },
    add: (dabs, pressure) => turn(() => structuredClone(w!.add(dabs, pressure))),
    finish: (rigid) => turn(() => structuredClone(w!.finish(rigid))),
    end: () => turn(() => structuredClone(w!.end())),
    cancel: () => void (w = null),
  };
}
/** The page's shown heights as the stroke begins (what the page sends with it). */
let shownAtBegin: Uint8Array | null = null;

const settings = (): Omit<BrushParams, "dabs"> => ({ tool: "naturalize", size: 5, strength: 10, seed: 11, weathers: true });

/** Quarter tiles along a path through these points, a fifth of the brush apart, then held at its end. */
function along(points: [number, number][]): number[] {
  const out: number[] = [];
  for (let k = 1; k < points.length; k++) {
    const [ax, ay] = points[k - 1];
    const [bx, by] = points[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let j = 0; j < n; j++) out.push(Math.round((ax + ((bx - ax) * j) / n) * 4), Math.round((ay + ((by - ay) * j) / n) * 4));
  }
  const [lx, ly] = points[points.length - 1];
  for (let k = 0; k < 6; k++) out.push(Math.round(lx * 4), Math.round(ly * 4));
  return out;
}

/** The page painting a stroke through `channel`, its dabs a frame's worth at a time and the worker answering now and
 *  then (so calls carry batches): the land shown, the heights before the integrity pass, the protected tiles and the
 *  operation it sends. */
async function paint(channel: WeatherChannel, heights: Uint8Array, terrain: ReturnType<typeof ed.terrainNow>["terrain"], W: number, H: number, ground: [number, number, number][], dabs: number[]) {
  const shown = heights.slice();
  shownAtBegin = shown.slice();
  const record = settings();
  const p = new RemotePreview(record, shown, W, H, ground, channel, () => {}, terrain.pre.slice(), terrain.protect);
  for (let k = 0; k < dabs.length; k += 4) {
    p.add(dabs.slice(k, k + 4));
    if (k % 12 === 8) await new Promise((r) => setTimeout(r, 0));
  }
  p.finish([]);
  await p.done();
  const params: BrushParams = { ...record, dabs };
  return { shown, pre: p.pre, protect: p.protect, params, changed: p.changed() };
}

async function compare(W: number, H: number, dabs: number[]) {
  const s = ed.collabSession()!;
  const ground = groundUnderObjects(s.built.entities);
  // (the page's terrain and land, as the session hands them to it)
  const { heights, terrain } = ed.terrainNow();
  const before = await paint(mapWorker(W, H), heights, terrain, W, H, ground, dabs);
  const after = await paint(ownWorker(terrain, W, H), heights, terrain, W, H, ground, dabs);
  expect(before.changed).toBeGreaterThan(0);
  expect(before.params.weathering).toBeDefined();
  expect(JSON.stringify(after.params)).toBe(JSON.stringify(before.params));
  expect(Buffer.from(after.shown).equals(Buffer.from(before.shown))).toBe(true);
  expect(Buffer.from(after.pre).equals(Buffer.from(before.pre))).toBe(true);
  expect(Buffer.from(after.protect).equals(Buffer.from(before.protect))).toBe(true);
  // the operation builds the land the page showed (D422)
  const u = ed.apply({ op: "brush", params: after.params }, "user", "Naturalize");
  expect(u.ok).toBe(true);
  expect(Buffer.from(ed.terrainNow().heights).equals(Buffer.from(after.shown))).toBe(true);
}

describe("Naturalize in its own worker builds the operation the map's worker built (#868)", () => {
  it("on a generated map", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 9, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    await compare(W, W, along([[18, 30], [40, 42], [60, 36], [78, 58], [70, 74]]));
  });

  it("on a map with a cave and an overhang", async () => {
    ed.openTimber(writeTimber(caveFile()), "cave.timber");
    await compare(CAVE_W, CAVE_H, along([[10, 17], [24, 17], [34, 17], [34, 9], [26, 9]]));
  });
});
