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
import { StackLive } from "../../src/core/sim/stackLive";
import { loadStack, retainedRows, STACK_FIELD, STACK_OP, StackWater } from "../../src/core/sim/stackWater";
import { WET, type WaterView } from "../../src/render3d/model";
import * as ed from "../../src/worker/session";
import { fixtureInEditor, namedInEditor } from "../fixtureEditor";

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

/** Highlands 96² seed 22 as generator 0.10.27 made it (#1181): a stream in a cave at (41–51, 68–69), 13 tiles from the
 *  carve's origin, that swings a few thousandths about where the settle stopped it (0.427 to 0.433 at (41, 68) about
 *  the settle's 0.431, #1229), so a carve's water that held its walls round every dry tile on the map showed it falling
 *  while the carve worked far from it. */
const CAVE_STREAM = "preview-highlands-96-22-carve.damgoodmaps";

async function open(seed = 21): Promise<{ origin: [number, number]; ground: Uint8Array; water: number[]; roofed: Map<string, number> }> {
  // (a force an earlier test left at work, failing part way, goes first)
  ed.forceCancel();
  // (a fixture since generator 0.10.29, D148: the land these cases were written on, tests/fixtures/projects, so the weathering's reach moving the generator's land moves nothing here;
  // seed 22's is the land of #1181, `CAVE_STREAM`)
  if (seed === 22) namedInEditor(CAVE_STREAM);
  else fixtureInEditor("highlands", W, seed);
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

type Since = NonNullable<ReturnType<typeof ed.forceStackSince>>;

/** The map's own water run on the same ticks as the force's so far, without the force (#1181): from the water the
 *  force's started from, with its flows' momentum, on the map's own ground and objects, every column. (On an engine of
 *  its own, run as the force's runs, never stopped by the settle's test.) */
function ownRun(since: Since): Float64Array {
  const start = new StackLive(since.model, since.from, since.flows);
  const st = start.state();
  start.close();
  const t = since.model.stacked!;
  const kept = retainedRows(since.model.retained ?? []);
  const m = new StackWater(since.model.W, since.model.H, t.objects.length / 8, kept.length / 4);
  try {
    (m.view(STACK_FIELD.masks) as Uint32Array).set(t.mask);
    (m.view(STACK_FIELD.objects) as Float64Array).set(t.objects);
    (m.view(STACK_FIELD.retained) as Float64Array).set(kept);
    m.op(STACK_OP.build, 0);
    loadStack(m, st, true, st);
    (m.view(STACK_FIELD.momentum) as Float64Array).set(st.edges!.out);
    if (since.ticks > 0) m.op(STACK_OP.run, since.ticks, 1);
    return m.copy(STACK_FIELD.depth) as Float64Array;
  } finally {
    m.close();
  }
}

/** Where the carve's water does not reach, the force's water (`since.now`) against the map's own run the same ticks
 *  (`ownRun`): the columns off by more than `tol`, and how many were compared (`under`, those under a roof). The carve
 *  reaches the tiles within 3 of what it changes (`land` against `ground`; its front's walls reach 2) and every tile
 *  joined to them by water (a column wet in either run). */
function offOwn(since: Since, ground: Uint8Array, land: Uint8Array, tol: number): { off: string[]; compared: number; under: number } {
  const own = ownRun(since);
  const st = since.now;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) for (let q = 0; q < st.count[i]; q++) if (st.depth[q * N + i] > 0 || own[q * N + i] > 0) wet[i] = 1;
  const reach = new Int32Array(N).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < N; i++) if (land[i] !== ground[i]) (reach[i] = 0), queue.push(i);
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const u = x + dx;
        const v = y + dy;
        if (u < 0 || v < 0 || u >= W || v >= W) continue;
        const j = v * W + u;
        if (reach[j] >= 0 || (reach[i] >= 3 && !(wet[i] && wet[j]))) continue;
        reach[j] = reach[i] + 1;
        queue.push(j);
      }
  }
  const off: string[] = [];
  let compared = 0;
  let under = 0;
  for (let i = 0; i < N; i++) {
    if (reach[i] >= 0) continue;
    for (let q = 0; q < st.count[i]; q++) {
      const c = q * N + i;
      if (!(st.depth[c] > 0 || own[c] > 0)) continue;
      compared++;
      if (st.floor[c] < ground[i]) under++;
      if (Math.abs(st.depth[c] - own[c]) > tol) off.push(`${i % W},${Math.floor(i / W)} at ${st.floor[c]}: ${own[c]} → ${st.depth[c]}`);
    }
  }
  return { off, compared, under };
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

describe("Carve's river is born as it cuts (D371)", () => {
  // (seed 22 has caves: a pool under a roof stays apart from the carve's water, checked on its own; #814. Seed 24 for 21
  // since generator 0.10.19's dry washes, D517, D148: seed 21's channel holds no more water at the cut's end than halfway.
  // Seed 22 on generator 0.10.27's land, `CAVE_STREAM`, #1181, D148: the cases went to seed 23 with 0.10.27, then to
  // 0.10.25's seed 22 as a fixture, because 19 of this land's cave stream's columns fell while the carve was shown,
  // (41, 68) 0.431 to 0.429, the most 0.003. The stream swings that much on its own (#1229), so its water is measured
  // against the map's own run the same ticks, `offOwn`: where the carve's water does not reach, it is the map's own,
  // the stream with it. It was not: the front held a wall round every dry tile on the map, FRONT_MARGIN now)
  it.each([24, 22])("the water flows into the channel as it is cut, from the carve's source; kept, the map's water flows on from it (seed %i)", async (seed) => {
    const { origin, ground, water, roofed } = await open(seed);
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
    const since = ed.forceStackSince();
    // kept: the map's water flows on from the water shown, not from the water before it
    const kept = ed.forceStop();
    expect(kept.kept).toBe(true);
    const d = depths(kept.view.water!, land);
    let off = 0;
    for (let i = 0; i < N; i++) off = Math.max(off, Math.abs(d[i] - shown(last[i])));
    expect(off).toBeLessThan(1e-4);
    expect(wetCut(ground, land, d).wet).toBe(seen.at(-1)!.wet);
    if (seed === 22) {
      // (on a map with caves, where the carve's water does not reach, the water handed on is the map's own as it ran on
      // the same ticks without the carve, every column, the cave's stream's with them)
      const own = offOwn(since!, ground, land, 1e-9);
      expect(own.off).toEqual([]);
      expect(own.compared).toBeGreaterThan(1000);
      expect(own.under, "columns under a roof compared").toBeGreaterThan(15);
    }
    // (and the water under a roof, which the frames above don't hold: none of the map's own lost where the carve cut nothing)
    else expect(poolsKept(roofed, kept.view.water!, land, ground, 1e-3)).toEqual([]);
    ed.settleWater();
  });

  // (seed 22 on `CAVE_STREAM`, #1181, D148: Esc handed on 17 of its cave stream's columns low by up to 0.003 against the
  // water before the carve, the stream's own swing, #1229; now, where the carve's water does not reach, exactly the map's
  // own run the same ticks, to the bit)
  it.each([21, 22])("undo stops it and puts the map's own water back; Esc skips to the end and hands on the water flowing then; a dry canyon flows none (seed %i)", async (seed) => {
    const { origin, ground, water, roofed } = await open(seed);
    if (seed === 22) expect(roofed.size, "seed 22's water under a roof").toBeGreaterThan(0);
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
    const was = ed.waterOf(ed.collabSession()!);
    partWay(7001);
    const back = ed.forceCancel(7001);
    expect(back.taken).toBe("work");
    expect(ed.flowForceWater(1)).toBeNull();
    const d = depths(back.water!, ed.terrainNow().heights);
    for (let i = 0; i < N; i++) expect(d[i]).toBeCloseTo(shown(water[i]), 4);
    // (its water under a roof too, exactly the map's own: none lost, none added)
    const backRoofed = underRoof(back.water!, ed.terrainNow().heights);
    expect(poolsKept(roofed, back.water!, ed.terrainNow().heights, ground, 1e-4, true)).toEqual([]);
    expect([...backRoofed.keys()].filter((key) => !roofed.has(key))).toEqual([]);
    // (exactly the water as the force found it, to the bit, every column)
    for (const key of ["tile", "floor", "depth", "contamination"] as const) expect(Array.from(back.water![key]), key).toEqual(Array.from(was[key]));
    // Esc (skipped to its end, kept): the map's water flows on from the water flowing when it came
    const now = partWay(7002);
    const since = ed.forceStackSince();
    const kept = ed.forceStop(7002);
    expect(kept.kept).toBe(true);
    expect(ed.flowForceWater(1)).toBeNull();
    const k = depths(kept.view.water!, ed.terrainNow().heights);
    for (let i = 0; i < N; i++) expect(k[i]).toBeCloseTo(shown(now[i]), 4);
    if (seed === 22) {
      // (where the carve's water does not reach, the map's own as it ran on the same ticks without the carve, to the bit)
      const own = offOwn(since!, ground, ed.terrainNow().heights, 0);
      expect(own.off).toEqual([]);
      expect(own.compared).toBeGreaterThan(1000);
      expect(own.under, "columns under a roof compared").toBeGreaterThan(15);
    } else expect(poolsKept(roofed, kept.view.water!, ed.terrainNow().heights, ground, 1e-3)).toEqual([]);
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

  it("its water as shown never strobes: few tiles go wet, dry and wet again (or the reverse) from one frame to the next", async () => {
    const { origin } = await open();
    expect(ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 70 }, origin, cut: null }).errors).toEqual([]);
    let f = ed.forceAdvance(1)!;
    for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
    // (a frame of Fast's: a step of the carve and six ticks of its water, a hundred and twenty times the game's pace)
    const shown: Float64Array[] = [];
    while (!f.done) {
      f = ed.forceAdvance(1)!;
      shown.push(Float64Array.from(ed.flowForceWater(6)!));
    }
    // (a thin sheet's own waves, crest to crest about twelve ticks, would alternate every frame if shown as they are)
    // A blink swings a hundredth of a level past the line and back: a sheet hovering on it, a few thousandths up and
    // down at a depth drawn as water like any other, draws the same in every frame (Highlands 96² seeds 22 and
    // 25, #814).
    const LINE = 0.05;
    const SWING = 0.01;
    const side = (d: number) => (d >= LINE + SWING ? 1 : d <= LINE - SWING ? -1 : 0);
    let blinks = 0;
    for (let u = 2; u < shown.length; u++)
      for (let i = 0; i < N; i++) {
        const a = side(shown[u - 2][i]);
        const b = side(shown[u - 1][i]);
        if (a !== 0 && a === side(shown[u][i]) && b === -a) blinks++;
      }
    // (shown as they are, about one a frame on this map; averaged, about one every six)
    expect(blinks / shown.length, `${blinks} blinks in ${shown.length} frames`).toBeLessThan(0.5);
    // Thin water is drawn as water at any depth, as the game draws it (no film, D154 as amended 2026-11-09), so the one
    // change a frame can show at a tile is its water coming or going (the view's WET): a tile that goes wet and dry
    // once is a front arriving and easing back; a tile that does so again and again flickers. (D148: until 2026-11-09
    // this counted a film fading in by its depth under three hundredths of a level swinging a tenth of the way and back,
    // a few at most, 0 to 4 on Highlands 96² seeds 21 to 30, shown as they are 10 to 31, the review of #816.)
    const drawn = (d: number) => (d > WET ? 1 : 0);
    const flicker = new Map<number, number>();
    for (let u = 2; u < shown.length; u++)
      for (let i = 0; i < N; i++) {
        const a = drawn(shown[u - 2][i]);
        const b = drawn(shown[u - 1][i]);
        const c = drawn(shown[u][i]);
        if ((b - a) * (c - b) < 0 && Math.min(Math.abs(b - a), Math.abs(c - b)) > 0.1) flicker.set(i, (flicker.get(i) ?? 0) + 1);
      }
    const again = [...flicker.values()].filter((n) => n > 1).length;
    expect(again, `${again} tiles' water comes and goes more than once`).toBeLessThan(8);
    ed.forceStop();
    ed.undo();
    ed.settleWater();
  });
});
