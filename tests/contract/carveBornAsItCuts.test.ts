// Carve's river is born as it cuts (PLAN §20 D371): while a carve is shown, the map's water flows on
// the land as each frame has it, the carve's source running from its first step, so the water follows
// the cutting edge down the new channel. Nothing flows while the carve is still being worked out; kept,
// the map's water flows on from exactly this water (no jump back to the water before it); Esc puts the
// map's own water back; a dry canyon has none. The settle that follows ends on the settled water, as
// after any edit (the water's journey's own tests).

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS } from "../../src/core/forces/carve/run";
import { STEPS_PER_SECOND } from "../../src/core/forces/force";
import { makeSpec } from "../../src/core/spec/mapspec";
import { WET, type WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const N = W * W;

/** Dry high ground far from the start (carve.test.ts's choice). */
function farFromStart(s: MapSession): [number, number] {
  const b = s.built;
  const st = b.start!;
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 12; y < b.H - 12; y += 4)
    for (let x = 12; x < b.W - 12; x += 4) {
      const i = y * b.W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i] * 2;
      if (d > far) {
        far = d;
        best = [x, y];
      }
    }
  return best;
}

async function open(): Promise<{ origin: [number, number]; ground: Uint8Array; water: number[] }> {
  // (a force an earlier test left at work, failing part way, goes first)
  ed.forceCancel();
  await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
  ed.refine();
  ed.settleWater();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  return { origin: farFromStart(s), ground: ed.terrainNow().heights.slice(), water: Array.from(s.built.water) };
}

/** A page's water view as a depth a tile. */
function depths(v: WaterView): Float64Array {
  const d = new Float64Array(N);
  for (let k = 0; k < v.count; k++) d[v.tile[k]] += v.depth[k];
  return d;
}

/** A depth as the page's view shows it (a film under WET is dry). */
const shown = (d: number) => (d > WET ? d : 0);

/** Tiles the carve lowered (shown now, against the ground before it), and those holding water. */
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

describe("Carve's river is born as it cuts (D371)", () => {
  it("the water flows into the channel as it is cut, from the carve's source; kept, the map's water flows on from it", async () => {
    const { origin, ground, water } = await open();
    const st = ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70 }, origin, cut: null });
    expect(st.errors).toEqual([]);
    let land: Uint8Array = ground.slice();
    const show = (f: ed.ForceFrame | null) => {
      if (f?.heights) land = f.heights;
      return f!;
    };
    // worked out first: nothing is cut, and the water doesn't move
    for (let k = 0; k < 400 && !show(ed.forceAdvance(1)).planned; k++) expect(Array.from(ed.flowForceWater(8)!)).toEqual(water);
    // shown a second of the carve at a time, the water given some of the game's time for each
    const seen: { cut: number; wet: number }[] = [];
    let f = show(ed.forceAdvance(0));
    while (!f.done) {
      f = show(ed.forceAdvance(STEPS_PER_SECOND));
      seen.push(wetCut(ground, land, ed.flowForceWater(120)!));
    }
    // the river is in its channel while the carve is still cutting, and more of it as the cut goes on
    // (halfway through the cut itself: a carve can finish cutting well before its showing ends)
    const cutAll = seen.at(-1)!.cut;
    const mid = seen.find((q) => q.cut >= cutAll / 2)!;
    expect(mid.cut).toBeGreaterThan(20);
    expect(mid.wet).toBeGreaterThan(0);
    expect(seen.at(-1)!.wet).toBeGreaterThan(mid.wet);
    const last = ed.flowForceWater(0)!;
    // kept: the map's water flows on from the water shown, not from the water before it
    const kept = ed.forceStop();
    expect(kept.kept).toBe(true);
    const d = depths(kept.view.water!);
    let off = 0;
    for (let i = 0; i < N; i++) off = Math.max(off, Math.abs(d[i] - shown(last[i])));
    expect(off).toBeLessThan(1e-4);
    expect(wetCut(ground, land, d).wet).toBe(seen.at(-1)!.wet);
    ed.settleWater();
  });

  it("undo stops it and puts the map's own water back; Esc skips to the end and hands on the water flowing then; a dry canyon flows none", async () => {
    const { origin, water } = await open();
    /** A carve part way through its showing, its water flowing. */
    const partWay = (gesture: number) => {
      ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70 }, origin, cut: null, gesture });
      let f = ed.forceAdvance(1)!;
      for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
      for (let k = 0; k < 3; k++) ed.forceAdvance(STEPS_PER_SECOND);
      const now = ed.flowForceWater(200)!;
      expect(Array.from(now)).not.toEqual(water);
      return now;
    };
    // undo (the force taken back by its gesture, D341): its water stops, and the map's own comes back
    partWay(7001);
    const back = ed.forceCancel(7001);
    expect(back.taken).toBe("work");
    expect(ed.flowForceWater(1)).toBeNull();
    const d = depths(back.water!);
    for (let i = 0; i < N; i++) expect(d[i]).toBeCloseTo(shown(water[i]), 4);
    // Esc (skipped to its end, kept): the map's water flows on from the water flowing when it came
    const now = partWay(7002);
    const kept = ed.forceStop(7002);
    expect(kept.kept).toBe(true);
    expect(ed.flowForceWater(1)).toBeNull();
    const k = depths(kept.view.water!);
    for (let i = 0; i < N; i++) expect(k[i]).toBeCloseTo(shown(now[i]), 4);
    ed.undo();
    ed.settleWater();
    // a dry canyon: no source, no water of its own
    ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70, dry: true }, origin, cut: null });
    expect(ed.flowForceWater(1)).toBeNull();
    ed.forceCancel();
  });

  it("the water follows the cut, never leads it: no dry or damp tile the carve is still to cut gets water, clicked or drawn (shown from its end)", async () => {
    const { origin, ground, water } = await open();
    const end: [number, number] = [Math.max(6, Math.min(W - 7, origin[0] + (origin[0] < W / 2 ? 30 : -30))), origin[1]];
    for (const req of [
      { verb: "carve" as const, settings: { ...DEFAULTS, power: 70 }, origin, cut: null },
      { verb: "carve" as const, settings: { ...DEFAULTS, power: 70, mode: "aim" as const }, origin, end, cut: null },
    ]) {
      expect(ed.forceStart(req).errors).toEqual([]);
      let f = ed.forceAdvance(1)!;
      for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
      // a step at a time, the water given a Fast step's worth of the game's time each (and more)
      let land: Uint8Array = ground.slice();
      const seen: { land: Uint8Array; depth: Float64Array }[] = [];
      while (!f.done) {
        f = ed.forceAdvance(1)!;
        if (f.heights) land = f.heights.slice();
        seen.push({ land, depth: Float64Array.from(ed.flowForceWater(12)!) });
      }
      const cut = land;
      let ahead = 0;
      // (on ground that showed no water, or only a film on damp ground: water already there may rise a little)
      for (const q of seen) for (let i = 0; i < N; i++) if (cut[i] !== ground[i] && q.land[i] === ground[i] && water[i] <= 0.05 && q.depth[i] > water[i] + 0.01) ahead++;
      expect(ahead, req.end ? "drawn" : "clicked").toBe(0);
      expect(seen.at(-1)!.depth.some((d, i) => d > water[i] + 0.05), "the river is born at all").toBe(true);
      ed.forceStop();
      ed.undo();
      ed.settleWater();
    }
  });
});
