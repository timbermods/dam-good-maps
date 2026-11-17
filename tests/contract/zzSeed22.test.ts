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

async function open(seed = 21): Promise<{ origin: [number, number]; ground: Uint8Array; water: number[]; roofed: Map<string, number> }> {
  // (a force an earlier test left at work, failing part way, goes first)
  ed.forceCancel();
  await runGenerate(makeSpec({ seed, theme: "highlands", size: { x: W, y: W } }));
  ed.refine();
  ed.settleWater();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  const ground = ed.terrainNow().heights.slice();
  return { origin: farFromStart(s), ground, water: Array.from(s.built.water), roofed: underRoof(ed.waterOf(s), ground) };
}

/** A page's water view as a depth a tile, on the ground at `heights`: the column on its surface, as `flowForceWater`
 *  gives them (on a map with caves the view also holds the water under a roof, a cave's pool the carve never touched:
 *  Highlands 96² seeds 22 and 23, #814). */
function depths(v: WaterView, heights: Uint8Array): Float64Array {
  const d = new Float64Array(N);
  for (let k = 0; k < v.count; k++) if (v.floor[k] >= heights[v.tile[k]]) d[v.tile[k]] += v.depth[k];
  return d;
}

/** A depth as the page's view shows it (a film under WET is dry). */
const shown = (d: number) => (d > WET ? d : 0);

/** A view's water under a roof (a column whose floor is below its tile's ground at `heights`: a cave's pool), by
 *  tile and floor. */
function underRoof(v: WaterView, heights: Uint8Array): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < v.count; k++) if (v.floor[k] < heights[v.tile[k]] && v.depth[k] > WET) m.set(`${v.tile[k]}:${v.floor[k]}`, v.depth[k]);
  return m;
}

/** The map's own water under a roof, where the ground at `heights` is still `ground`, is still there in `v`: none of it
 *  lost (to `tol`), and, `exact`, none added either (the carve's river may run on into a cave it reaches). */
function worst(roofed: Map<string, number>, v: WaterView, heights: Uint8Array, ground: Uint8Array): string {
  const now = underRoof(v, heights);
  let w = 0; let at = "";
  for (const [key, d] of roofed) { const i = Number(key.split(":")[0]); if (heights[i] !== ground[i]) continue; const e = now.get(key) ?? 0; if (Math.abs(d - e) > w) { w = Math.abs(d - e); at = `${i % W},${Math.floor(i / W)} ${d.toFixed(4)}→${e.toFixed(4)}`; } }
  return `${w.toExponential(2)} at ${at}`;
}
function poolsKept(roofed: Map<string, number>, v: WaterView, heights: Uint8Array, ground: Uint8Array, tol: number, exact = false): string[] {
  const now = underRoof(v, heights);
  const off: string[] = [];
  for (const [key, d] of roofed) {
    const i = Number(key.split(":")[0]);
    if (heights[i] !== ground[i]) continue;
    const e = now.get(key) ?? 0;
    if (d - e > tol || (exact && e - d > tol)) off.push(`${i % W},${Math.floor(i / W)} at ${key.split(":")[1]}: ${d.toFixed(3)} → ${e.toFixed(3)}`);
  }
  return off;
}

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


import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { GENERATOR_VERSION } from "../../src/core/spec/mapspec";
const FILE = process.env.SEED22_FILE;
async function openAny(seed: number) {
  if (!FILE) return open(seed);
  ed.forceCancel();
  const raw = decodeProject(new Uint8Array(readFileSync(FILE)));
  const relabelled = MapSession.open({ ...raw, generatorVersion: GENERATOR_VERSION }).project(1);
  ed.collabOpen(MapSession.open(decodeProject(relabelled)));
  ed.settleWater();
  const s = MapSession.open(decodeProject(ed.project().bytes));
  const ground = ed.terrainNow().heights.slice();
  return { origin: farFromStart(s), ground, water: Array.from(s.built.water), roofed: underRoof(ed.waterOf(s), ground) };
}
function fp(tag: string, o: { origin: [number, number]; ground: Uint8Array; water: number[]; roofed: Map<string, number> }) {
  const h = createHash("sha256");
  h.update(o.ground);
  h.update(new Uint8Array(new Float64Array(o.water).buffer));
  const r = [...o.roofed].sort().map(([k, v]) => `${k}=${v.toFixed(6)}`).join(";");
  h.update(r);
  const p = [...o.roofed].filter(([k]) => Number(k.split(":")[0]) === 68 * W + 41).map(([k, v]) => `${k}=${v.toFixed(4)}`);
  console.log(`FP ${tag} mode=${FILE ? "file" : "gen"} origin=${o.origin} roofed=${o.roofed.size} (41,68)=${p} hash=${h.digest("hex").slice(0, 16)}`);
}
describe("Carve's river is born as it cuts (D371)", () => {
  // (seed 22 has caves: a pool under a roof stays apart from the carve's water, checked on its own; #814. Seed 24 for 21
  // since generator 0.10.19's dry washes, D517, D148: seed 21's channel holds no more water at the cut's end than halfway;
  // seed 23 for 22 since generator 0.10.27, D(new-leaks) with 0.10.26's ruin fields, D148: 19 of seed 22's cave
  // pool columns fall while the carve is shown, (41, 68)'s 0.431 to 0.429, its water not at rest under its roof, as the
  // undo case below found on 0.10.26's land)
  it.each([22])("the water flows into the channel as it is cut, from the carve's source; kept, the map's water flows on from it (seed %i)", async (seed) => {
    const o = await openAny(seed); fp(`case seed ${seed}`, o); const { origin, ground, water, roofed } = o;
    if (seed === 22) expect(roofed.size, "seed 23's water under a roof").toBeGreaterThan(0);
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
    const d = depths(kept.view.water!, land);
    let off = 0;
    for (let i = 0; i < N; i++) off = Math.max(off, Math.abs(d[i] - shown(last[i])));
    expect(off).toBeLessThan(1e-4);
    expect(wetCut(ground, land, d).wet).toBe(seen.at(-1)!.wet);
    // (and the water under a roof, which the frames above don't hold: none of the map's own lost where the carve cut nothing)
    { const L = poolsKept(roofed, kept.view.water!, land, ground, 1e-3); { const h = createHash("sha256"); const v = kept.view.water!; h.update(new Uint8Array(Float64Array.from(v.depth as ArrayLike<number>).buffer)); console.log(`HASH flow ${h.digest("hex").slice(0, 16)} count ${v.count}`); } console.log(`WORST flow ${worst(roofed, kept.view.water!, land, ground)}`); console.log(`POOLS flow ${L.length}: ${L.join(" | ")}`); expect(L).toEqual([]); }
    ed.settleWater();
  });

  // (seed 23 for 22 since generator 0.10.27, D(new-leaks): a course's water leaves only by its own way, so the land moved,
  // D148: seed 22's cave pool at (84–86, 58–59), 52 tiles from any tile the carve cuts, falls 0.004 in the carve's three
  // seconds, its water not at rest under its roof; seed 23 has 17 tiles of water under a roof, and they keep it)
  it.each([22])("undo stops it and puts the map's own water back; Esc skips to the end and hands on the water flowing then; a dry canyon flows none (seed %i)", async (seed) => {
    const o = await openAny(seed); fp(`case seed ${seed}`, o); const { origin, ground, water, roofed } = o;
    if (seed === 22) expect(roofed.size, "seed 23's water under a roof").toBeGreaterThan(0);
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
    const d = depths(back.water!, ed.terrainNow().heights);
    for (let i = 0; i < N; i++) expect(d[i]).toBeCloseTo(shown(water[i]), 4);
    // (its water under a roof too, exactly the map's own: none lost, none added)
    const backRoofed = underRoof(back.water!, ed.terrainNow().heights);
    { const L = poolsKept(roofed, back.water!, ed.terrainNow().heights, ground, 1e-4, true); console.log(`POOLS undo ${L.length}: ${L.join(" | ")}`); expect(L).toEqual([]); }
    expect([...backRoofed.keys()].filter((key) => !roofed.has(key))).toEqual([]);
    // Esc (skipped to its end, kept): the map's water flows on from the water flowing when it came
    const now = partWay(7002);
    const kept = ed.forceStop(7002);
    expect(kept.kept).toBe(true);
    expect(ed.flowForceWater(1)).toBeNull();
    const k = depths(kept.view.water!, ed.terrainNow().heights);
    for (let i = 0; i < N; i++) expect(k[i]).toBeCloseTo(shown(now[i]), 4);
    { const L = poolsKept(roofed, kept.view.water!, ed.terrainNow().heights, ground, 1e-3); { const h = createHash("sha256"); const v = kept.view.water!; h.update(new Uint8Array(Float64Array.from(v.depth as ArrayLike<number>).buffer)); console.log(`HASH esc ${h.digest("hex").slice(0, 16)} count ${v.count}`); } console.log(`WORST esc ${worst(roofed, kept.view.water!, ed.terrainNow().heights, ground)}`); console.log(`POOLS esc ${L.length}: ${L.join(" | ")}`); expect(L).toEqual([]); }
    ed.undo();
    ed.settleWater();
    // a dry canyon: no source, no water of its own
    ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70, dry: true }, origin, cut: null });
    expect(ed.flowForceWater(1)).toBeNull();
    ed.forceCancel();
  });

});
