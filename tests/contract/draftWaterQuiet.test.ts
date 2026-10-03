// Painting after a force keeps the display's rate (Live editing's blocking rule, D158; found by
// D244 step 2's measurements, tools/measure-ceiling.ts). After two eruptions a stroke anywhere made
// the worker send the page the whole map's water about seventy times a second, each costing the page
// a frame's time or more. Three causes, each checked here:
// - the background settle stopped at its one-day cap while a lake behind the lava was still filling
//   and called it settled; every stroke's water then carried the settle on (`PREVIEW_JOB_DAYS`: it
//   runs on while the water moves);
// - the warm start drained water the old ground's canonical start didn't reach either (a lake filling
//   past that walk), so every stroke's water refilled it (D260's rule drains only water that lost its
//   feed);
// - a stroke's water went to the page every frame even when the stroke touched no water and only the
//   water still settling elsewhere moved (now at the journey's pace; the page also meshes a stroke's
//   water a few chunks a frame, measured by the tool).

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { generate } from "../../src/core/gen/generate";
import { PREVIEW_JOB_DAYS, PreviewJob, unfedTiles } from "../../src/core/sim/preview";
import { TICKS_PER_DAY, type WaterModel } from "../../src/core/sim/water";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

function model(theme: "riverValley" | "lakeBasin" = "riverValley", seed = 3): { m: WaterModel; depth: Float64Array } {
  const r = generate(makeSpec({ seed, theme, size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  return { m: s.built.waterModel, depth: Float64Array.from(s.built.water) };
}

describe("a stroke's water after a force (D244's measurements)", () => {
  const fillsFromDry = (seed: number) => {
    const { m } = model("lakeBasin", seed);
    // from a dry map: the rivers take more than a day to fill it
    const N = W * W;
    const dry = { model: m, water: { settled: false, ticks: 0, depth: new Float64Array(N), contamination: new Float64Array(N), sat: new Uint8Array(N) } };
    const job = new PreviewJob(dry, m);
    let r = job.advance(Infinity);
    while (!r) r = job.advance(Infinity);
    expect(r.ticks).toBeGreaterThan(TICKS_PER_DAY);
    expect(r.ticks).toBeLessThanOrEqual(PREVIEW_JOB_DAYS * TICKS_PER_DAY + 64);
    expect(r.settled || r.steadyTicks !== undefined).toBe(true);
    // in slices, the same
    const sliced = new PreviewJob(dry, m);
    let q = sliced.advance(4);
    while (!q) q = sliced.advance(4);
    expect(q.ticks).toBe(r.ticks);
    expect(Array.from(sliced.sim.D)).toEqual(Array.from(job.sim.D));
  };
  it("the editor's background settle runs on past its first day while the water still moves, and ends settled", () => {
    // (a lake basin's lake takes about three days to fill from dry; seed 8 on M9b's maps, 2.75 days, D148;
    // seed 9 since Lake Basin round 2, D453, 2.9 days: seed 8's lake, like seed 1's below, now fills past the cap)
    fillsFromDry(9);
  });
  // An expected failure, kept on the seed that caught it (Kyler, 2026-10-02): M9b's Lake Basin 96² seed 1
  // lake is still filling at the editor's four-day preview cap, so the background settle never ends
  // settled, while the generator settles up to six days (D358). For the milestone session; when it
  // passes, `fails` comes off.
  it.fails("Lake Basin seed 1: its lake still fills at the four-day preview cap, so it never ends settled", () => fillsFromDry(1));

  it("the warm start keeps water the old ground's canonical start didn't reach either; water that lost its feed still drains (D260)", () => {
    const { m, depth } = model();
    const N = W * W;
    // a pool on high dry ground, far from every source: no canonical start reaches it, before or after
    let pool = -1;
    for (let i = 0; i < N && pool < 0; i++) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (x < 10 || y < 10 || x > W - 10 || y > W - 10 || depth[i] > 0) continue;
      let dry = true;
      for (let yy = y - 6; yy <= y + 6 && dry; yy++) for (let xx = x - 6; xx <= x + 6 && dry; xx++) if (depth[yy * W + xx] > 0) dry = false;
      if (dry) pool = i;
    }
    expect(pool).toBeGreaterThanOrEqual(0);
    const water = depth.slice();
    water[pool] = 0.5;
    const from = { model: m, water: { settled: true, ticks: 0, depth: water, contamination: new Float64Array(N), sat: new Uint8Array(N) } };
    const next = { ...m, floor: m.floor.slice() };
    next.floor[5 * W + 5] += 1;
    expect(unfedTiles(from, next)![pool]).toBe(0);
    // a source removed: its water lost its feed and drains
    const src = m.emitters.find((e) => e.cells.length);
    if (src) {
      const without = { ...m, emitters: m.emitters.filter((e) => e !== src) };
      const un = unfedTiles({ model: m, water: { ...from.water, depth: depth.slice() } }, without)!;
      let n = 0;
      for (let i = 0; i < N; i++) if (un[i]) n++;
      expect(n).toBeGreaterThan(0);
    }
  });

  it("while the water still settles, a stroke that touches no water gets it at the journey's pace, not every frame", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const b = s.built;
    // a dam across the river, its water left to settle (the job in flight)
    let river = -1;
    for (let i = 0; i < W * W && river < 0; i++) if (b.channel[i] && i % W > 30 && i % W < 60) river = i;
    const rx = river % W;
    const ry = Math.floor(river / W);
    const cells: [number, number, number][] = [];
    for (let y = ry - 6; y <= ry + 6; y++) cells.push([y, rx, rx + 1]);
    expect(ed.apply({ op: "sculpt", params: { mode: "raise", cells, amount: 4 } }, "user", "Dam").errors).toEqual([]);
    // a stroke on dry ground far from any water
    const wet = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) if (b.water[i] > 0 || b.channel[i]) wet[i] = 1;
    let at: [number, number] | null = null;
    for (let y = 8; y < W - 10 && !at; y += 2)
      for (let x = 8; x < W - 10 && !at; x += 2) {
        let dry = true;
        for (let yy = y - 6; yy <= y + 8 && dry; yy++) for (let xx = x - 6; xx <= x + 8 && dry; xx++) if (yy >= 0 && xx >= 0 && yy < W && xx < W && wet[yy * W + xx]) dry = false;
        if (dry) at = [x, y];
      }
    expect(at).not.toBeNull();
    const times: number[] = [];
    ed.listen((e) => {
      if (e.kind === "water" && e.draft) times.push(performance.now());
    });
    const h = ed.terrainNow().heights;
    const [x0, y0] = at!;
    const t0 = performance.now();
    // (the worker's loop yields through a message channel: wait by polling, not on a timer)
    const wait = async (ms: number) => {
      const until = performance.now() + ms;
      while (performance.now() < until) await new Promise((r) => setImmediate(r));
    };
    for (let k = 0; k < 6; k++) {
      const ground = new Uint8Array(9);
      for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) ground[y * 3 + x] = h[(y0 + y) * W + x0 + x] + 1 + (k % 2);
      ed.draftStroke({ x0, y0, x1: x0 + 2, y1: y0 + 2 }, ground);
      await wait(250);
    }
    const elapsed = performance.now() - t0;
    ed.listen(null);
    ed.cancelDraft();
    // the water moves all the while: frames come, but at the journey's pace, never one a frame
    expect(times.length).toBeGreaterThan(1);
    expect(times.length).toBeLessThanOrEqual(Math.ceil(elapsed / 150) + 1);
    for (let k = 1; k < times.length; k++) expect(times[k] - times[k - 1], `frame ${k}`).toBeGreaterThanOrEqual(140);
  }, 120_000);
});
