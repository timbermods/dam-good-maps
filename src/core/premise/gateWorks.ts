// Stage 4 of the wall with one gate (docs/PREMISES.md §5.1, §2.2 stage 4): its ladder, round 8's rungs as templates on
// the land, each work's site (the tiles the player builds on or clears), what it does there and what it buys, by the
// lake stair's measures (`ladder.ts`): the water a work adds by number, `flowThrough` and `prefillFrom` on the land with
// it and the works it needs done against without it, its green the soil's reach of that water (`estimateGain`), a
// reservoir work's the water it holds. The shared `ladderOf` reads the lake stair's kinds (a notch's row, a basin's
// spill levee, a megadam at the next lake's sill); the gate's rungs are other templates:
//
// - the Still Pool's levee (first): its inlet shut a level over the plunge pool's sill, before the first badtide;
// - the Gate opened (medium): its two rows of Blockages cleared and its bar blasted a level, to the lake's sill: the
//   river splits, a share down the slot and the Gate Bed;
// - the Gate made whole (medium, after it): the bar blasted again, a level under the sill, and a levee on the Low
//   River's lip a level over it: the whole river through the Gate, the lake half a level lower;
// - the leat opened (medium): its row cleared and its bar blasted once, to the springs' sill: a trickle along the crest,
//   over the Pass and down the Pass Bed; its whole share (large, after it): the bar blasted again, to the leat's bed;
// - the megadam (large): a wall across the Low River's gorge in the spur, to the megadam's water, the Gate's slot
//   dammed to the same level: the valley a reservoir.
//
// The card's words and each work in a sentence (`gateCard`, `gateWorkWords`) are the gate's own.

import { THEME_NAMES } from "../spec/mapspec";
import { tilesToRuns } from "../math/grid";
import { hypot } from "../math/portable";
import { flowThrough, prefillFrom } from "../sim/prefill";
import { fillDays, fillLake } from "../sim/fill";
import type { WaterModel } from "../sim/water";
import type { StyleTheme } from "./choice";
import type { PremiseCard } from "./card";
import { pathDist, pathLength, pointAt } from "./geom";
import { estimateGain, soilReach, spectrumMiss, type Ladder, type WorkSite } from "./ladder";
import { gateOf, onLocal, onMap, rangeAt, turnOf } from "./premises/wallGate";
import { gateZones } from "./gateLand";
import type { Point, PremisePlan } from "./types";
import { stageModel, type StageWater } from "./water";

/** The head a pond stands over its spill (as `ladder.ts`'s). */
const HEAD = 0.1;
/** The rungs that send more water down a bed already wet (the Gate made whole, the leat's whole share): by number
 *  their bed is the same, since `flowThrough` counts every source whose water passes a tile, unsplit between outlets,
 *  so what they buy is the settle's (a proof, PREMISES §3.4), and their floor here is none. */
export const SHARE_RUNGS = ["gateWhole", "leatWhole"] as const;
/** How far the megadam's wall runs each way from the gorge to its shoulders. */
const WALL_REACH = 30;
/** How far each way along the gorge the megadam's wall reads its line (`wallAcross`). */
const WALL_CHORD = 3;
/** How far toward the valley from the range's spine the megadam's wall crosses the Gate's gorge. */
const SLOT_WALL_OFF = 3;

type Change = [tile: number, floor: number][];
interface Water {
  depth: Float64Array;
  contamination: Float64Array;
  held: number;
}

/** The water `flowThrough` gives a floor with the plan's sources (`ladder.ts` `waterOn`'s reading). */
function waterOn(w: StageWater, floor: Float64Array): Water {
  const m = { ...stageModel(w), floor };
  const flow = flowThrough(m);
  const s = prefillFrom(m, flow);
  let held = 0;
  for (let i = 0; i < floor.length; i++)
    if (flow.path[i] && flow.level[i] > floor[i]) {
      held += flow.level[i] - floor[i];
      s.depth[i] += HEAD;
    }
  return { depth: s.depth as Float64Array, contamination: s.contamination as Float64Array, held };
}

/** A link's head (its bar: the tiles out of its body to a tile or two past its first row that stand at `least` or over,
 *  stage 1's bar and head-hold) and its rows' tiles. */
function headAndRows(plan: PremisePlan, w: StageWater, id: string, least: number): { head: number[]; rows: number[] } {
  const r = w.raster;
  const li = plan.links.findIndex((l) => l.id === id) + 1;
  const rows = (r.rows[id] ?? []).flat();
  const first = r.rows[id]?.[0] ?? [];
  const end = first.length ? Math.max(...first.map((i) => r.along[i])) : 0;
  const head: number[] = [];
  for (let i = 0; i < r.W * r.H; i++) if (r.channel[i] === li && r.along[i] >= 0 && r.along[i] <= end + 1.5 && r.heights[i] >= least && !rows.includes(i)) head.push(i);
  return { head, rows };
}

/** A wall across a channel at the point nearest `at`, square to its path's line there (the chord `WALL_CHORD` tiles each
 *  way, not the tangent: at a bend the second row's tangent turned along the gorge, ran up the valley at the lake's
 *  level one way and off the map's edge the other, and the plan was drawn again), two tiles thick, out to ground at
 *  `level` on each side (`ladder.ts` `wallAcross`'s reading); empty where a side finds none within `WALL_REACH`. */
function wallAcross(path: readonly Point[], at: Point, heights: Uint8Array, W: number, H: number, level: number): number[] {
  const len = pathLength(path);
  let best = Infinity;
  let s0 = 0;
  for (let s = 0; s <= len; s += 0.25) {
    const p = pointAt(path, s).p;
    const d = (p[0] - at[0]) * (p[0] - at[0]) + (p[1] - at[1]) * (p[1] - at[1]);
    if (d < best) [best, s0] = [d, s];
  }
  const out = new Set<number>();
  const c0 = pointAt(path, Math.max(0, s0 - WALL_CHORD)).p;
  const c1 = pointAt(path, Math.min(len, s0 + WALL_CHORD)).p;
  const cl = hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const dir: Point = cl > 0 ? [(c1[0] - c0[0]) / cl, (c1[1] - c0[1]) / cl] : pointAt(path, s0).dir;
  const n: Point = [-dir[1], dir[0]];
  const p0 = pointAt(path, s0).p;
  for (const ds of [0, 0.7]) {
    const p: Point = [p0[0] + dir[0] * ds, p0[1] + dir[1] * ds];
    for (const side of [1, -1]) {
      let met = false;
      for (let k = 0; k <= WALL_REACH; k += 0.5) {
        const x = Math.floor(p[0] + n[0] * k * side);
        const y = Math.floor(p[1] + n[1] * k * side);
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const i = y * W + x;
        if (heights[i] >= level) {
          met = true;
          break;
        }
        out.add(i);
      }
      if (!met) return [];
    }
  }
  return [...out];
}

/** The gate's ladder on its land: each work's site, its change to the land, and what it buys; day 1's shares. */
export function gateLadder(plan: PremisePlan, w: StageWater, heights: Uint8Array): Ladder {
  const g = gateOf(plan)!;
  const r = w.raster;
  const { W, H } = plan;
  const N = W * H;
  const S = g.sill;
  // day 1: every row shut (a Blockage is a level of floor)
  const base = Float64Array.from(heights);
  for (const rows of Object.values(r.rows)) for (const row of rows) for (const i of row) base[i] = heights[i] + 1;
  const pool = plan.bodies.find((b) => b.id === g.pool)!;
  const gate = headAndRows(plan, w, g.gate, S);
  const leat = headAndRows(plan, w, g.leat, pool.sill);
  const li = (id: string) => plan.links.findIndex((l) => l.id === id) + 1;
  const site = (id: string): WorkSite => {
    const x = plan.works.find((k) => k.id === id)!;
    return { id: x.id, kind: x.kind, rung: x.rung, on: x.on, region: x.region, tiles: [], does: "build", needs: x.needs, green: 0, wet: 0, reservoir: 0, reach: [], paid: false };
  };
  const changes = new Map<string, Change>();
  const sites = new Map<string, WorkSite>();
  const reservoir = new Set<string>();
  const add = (s: WorkSite, change: Change, held = false) => {
    sites.set(s.id, s);
    changes.set(s.id, change);
    if (held) reservoir.add(s.id);
  };
  for (const work of plan.works) {
    const s = site(work.id);
    const change: Change = [];
    if (work.id === "neck") {
      // the inlet's tiles at its middle, a level over the plunge pool's sill
      const k = li(g.inlet);
      const tiles: number[] = [];
      for (let i = 0; i < N; i++) if (r.channel[i] === k) tiles.push(i);
      tiles.sort((a, b) => r.along[a] - r.along[b]);
      const mid = tiles[tiles.length >> 1];
      if (mid !== undefined) {
        // (a level over the plunge pool it feeds from)
        const D = plan.bodies.find((b) => b.id === g.door)!.sill;
        s.tiles = [mid];
        s.level = D + 1;
        change.push([mid, D + 1]);
      }
      add(s, change);
    } else if (work.id === "gateOpen") {
      s.does = "clear";
      s.tiles = [...gate.head, ...gate.rows];
      s.level = S;
      // (a row cleared comes down to the bar's new level at most: stage 1's head-hold stands the first row at the bar)
      for (const i of gate.rows) change.push([i, Math.min(heights[i], S)]);
      for (const i of gate.head) change.push([i, S]);
      add(s, change);
    } else if (work.id === "gateWhole") {
      const lip = r.lips[g.low] ?? [];
      s.tiles = [...gate.head, ...lip];
      for (const i of [...gate.head, ...gate.rows]) change.push([i, Math.min(heights[i], S - 1)]);
      for (const i of lip) change.push([i, S + 1]);
      s.level = S + 1;
      add(s, change);
    } else if (work.id === "leatOpen") {
      s.does = "clear";
      s.tiles = [...leat.head, ...leat.rows];
      s.level = pool.sill;
      for (const i of leat.rows) change.push([i, Math.min(heights[i], pool.sill)]);
      for (const i of leat.head) change.push([i, pool.sill]);
      add(s, change);
    } else if (work.id === "leatWhole") {
      s.does = "clear";
      s.tiles = leat.head.slice();
      s.level = pool.sill - 1;
      for (const i of [...leat.head, ...leat.rows]) change.push([i, Math.min(heights[i], pool.sill - 1)]);
      add(s, change);
    } else if (work.id === "megadam") {
      const low = plan.links.find((l) => l.id === g.low)!;
      const spur = plan.ridges.find((x) => x.id === g.spur);
      // (where the gorge crosses the spur: its point nearest the spur's line)
      let at: Point = work.at;
      if (spur && low.path) {
        let best = Infinity;
        const len = pathLength(low.path);
        for (let t = 0; t <= len; t += 0.5) {
          const p = pointAt(low.path, t).p;
          const d = pathDist(p[0], p[1], spur.path).d;
          if (d < best) [best, at] = [d, p];
        }
      }
      const wall = wallAcross(low.path ?? [], at, heights, W, H, g.megadam);
      // (and the Gate dammed to the same level across its gorge in the range, wall to wall: else the raised lake leaves
      // by it. Dammed at its head alone, the lake ran round the head over the meadow and down the wadi strips beside
      // the slot's bed, off the map at the notch)
      const gp = plan.links.find((l) => l.id === g.gate)?.path ?? [];
      // (where the gorge crosses the range `SLOT_WALL_OFF` tiles before its spine, under the crest: on the back slope's
      // lower half its walls fell to the basin's floor, and on the spine the wall ran along the leat's wadi on the crest)
      const T = turnOf(plan, g);
      let ks = Math.max(1, Math.round(g.slot.to / 2));
      for (let k = 1; k <= g.slot.to && k < gp.length; k++) {
        const [u, v] = onLocal(T, gp[k]);
        const [u0, v0] = onLocal(T, gp[ks]);
        if (Math.abs(v - rangeAt(g.range, u).v + SLOT_WALL_OFF) < Math.abs(v0 - rangeAt(g.range, u0).v + SLOT_WALL_OFF)) ks = k;
      }
      // (and square to the range there, along its spine: square to the gorge's own winding line, it ran along the gorge's
      // wadi strip where the gorge bent)
      const [ku, kv] = onLocal(T, gp[ks]);
      const across: Point[] = [onMap(T, [ku, kv - 4]), onMap(T, [ku, kv + 4])];
      const slotWall = gp.length > 1 ? wallAcross(across, gp[ks], heights, W, H, g.megadam) : [];
      s.level = g.megadam;
      if (wall.length && slotWall.length) {
        s.tiles = [...wall, ...gate.head, ...slotWall];
        for (const i of s.tiles) change.push([i, g.megadam]);
      } else s.note = `no shoulders at ${g.megadam} within ${WALL_REACH} tiles of ${wall.length ? "the Gate's gorge" : "the gorge"}`;
      add(s, change, true);
    } else add(s, change);
  }
  const byId = new Map(plan.works.map((x) => [x.id, x]));
  const needsOf = (id: string, out = new Set<string>()): Set<string> => {
    for (const n of byId.get(id)?.needs ?? []) if (!out.has(n)) (out.add(n), needsOf(n, out));
    return out;
  };
  const cache = new Map<string, Water>();
  const waterWith = (done: Set<string>): Water => {
    const key = [...done].sort().join(",");
    let v = cache.get(key);
    if (!v) {
      const f = Float64Array.from(base);
      for (const x of plan.works) if (done.has(x.id)) for (const [i, h] of changes.get(x.id) ?? []) f[i] = h;
      v = waterOn(w, f);
      cache.set(key, v);
    }
    return v;
  };
  const day1 = waterWith(new Set());
  for (const work of plan.works) {
    const s = sites.get(work.id)!;
    if (!s.tiles.length) {
      s.note = s.note ?? "no site on the land";
      continue;
    }
    const needs = needsOf(work.id);
    const before = waterWith(needs);
    const after = waterWith(new Set([...needs, work.id]));
    const gain = estimateGain(heights, W, H, before, after);
    s.green = gain.green;
    s.wet = gain.wet;
    // (a reservoir's reach is the valley it drowns: its measure is the water it holds, and
    // stage 6 plants day 1's land, which keeps nothing off a work's reach)
    s.reach = reservoir.has(work.id) ? [] : tilesToRuns(gain.tiles, W);
    if (reservoir.has(work.id)) s.reservoir = Math.max(0, Math.round(after.held - before.held));
    const range = reservoir.has(work.id) ? work.gives.reservoir : work.gives.green;
    const v = reservoir.has(work.id) ? s.reservoir : s.green;
    s.paid = !!range && v >= range[0];
    if ((SHARE_RUNGS as readonly string[]).includes(work.id)) s.note = "its share of the river is the settle's: by number its bed is the same";
    else if (!s.paid && range) s.note = `${reservoir.has(work.id) ? "holds" : "greens"} ${v}, under its floor of ${range[0]}`;
  }
  const soil = soilReach(heights, day1, W, H);
  let water = 0;
  let moist = 0;
  for (let i = 0; i < N; i++) {
    if (soil[i] === 2) water++;
    else if (soil[i] === 1) moist++;
  }
  const works = plan.works.map((x) => sites.get(x.id)!);
  return { works, day1: { water: water / N, moist: moist / N }, small: 0, together: works.reduce((t, x) => t + x.green, 0) / N };
}

/** Day 1's shares against `spectrum` (the lake stair's ranges), in one line, or null. */
export function gateSpectrum(l: Ladder): string | null {
  return spectrumMiss(l.day1);
}

// ------------------------------------------------------------------------------------------------- the card's words

const NUMBER = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const number = (n: number) => NUMBER[n] ?? String(n);
const tiles = (n: number) => `${number(n)} tile${n === 1 ? "" : "s"}`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** One of the gate's works in a sentence: what to build or clear, where and how much, and what it buys. Player text
 *  (docs/RULES.md, "Writing README and website text"): short, plain words, the map's own names. */
export function gateWorkWords(plan: PremisePlan, w: WorkSite): string {
  const name = (id: string) => plan.names[id] ?? id;
  const g = gateOf(plan)!;
  const green = w.green > 0 ? `about ${w.green} tiles of dry land` : "the dry land beyond";
  switch (w.id) {
    case "neck":
      return `Before the first badtide, build a levee across ${name(g.inlet)} (${tiles(w.tiles.length)}), so ${name(g.kettle)} keeps clean water.`;
    case "gateOpen":
      return `Clear the Blockages in ${name(g.gate)} and blast its bar a level (${tiles(w.tiles.length)}) to send part of the river into the basin and water ${green}.`;
    case "gateWhole":
      return `Blast the Gate's bar again and build a levee on ${name(g.low)} (${tiles(w.tiles.length)}) to send the whole river through ${name(g.gate)}.`;
    case "leatOpen":
      return `Clear ${name(g.leat)} at ${name(g.pool)} and blast its bar once (${tiles(w.tiles.length)}) to carry a trickle over the pass and water ${green}.`;
    case "leatWhole":
      return `Blast ${name(g.leat)}'s bar again (${tiles(w.tiles.length)}) to take the springs' share over the pass.`;
    case "megadam":
      return `Dam ${name(g.low)} in the spur and ${name(g.gate)} across its gorge in the range, two walls (${tiles(w.tiles.length)}), to raise ${name(g.lake)} into a reservoir.`;
    default:
      return `Build at ${name(w.on)} (${tiles(w.tiles.length)}).`;
  }
}

/** A gate map's card: the shared card's words, and what the megadam buys (`gateDamWords`, from the settled map; null
 *  before the settle or where the dam has no site). */
export type GateCard = PremiseCard & { dam: string | null };

/** What the megadam buys in a drought, from the settled map's water model `m`: how many days the lake's water lasts
 *  through a drought with the dam built (the valley filled to the megadam's level behind its wall and the Gate's head)
 *  and without it (the lake at its sill, the Low River's lip), by the game's evaporation as a Fill's are read
 *  (`sim/fill.ts` `fillDays`, D29: the sources stopped, the surface sinking flat). Null where the dam has no site or a
 *  level's water would leave the map. */
export function gateDamDays(plan: PremisePlan, w: StageWater, ladder: Ladder, m: WaterModel): { dammed: number; lake: number } | null {
  const g = gateOf(plan)!;
  const site = ladder.works.find((x) => x.id === "megadam");
  if (!site?.tiles.length) return null;
  const k = plan.bodies.findIndex((b) => b.id === g.lake) + 1;
  let at = -1;
  for (let i = 0; i < w.raster.lake.length; i++) if (w.raster.lake[i] === k && (at < 0 || m.floor[i] < m.floor[at])) at = i;
  if (at < 0) return null;
  const x = at % m.W;
  const y = (at - x) / m.W;
  const floor = Float64Array.from(m.floor);
  for (const i of site.tiles) floor[i] = Math.max(floor[i], g.megadam);
  const dammed = fillLake({ ...m, floor }, x, y, g.megadam);
  const lake = fillLake(m, x, y, g.sill);
  if ("reason" in dammed || "reason" in lake) return null;
  return { dammed: Math.round(fillDays(m.W, m.H, dammed.lake)), lake: Math.round(fillDays(m.W, m.H, lake.lake)) };
}

/** The card's line for what the megadam buys (`gateDamDays`). */
export function gateDamWords(plan: PremisePlan, days: { dammed: number; lake: number }): string {
  const g = gateOf(plan)!;
  const name = plan.names[g.lake] ?? g.lake;
  const n = (id: string) => plan.names[id] ?? id;
  return `With the megadam's two walls, across ${n(g.low)} in the spur and across ${n(g.gate)} in the range, ${name} holds water for ${days.dammed} days of drought; without them, for ${days.lake}.`;
}

/** `megadam.holds` (#1067): the reason a map is refused when its megadam buys nothing, the valley at the megadam's
 *  water leaving the map round its walls (or the dam with no site). */
export const MEGADAM_HOLDS = "megadam.holds: the valley at the megadam's water leaves the map round its walls";

/** What the megadam buys on the settled map's water model (`gateDamDays`), or `megadam.holds`'s refusal. */
export function megadamHolds(plan: PremisePlan, w: StageWater, ladder: Ladder, m: WaterModel): { dammed: number; lake: number } | { reason: string } {
  return gateDamDays(plan, w, ladder, m) ?? { reason: MEGADAM_HOLDS };
}

/** The card's words for a gate map: the premise's name, the style, the landmark and the ladder's first rung. */
export function gateCard(plan: PremisePlan, theme: StyleTheme, ladder: Ladder): GateCard {
  const g = gateOf(plan)!;
  const name = (id: string) => plan.names[id] ?? id;
  const veil = plan.links.find((l) => l.id === g.veil)!;
  const rungs = ["first", "small", "medium", "large"] as const;
  const first = rungs.map((rg) => ladder.works.find((w) => w.rung === rg && w.tiles.length > 0)).find((w) => w);
  return {
    name: "Wall with one gate",
    style: THEME_NAMES[theme],
    landmark: `${cap(name(g.veil))}, a ${number(veil.fall?.height ?? g.drop)}-level fall from a cleft in the range into ${name(g.door)}`,
    first: first ? gateWorkWords(plan, first) : null,
    line: plan.line,
    dam: null,
  };
}

// ------------------------------------------------------------------------------------------------- the works' invariants

/** What a works invariant reads: the water, the land and the ladder on it. */
export interface GateWorksContext {
  plan: PremisePlan;
  water: StageWater;
  heights: Uint8Array;
  ladder: Ladder;
}

export interface GateWorksInvariant {
  id: string;
  test(ctx: GateWorksContext): { ok: true } | { ok: false; reason: string };
}

const ok = { ok: true } as const;
const no = (reason: string) => ({ ok: false as const, reason });

/** Day 1's floor: the land with every row shut (a Blockage is a level of floor). */
function dayOneFloor(w: StageWater, heights: Uint8Array): Float64Array {
  const f = Float64Array.from(heights);
  for (const rows of Object.values(w.raster.rows)) for (const row of rows) for (const i of row) f[i] = heights[i] + 1;
  return f;
}

/** The floor with one work's site laid as the ladder reads it: built up to its level, or cleared down to it. */
function withSite(floor: Float64Array, s: WorkSite): Float64Array {
  const f = Float64Array.from(floor);
  for (const i of s.tiles) f[i] = s.does === "build" ? Math.max(f[i], s.level ?? f[i]) : Math.min(f[i], s.level ?? f[i]);
  return f;
}

/** `works.sites` (§5.1's ladder): every rung stands on the land, its tiles and its level. */
const worksSites: GateWorksInvariant = {
  id: "works.sites",
  test({ plan, ladder }) {
    for (const w of plan.works) {
      const s = ladder.works.find((x) => x.id === w.id);
      if (!s || !s.tiles.length) return no(`${w.id} has no site on the land`);
      if (s.level === undefined) return no(`${w.id} has no level`);
    }
    return ok;
  },
};

/** `works.paid` (§4.2's floors, the gate's `gives`): every rung buys its floor (green, or the water it holds). */
const worksPaid: GateWorksInvariant = {
  id: "works.paid",
  test({ ladder }) {
    for (const s of ladder.works) if (!s.paid) return no(`${s.id}: ${s.note ?? "under its floor"}`);
    return ok;
  },
};

/** `start.neck`, its works half (§5.1): left alone the Still Pool takes the river's water (and its badtide); with its
 *  levee no source's water reaches it. */
const neckShuts: GateWorksInvariant = {
  id: "neck.shuts",
  test({ plan, water, heights, ladder }) {
    const g = gateOf(plan)!;
    const k = plan.bodies.findIndex((b) => b.id === g.kettle) + 1;
    const levee = ladder.works.find((x) => x.id === "neck");
    if (!levee) return no("No levee on the Still Pool's inlet");
    const reached = (floor: Float64Array) => {
      const p = flowThrough({ ...stageModel(water), floor }).path;
      for (let i = 0; i < p.length; i++) if (water.raster.lake[i] === k && p[i]) return true;
      return false;
    };
    const base = dayOneFloor(water, heights);
    if (!reached(base)) return no(`Left alone, the river never reaches ${plan.names[g.kettle] ?? g.kettle}`);
    if (reached(withSite(base, levee))) return no(`With its levee, the river still reaches ${plan.names[g.kettle] ?? g.kettle}`);
    return ok;
  },
};

/** `gate.opens` (§5.1): shut on day 1, no water leaves by the notch; opened (its rows cleared and its bar blasted a
 *  level), the river runs through the slot and down the Gate Bed out of the notch. */
const gateOpens: GateWorksInvariant = {
  id: "gate.opens",
  test({ plan, water, heights, ladder }) {
    const g = gateOf(plan)!;
    const r = water.raster;
    const gate = plan.links.findIndex((l) => l.id === g.gate) + 1;
    const open = ladder.works.find((x) => x.id === "gateOpen");
    if (!open) return no("The Gate is never opened");
    const out = (floor: Float64Array) => {
      const p = flowThrough({ ...stageModel(water), floor }).path;
      for (let i = 0; i < p.length; i++) {
        const x = i % r.W;
        const y = (i - x) / r.W;
        if (p[i] && r.channel[i] === gate && (x === 0 || y === 0 || x === r.W - 1 || y === r.H - 1)) return true;
      }
      return false;
    };
    const base = dayOneFloor(water, heights);
    if (out(base)) return no("Shut, the Gate lets the river out by the notch on day 1");
    if (!out(withSite(base, open))) return no("Opened, the Gate's water never reaches the notch");
    return ok;
  },
};

/** `basin.dry`, by number (§5.1: the basin under 12 % moist or wet on day 1): day 1's soil over the basin's floor. */
const basinDry: GateWorksInvariant = {
  id: "basin.dry",
  test({ plan, water, heights }) {
    const { zone } = gateZones(plan);
    const soil = soilReach(heights, waterOn(water, dayOneFloor(water, heights)), plan.W, plan.H);
    let floor = 0;
    let wet = 0;
    for (let i = 0; i < soil.length; i++) {
      if (zone[i] !== 2) continue;
      floor++;
      if (soil[i]) wet++;
    }
    const share = floor ? wet / floor : 0;
    return share < BASIN_DRY ? ok : no(`${(100 * share).toFixed(1)} % of the basin's floor is moist or wet on day 1 (under ${100 * BASIN_DRY} %)`);
  },
};
const BASIN_DRY = 0.12;

/** `map.shares` (planning's ruling of 2026-11-12: the valley's green and the basin's floor each a quarter of the map or
 *  more, the range and the hills the rest): day 1's moist or wet ground before the range, and the basin's dry ground
 *  past it within two levels of its pan, each `SHARE_LEAST` of the map or more. */
const mapShares: GateWorksInvariant = {
  id: "map.shares",
  test({ plan, water, heights }) {
    const g = gateOf(plan)!;
    const { zone } = gateZones(plan);
    const soil = soilReach(heights, waterOn(water, dayOneFloor(water, heights)), plan.W, plan.H);
    const N = plan.W * plan.H;
    let green = 0;
    let floor = 0;
    for (let i = 0; i < N; i++) {
      if (zone[i] === 0 && soil[i]) green++;
      if (zone[i] === 2 && soil[i] !== 2 && heights[i] <= g.pan.level + 2) floor++;
    }
    if (green / N < SHARE_LEAST) return no(`The valley's green is ${(100 * green / N).toFixed(1)} % of the map (${100 * SHARE_LEAST} % or more)`);
    if (floor / N < SHARE_LEAST) return no(`The basin's floor is ${(100 * floor / N).toFixed(1)} % of the map (${100 * SHARE_LEAST} % or more)`);
    return ok;
  },
};
export const SHARE_LEAST = 0.25;

/** The map's shares on day 1 (`map.shares`' reading): the valley's green, the basin's floor, the rest. */
export function gateShares(plan: PremisePlan, water: StageWater, heights: Uint8Array): { green: number; floor: number; rest: number } {
  const g = gateOf(plan)!;
  const { zone } = gateZones(plan);
  const soil = soilReach(heights, waterOn(water, dayOneFloor(water, heights)), plan.W, plan.H);
  const N = plan.W * plan.H;
  let green = 0;
  let floor = 0;
  for (let i = 0; i < N; i++) {
    if (zone[i] === 0 && soil[i]) green++;
    if (zone[i] === 2 && soil[i] !== 2 && heights[i] <= g.pan.level + 2) floor++;
  }
  return { green: green / N, floor: floor / N, rest: 1 - (green + floor) / N };
}

/** The gate's works invariants, on its ladder. */
export const GATE_WORKS_CHECKS: GateWorksInvariant[] = [worksSites, worksPaid, neckShuts, gateOpens, basinDry, mapShares];

export function gateWorksFailures(ctx: GateWorksContext): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (const inv of GATE_WORKS_CHECKS) {
    const r = inv.test(ctx);
    if (!r.ok) out.push({ id: inv.id, reason: r.reason });
  }
  return out;
}
