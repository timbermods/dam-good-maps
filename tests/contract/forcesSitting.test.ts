// Kyler's forces sitting, batch A (PLAN §20 D344), through the editor's worker session: A5 a river
// drawn uphill is shown from where the stroke began, its water still running downhill (its land and its
// operation the same as shown the other way); A6 the editor's fissure takes its breadth from the shape
// drawn, so a small loop gives a small eruption even at the largest Size, and its operation keeps it;
// A7 Glaciate's land changes only as the ice front reaches it, and is the kept land exactly at its
// showing's last stage.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { ERUPT_DEFAULTS, ERUPT_SIZE_MAX } from "../../src/core/forces/erupt";
import { ADVANCE_STEPS, RETREAT_STEPS } from "../../src/core/forces/glaciate/run";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import type { ForceResultParams } from "../../src/core/forces/op";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const hash = (h: Uint8Array) => createHash("sha256").update(h).digest("hex");

async function fresh(seed = 3) {
  await runGenerate(makeSpec({ seed, theme: "highlands", size: { x: W, y: W } }));
  ed.refine();
  return MapSession.open(decodeProject(ed.project().bytes)).built;
}

/** Run the force at work to its end, frame by frame: the heights each frame showed, and the kept map. */
function playOut(): { frames: Uint8Array[]; kept: Uint8Array } {
  const frames: Uint8Array[] = [];
  let shown = ed.terrainNow().heights.slice();
  for (let k = 0; k < 4000; k++) {
    const f = ed.forceAdvance(1)!;
    if (f.heights) shown = f.heights.slice();
    if (f.planned) frames.push(shown);
    if (f.done) break;
  }
  expect(ed.forceStop().errors).toEqual([]);
  return { frames, kept: ed.terrainNow().heights.slice() };
}

describe("a river drawn uphill is shown the way it was drawn (A5)", () => {
  it("its showing starts where the stroke began, its land and its operation are the same, its water runs downhill", async () => {
    const b = await fresh();
    const st = b.start!;
    // a line across the map, away from the start
    const y0 = st.y < W / 2 ? 70 : 24;
    const origin: [number, number] = [18, y0];
    const end: [number, number] = [76, y0 + 4];
    const via: [number, number][] = [[46, y0 + 1]];
    const req = { verb: "carve" as const, settings: { ...CARVE_DEFAULTS, mode: "aim" as const, defyGravity: true, power: 70, dry: true, width: 5 }, origin, end, via, cut: null };
    const before = b.heights.slice();
    expect(ed.forceStart(req).errors).toEqual([]);
    const forward = playOut();
    const opForward = MapSession.open(decodeProject(ed.project().bytes)).state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
    ed.undo();
    expect(hash(ed.terrainNow().heights)).toBe(hash(before));
    expect(ed.forceStart({ ...req, shownFrom: "end" }).errors).toEqual([]);
    const back = playOut();
    const opBack = MapSession.open(decodeProject(ed.project().bytes)).state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
    // the same land kept, the same operation (only its showing differs)
    expect(hash(back.kept)).toBe(hash(forward.kept));
    expect(opBack).toEqual(opForward);
    expect(back.frames.length).toBe(forward.frames.length);
    // the first tiles to change: near the course's end shown from the end, near its origin otherwise
    const firstChange = (frames: Uint8Array[]) => {
      for (const h of frames) {
        const changed: number[] = [];
        for (let i = 0; i < h.length; i++) if (h[i] !== before[i]) changed.push(i);
        if (changed.length) return { x: changed.reduce((a, i) => a + (i % W), 0) / changed.length, y: changed.reduce((a, i) => a + Math.floor(i / W), 0) / changed.length };
      }
      throw new Error("nothing changed");
    };
    const d = (p: { x: number; y: number }, q: [number, number]) => Math.hypot(p.x - q[0], p.y - q[1]);
    const f0 = firstChange(forward.frames);
    const b0 = firstChange(back.frames);
    expect(d(f0, origin)).toBeLessThan(d(f0, end));
    expect(d(b0, end)).toBeLessThan(d(b0, origin));
    // each tile, shown from the end, takes its final level as it is reached and keeps it
    for (let k = 1; k < back.frames.length; k++)
      for (let i = 0; i < W * W; i += 7) if (back.frames[k - 1][i] !== before[i]) expect(back.frames[k][i]).toBe(back.frames[k - 1][i]);
  }, 180_000);
});

describe("the editor's fissure takes its breadth from its shape (A6)", () => {
  it("a small loop at the largest Size raises a small eruption, and its operation keeps that breadth", async () => {
    const b = await fresh(21);
    const st = b.start!;
    const cx = st.x < W / 2 ? 70 : 26;
    const cy = st.y < W / 2 ? 70 : 26;
    const loop = Array.from({ length: 25 }, (_, k) => ({ x: cx + 4 * Math.cos((k / 24) * Math.PI * 2), y: cy + 4 * Math.sin((k / 24) * Math.PI * 2) }));
    const before = b.heights.slice();
    const settings = { ...ERUPT_DEFAULTS, mode: "fissure" as const, power: 60, size: ERUPT_SIZE_MAX, shape: null, summit: null, flows: null, ridges: null } as unknown as typeof ERUPT_DEFAULTS;
    expect(ed.forceStart({ verb: "erupt", settings, origin: [Math.round(loop[0].x), Math.round(loop[0].y)], path: loop, cut: null, natural: true }).errors).toEqual([]);
    const { kept } = playOut();
    const op = MapSession.open(decodeProject(ed.project().bytes)).state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
    expect((op.settings as { size?: number }).size).toBeLessThanOrEqual(8);
    // what it raised stays near the loop (its breadth and its flows' apron), far inside what the
    // largest Size would have spread over
    let far = 0;
    for (let i = 0; i < W * W; i++) if (kept[i] > before[i]) far = Math.max(far, Math.hypot((i % W) - cx, Math.floor(i / W) - cy));
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(ERUPT_SIZE_MAX / 4);
  }, 120_000);
});

describe("Glaciate's land changes only as the ice passes, and settles at its last stage (A7)", () => {
  it("no tile changes before the front reaches it; during the melt nothing more changes; the last stage is the kept land", async () => {
    const b = await fresh(21);
    const st = b.start!;
    let at: [number, number] = [W >> 1, W >> 1];
    let far = -1;
    for (let y = 16; y < W - 16; y += 4)
      for (let x = 16; x < W - 16; x += 4) {
        const i = y * W + x;
        if (b.water[i] > 0) continue;
        const d = Math.hypot(x - st.x, y - st.y) + b.heights[i];
        if (d > far) {
          far = d;
          at = [x, y];
        }
      }
    expect(ed.forceStart({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 50 }, origin: at, cut: null, natural: true }).errors).toEqual([]);
    const { frames, kept } = playOut();
    expect(frames.length).toBe(ADVANCE_STEPS + RETREAT_STEPS + 1);
    // its land grows with the front: each stage of the advance changes more
    const changed = (h: Uint8Array) => h.reduce((n, v, i) => n + (v !== b.heights[i] ? 1 : 0), 0);
    for (let k = 2; k <= ADVANCE_STEPS; k++) expect(changed(frames[k])).toBeGreaterThanOrEqual(changed(frames[k - 1]));
    expect(changed(frames[1])).toBeLessThan(changed(frames[ADVANCE_STEPS]));
    // the melt reveals it: no ground changes under the retreating ice until its end, which is the kept
    // land (the ice, the effects' clock, keeps to the same stages: D344 A7)
    for (let k = ADVANCE_STEPS + 1; k < frames.length; k++) expect(hash(frames[k])).toBe(hash(frames[ADVANCE_STEPS]));
    expect(hash(frames.at(-1)!)).toBe(hash(kept));
  }, 120_000);
});
