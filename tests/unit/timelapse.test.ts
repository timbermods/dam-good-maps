// The time-lapse's video file and timeline (src/editor/timelapse/): the WebM the writer makes reads back with every
// frame, its length and its key frames; the plan fits any history in about a minute, its frame count known before
// the first frame; the camera glides (never cuts) from the opening to the hero view; and the ending eases the
// replay's water and soil into the finished map's, never snapping.

import { describe, expect, it } from "vitest";
import { blendSoil, blendWater, easeIn } from "../../src/editor/timelapse/blend";
import { lapseCamera } from "../../src/editor/timelapse/camera";
import { FPS, lapsePlan } from "../../src/editor/timelapse/plan";
import { WebmWriter, webmFacts } from "../../src/editor/timelapse/webm";
import type { LapseStep } from "../../src/core/doc/timelapse";
import type { EntityView, WaterView } from "../../src/render3d/model";

async function bytesOf(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

describe("the WebM writer", () => {
  it("writes every frame, its key frames and its length, and reads them back", async () => {
    const w = new WebmWriter({ codec: "V_VP9", width: 320, height: 180, fps: FPS });
    const n = 95;
    for (let f = 0; f < n; f++) w.add(new Uint8Array(40 + (f % 7) * 300).fill(f & 0xff), Math.round((f * 1e6) / FPS), f % 30 === 0);
    expect(w.count).toBe(n);
    const facts = webmFacts(await bytesOf(w.finish()));
    expect(facts).toMatchObject({ codec: "V_VP9", width: 320, height: 180, frames: n, keyFrames: 4, clusters: 4 });
    expect(facts.durationMs).toBeCloseTo((n * 1000) / FPS, 0);
  });

  it("starts a new cluster before a block's time outgrows its 16 bits", async () => {
    // (one key frame, then two minutes of frames: the clusters split every 30 s)
    const w = new WebmWriter({ codec: "V_VP8", width: 64, height: 36, fps: 1 });
    for (let s = 0; s <= 120; s++) w.add(new Uint8Array(8), s * 1e6, s === 0);
    const facts = webmFacts(await bytesOf(w.finish()));
    expect(facts.frames).toBe(121);
    expect(facts.keyFrames).toBe(1);
    expect(facts.clusters).toBeGreaterThanOrEqual(4);
  });

  it("refuses a video that does not start on a key frame", () => {
    const w = new WebmWriter({ codec: "V_VP9", width: 64, height: 36, fps: FPS });
    expect(() => w.add(new Uint8Array(4), 0, false)).toThrow(/key frame/);
  });
});

const box = (x: number, y: number, r = 4) => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
function history(n: number, W: number, seed = 1): Pick<LapseStep, "kind" | "place">[] {
  const kinds: LapseStep["kind"][] = ["land", "force", "objects", "water", "land", "other"];
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  return Array.from({ length: n }, (_, k) => ({ kind: kinds[k % kinds.length], place: k % 9 === 8 ? null : box(8 + Math.floor(rand() * (W - 16)), 8 + Math.floor(rand() * (W - 16))) }));
}

describe("the time-lapse's timeline", () => {
  it("plays a short history about a second and a half a step and a long one in about a minute", () => {
    const short = lapsePlan(history(4, 128), 128, 128);
    expect(short.frames / FPS).toBeGreaterThan(8);
    expect(short.frames / FPS).toBeLessThan(20);
    for (const n of [60, 400, 3000]) {
      const long = lapsePlan(history(n, 256), 256, 256);
      expect(long.frames / FPS).toBeGreaterThan(40);
      expect(long.frames / FPS).toBeLessThan(90);
    }
  });

  it("places every step in order inside its scene, and the ending after them", () => {
    const p = lapsePlan(history(120, 192), 192, 192);
    let at = p.intro;
    for (const s of p.steps) {
      const scene = p.scenes[s.scene];
      expect(s.from).toBeGreaterThanOrEqual(at);
      expect(s.from).toBeGreaterThanOrEqual(scene.from);
      expect(s.to).toBeLessThanOrEqual(scene.to);
      expect(s.until).toBeGreaterThanOrEqual(s.to);
      at = s.to;
    }
    expect(p.outro.tail).toBe(at);
    expect(p.outro.tail).toBeLessThan(p.outro.glide);
    expect(p.outro.glide).toBeLessThan(p.outro.hold);
    expect(p.outro.hold).toBeLessThan(p.frames);
  });

  it("is the same plan every time", () => {
    const h = history(50, 128);
    expect(lapsePlan(h, 128, 128)).toEqual(lapsePlan(h, 128, 128));
  });
});

describe("the time-lapse's camera", () => {
  const W = 128;
  const heights = new Uint8Array(W * W).fill(8);
  const start: EntityView = { count: 1, templates: ["StartingLocation"], template: new Uint16Array([0]), x: new Int16Array([60]), y: new Int16Array([40]), z: new Int16Array([8]), orientation: new Uint8Array([2]) } as unknown as EntityView;

  it("never cuts: from frame to frame it moves a little, and ends still on the hero view", () => {
    const p = lapsePlan(history(30, W), W, W);
    const cam = lapseCamera(p, heights, W, W, start);
    let prev = cam(0);
    let worst = 0;
    for (let f = 1; f < p.frames; f++) {
      const v = cam(f);
      // the target's move against how far back the camera stands, and the zoom's
      const move = Math.hypot(v.target[0] - prev.target[0], v.target[1] - prev.target[1], v.target[2] - prev.target[2]) / v.distance;
      worst = Math.max(worst, move, Math.abs(Math.log(v.distance / prev.distance)), Math.abs(v.yaw - prev.yaw), Math.abs(v.pitch - prev.pitch));
      prev = v;
    }
    expect(worst).toBeLessThan(0.08);
    const last = cam(p.frames - 1);
    const held = cam(p.outro.hold);
    expect(last.yaw).toBeCloseTo(held.yaw, 6);
    expect(last.pitch).toBeCloseTo(held.pitch, 6);
  });

  it("is a slow drone, never a turntable: one pitch, a little turn, and nearby edits in one framing", () => {
    const p = lapsePlan(history(30, W), W, W);
    const cam = lapseCamera(p, heights, W, W, start);
    // (one pitch until the glide to the hero view; the heading turns at most 20° over the whole video, one way)
    const yaws: number[] = [];
    for (let f = 0; f < p.outro.glide; f++) {
      expect(cam(f).pitch).toBeCloseTo(cam(0).pitch, 9);
      yaws.push(cam(f).yaw);
    }
    expect(Math.abs(cam(p.frames - 1).yaw - cam(0).yaw)).toBeLessThanOrEqual((20 * Math.PI) / 180 + 1e-9);
    for (let k = 1; k < yaws.length; k++) expect(yaws[k]).toBeGreaterThanOrEqual(yaws[k - 1]);
    // edits close together (each within a few tiles of the last) never move the camera's target between them
    const near = Array.from({ length: 12 }, (_, k) => ({ kind: "land" as const, place: box(40 + (k % 3) * 3, 50 + (k % 2) * 3) }));
    const q = lapsePlan(near, W, W);
    const c2 = lapseCamera(q, heights, W, W, start);
    const first = q.scenes[0];
    const inside = q.scenes.flatMap((s) => [s.glide, s.from, s.to - 1]).filter((f) => f >= first.from && f < q.outro.glide);
    for (const f of inside) {
      expect(c2(f).target[0]).toBeCloseTo(c2(first.from).target[0], 6);
      expect(c2(f).target[2]).toBeCloseTo(c2(first.from).target[2], 6);
    }
  });
});

describe("the ending's ease", () => {
  const water = (cols: [number, number, number, number][], flows?: number[]): WaterView => ({
    count: cols.length,
    tile: Int32Array.from(cols.map((c) => c[0])),
    floor: Float32Array.from(cols.map((c) => c[1])),
    depth: Float32Array.from(cols.map((c) => c[2])),
    contamination: Float32Array.from(cols.map((c) => c[3])),
    ...(flows ? { outflow: Float32Array.from(flows) } : {}),
  });

  it("mixes each column's water, grows and dries the columns one side has, and ends as the map's own", () => {
    // tile 3 in both; tile 5 only filling (a), tile 9 only in the map (b); tile 3 under a cave at floor 2 in b only
    const a = water([[3, 4, 1, 0], [5, 4, 0.5, 1]], [1, 0, 0, 0, 0, 2, 0, 0]);
    const b = water([[3, 2, 0.4, 0], [3, 4, 2, 0.5], [9, 6, 1, 0]], [0, 0, 0, 0, 0, 0, 0, 3, 4, 0, 0, 0]);
    expect(blendWater(a, b, 0)).toBe(a);
    expect(blendWater(a, b, 1)).toBe(b);
    const m = blendWater(a, b, 0.25);
    const at = (t: number, fl: number) => [...m.tile].findIndex((v, k) => v === t && m.floor[k] === fl);
    expect(m.count).toBe(4);
    expect([...m.tile]).toEqual([3, 3, 5, 9]);
    expect(m.depth[at(3, 4)]).toBeCloseTo(1.25, 6);
    expect(m.contamination[at(3, 4)]).toBeCloseTo((0.5 * 0.25 * 2) / 1.25, 6);
    expect(m.depth[at(5, 4)]).toBeCloseTo(0.375, 6);
    expect(m.contamination[at(5, 4)]).toBeCloseTo(1, 6);
    expect(m.depth[at(9, 6)]).toBeCloseTo(0.25, 6);
    expect(m.depth[at(3, 2)]).toBeCloseTo(0.1, 6);
    // (before halfway the filling water's outflows; a column it lacks flows nowhere)
    expect([...m.outflow!.slice(at(5, 4) * 4, at(5, 4) * 4 + 4)]).toEqual([0, 2, 0, 0]);
    expect([...m.outflow!.slice(at(9, 6) * 4, at(9, 6) * 4 + 4)]).toEqual([0, 0, 0, 0]);
    const late = blendWater(a, b, 0.75);
    const k = [...late.tile].findIndex((v, j) => v === 3 && late.floor[j] === 4);
    expect([...late.outflow!.slice(k * 4, k * 4 + 4)]).toEqual([0, 0, 0, 3]);
    // (never a step bigger than the ease's own between two views)
    let worst = 0;
    for (let s = 1; s <= 20; s++) {
      const p = blendWater(a, b, (s - 1) / 20);
      const q = blendWater(a, b, s / 20);
      const d = (w: WaterView, t: number, fl: number) => {
        const j = [...w.tile].findIndex((v, i) => v === t && w.floor[i] === fl);
        return j < 0 ? 0 : w.depth[j];
      };
      for (const [t, fl] of [[3, 4], [5, 4], [9, 6], [3, 2]]) worst = Math.max(worst, Math.abs(d(q, t, fl) - d(p, t, fl)));
    }
    expect(worst).toBeLessThanOrEqual(1 / 20 + 1e-6);
  });

  it("greens the soil tile by tile and eases in smoothly over its frames", () => {
    const a = { moisture: Uint8Array.from([0, 100, 200]), contamination: Uint8Array.from([0, 0, 50]) };
    const b = { moisture: Uint8Array.from([200, 100, 0]), contamination: Uint8Array.from([0, 0, 150]) };
    const m = blendSoil(a, b, 0.5);
    expect([...m.moisture]).toEqual([100, 100, 100]);
    expect([...m.contamination]).toEqual([0, 0, 100]);
    expect(blendSoil(a, b, 1)).toBe(b);
    expect(blendSoil(a, { moisture: new Uint8Array(4), contamination: new Uint8Array(4) }, 0.3).moisture.length).toBe(4);
    expect(easeIn(10, 10, 40)).toBe(0);
    expect(easeIn(40, 10, 40)).toBe(1);
    expect(easeIn(25, 10, 40)).toBeCloseTo(0.5, 6);
    for (let f = 10; f < 40; f++) expect(easeIn(f + 1, 10, 40)).toBeGreaterThanOrEqual(easeIn(f, 10, 40));
  });
});
