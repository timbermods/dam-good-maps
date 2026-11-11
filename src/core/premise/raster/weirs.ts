// The weirs at the heads of channels a body's water splits between (docs/PREMISES.md §2.2, stage 1; levels.ts
// `weirs`): the springs' pool's neck and hanging valley, or a lake's hanging valley beside its fall. A channel's own
// course sets what it carries (measured on seed 1: the valley 3.2 a tile of width a level of head, the neck 1.9), so
// where the water splits each head is a lip instead: a crest two tiles thick at the head bed just past the body's
// shore, square to the grid (a weir across a diagonal carries a third less a tile), a tile or two aside where another
// water crowds it, its width in tiles that pour; the body's water a level deep behind it, rock beside its ends, and
// the bed past it two levels lower (a level for a hanging valley, whose lip is the next step), with the shelf of a
// body it runs into. Its own course past it, bent back beside its head, is rock there. Each then carries as a lip
// does, `lipCarry` × its tiles × the head, and the split is the table's.

import { pathDist, pointAt } from "../geom";
import { designLevel, WATER, weirs, weirWidth, type WaterTable } from "../levels";
import { Rng } from "../../math/rng";
import type { Point, PremisePlan } from "../types";
import { clearWater, near4, seedOf, type WaterRaster } from "./field";
import { lipStair, lipTiles, type LipStair } from "./falls";

/** The crest's thickness, and how far past the body's shore it starts. */
const THICK = 2;
/** The rows in front of the crest it lowers, the rock beside its ends, and the rows behind it kept a level deep. */
const FRONT = 3;
const SHOULDER = 2;
const BEHIND = 5;
/** How far into the body a channel past a weir runs into its bed stays a level under the crest. */
const MOUTH_REACH = 3;
/** The farthest a weir's stair is lengthened, past its width, to hold its width in tiles. */
const GROW = 6;

export function rasterWeirs(plan: PremisePlan, table: WaterTable, r: WaterRaster): void {
  const { W, H } = r;
  const nb = new Int32Array(4);
  const weired = weirs(plan);
  plan.links.forEach((l, li) => {
    if (!weired.has(l.id) || !l.path) return;
    const path = l.path;
    const crest = (l.bed as number[])[0];
    const k0 = plan.bodies.findIndex((b) => b.id === l.from) + 1;
    const from = k0 ? plan.bodies[k0 - 1] : null;
    const width = weirWidth(l);
    const tileAt = (s: number) => {
      const { p } = pointAt(path, s);
      const x = Math.floor(p[0]);
      const y = Math.floor(p[1]);
      return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
    };
    // (its front edge: the crest's thickness past where the path leaves the body's water)
    let shore = 0;
    while (shore < 12 && k0 && r.lake[tileAt(shore)] === k0) shore += 0.25;
    const at0 = shore + THICK;
    const { p, dir } = pointAt(path, at0);
    const n: Point = Math.abs(dir[0]) >= Math.abs(dir[1]) ? [Math.sign(dir[0]), 0] : [0, Math.sign(dir[1])];
    const dL: Point = [-n[1], n[0]];
    const ours = (i: number) => r.channel[i] === li + 1;
    const body = (i: number) => k0 > 0 && r.lake[i] === k0;
    // (another water is not its to take; ground stage 1 laid before it, a dry bed's strip or a body's rim, is)
    const free = (i: number) => ours(i) || body(i) || (!r.lake[i] && !r.channel[i]);
    // (its place across the channel: on the path, else a tile or two aside where another water crowds it there)
    const placeAt = (o: number) => {
      const q: Point = [p[0] + dL[0] * o, p[1] + dL[1] * o];
      const stairOf = (w: number): LipStair =>
        lipStair([q[0] - (dL[0] * w) / 2, q[1] - (dL[1] * w) / 2], [q[0] + (dL[0] * w) / 2, q[1] + (dL[1] * w) / 2], n, new Rng(seedOf(plan, l.id, "weir")));
      let drawn = width;
      let st = stairOf(width);
      while (drawn < width + GROW && lipTiles(st) < width) st = stairOf(++drawn);
      const { a, sb, c0, c1, t } = st;
      const m = c1 - c0 + 1;
      const T = (c: number) => t[Math.max(0, Math.min(m - 1, c - c0))];
      const atCK = (c: number, k: number): number => {
        const row = sb < 0 ? T(c) + k : T(c) - 1 - k;
        const x = a === 0 ? c : row;
        const y = a === 0 ? row : c;
        return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
      };
      let crowded = 0;
      for (let c = c0 - 1; c <= c1 + 1; c++)
        for (let k = -1; k <= THICK; k++) {
          const i = atCK(c, k);
          if (i < 0 || !free(i)) crowded++;
        }
      return { c0, c1, atCK, crowded };
    };
    let place = placeAt(0);
    for (const o of [1, -1, 2, -2]) {
      if (!place.crowded) break;
      const other = placeAt(o);
      if (other.crowded < place.crowded) place = other;
    }
    const { c0, c1, atCK } = place;
    const upLevel = from ? designLevel(table, from) : crest + WATER.designDepth;
    const bedDepth = Math.max(WATER.designDepth, table.links[l.id].bedDepth);
    const surfaceAt = Math.max(upLevel, crest + bedDepth);
    const past = crest - (l.fall ? 1 : 2);
    const setWater = (i: number, h: number, surface: number, s0: number, s1: number) => {
      const x = i % W;
      const y = (i - x) / W;
      r.lake[i] = 0;
      r.pool[i] = 0;
      r.crest[i] = 0;
      r.channel[i] = li + 1;
      r.heights[i] = Math.max(0, h);
      r.fixed[i] = 1;
      r.along[i] = Math.max(s0, Math.min(s1, pathDist(x + 0.5, y + 0.5, path).s));
      r.surface[i] = surface;
    };
    const crestTiles: number[] = [];
    for (let c = c0; c <= c1; c++) {
      // the crest, and the bed in front of it a level lower
      for (let k = 0; k < THICK; k++) {
        const i = atCK(c, k);
        if (i < 0 || !free(i)) continue;
        setWater(i, crest, surfaceAt, -Infinity, at0 - 0.5);
        crestTiles.push(i);
      }
      for (let k = -1; k >= -FRONT; k--) {
        const i = atCK(c, k);
        if (i >= 0 && free(i)) setWater(i, Math.min(past, ours(i) ? r.heights[i] : past), Math.max(surfaceAt, ours(i) ? r.surface[i] : 0), at0, Infinity);
      }
    }
    // the water behind it a level deep up to the crest, the whole width (a body's shelf at its sill there would be a
    // weir of its own, and a crest tile with ground behind it pours nothing)
    const apron = new Set<number>();
    for (let c = c0 - 1; c <= c1 + 1; c++)
      for (let k = THICK; k < THICK + BEHIND; k++) {
        const i = atCK(c, k);
        if (i < 0) continue;
        const inCol = c >= c0 && c <= c1;
        // (beside its ends, its own course past it, bent back there, is not its head)
        if (body(i) || (ours(i) && (inCol || r.along[i] < at0))) {
          if (r.heights[i] > crest - 1) r.heights[i] = Math.max(0, crest - 1);
        } else if (inCol && free(i)) setWater(i, crest - 1, surfaceAt, -Infinity, at0 - 1);
        else continue;
        if (inCol) apron.add(i);
      }
    // rock beside its ends, so the water passes over the crest alone: beside the crest its own water, in front of it
    // any other (another channel's head beside it too) and its own above the crest (its bed past the crest, where its
    // course bends, stays)
    for (const [ca, cb] of [
      [c0 - SHOULDER, c0 - 1],
      [c1 + 1, c1 + SHOULDER],
    ])
      for (let c = ca; c <= cb; c++)
        for (let k = -FRONT; k < THICK; k++) {
          const i = atCK(c, k);
          if (i < 0 || !(k >= 0 ? ours(i) : ours(i) ? r.along[i] < at0 : r.lake[i] || r.channel[i])) continue;
          clearWater(r, i);
          r.heights[i] = crest + 1;
          r.fixed[i] = 1;
        }
    // past it the channel's bed lower, all the way; the reach at that level runs on to the next step down, and its
    // water may stand over the crest there, so its banks are the body's (the guard stands over the body's level)
    const crestSet = new Set(crestTiles);
    for (let i = 0; i < W * H; i++) {
      if (!ours(i) || crestSet.has(i) || r.along[i] < at0) continue;
      if (r.heights[i] > past) r.heights[i] = Math.max(0, past);
      if (r.heights[i] === past) r.surface[i] = Math.max(r.surface[i], surfaceAt);
    }
    // and where its course past it bends back beside its head or its body, rock there: the water passes over the crest
    // alone (a hanging valley that hooks back past its source took half its flow round its weir, seed 11 at 128²)
    const head = (j: number) => body(j) || apron.has(j) || (ours(j) && !crestSet.has(j) && r.along[j] < at0);
    for (let i = 0; i < W * H; i++) {
      if (!ours(i) || crestSet.has(i) || apron.has(i) || r.along[i] < at0) continue;
      near4(W, H, i, nb);
      if (!Array.from(nb).some((j) => j >= 0 && head(j))) continue;
      clearWater(r, i);
      r.heights[i] = crest + 1;
      r.fixed[i] = 1;
    }
    // and where it runs into a body, that body's shelf there a level lower too (else the shelf is a second weir, at
    // the first's crest, and drowns it)
    const kTo = l.fall ? 0 : plan.bodies.findIndex((b) => b.id === l.to) + 1;
    if (kTo) {
      let ring: number[] = [];
      for (let i = 0; i < W * H; i++) if (ours(i) && r.along[i] >= at0) ring.push(i);
      const seen = new Set<number>(ring);
      for (let step = 0; step < MOUTH_REACH && ring.length; step++) {
        const next: number[] = [];
        for (const i of ring) {
          near4(W, H, i, nb);
          for (const j of nb) {
            if (j < 0 || seen.has(j) || r.lake[j] !== kTo) continue;
            seen.add(j);
            if (r.heights[j] > past) r.heights[j] = Math.max(0, past);
            next.push(j);
          }
        }
        ring = next;
      }
    }
    // its tiles that pour: crest tiles with the lowered bed beside them
    const lip = crestTiles.filter((i) => {
      near4(W, H, i, nb);
      return Array.from(nb).some((j) => j >= 0 && ours(j) && !crestSet.has(j) && r.along[j] >= at0 && r.heights[j] < crest);
    });
    const cols: [number, number, number, number][] = [];
    for (let c = c0; c <= c1; c++) cols.push([atCK(c, -1), atCK(c, 0), atCK(c, 1), atCK(c, THICK)]);
    r.weirs[l.id] = { at: at0, lip, cols };
  });
}
