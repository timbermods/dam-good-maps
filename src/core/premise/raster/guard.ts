// The guard (docs/PREMISES.md §2.2, stage 1; four-lakes-design's guard): every tile beside water that would let it
// out stands a level over the water, so the water leaves only where the plan says (its links, its exits). Two
// waters that touch where no link joins them are parted first: the higher one gives up the tile, which then holds
// both. The guard's levels are the least stage 2's land may stand there (`WaterRaster.heights` on tiles not `fixed`),
// never a wall of their own: the land's envelope rises over them.

import type { PremisePlan } from "../types";
import { clearWater, near4, type WaterRaster } from "./field";

/** How far over the water's surface the guard must stand, at least: the next whole level over surface + this. */
const FREEBOARD = 0.15;
/** How far from a channel's head or end (tiles along it) it may meet another channel of the same body. */
const MEET = 1.5;
/** Two waters closer in level than this are one where they meet. */
const LEVEL = 0.5;
/** How fast a channel's water falls to its lake's level past its mouth, a level a tile; and how far it reaches. */
const SURGE_DROP = 0.25;
const SURGE_REACH = 6;

/** The water a tile belongs to: a body (its index) or a channel (-1 - its link's index); null on ground. */
function systemOf(r: WaterRaster, i: number): number | null {
  if (r.lake[i]) return r.lake[i] - 1;
  if (r.channel[i]) return -r.channel[i];
  return null;
}

/** Waters that touch where no link joins them: one gives up its tile, which becomes ground (the guard's). Returns
 *  the tiles parted. */
export function partWaters(plan: PremisePlan, r: WaterRaster): number {
  const { W, H } = r;
  const bodyIds = plan.bodies.map((b) => b.id);
  const links = plan.links;
  // (a channel's head and end: its first and last tiles of its own, where another's bed took its path's ends)
  const first = new Float64Array(links.length).fill(Infinity);
  const last = new Float64Array(links.length).fill(-Infinity);
  for (let i = 0; i < W * H; i++) {
    const k = r.channel[i] - 1;
    if (k < 0) continue;
    if (r.along[i] < first[k]) first[k] = r.along[i];
    if (r.along[i] > last[k]) last[k] = r.along[i];
  }
  // (a link's first row stands where the plan puts it, or at its first tiles of its own: water.ts `spanRow`; past it
  // is the side the row keeps dry)
  const rowAt = links.map((l, k) => (l.rows.length ? Math.max(Math.min(...l.rows), first[k] + 0.5) : Infinity));
  // (and past a weir: its water meets no other but where it runs into its own)
  const weirAt = links.map((l) => r.weirs[l.id]?.at ?? Infinity);
  const behind = (t: number, k: number) => r.along[t] >= rowAt[k] + 0.5 || r.along[t] >= weirAt[k];
  const head = (t: number) => {
    const k = r.channel[t] - 1;
    return r.along[t] < Math.max(0, first[k]) + MEET && !behind(t, k);
  };
  const end = (t: number, k: number) => r.along[t] > last[k] - MEET;
  const level = (p: number, q: number) => Math.abs(r.surface[p] - r.surface[q]) < LEVEL;
  // (a fall's upper water meets its lower only over its crest: the landmark's upper water is its valley's channel,
  // the gorge's lower water is its own)
  const joined = (i: number, j: number, a: number, b: number): boolean => {
    if (a === b) return true;
    if (a >= 0 && b >= 0) {
      for (const [p, q] of [[i, j], [j, i]]) {
        const k = r.crest[p];
        if (!k) continue;
        const l = links[k - 1];
        if (l.from === bodyIds[r.lake[p] - 1] && l.to === bodyIds[r.lake[q] - 1]) return true;
      }
      return false;
    }
    if (a < 0 && b < 0) {
      // (two channels of one body meet where both meet it, at their heads or their ends, or where both hold its water at
      // one level, neither past a row)
      const ka = -a - 1;
      const kb = -b - 1;
      const la = links[ka];
      const lb = links[kb];
      if (la.from === lb.from && head(i) && head(j)) return true;
      // (a tributary's end joins the other anywhere: both run on to the same water or the same exit)
      if (la.to === lb.to && (end(i, ka) || end(j, kb))) return true;
      if ((la.to === lb.from && end(i, ka) && head(j)) || (lb.to === la.from && end(j, kb) && head(i))) return true;
      const share = la.from === lb.from || la.to === lb.to || la.to === lb.from || lb.to === la.from;
      return share && !behind(i, ka) && !behind(j, kb) && level(i, j);
    }
    const [bodyTile, chanTile] = a >= 0 ? [i, j] : [j, i];
    const body = bodyIds[a >= 0 ? a : b];
    const k = r.channel[chanTile] - 1;
    const l = links[k];
    if (l.from !== body && l.to !== body) return false;
    if (l.fall) {
      if (l.kind === "gorge") return l.from !== body || r.crest[bodyTile] === k + 1;
      return l.to !== body || r.crest[chanTile] === k + 1;
    }
    // (a channel meets the body it leaves at its head, or where it holds that water, short of a row; the body it
    // reaches anywhere: its water runs on into it)
    if (l.from === body && (head(chanTile) || (!behind(chanTile, k) && level(i, j)))) return true;
    return l.to === body;
  };
  const nb = new Int32Array(4);
  const own = (t: number, sys: number): number => {
    near4(W, H, t, nb);
    let n = 0;
    for (const k of nb) if (k >= 0 && systemOf(r, k) === sys) n++;
    return n;
  };
  let parted = 0;
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
          const a = systemOf(r, i);
          if (j < 0 || a === null) continue;
          const b = systemOf(r, j);
          if (b === null || joined(i, j, a, b)) continue;
          // (the tile with more of its own water round it gives it up, so no narrow channel is cut; else the higher)
          const ni = own(i, a);
          const nj = own(j, b);
          // (a fall's crest never: its lip is the fall's width)
          const ci = r.crest[i] !== 0;
          const cj = r.crest[j] !== 0;
          const drop = ci !== cj ? (ci ? j : i) : ni !== nj ? (ni > nj ? i : j) : r.surface[i] >= r.surface[j] ? i : j;
          clearWater(r, drop);
          r.fixed[drop] = 0;
          r.heights[drop] = 0;
          changed++;
        }
      }
    parted += changed;
    if (!changed) break;
  }
  r.parted += parted;
  return parted;
}

/** Water cut off from the rest of its own (a pocket of a plunge pool past a crossing channel, the tail of a bed past
 *  another's): ground. A body keeps its largest piece; a channel each piece that meets a body of its own or the map's
 *  edge, or the bed of a link that joins it (`Link.joins`: a tributary's end lies across its trunk's bed, so a trunk
 *  two join is three pieces, its middle one between their ends; dropped, the trunk's water ran out over the land there,
 *  256² seeds 1 and 2). Returns the tiles dropped. */
export function dropPockets(plan: PremisePlan, r: WaterRaster): number {
  const { W, H } = r;
  const N = W * H;
  const comp = new Int32Array(N).fill(-1);
  const nb = new Int32Array(4);
  const pieces: { sys: number; tiles: number[]; meets: boolean }[] = [];
  const bodyIdx = new Map(plan.bodies.map((b, k) => [b.id, k]));
  for (let i = 0; i < N; i++) {
    const sys = systemOf(r, i);
    if (sys === null || comp[i] >= 0) continue;
    const id = pieces.length;
    const tiles: number[] = [];
    let meets = false;
    const link = sys < 0 ? plan.links[-sys - 1] : null;
    const ends = link ? [bodyIdx.get(link.from), bodyIdx.get(link.to)] : [];
    const tributary = (k: number): boolean => k > 0 && plan.links[k - 1].joins?.link === link!.id;
    comp[i] = id;
    const stack = [i];
    while (stack.length) {
      const c = stack.pop()!;
      tiles.push(c);
      const x = c % W;
      const y = (c - x) / W;
      if (link && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) meets = true;
      near4(W, H, c, nb);
      for (const j of nb) {
        if (j < 0) continue;
        if (link && r.lake[j] && ends.includes(r.lake[j] - 1)) meets = true;
        if (link && tributary(r.channel[j])) meets = true;
        if (comp[j] >= 0 || systemOf(r, j) !== sys) continue;
        comp[j] = id;
        stack.push(j);
      }
    }
    pieces.push({ sys, tiles, meets });
  }
  const largest = new Map<number, number>();
  for (const [k, p] of pieces.entries()) {
    const best = largest.get(p.sys);
    if (best === undefined || pieces[best].tiles.length < p.tiles.length) largest.set(p.sys, k);
  }
  let dropped = 0;
  for (const [k, p] of pieces.entries()) {
    if (largest.get(p.sys) === k || (p.sys < 0 && p.meets)) continue;
    for (const i of p.tiles) {
      clearWater(r, i);
      r.fixed[i] = 0;
      r.heights[i] = 0;
      dropped++;
    }
  }
  r.parted += dropped;
  return dropped;
}

/** A channel's water runs into its lake higher than the lake stands (the neck carries the springs' pool into the top
 *  lake more than a level over its bed): the lake's surface by its mouth rises to meet it, falling `SURGE_DROP` a tile,
 *  so the guard there stands over it. */
export function surgeMouths(plan: PremisePlan, r: WaterRaster): void {
  const { W, H } = r;
  const N = W * H;
  const toBody = plan.links.map((l) => plan.bodies.findIndex((b) => b.id === l.to));
  const nb = new Int32Array(4);
  for (let pass = 0; pass < SURGE_REACH; pass++) {
    let changed = 0;
    for (let i = 0; i < N; i++) {
      const k = r.lake[i] - 1;
      if (k < 0 || r.pool[i] || r.crest[i]) continue;
      near4(W, H, i, nb);
      for (const j of nb) {
        if (j < 0) continue;
        const from = r.channel[j] ? toBody[r.channel[j] - 1] === k : r.lake[j] === k + 1 && !r.pool[j] && !r.crest[j];
        if (!from) continue;
        const v = r.surface[j] - SURGE_DROP;
        if (v > r.surface[i]) {
          r.surface[i] = v;
          changed++;
        }
      }
    }
    if (!changed) break;
  }
}

/** Every ground tile beside water raised to a level over the water's surface. Returns the tiles raised. */
export function guardWater(r: WaterRaster): number {
  const { W, H } = r;
  const N = W * H;
  const nb = new Int32Array(4);
  let raised = 0;
  for (let i = 0; i < N; i++) {
    if (r.lake[i] || r.channel[i]) continue;
    let need = -1;
    near4(W, H, i, nb);
    for (const j of nb) {
      if (j < 0 || !(r.lake[j] || r.channel[j])) continue;
      const v = Math.floor(r.surface[j] + FREEBOARD) + 1;
      if (v > need) need = v;
    }
    if (need > r.heights[i]) {
      r.heights[i] = need;
      raised++;
    }
  }
  return raised;
}
