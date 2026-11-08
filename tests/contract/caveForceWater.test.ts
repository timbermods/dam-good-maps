// A force's own water on a map with caves or overhangs (D371 on the stacked engine; #611's review): while Carve plays
// on such a map its river is born as it cuts, as on a plain map (carveBornAsItCuts.test.ts), the water following the
// cut and never leading it; kept, the map's water flows on from exactly the water shown and the journey ends on the
// canonical stacked settle, byte for byte; taken back, the map's own water comes back and the force's run is gone.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS } from "../../src/core/forces/carve/run";
import { STEPS_PER_SECOND } from "../../src/core/forces/force";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { makeSpec } from "../../src/core/spec/mapspec";
import { WET, type WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const N = W * W;

/** Dry high ground far from the start and from every cave or overhang (a carve is refused on them, D487). */
function origin(s: MapSession): [number, number] {
  const b = s.built;
  const st = b.start!;
  const roofed = [...s.columns.keys()];
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 12; y < b.H - 12; y += 4)
    for (let x = 12; x < b.W - 12; x += 4) {
      const i = y * b.W + x;
      if (b.water[i] > 0) continue;
      if (roofed.some((r) => Math.max(Math.abs((r % W) - x), Math.abs(Math.floor(r / W) - y)) < 12)) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i] * 2;
      if (d > far) {
        far = d;
        best = [x, y];
      }
    }
  return best;
}

async function open(): Promise<{ origin: [number, number]; ground: Uint8Array; water: number[] }> {
  ed.forceCancel();
  const spec = makeSpec({ seed: 22, theme: "highlands", size: { x: W, y: W } });
  spec.settings.terrain.verticality = 70;
  await runGenerate(spec);
  ed.refine();
  ed.settleWater();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  expect(s.built.waterModel.stacked, "the map has caves or overhangs").toBeTruthy();
  const view = ed.sessionView().view.water;
  const ground = ed.terrainNow().heights.slice();
  return { origin: origin(s), ground, water: Array.from(topOf(view, ground)) };
}

/** The water a view shows on the ground, per tile: the column standing on the tile's surface (`ground`), not a cave's
 *  under it. */
function topOf(v: WaterView, ground: ArrayLike<number>): Float64Array {
  const d = new Float64Array(N);
  for (let k = 0; k < v.count; k++) if (v.floor[k] === ground[v.tile[k]]) d[v.tile[k]] = v.depth[k];
  return d;
}

const shown = (d: number) => (d > WET ? d : 0);

function wetCut(ground: Uint8Array, now: Uint8Array, depth: ArrayLike<number>): { cut: number; wet: number } {
  let cut = 0;
  let wet = 0;
  for (let i = 0; i < N; i++)
    if (now[i] < ground[i]) {
      cut++;
      if (depth[i] > 0.05) wet++;
    }
  return { cut, wet };
}

describe("a force's own water on a map with caves (D371)", () => {
  it("Carve's river is born as it cuts, never ahead of it; kept, the map's water flows on from it and settles canonically", async () => {
    const { origin: at, ground, water } = await open();
    const st = ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70 }, origin: at, cut: null });
    expect(st.errors).toEqual([]);
    let land: Uint8Array = ground.slice();
    let f = ed.forceAdvance(1)!;
    // worked out first: nothing is cut, and the water stands as it was
    for (let k = 0; k < 400 && !f.planned; k++) {
      f = ed.forceAdvance(1)!;
      const d = ed.flowForceWater(8)!;
      expect(d, "the force has water of its own").not.toBeNull();
      for (let i = 0; i < N; i++) expect(Math.abs(shown(d[i]) - water[i])).toBeLessThan(1e-6);
    }
    // a step at a time: the water follows the cut, never leads it
    const seen: { land: Uint8Array; depth: Float64Array }[] = [];
    while (!f.done) {
      f = ed.forceAdvance(STEPS_PER_SECOND / 2)!;
      if (f.heights) land = f.heights.slice();
      seen.push({ land, depth: Float64Array.from(ed.flowForceWater(60)!) });
    }
    let ahead = 0;
    for (const q of seen) for (let i = 0; i < N; i++) if (land[i] !== ground[i] && q.land[i] === ground[i] && water[i] <= 0.05 && q.depth[i] > water[i] + 0.01) ahead++;
    expect(ahead, "water ahead of the cut").toBe(0);
    const cutAll = wetCut(ground, land, seen.at(-1)!.depth);
    const mid = seen.map((q) => wetCut(ground, q.land, q.depth)).find((q) => q.cut >= cutAll.cut / 2)!;
    expect(mid.cut).toBeGreaterThan(20);
    expect(mid.wet, "water in the channel while it is still cut").toBeGreaterThan(0);
    expect(cutAll.wet).toBeGreaterThan(mid.wet);
    // kept: the page goes on showing the water it showed, and the map's water flows on from it
    const last = ed.flowForceWater(0)!;
    const kept = ed.forceStop();
    expect(kept.kept).toBe(true);
    expect(ed.flowForceWater(1)).toBeNull();
    const k = topOf(kept.view.water!, land);
    let off = 0;
    for (let i = 0; i < N; i++) off = Math.max(off, Math.abs(k[i] - shown(last[i])));
    expect(off).toBeLessThan(1e-4);
    expect(ed.waterSettling(), "the map's water flows on").toBe(true);
    // the canonical settle, byte for byte as a fresh one of the map as it stands
    ed.settleWater();
    const s = ed.collabSession()!;
    const fresh = canonicalSettle(s.built.waterModel);
    expect(Buffer.from(s.built.settle.stack!.depth.buffer).equals(Buffer.from(fresh.stack!.depth.buffer))).toBe(true);
  });

  it("taken back, its water goes and the map's own comes back; a dry canyon has none", async () => {
    const { origin: at, ground, water } = await open();
    ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70 }, origin: at, cut: null, gesture: 8001 });
    let f = ed.forceAdvance(1)!;
    for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
    for (let k = 0; k < 3; k++) ed.forceAdvance(STEPS_PER_SECOND);
    expect(Array.from(ed.flowForceWater(200)!).some((d, i) => Math.abs(shown(d) - water[i]) > 0.05)).toBe(true);
    const back = ed.forceCancel(8001);
    expect(back.taken).toBe("work");
    expect(ed.flowForceWater(1)).toBeNull();
    const d = topOf(back.water!, ground);
    for (let i = 0; i < N; i++) expect(d[i]).toBeCloseTo(water[i], 4);
    ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70, dry: true }, origin: at, cut: null });
    expect(ed.flowForceWater(1)).toBeNull();
    ed.forceCancel();
  });
});
