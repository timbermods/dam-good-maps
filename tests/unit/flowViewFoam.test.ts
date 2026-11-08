// The foam threads, wakes and seams are the Flow view's alone (planning's ruling on #236, 2026-11-08, under D497):
// the game's water has no foam term, so outside the Flow view the river is drawn as the game draws it, with none, in
// every look, and the bake makes none of their shapes; in the Flow view they show as before, with its streaks. The
// flow texture the surface moves by is the same either way. (D148: the cues were always on under D353 and D446.)

import { describe, expect, it } from "vitest";
import { Scene, type Mesh, type Points } from "three";
import { WaterMotion } from "../../src/render3d/motion";
import { runBake, type BakeJob, type BakeResult } from "../../src/render3d/high/bake";
import { outflowGrid } from "../../src/render3d/current";
import { overlayTexture, sceneUniforms } from "../../src/render3d/materials";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";
import type { Baker } from "../../src/render3d/high/fields";

const W = 64;
const H = 12;

/** A W x H map with a fast channel on rows 4..7, its settle's outflows all east. */
function river() {
  const depth = new Float32Array(W * H);
  for (let y = 4; y < 8; y++) for (let x = 0; x < W; x++) depth[y * W + x] = 1;
  const heights = new Uint8Array(W * H).fill(5);
  const view = waterFromDepth(heights, depth, new Float32Array(W * H));
  // (four a column, −y, −x, +y, +x: 3 a second east)
  view.outflow = new Float32Array(view.count * 4);
  for (let k = 0; k < view.count; k++) view.outflow[k * 4 + 3] = 3;
  return { heights, sw: surfaceWater(W, H, view) };
}

/** The page's bake worker, on this thread, its jobs kept. */
function baker(jobs: BakeJob[]): Baker {
  let id = 1;
  return {
    run: (job: Omit<BakeJob, "id">) => {
      const full = { ...job, id: id++ } as BakeJob;
      jobs.push(full);
      return Promise.resolve<BakeResult>(runBake(full));
    },
  } as unknown as Baker;
}

const settle = () => new Promise((r) => setTimeout(r, 0));

function motion() {
  const jobs: BakeJob[] = [];
  const scene = new Scene();
  const u = sceneUniforms(W, H, overlayTexture(W, H), overlayTexture(W, H), overlayTexture(W, H), overlayTexture(W, H));
  const m = new WaterMotion(W, H, baker(jobs), scene, u, () => {});
  const cues = scene.getObjectByName("water.cues") as Mesh;
  const streaks = scene.getObjectByName("water.flow") as Points;
  return { m, jobs, cues, streaks };
}

describe("the foam, wakes and seams in the Flow view alone", () => {
  it("outside the Flow view: no foam or streaks drawn, none of their shapes made, the same flow texture", async () => {
    const { heights, sw } = river();
    const off = motion();
    off.m.waterChanged(heights, sw, true);
    await settle();
    expect(off.jobs.map((j) => (j.kind === "flow" ? j.shapes : null))).toEqual([false]);
    expect(off.cues.visible).toBe(false);
    expect(off.streaks.visible).toBe(false);
    expect(off.cues.geometry.getAttribute("position").count).toBe(0);
    expect(off.m.stats).toEqual({ lanes: 0, wakes: 0, seams: 0, streaks: 0, triangles: 0 });
    // the surface's own flow, as the Flow view's bake makes it
    const on = motion();
    on.m.setFlow(true);
    on.m.waterChanged(heights, sw, true);
    await settle();
    expect(Array.from(off.m.flow.image.data as Uint8Array)).toEqual(Array.from(on.m.flow.image.data as Uint8Array));
    // (the river is fast enough for foam: the test's water would show it in the Flow view)
    expect(on.m.stats.triangles).toBeGreaterThan(0);
    // and the whole bake's own: the job without the shapes gives the flow and cave fields of the job with them
    const out = outflowGrid(W, H, sw);
    const job = { id: 1, kind: "flow", W, H, heights, sw, out } as const;
    const a = runBake({ ...job, shapes: false });
    const b = runBake(job);
    expect(a.kind === "flow" && b.kind === "flow" && Array.from(a.flow)).toEqual(b.kind === "flow" && Array.from(b.flow));
  });

  it("the Flow view switched on bakes the shapes at once and shows them; off hides them again", async () => {
    const { heights, sw } = river();
    const { m, jobs, cues, streaks } = motion();
    m.waterChanged(heights, sw, true);
    await settle();
    m.setFlow(true);
    await settle();
    expect(jobs.map((j) => (j.kind === "flow" ? j.shapes : null))).toEqual([false, true]);
    expect(m.ready).toBe(true);
    expect(m.stats.lanes).toBeGreaterThan(0);
    expect(m.stats.triangles).toBeGreaterThan(0);
    expect(cues.visible).toBe(true);
    expect(streaks.visible).toBe(true);
    expect(m.animates).toBe(true);
    m.setFlow(false);
    expect(cues.visible).toBe(false);
    expect(streaks.visible).toBe(false);
    expect(m.animates).toBe(false);
    // back on with the shapes still the last bake's: drawn at once, no bake
    m.setFlow(true);
    expect(cues.visible).toBe(true);
    expect(jobs.length).toBe(2);
  });

  it("switched on while a bake waits to start, it bakes at once with the shapes, and the wait's bake never follows", async () => {
    const g = globalThis as { window?: unknown };
    const had = "window" in g;
    const was = g.window;
    g.window = globalThis;
    try {
      const { heights, sw } = river();
      const { m, jobs, cues } = motion();
      m.waterChanged(heights, sw, true);
      await settle();
      // the water changes again: its bake waits (at least a quarter of a second)
      m.waterChanged(heights, sw);
      expect(m.ready).toBe(false);
      expect(jobs.length).toBe(1);
      m.setFlow(true);
      // (sent at once, not after the wait)
      expect(jobs.map((j) => (j.kind === "flow" ? j.shapes : null))).toEqual([false, true]);
      await settle();
      expect(m.ready).toBe(true);
      expect(cues.visible).toBe(true);
      // (the wait was cleared: no third bake)
      await new Promise((r) => setTimeout(r, 400));
      expect(jobs.length).toBe(2);
    } finally {
      if (had) g.window = was;
      else delete g.window;
    }
  });

  it("switched on while a bake without the shapes is out, its answer is dropped for the one with them", async () => {
    const { heights, sw } = river();
    const { m, jobs, cues } = motion();
    // (the first bake sent, its answer not yet back)
    m.waterChanged(heights, sw, true);
    m.setFlow(true);
    expect(jobs.map((j) => (j.kind === "flow" ? j.shapes : null))).toEqual([false, true]);
    await settle();
    expect(m.ready).toBe(true);
    expect(m.stats.triangles).toBeGreaterThan(0);
    expect(cues.visible).toBe(true);
  });
});
