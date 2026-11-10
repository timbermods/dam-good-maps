// A channel's bed by number (docs/PREMISES.md §2.2, stage 1; four-lakes-design's `Channel`): its bed along its path,
// given in levels at the path's points (stepping down a whole level at a time between them) or, for the bypass, by
// number from the pool's sill to its exit; its width, a mouth where the plan gives one; a brook's course wandering a
// little; a dry channel's wadi strip, a level over its bed, ragged. A channel starts two tiles inside the body it
// leaves and ends two inside the one it reaches (§4.5: a run that started a tile outside its outline left none), and
// a bed a tile wide is joined edge to edge so water can run along it.

import { fbm } from "../../math/noise";
import { dist, pathLength, segDist } from "../geom";
import { WATER, type WaterTable } from "../levels";
import type { Link, Point, PremisePlan } from "../types";
import { box, seedOf, type WaterRaster } from "./field";

/** How far a brook's course wanders from its path, and how much wider its bed runs here and there. */
const BROOK_WANDER = 1.2;
const BROOK_WIDEN = 0.5;
/** The bypass's bed (`bed: { under }`): it holds the pool's sill this far past its mouth, then steps down evenly to
 *  this level at its end (an edge, or the gorge's bed a level under it). Stage 2 cuts the land round it. */
const BYPASS_HOLD = 7;
const BYPASS_END = 1;
/** A mouth's full width holds this far along, then narrows to the bed's over three tiles. */
const MOUTH_RUN = 7;

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

/** A link's half width `s` tiles along it (its mouth's at its head). */
export function halfAt(l: Link, s: number): number {
  const half = l.half ?? 0.55;
  if (!l.mouth || s >= MOUTH_RUN + 3) return half;
  const m = l.mouth / 2;
  if (s < MOUTH_RUN) return m;
  return m + ((half - m) * (s - MOUTH_RUN)) / 3;
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
    const wet = !!lf?.wet;
    const brook = l.kind === "brook" && (l.half ?? 0) >= 1;
    const wander = brook ? BROOK_WANDER : 0;
    const sW1 = seedOf(plan, l.id, "wx");
    const sW2 = seedOf(plan, l.id, "wy");
    const sWide = seedOf(plan, l.id, "wide");
    const sStrip = seedOf(plan, l.id, "strip");
    let hMost = 0;
    for (let s = 0; s <= len + 1; s += 1) hMost = Math.max(hMost, halfAt(l, s));
    const reach = hMost + BROOK_WIDEN + wander + (wet ? 1 : 3.2);
    const touched: number[] = [];
    let run = 0;
    for (let k = 0; k + 1 < ext.length; k++) {
      const a = ext[k];
      const b = ext[k + 1];
      const segLen = dist(a, b);
      const [x0, y0, x1, y1] = box(W, H, Math.min(a[0], b[0]) - reach, Math.min(a[1], b[1]) - reach, Math.max(a[0], b[0]) + reach, Math.max(a[1], b[1]) + reach);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * W + x;
          const px = x + 0.5 + (wander ? wander * fbm(sW1, x, y, 14, 2) : 0);
          const py = y + 0.5 + (wander ? wander * fbm(sW2, x, y, 14, 2) : 0);
          const { d, t } = segDist(px, py, a[0], a[1], b[0], b[1]);
          if (dBest[i] === Infinity) touched.push(i);
          if (d < dBest[i]) {
            dBest[i] = d;
            sBest[i] = run + t * segLen - lead;
          }
        }
      run += segLen;
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
      let run2 = 0;
      for (let k = 0; k + 1 < ext.length; k++) {
        const a = ext[k];
        const b = ext[k + 1];
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
              sBest[side] = run2 + (q / steps) * segLen - lead;
            }
          }
          if (!inBed.has(i)) {
            inBed.add(i);
            if (dBest[i] === Infinity) touched.push(i);
            dBest[i] = Math.min(dBest[i], 0.5);
            sBest[i] = run2 + (q / steps) * segLen - lead;
          }
          last = i;
        }
        run2 += segLen;
      }
    }
    const depth = Math.max(lf?.depth ?? 0, WATER.designDepth);
    for (const i of inBed) {
      const s = sBest[i];
      const bed = bedAt(plan, l, s);
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
      r.surface[i] = bed + depth;
    }
    // a dry channel's wadi: a ragged strip a level over its bed
    if (!wet)
      for (const i of touched) {
        if (inBed.has(i) || r.fixed[i] || r.lake[i] || r.channel[i]) continue;
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
