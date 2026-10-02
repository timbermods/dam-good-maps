// Fed and unfed water (D387 (2)): which of a settled map's water a source feeds, by the water's own
// connectivity as the simulation moves it (water.ts), not by a guess. From every running emitter's
// tiles (water and badwater sources, every source of a group, seeps), water reaches a wet neighbour
// when the game's flow rule would carry it there: the neighbour's floor stands below the fed tile's
// surface (and a partial obstacle, a NaturalDam, is overtopped). Water it reaches is fed: a source
// keeps it there, or would bring it back if it were taken. Every other wet tile is unfed: water no
// source can reach (a pool the canonical settle's pre-fill left in a hollow beside a river, a carve's
// sealed oxbow lake, a Fill), which in the game only evaporates. Taking unfed water away changes
// nothing a source feeds, so the game, from a file without it, never brings it back.

import { WaterSim, type WaterModel, type WaterSimOptions, type WaterState } from "./water";

/** Water deeper than this is water to the player: the hover readout's line (doc/describeTile.ts),
 *  and a body of water's (analysis/walk.ts WATER_BODY). Remove unfed water counts its pools and
 *  tiles by it; a thinner film round them is taken with them. */
export const WATER = 0.001;

/** Tiles of `depth` a running source's water reaches (1), as the simulation moves it (see the file
 *  comment). Emitter tiles are fed; dry tiles other than those are never fed. */
export function fedTiles(m: WaterModel, depth: ArrayLike<number>): Uint8Array {
  const { W, H, floor: F, dam } = m;
  const N = W * H;
  const fed = new Uint8Array(N);
  const queue = new Int32Array(N);
  let tail = 0;
  for (const e of m.emitters) {
    if (!(e.strength > 0)) continue;
    for (const i of e.cells) {
      if (fed[i]) continue;
      fed[i] = 1;
      queue[tail++] = i;
    }
  }
  for (let h = 0; h < tail; h++) {
    const c = queue[h];
    const d = depth[c];
    if (!(d > 0)) continue;
    const hc = F[c] + d;
    const x = c % W;
    const y = (c - x) / W;
    for (let k = 0; k < 4; k++) {
      let n: number;
      if (k === 0) n = y > 0 ? c - W : -1;
      else if (k === 1) n = x > 0 ? c - 1 : -1;
      else if (k === 2) n = y < H - 1 ? c + W : -1;
      else n = x < W - 1 ? c + 1 : -1;
      if (n < 0 || fed[n] || !(depth[n] > 0)) continue;
      const fn = F[n];
      if (!(fn < hc)) continue;
      // a partial obstacle holds the water back until it is overtopped (water.ts damFlow)
      const lim = dam ? dam[n] : -1;
      if (lim >= 0 && fn < Math.ceil(hc) && hc - fn < lim) continue;
      fed[n] = 1;
      queue[tail++] = n;
    }
  }
  return fed;
}

/** The unfed water of a settled map: its bodies (4-connected unfed wet tiles, each ascending), in
 *  the order of their first tile. With `inside`, only the bodies with a wet tile inside it, whole:
 *  a body cut at the selection's edge would flow back into the tiles taken. */
export function unfedBodies(m: WaterModel, depth: ArrayLike<number>, inside?: Uint8Array | null): number[][] {
  const { W, H } = m;
  const N = W * H;
  const fed = fedTiles(m, depth);
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  const out: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || fed[s] || !(depth[s] > 0)) continue;
    seen[s] = 1;
    queue[0] = s;
    let tail = 1;
    let hit = !inside || inside[s] === 1;
    for (let h = 0; h < tail; h++) {
      const c = queue[h];
      const x = c % W;
      const y = (c - x) / W;
      for (let k = 0; k < 4; k++) {
        let n: number;
        if (k === 0) n = y > 0 ? c - W : -1;
        else if (k === 1) n = x > 0 ? c - 1 : -1;
        else if (k === 2) n = y < H - 1 ? c + W : -1;
        else n = x < W - 1 ? c + 1 : -1;
        if (n < 0 || seen[n] || fed[n] || !(depth[n] > 0)) continue;
        seen[n] = 1;
        queue[tail++] = n;
        if (!hit && inside![n] === 1) hit = true;
      }
    }
    if (hit) out.push(Array.from(queue.subarray(0, tail)).sort((a, b) => a - b));
  }
  return out;
}

/** The simulation after the drained tiles' unfed water is taken away (the model's `drained`, Remove
 *  unfed water): a new simulation on the water as it stands, those tiles dry and still, at the same
 *  tick; null when none of them holds unfed water (nothing changes). */
export function drainedSim(m: WaterModel, sim: WaterSim, opts: WaterSimOptions = {}): WaterSim | null {
  if (!m.drained?.length) return null;
  const state: WaterState = { depth: sim.D.slice(), contamination: sim.C.slice() };
  const out = sim.out.slice();
  if (!drainUnfed(m, state.depth, state.contamination, out)) return null;
  const next = new WaterSim(m, state, opts);
  next.out.set(out);
  next.ticks = sim.ticks;
  return next;
}

/** `depth` and `contamination` with the drained tiles' unfed water taken away, in place (the
 *  editor's preview and the water carried over after an edit, `drainedSim`'s rule); whether any
 *  was. */
export function drainUnfed(m: WaterModel, depth: Float64Array, contamination: Float64Array, out?: Float64Array | null): boolean {
  const drained = m.drained;
  if (!drained?.length) return false;
  const fed = fedTiles(m, depth);
  let any = false;
  for (const i of drained) {
    if (!(depth[i] > 0) || fed[i]) continue;
    depth[i] = 0;
    contamination[i] = 0;
    if (out) out[4 * i] = out[4 * i + 1] = out[4 * i + 2] = out[4 * i + 3] = 0;
    any = true;
  }
  return any;
}
