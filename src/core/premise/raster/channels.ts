// A channel's bed by number (docs/PREMISES.md §2.2, stage 1; four-lakes-design's `Channel`): its bed along its path,
// given in levels at the path's points (stepping down a whole level at a time between them) or, for the bypass, by
// number from the pool's sill to its exit; its width, a mouth where the plan gives one; a brook's course wandering a
// little; a dry channel's wadi strip, a level over its bed, ragged. A channel starts two tiles inside the body it
// leaves and ends two inside the one it reaches (§4.5: a run that started a tile outside its outline left none), and
// a bed a tile wide is joined edge to edge so water can run along it.

import { BED_FLOOR } from "../../land/genome";
import { fbm } from "../../math/noise";
import { dist, pathLength, segDist } from "../geom";
import { designLevel, WATER, type WaterTable } from "../levels";
import type { Body, Link, Point, PremisePlan } from "../types";
import { box, seedOf, type WaterRaster } from "./field";

/** How far a channel's course wanders from its path (D208: never ruler-straight; Four Lakes' `Channel.wander`): the
 *  bypass 2.2, a leat 0.8, a brook drawn from 1 to 4.2; the neck, the hanging valley and the gorge run true (their
 *  heads are weirs and lips). Tiles, the noise's amplitude across the path; it fades to nothing over `WANDER_EASE`
 *  at each end, so a channel leaves and meets its waters where the plan says. */
const WANDER = { bypass: 2.2, leat: 0.8, brook: [1, 4.2] } as const;
const WANDER_EASE = 6;
/** The wander's wavelength along the course, tiles. */
const WANDER_CELL = 14;
/** How much wider a brook's bed runs here and there. */
const BROOK_WIDEN = 0.5;
/** The bypass's bed (`bed: { under }`): it holds the pool's sill this far past its mouth, then steps down evenly to
 *  this level at its end (an edge, or the gorge's bed on the floor a level under it). Stage 2 cuts the land round it. */
const BYPASS_HOLD = 7;
const BYPASS_END = BED_FLOOR + 1;
/** How far a row's top stands over the water it holds back, at least. */
const ROW_CLEAR = 0.3;
/** A mouth's full width holds this far along, then narrows to the bed's over three tiles. */
const MOUTH_RUN = 7;

/** The bed a shut link's head holds up to its first row: the row's top (a level over it) clear of its body's water. */
export function headHolds(table: WaterTable, from: Body): number {
  return Math.ceil(designLevel(table, from) + ROW_CLEAR) - 1;
}

/** The half width `s` tiles along a path with one at each of its points, read straight between them. */
function halvesAt(path: readonly Point[], halves: readonly number[], s: number): number {
  if (s <= 0) return halves[0];
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const len = dist(path[k], path[k + 1]);
    if (s <= run + len) return halves[k] + (halves[k + 1] - halves[k]) * (len > 0 ? (s - run) / len : 1);
    run += len;
  }
  return halves[halves.length - 1];
}

/** A link's bed level `s` tiles along its path (negative: inside the body it leaves). */
export function bedAt(plan: PremisePlan, l: Link, s: number): number {
  const path = l.path!;
  const bed = l.bed;
  if (Array.isArray(bed)) {
    if (s <= 0) return bed[0];
    let run = 0;
    for (let k = 0; k + 1 < path.length; k++) {
      const len = dist(path[k], path[k + 1]);
      if (s < run + len || k + 2 === path.length) {
        const t = len > 0 ? Math.max(0, Math.min(1, (s - run) / len)) : 1;
        const b0 = bed[k];
        const b1 = bed[k + 1] ?? b0;
        // (down a whole level at a time, the last level kept for the segment's end: four-lakes-design's `brookBed`)
        return b0 >= b1 ? Math.max(b1, b0 - Math.floor(t * (b0 - b1 + 0.999))) : Math.min(b1, b0 + Math.floor(t * (b1 - b0 + 0.999)));
      }
      run += len;
    }
    return bed[bed.length - 1];
  }
  const from = plan.bodies.find((b) => b.id === l.from);
  const head = from ? from.sill : BYPASS_END;
  const len = pathLength(path);
  if (s <= BYPASS_HOLD || len <= BYPASS_HOLD) return head;
  const t = Math.min(1, (s - BYPASS_HOLD) / (len - BYPASS_HOLD));
  return Math.max(BYPASS_END, head - Math.floor(t * (head - BYPASS_END + 0.999)));
}

/** A link's half width `s` tiles along it (its mouth's at its head): `half`, or read between its path's points where
 *  the link gives a width for each (`Link.halves`). */
export function halfAt(l: Link, s: number): number {
  const half = l.halves && l.path && l.halves.length === l.path.length ? halvesAt(l.path, l.halves, s) : (l.half ?? 0.55);
  if (!l.mouth || s >= MOUTH_RUN + 3) return half;
  const m = l.mouth / 2;
  if (s < MOUTH_RUN) return m;
  return m + ((half - m) * (s - MOUTH_RUN)) / 3;
}

/** How far a link's course wanders (`WANDER`). */
export function wanderOf(plan: PremisePlan, l: Link): number {
  if (l.wander !== undefined) return l.wander;
  if (l.kind === "bypass") return WANDER.bypass;
  if (l.kind === "leat") return WANDER.leat;
  if (l.kind !== "brook") return 0;
  const u = (seedOf(plan, l.id, "wander") >>> 0) / 4294967296;
  return WANDER.brook[0] + (WANDER.brook[1] - WANDER.brook[0]) * u;
}

/** A link's course: its path (with its ends' leads) a tile at a time, each point moved across the path by the
 *  wander's noise, and the arc length along the path each point stands for. */
function courseOf(ext: Point[], wander: number, seed: number): { pts: Point[]; s: number[] } {
  let total = 0;
  for (let k = 0; k + 1 < ext.length; k++) total += dist(ext[k], ext[k + 1]);
  const pts: Point[] = [];
  const s: number[] = [];
  let run = 0;
  for (let k = 0; k + 1 < ext.length; k++) {
    const a = ext[k];
    const b = ext[k + 1];
    const segLen = dist(a, b);
    const u = unit(a, b);
    const steps = wander ? Math.max(1, Math.ceil(segLen)) : 1;
    for (let q = k === 0 ? 0 : 1; q <= steps; q++) {
      const at = run + (segLen * q) / steps;
      const ease = Math.max(0, Math.min(1, at / WANDER_EASE, (total - at) / WANDER_EASE));
      const o = wander ? wander * ease * fbm(seed, at, 0.5, WANDER_CELL, 2) : 0;
      pts.push([a[0] + ((b[0] - a[0]) * q) / steps - u[1] * o, a[1] + ((b[1] - a[1]) * q) / steps + u[0] * o]);
      s.push(at);
    }
    run += segLen;
  }
  return { pts, s };
}

/** Each link's channel: its bed tiles, levels and wadi strip. Bodies keep their tiles (a channel lowers its own ends'
 *  beds to meet them); where two channels cross, the lower bed keeps the tile. */
export function rasterChannels(plan: PremisePlan, table: WaterTable, r: WaterRaster): void {
  const { W, H } = r;
  const N = W * H;
  const dBest = new Float32Array(N).fill(Infinity);
  const sBest = new Float32Array(N);
  const exits = new Set(plan.exits.map((e) => e.id));
  const strips: [number, number][] = [];
  plan.links.forEach((l, li) => {
    if (!l.path || l.path.length < 2) return;
    const fromBody = plan.bodies.findIndex((b) => b.id === l.from);
    const toBody = plan.bodies.findIndex((b) => b.id === l.to);
    const path = l.path;
    const len = pathLength(path);
    // (two tiles into the body it leaves and the one it reaches; past the edge at an exit)
    const ext: Point[] = path.map((p) => [p[0], p[1]] as Point);
    const lead = fromBody >= 0 ? 2 : 0;
    if (lead) {
      const u = unit(path[1], path[0]);
      ext.unshift([path[0][0] + u[0] * lead, path[0][1] + u[1] * lead]);
    }
    if (toBody >= 0 || exits.has(l.to)) {
      const n = path.length;
      const u = unit(path[n - 2], path[n - 1]);
      ext.push([path[n - 1][0] + u[0] * 2, path[n - 1][1] + u[1] * 2]);
    }
    const lf = table.links[l.id];
    // (a dry bed a wet link joins (`Link.joins`) is wet from the join down, its wadi above it)
    const wetFrom = lf?.wetFrom ?? (lf?.wet ? -Infinity : Infinity);
    const wet = wetFrom === -Infinity;
    const brook = l.kind === "brook" && (l.half ?? 0) >= 1;
    const course = courseOf(ext, wanderOf(plan, l), seedOf(plan, l.id, "course"));
    const sWide = seedOf(plan, l.id, "wide");
    const sStrip = seedOf(plan, l.id, "strip");
    let hMost = 0;
    for (let s = 0; s <= len + 1; s += 1) hMost = Math.max(hMost, halfAt(l, s));
    const reach = hMost + BROOK_WIDEN + (wet ? 1 : 3.2);
    const touched: number[] = [];
    const { pts } = course;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const s0 = course.s[k];
      const s1 = course.s[k + 1];
      const [x0, y0, x1, y1] = box(W, H, Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          const { d, t } = segDist(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]);
          if (d > reach) continue;
          if (dBest[i] === Infinity) touched.push(i);
          if (d < dBest[i]) {
            dBest[i] = d;
            sBest[i] = s0 + t * (s1 - s0) - lead;
          }
        }
    }
    const inBed = new Set<number>();
    for (const i of touched) {
      const x = i % W;
      const y = (i - x) / W;
      const half = halfAt(l, Math.max(0, sBest[i])) + (brook ? BROOK_WIDEN * Math.max(0, fbm(sWide, x, y, 13, 2) + 0.1) : 0);
      if (dBest[i] <= Math.max(0.5, half)) inBed.add(i);
    }
    // a bed a tile wide, joined edge to edge: where its tiles meet only at a corner, the side tile nearer the path
    if ((l.half ?? 0.55) < 1) {
      let last = -1;
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const s0 = course.s[k];
        const s1 = course.s[k + 1];
        const segLen = dist(a, b);
        const steps = Math.max(1, Math.ceil(segLen * 4));
        for (let q = 0; q <= steps; q++) {
          const px = a[0] + ((b[0] - a[0]) * q) / steps;
          const py = a[1] + ((b[1] - a[1]) * q) / steps;
          const x = Math.floor(px);
          const y = Math.floor(py);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const i = y * W + x;
          if (last >= 0 && i !== last) {
            const lx = last % W;
            const ly = (last - lx) / W;
            if (lx !== x && ly !== y) {
              const c1 = ly * W + x;
              const c2 = y * W + lx;
              const d1 = segDist(x + 0.5, ly + 0.5, a[0], a[1], b[0], b[1]).d;
              const d2 = segDist(lx + 0.5, y + 0.5, a[0], a[1], b[0], b[1]).d;
              const side = d1 <= d2 ? c1 : c2;
              inBed.add(side);
              if (dBest[side] === Infinity) touched.push(side);
              dBest[side] = Math.min(dBest[side], 0.5);
              sBest[side] = s0 + (q / steps) * (s1 - s0) - lead;
            }
          }
          if (!inBed.has(i)) {
            inBed.add(i);
            if (dBest[i] === Infinity) touched.push(i);
            dBest[i] = Math.min(dBest[i], 0.5);
            sBest[i] = s0 + (q / steps) * (s1 - s0) - lead;
          }
          last = i;
        }
      }
    }
    const depth = Math.max(lf?.bedDepth ?? 0, WATER.designDepth);
    // (a bed other links' water joins: each reach's own depth, by the flow it carries below that join)
    const reaches = lf?.reaches;
    const reachDepth = (s: number): number => {
      if (!reaches) return depth;
      let d = reaches[0].depth;
      for (const q of reaches) if (s >= q.from) d = q.depth;
      return Math.max(d, WATER.designDepth);
    };
    const depthAt = (s: number) => (s >= wetFrom ? reachDepth(s) : WATER.designDepth);
    // a shut link's head holds its first row's top (a level over the bed) clear of its body's water: where that water
    // stands more than a level over its sill (the springs' pool through its neck alone), the head is a level higher
    const from = fromBody >= 0 ? plan.bodies[fromBody] : null;
    const rowAt = l.rows.length ? Math.min(...l.rows) : -Infinity;
    const holds = from ? headHolds(table, from) : -Infinity;
    for (const i of inBed) {
      const s = sBest[i];
      const bed = s <= rowAt + 1 ? Math.max(bedAt(plan, l, s), holds) : bedAt(plan, l, s);
      if (r.lake[i]) {
        const b = r.lake[i] - 1;
        // its own ends: the body's bed meets the channel's
        if ((b === fromBody || b === toBody) && bed < r.heights[i]) r.heights[i] = bed;
        continue;
      }
      if (r.fixed[i] && !r.channel[i]) continue;
      if (r.channel[i] && r.heights[i] <= bed) continue;
      r.channel[i] = li + 1;
      r.heights[i] = Math.max(0, bed);
      r.fixed[i] = 1;
      r.along[i] = s;
      r.surface[i] = bed + (wetFrom === -Infinity ? reachDepth(s) : depthAt(s));
    }
    // a dry channel's wadi: a ragged strip a level over its bed (where it is dry)
    if (!wet)
      for (const i of touched) {
        if (inBed.has(i) || r.fixed[i] || r.lake[i] || r.channel[i] || sBest[i] >= wetFrom) continue;
        const x = i % W;
        const y = (i - x) / W;
        const half = halfAt(l, Math.max(0, sBest[i]));
        if (dBest[i] > half + 1.7 + 1.3 * fbm(sStrip, x, y, 7, 2)) continue;
        strips.push([i, Math.max(0, bedAt(plan, l, sBest[i]) + 1)]);
      }
    for (const i of touched) dBest[i] = Infinity;
  });
  // (the strips once every bed is laid, so no strip stands where another channel runs)
  for (const [i, v] of strips) {
    if (r.fixed[i] || r.lake[i] || r.channel[i]) continue;
    r.heights[i] = v;
    r.fixed[i] = 1;
  }
}

function unit(a: Point, b: Point): Point {
  const d = dist(a, b);
  return d > 0 ? [(b[0] - a[0]) / d, (b[1] - a[1]) / d] : [1, 0];
}
