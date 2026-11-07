// The time-lapse's video file and timeline (src/editor/timelapse/): the WebM the writer makes reads back with every
// frame, its length and its key frames; the plan fits any history in about a minute, its frame count known before
// the first frame; and the camera glides (never cuts) from the opening to the hero view.

import { describe, expect, it } from "vitest";
import { lapseCamera } from "../../src/editor/timelapse/camera";
import { FPS, lapsePlan } from "../../src/editor/timelapse/plan";
import { WebmWriter, webmFacts } from "../../src/editor/timelapse/webm";
import type { LapseStep } from "../../src/core/doc/timelapse";
import type { EntityView } from "../../src/render3d/model";

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
});
