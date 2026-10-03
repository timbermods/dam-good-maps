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
// (water.ts `RetainedWater`, stored with the carve): it is part of the map, like its sources. A Fill
// (D394) is stored and starts the same way.
//
// The walk spreads level over flat ground in every direction, further than a source's water goes:
// a hollow on a dry plateau the walk crossed starts full, and the thin start on the plateau drains
// into a hollow that started empty. That water would come from nowhere (D385). So once the water has
// settled, the water no running source and no kept stored lake reaches (sim/fed.ts `withoutUnfed`) is
// taken away, with the unfed water the player removed (the model's `drained`, D387 (2)), and the
// water settles on from there (`DRAIN_DAYS`); a map with none keeps its bytes.
//
// A sealed basin only evaporating is settled water (D222, D413): the settle stops once nothing else
// changes, and the basin is stored with the water it started with, so a Fill is stored at exactly
// its level and an oxbow lake with the water its carve kept; the game evaporates them from there.

import { MinHeap } from "../math/grid";
import { withoutUnfed } from "./fed";
import { sealedTiles, SettleRun, WaterSim, type SettleResult, type WaterModel, type WaterState } from "./water";

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

/** The flow through each tile (`q`, blocks a second: the strength of every running emitter whose
 *  water passes it, walking downhill or level on the filled surface), its badwater part, the tiles
 *  it passes (`path`) and the spill levels it walked on. */
export function flowThrough(m: WaterModel): { q: Float64Array; qBad: Float64Array; path: Uint8Array; spill: Float64Array } {
  const { W, H } = m;
  const N = W * H;
  const spill = spillLevels(m);
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
  return { q, qBad, path, spill };
}

/** The deterministic starting state of the canonical settle (see the file comment). */
export function prefill(m: WaterModel): WaterState {
  const { W, H } = m;
  const N = W * H;
  const { q, qBad, path, spill } = flowThrough(m);
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
 *  days, checked every 128 ticks), then, when unfed water is left (the pre-fill's water nothing
 *  reaches, or water a removal drained; see the file comment), once more after taking it (at most
 *  `DRAIN_DAYS`). The same input always gives the same bytes. A sealed basin's
 *  evaporation is not the water changing: the settle stops at the first check where only that
 *  still changed (`steadyTicks`, D222, D413), and every sealed basin at its last check (water.ts
 *  `sealedBasins`) is stored as the pre-fill started it (`keepSealed`). */
export function canonicalSettle(m: WaterModel): CanonicalWater {
  if (canonicalBackend) return canonicalBackend(m, prefill(m));
  const run = canonicalRun(m);
  let r = run.advance(Infinity);
  while (!r) r = run.advance(Infinity);
  return r;
}

/** Where `canonicalSettle` runs after its pre-fill when a batch job asks (tools/rust/native-water.ts: the
 *  native Rust water, PLAN §20 D381), else null: here, with the Rust water in WebAssembly. Both give the
 *  same bytes (tools/rust/water-identity.ts checks it in CI). */
let canonicalBackend: ((m: WaterModel, start: WaterState) => CanonicalWater) | null = null;

/** Sets (or clears, with null) `canonicalSettle`'s backend; Node batch jobs only. */
export function setCanonicalBackend(backend: ((m: WaterModel, start: WaterState) => CanonicalWater) | null): void {
  canonicalBackend = backend;
}

/** The canonical settle in slices (`advance` runs at most the ticks it is given): the editor's
 *  worker runs it between answers to the page, and drops it when a newer edit arrives. The result
 *  equals `canonicalSettle`'s. */
export function canonicalRun(m: WaterModel): { advance(ticks: number): CanonicalWater | null; readonly ticks: number; readonly maxTicks: number } {
  const start = prefill(m);
  let sim = new WaterSim(m, start);
  const sealed = sealedTiles(m);
  let run = new SettleRun(sim, { sealed });
  let maxTicks = run.maxTicks;
  // once the water has settled, its unfed water is taken away and the water settles on from there,
  // at most DRAIN_DAYS more (D385, D387 (2))
  let drainNext = true;
  let done: CanonicalWater | null = null;
  return {
    advance(ticks: number): CanonicalWater | null {
      if (done) return done;
      let left = ticks;
      for (;;) {
        const t0 = sim.ticks;
        const r = run.advance(left);
        left -= sim.ticks - t0;
        if (!r) return null;
        if (drainNext) {
          drainNext = false;
          const next = withoutUnfed(m, sim);
          if (next) {
            sim = next;
            run = new SettleRun(sim, { sealed, maxDays: DRAIN_DAYS });
            maxTicks = sim.ticks + run.maxTicks;
            if (left > 0) continue;
            return null;
          }
        }
        const kept = keepSealed(sim, run.closedBasins(), start, m.drained);
        done = { ...r, depth: sim.D, contamination: sim.C, sat: kept ? new WaterSim(m, { depth: sim.D, contamination: sim.C }).saturation() : sim.saturation(), out: sim.out.slice() };
        return done;
      }
    },
    get ticks() {
      return sim.ticks;
    },
    get maxTicks() {
      return maxTicks;
    },
  };
}

/** A sealed basin only evaporating is stored as it started (D413): every tile of the sealed basins
 *  at the settle's last check (`closed`, water.ts `sealedBasins`) but a drained one gets back its
 *  pre-fill depth and badwater share (`start`: the water its lake kept, a Fill's level), its
 *  outflows still. What the settle's days evaporated is the game's to evaporate, from the file.
 *  Whether any tile was given back. */
function keepSealed(sim: WaterSim, closed: Uint8Array | null, start: WaterState, drained: readonly number[] | undefined): boolean {
  if (!closed) return false;
  const skip = new Set(drained ?? []);
  let any = false;
  for (let i = 0; i < sim.N; i++) {
    if (!closed[i] || skip.has(i)) continue;
    sim.D[i] = start.depth[i];
    sim.C[i] = start.contamination[i];
    for (let k = 0; k < 4; k++) sim.out[4 * i + k] = 0;
    any = true;
  }
  return any;
}

/** The most game days the canonical settle runs on after taking away its unfed water
 *  (`canonicalRun`): the first settle's own limit. The water round it had settled, so it is mostly
 *  steady again within a check or two; a map whose water passed the settle's test while a slow surge
 *  still moved (Near Bardenas Reales) takes longer. */
export const DRAIN_DAYS = 4;
