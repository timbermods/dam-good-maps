// Fed and unfed water (D387 (2), D385): which of a map's water a source feeds, by the water's own
// connectivity as the simulation moves it (water.ts), not by a guess. From every running emitter's
// tiles (water and badwater sources, every source of a group, seeps), and from any seed tiles given
// (a stored lake, the water an edit kept), water reaches a wet neighbour when the game's flow rule
// would carry it there: the neighbour's floor stands no higher than the reached tile's surface (and a
// partial obstacle, a NaturalDam, is overtopped). Water it reaches is fed: a source keeps it there,
// or would bring it back if it were taken. Every other wet tile is unfed: water nothing brings there,
// which in the game only evaporates, and taking it away changes nothing a source feeds.
//
// The one definition, with the seeds each question needs:
// - Remove unfed water (doc/waterEdits.ts, its check in doc/ops.ts): sources only, so a carve's
//   sealed oxbow lake and a Fill count as unfed and can be removed;
// - the canonical settle (prefill.ts) and the editor's water (preview.ts): sources and the stored
//   lakes a removal didn't drain (`keptSeeds`), plus, in the preview, the water kept from before.
//   Water the pre-fill put where none of them reaches (a hollow on a dry plateau its walk spread
//   over) would come from nowhere, so it is taken away once the water has stopped (`withoutUnfed`,
//   in both), as is the water a removal drained (the model's `drained`).

import { WaterSim, type WaterModel, type WaterSimOptions, type WaterState } from "./water";

/** Water deeper than this is water to the player: the hover readout's line (doc/describeTile.ts),
 *  and a body of water's (analysis/walk.ts WATER_BODY). Remove unfed water counts its pools and
 *  tiles by it; a thinner film round them is taken with them. */
export const WATER = 0.001;

/** Tiles of `depth` a running source's water, or a seed's (a mask), reaches (1), as the simulation
 *  moves it (see the file comment). Emitter tiles and wet seed tiles are fed; other dry tiles never
 *  are. */
export function fedTiles(m: WaterModel, depth: ArrayLike<number>, seeds?: ArrayLike<number> | null): Uint8Array {
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
  if (seeds)
    for (let i = 0; i < N; i++) {
      if (!seeds[i] || fed[i] || !(depth[i] > 0)) continue;
      fed[i] = 1;
      queue[tail++] = i;
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
      // (level counts: a lake the pre-fill filled to its spill level stands exactly at its rim, and
      // its source overflows it there)
      if (!(fn <= hc)) continue;
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

/** The stored lakes' tiles a removal didn't drain (the model's `retained` less its `drained`), as a
 *  mask, or null when there are none: the canonical settle's and the editor's seeds beside the
 *  sources (a stored lake is its own cause, D216, D394). */
export function keptSeeds(m: WaterModel): Uint8Array | null {
  if (!m.retained?.length) return null;
  const mask = new Uint8Array(m.W * m.H);
  for (const r of m.retained) for (const i of r.tiles) mask[i] = 1;
  for (const i of m.drained ?? []) mask[i] = 0;
  return mask;
}

/** The simulation without its unfed water (no running source and no seed reaches it: by default the
 *  kept stored lakes, `keptSeeds`; the editor's preview adds the water it kept from before): the
 *  water the pre-fill left where none goes (D385) and the water a removal drained (the model's
 *  `drained`, D387 (2)). A new simulation on the water as it stands, those tiles dry and still, at
 *  the same tick, so its bookkeeping is built from that water (water.ts: a running simulation's `D`
 *  and `C` are never written); null when there is none (nothing changes). The one drain of the
 *  canonical settle (prefill.ts `canonicalRun`) and the preview's (preview.ts `PreviewJob`). */
export function withoutUnfed(m: WaterModel, sim: WaterSim, opts: WaterSimOptions = {}, seeds: ArrayLike<number> | null = keptSeeds(m)): WaterSim | null {
  const state: WaterState = { depth: sim.D.slice(), contamination: sim.C.slice() };
  const out = sim.out.slice();
  const fed = fedTiles(m, state.depth, seeds);
  let any = false;
  for (let i = 0; i < sim.N; i++) {
    if (!(state.depth[i] > 0) || fed[i]) continue;
    state.depth[i] = 0;
    state.contamination[i] = 0;
    out[4 * i] = out[4 * i + 1] = out[4 * i + 2] = out[4 * i + 3] = 0;
    any = true;
  }
  if (!any) return null;
  const next = new WaterSim(m, state, opts);
  next.setOut(out);
  next.ticks = sim.ticks;
  return next;
}

/** `depth` and `contamination` with the drained tiles' unfed water taken away, in place (the
 *  editor's preview and the water carried over after an edit, as the canonical settle takes it,
 *  `withoutUnfed`); whether any was. */
export function drainUnfed(m: WaterModel, depth: Float64Array, contamination: Float64Array, out?: Float64Array | null): boolean {
  const drained = m.drained;
  if (!drained?.length) return false;
  const fed = fedTiles(m, depth, keptSeeds(m));
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
