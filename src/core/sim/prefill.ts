// The canonical settle (PLAN §10, §19.7): the water written into a file always starts from a state
// computed from the terrain and the sources alone, then runs the exact simulation on a fixed
// schedule until the deterministic settle test passes. Interactive previews may warm-start; files
// never do.
//
// The starting state has two parts, both deterministic (prototype/watersim.py `prefill` is the same
// algorithm, checked against this one by the oracle):
// - basins: a priority flood from the draining map edge gives every tile its spill level. Water
//   from the sources runs downhill on that filled surface; every depression it passes through
//   starts full, at its spill level (surfaces settle flat, notes/water_and_soil.md Q2);
// - rivers: the other tiles on the water's path start at the depth an open channel carries its
//   flow with, about 0.3·Q/w (Q the flow through the tile, w the channel width there; a lip tile
//   passes all its water each substep, PLAN §9.2).
// A basin sealed off from its river (a carve's oxbow lake) then starts with the water it kept
// (water.ts `RetainedWater`, stored with the carve): it is part of the map, like its sources.

import { MinHeap } from "../math/grid";
import { SettleRun, WaterSim, type SettleResult, type WaterModel, type WaterState } from "./water";

/** Spill level of every tile: the lowest level water standing there can drain at, through the map
 *  edge (Barnes' priority flood). Edge tiles that emit water are walled off from the edge and are
 *  not outlets. A partial obstacle (NaturalDam) raises its tile's level by its height. */
export function spillLevels(m: WaterModel): Float64Array {
  const { W, H } = m;
  const N = W * H;
  const level = new Float64Array(N);
  for (let i = 0; i < N; i++) level[i] = m.floor[i] + (m.dam && m.dam[i] >= 0 ? m.dam[i] : 0);
  const emitting = new Uint8Array(N);
  for (const e of m.emitters) for (const i of e.cells) emitting[i] = 1;
  const filled = level.slice();
  const seen = new Uint8Array(N);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !emitting[i]) {
      seen[i] = 1;
      heap.push(filled[i], i);
    }
  }
  while (heap.size > 0) {
    const c = heap.pop();
    const lv = heap.lastKey;
    const x = c % W;
    const y = (c - x) / W;
    for (let k = 0; k < 4; k++) {
      let n: number;
      if (k === 0) n = y > 0 ? c - W : -1;
      else if (k === 1) n = x > 0 ? c - 1 : -1;
      else if (k === 2) n = y < H - 1 ? c + W : -1;
      else n = x < W - 1 ? c + 1 : -1;
      if (n < 0 || seen[n]) continue;
      seen[n] = 1;
      if (filled[n] < lv) filled[n] = lv;
      heap.push(filled[n], n);
    }
  }
  return filled;
}

/** The deterministic starting state of the canonical settle (see the file comment). */
export function prefill(m: WaterModel): WaterState {
  const { W, H } = m;
  const N = W * H;
  const spill = spillLevels(m);
  // flow through each tile: the strength of every emitter whose water passes it, walking downhill
  // (or level) on the filled surface
  const q = new Float64Array(N);
  const qBad = new Float64Array(N);
  const path = new Uint8Array(N);
  const mark = new Int32Array(N);
  const queue = new Int32Array(N);
  let stamp = 0;
  for (const e of m.emitters) {
    if (!(e.strength > 0)) continue;
    stamp++;
    let head = 0;
    let tail = 0;
    for (const i of e.cells) {
      if (mark[i] !== stamp) {
        mark[i] = stamp;
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const c = queue[head++];
      q[c] += e.strength;
      if (e.contamination > 0) qBad[c] += e.strength * e.contamination;
      path[c] = 1;
      const x = c % W;
      const y = (c - x) / W;
      for (let k = 0; k < 4; k++) {
        let n: number;
        if (k === 0) n = y > 0 ? c - W : -1;
        else if (k === 1) n = x > 0 ? c - 1 : -1;
        else if (k === 2) n = y < H - 1 ? c + W : -1;
        else n = x < W - 1 ? c + 1 : -1;
        if (n < 0 || mark[n] === stamp || spill[n] > spill[c]) continue;
        mark[n] = stamp;
        queue[tail++] = n;
      }
    }
  }
  // open-channel tiles (on the path, not in a depression): local width = the shorter of the row
  // and column runs of such tiles through the tile
  const open = new Uint8Array(N);
  for (let i = 0; i < N; i++) open[i] = path[i] && !(spill[i] > m.floor[i]) ? 1 : 0;
  const runX = new Int32Array(N);
  const runY = new Int32Array(N);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      if (!open[y * W + x]) {
        x++;
        continue;
      }
      let x1 = x;
      while (x1 < W && open[y * W + x1]) x1++;
      for (let k = x; k < x1; k++) runX[y * W + k] = x1 - x;
      x = x1;
    }
  }
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!open[y * W + x]) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 < H && open[y1 * W + x]) y1++;
      for (let k = y; k < y1; k++) runY[k * W + x] = y1 - y;
      y = y1;
    }
  }
  const depth = new Float64Array(N);
  const contamination = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    if (!path[i]) continue;
    let d: number;
    if (spill[i] > m.floor[i]) d = spill[i] - m.floor[i];
    else {
      const w = runX[i] < runY[i] ? runX[i] : runY[i];
      d = (0.3 * q[i]) / w;
      if (d > 1) d = 1;
    }
    depth[i] = d;
    contamination[i] = d > 0 && q[i] > 0 ? qBad[i] / q[i] : 0;
  }
  // a sealed basin starts with the water it kept (water.ts RetainedWater), up to the surface it had
  for (const lake of m.retained ?? [])
    for (let k = 0; k < lake.tiles.length; k++) {
      const i = lake.tiles[k];
      if (m.floor[i] === lake.floor[k]) {
        depth[i] = lake.depth[k];
        contamination[i] = lake.contamination[k];
      } else {
        const d = lake.floor[k] + lake.depth[k] - m.floor[i];
        depth[i] = d > 0 ? d : 0;
        contamination[i] = d > 0 ? lake.contamination[k] : 0;
      }
    }
  return { depth, contamination };
}

export interface CanonicalWater extends SettleResult {
  depth: Float64Array;
  contamination: Float64Array;
  /** Cluster saturation of the settled water (moisture and evaporation). */
  sat: Uint8Array;
  /** The settled outflow momentum, 4 per tile (the editor's preview warm-starts from it). */
  out?: Float64Array;
  /** The editor's warm-started preview (sim/preview.ts), not the canonical settle: never written
   *  to a file, and replaced by the canonical settle in the background (EDITOR_PLAN §6). */
  preview?: boolean;
  /** The last settled water carried over to changed ground while the water settles again in the
   *  background (sim/preview.ts `staleWater`): shown at once after an edit, never written to a
   *  file. Always `preview` too. */
  stale?: boolean;
}

/** The canonical settle: the pre-fill, then the exact simulation until it settles (at most 4 game
 *  days, checked every 128 ticks). The same input always gives the same bytes. */
export function canonicalSettle(m: WaterModel): CanonicalWater {
  const run = canonicalRun(m);
  let r = run.advance(Infinity);
  while (!r) r = run.advance(Infinity);
  return r;
}

/** The canonical settle in slices (`advance` runs at most the ticks it is given): the editor's
 *  worker runs it between answers to the page, and drops it when a newer edit arrives. The result
 *  equals `canonicalSettle`'s. */
export function canonicalRun(m: WaterModel): { advance(ticks: number): CanonicalWater | null; readonly ticks: number; readonly maxTicks: number } {
  const sim = new WaterSim(m, prefill(m));
  const run = new SettleRun(sim);
  let done: CanonicalWater | null = null;
  return {
    advance(ticks: number): CanonicalWater | null {
      if (done) return done;
      const r = run.advance(ticks);
      if (r) done = { ...r, depth: sim.D, contamination: sim.C, sat: sim.saturation(), out: sim.out.slice() };
      return done;
    },
    get ticks() {
      return run.ticks;
    },
    get maxTicks() {
      return run.maxTicks;
    },
  };
}
