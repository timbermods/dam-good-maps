// The light look's flow texture (stillFlow.ts, D453): the badwater share and the waterfall mask worked out off the
// page's thread, one job at a time and at most every STILL_FLOW_WAIT ms while the water moves, and exactly the texture
// built from the final water once it stops, however the jobs and the changes interleave.

import { afterEach, describe, expect, it, vi } from "vitest";
import { shareBytes, stillBytes } from "../../src/render3d/high/bake";
import { surfaceWater, waterFromDepth, type SurfaceWater } from "../../src/render3d/model";
import { stillFlowTexture } from "../../src/render3d/motion";
import { STILL_FLOW_WAIT, StillFlow, type ShareJob } from "../../src/render3d/stillFlow";
import { DataTexture, Scene } from "three";
import { sceneUniforms } from "../../src/render3d/materials";
import { WaterMotion } from "../../src/render3d/motion";
import { shareByte } from "../../src/render3d/high/flow";

const W = 40;
const H = 30;

/** A small seeded random. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Land in a few levels, and water on it: pools and films, clean, bad and mixed. */
function land(rand: () => number): Uint8Array {
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) h[y * W + x] = 4 + (x > 25 ? 1 : 0) + (rand() < 0.05 ? 1 : 0);
  return h;
}
const water = (heights: Uint8Array, depth: Float32Array, cont: Float32Array): SurfaceWater => surfaceWater(W, H, waterFromDepth(heights, depth, cont));
/** The water changed in a box (a seep's film spreading, a front moving). */
function change(rand: () => number, depth: Float32Array, cont: Float32Array, whole = false): void {
  const x0 = whole ? 0 : Math.floor(rand() * W);
  const y0 = whole ? 0 : Math.floor(rand() * H);
  const w = whole ? W : 1 + Math.floor(rand() * 8);
  const h = whole ? H : 1 + Math.floor(rand() * 8);
  for (let y = y0; y < Math.min(H, y0 + h); y++)
    for (let x = x0; x < Math.min(W, x0 + w); x++) {
      const r = rand();
      depth[y * W + x] = r < 0.3 ? 0 : r < 0.6 ? rand() * 0.1 : rand() * 1.5;
      cont[y * W + x] = rand() < 0.5 ? 0 : rand() < 0.5 ? 1 : rand();
    }
}
const shares = (t: { image: { data: unknown } }) => (t.image.data as Uint8Array).filter((_, k) => k % 4 === 2);
/** The whole texture: the share (B) and the waterfall mask (A) with the still current (RG). */
const texels = (t: { image: { data: unknown } }) => Array.from(t.image.data as Uint8Array);

afterEach(() => vi.useRealTimers());

describe("the light look's flow texture", () => {
  it("works the share and the waterfall mask out as the moving looks' flow texture packs them", () => {
    const rand = random(3);
    const heights = land(rand);
    const depth = new Float32Array(W * H);
    const cont = new Float32Array(W * H);
    change(rand, depth, cont, true);
    const sw = water(heights, depth, cont);
    const flow = new StillFlow(W, H, () => Promise.reject(new Error("no job")));
    flow.start(sw);
    expect(texels(flow.texture)).toEqual(texels(stillFlowTexture(W, H, sw)));
    expect(Array.from(shareBytes(W, H, sw))).toEqual(Array.from(shares(stillFlowTexture(W, H, sw))));
    // (the land steps a level at x 26: the water there has falls, and their landing tiles a mask)
    expect((stillFlowTexture(W, H, sw).image.data as Uint8Array).some((v, k) => k % 4 === 3 && v > 1)).toBe(true);
  });

  it("sends one job at a time, at most every STILL_FLOW_WAIT ms, and once the water stops is the texture built from the final water", async () => {
    vi.useFakeTimers();
    for (const [seed, latency] of [[11, 5], [12, 120], [13, 600]] as const) {
      const rand = random(seed);
      const heights = land(rand);
      const depth = new Float32Array(W * H);
      const cont = new Float32Array(W * H);
      change(rand, depth, cont, true);
      let out = 0;
      let most = 0;
      const sent: number[] = [];
      // (the worker: an answer `latency` ms later)
      const job: ShareJob = (w, h, sw) => {
        out++;
        most = Math.max(most, out);
        sent.push(performance.now());
        return new Promise((resolve) => setTimeout(() => (out--, resolve(stillBytes(w, h, sw))), latency));
      };
      let drawn = 0;
      let rows = 0;
      const flow = new StillFlow(W, H, job, (_x0, y0, _x1, y1) => (rows += y1 - y0 + 1), () => drawn++);
      flow.start(water(heights, depth, cont));
      // two seconds of changes, one every 20 ms, the water changing in place between some of them
      for (let t = 0; t < 2000; t += 20) {
        change(rand, depth, cont);
        flow.update(water(heights, depth, cont));
        await vi.advanceTimersByTimeAsync(20);
      }
      await vi.advanceTimersByTimeAsync(STILL_FLOW_WAIT + latency * 2 + 50);
      expect(most).toBe(1);
      for (let k = 1; k < sent.length; k++) expect(sent[k] - sent[k - 1]).toBeGreaterThanOrEqual(STILL_FLOW_WAIT);
      expect(sent.length).toBeLessThanOrEqual(Math.ceil(2000 / STILL_FLOW_WAIT) + 2);
      expect(drawn).toBeGreaterThan(0);
      expect(rows).toBeGreaterThan(0);
      expect(texels(flow.texture), `answers ${latency} ms late`).toEqual(texels(stillFlowTexture(W, H, water(heights, depth, cont))));
      flow.dispose();
    }
  });

  it("drops an answer that comes after the map is gone", async () => {
    vi.useFakeTimers();
    const rand = random(5);
    const heights = land(rand);
    const depth = new Float32Array(W * H);
    const cont = new Float32Array(W * H);
    change(rand, depth, cont, true);
    let drawn = 0;
    const flow = new StillFlow(W, H, (w, h, sw) => new Promise((r) => setTimeout(() => r(stillBytes(w, h, sw)), 100)), undefined, () => drawn++);
    flow.start(water(heights, depth, cont));
    change(rand, depth, cont, true);
    flow.update(water(heights, depth, cont));
    await vi.advanceTimersByTimeAsync(10);
    flow.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(drawn).toBe(0);
  });

  it("sets the share at once for water put in place (a Compare flip), and drops a job's late answer from before it", async () => {
    vi.useFakeTimers();
    const rand = random(17);
    const heights = land(rand);
    const depth = new Float32Array(W * H);
    const cont = new Float32Array(W * H);
    change(rand, depth, cont, true);
    let drawn = 0;
    const flow = new StillFlow(W, H, (w, h, sw) => new Promise((r) => setTimeout(() => r(stillBytes(w, h, sw)), 100)), undefined, () => drawn++);
    flow.start(water(heights, depth, cont));
    // moving water: a job goes out on it
    change(rand, depth, cont, true);
    flow.update(water(heights, depth, cont));
    await vi.advanceTimersByTimeAsync(10);
    // the flip: the other version's water, its share in the same frame
    change(rand, depth, cont, true);
    const flipped = water(heights, depth, cont);
    flow.update(flipped, true);
    expect(texels(flow.texture)).toEqual(texels(stillFlowTexture(W, H, flipped)));
    // the job from before the flip answers late: dropped
    await vi.advanceTimersByTimeAsync(500);
    expect(drawn).toBe(0);
    expect(texels(flow.texture)).toEqual(texels(stillFlowTexture(W, H, flipped)));
    flow.dispose();
  });

  it("draws the latest water's badwater share on the frame after it comes, before any job answers (#865's review)", async () => {
    vi.useFakeTimers();
    const rand = random(19);
    const heights = land(rand);
    const depth = new Float32Array(W * H);
    const cont = new Float32Array(W * H);
    change(rand, depth, cont, true);
    const touched: number[][] = [];
    const flow = new StillFlow(W, H, (w, h, sw) => new Promise((r) => setTimeout(() => r(stillBytes(w, h, sw)), 400)), (...r) => touched.push(r));
    flow.start(water(heights, depth, cont));
    for (let k = 0; k < 4; k++) {
      // badwater poured onto dry ground and a front moving: each tile's share and wetness in the texture at once, its
      // rows sent with the next frame, while the job on it (or an older one) is still out
      change(rand, depth, cont);
      const sw = water(heights, depth, cont);
      touched.length = 0;
      flow.update(sw);
      expect(touched.length).toBeGreaterThan(0);
      expectCurrent(flow.texture.image.data as Uint8Array, sw);
      await vi.advanceTimersByTimeAsync(120);
      expectCurrent(flow.texture.image.data as Uint8Array, sw);
    }
    // once the water stops, the texture built from it whole
    await vi.advanceTimersByTimeAsync(2000);
    const last = water(heights, depth, cont);
    expect(texels(flow.texture)).toEqual(texels(stillFlowTexture(W, H, last)));
    flow.dispose();
  });
});

/** Every wet tile's share in B and a wet A, every dry tile's A 0. */
function expectCurrent(data: Uint8Array, sw: SurfaceWater): void {
  for (let i = 0; i < W * H; i++) {
    const wet = sw.surface[i] === sw.surface[i] && sw.depth[i] > 0;
    if (wet) {
      expect(data[i * 4 + 2], `tile ${i}`).toBe(shareByte(sw.contamination[i]));
      expect(data[i * 4 + 3], `tile ${i}`).toBeGreaterThan(0);
    } else expect(data[i * 4 + 3], `tile ${i}`).toBe(0);
  }
}

describe("the moving water's flow texture (motion.ts)", () => {
  it("draws the latest water's badwater share on the frame after it comes, never a bake behind it (#865's review)", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    try {
      const rand = random(23);
      const heights = land(rand);
      const depth = new Float32Array(W * H);
      const cont = new Float32Array(W * H);
      change(rand, depth, cont, true);
      // a worker that answers each bake 1.5 s late, with the flow texture's bytes for the water it was sent
      const baker = { run: (job: { W: number; H: number; sw: SurfaceWater }) => new Promise((r) => setTimeout(() => r({ kind: "flow", flow: stillFlowTexture(job.W, job.H, job.sw).image.data, shapes: null, cave: null, ms: 0 }), 1500)) };
      const t = () => new DataTexture(new Uint8Array(4), 1, 1);
      const touched: number[][] = [];
      const motion = new WaterMotion(W, H, baker as never, new Scene(), sceneUniforms(W, H, t(), t(), t(), t()), () => {}, () => null, (...r) => touched.push(r));
      (motion as unknown as { setShapes: () => void }).setShapes = () => {};
      motion.waterChanged(heights, water(heights, depth, cont), true);
      for (let k = 0; k < 4; k++) {
        change(rand, depth, cont);
        const sw = water(heights, depth, cont);
        touched.length = 0;
        motion.waterChanged(heights, sw);
        expect(touched.length).toBeGreaterThan(0);
        expectCurrent(motion.flow.image.data as Uint8Array, sw);
        // (a bake of older water answering meanwhile leaves the latest's share in place)
        await vi.advanceTimersByTimeAsync(700);
        expectCurrent(motion.flow.image.data as Uint8Array, sw);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

