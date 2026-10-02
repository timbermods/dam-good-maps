// Fed water (D385): which water a running source feeds, by the water's own connectivity as the
// simulation moves it (water.ts), not by a guess. From every running emitter's tiles (water and
// badwater sources, every source of a group, seeps), and from any other tiles given as seeds (a
// stored lake, the water an edit kept), water reaches a wet neighbour when the game's flow rule
// would carry it there: the neighbour's floor stands no higher than the reached tile's surface (and a
// partial obstacle, a NaturalDam, is overtopped). Every other wet tile holds water nothing brings
// there: in the game it only evaporates, and taking it away changes nothing a source feeds.
//
// The canonical settle uses it to drop the water its pre-fill put where no source's water goes (a
// hollow on a dry plateau the pre-fill's walk spread over, prefill.ts), and the editor's warm start
// to keep the pre-fill's water on changed ground only where a source or the water already there
// reaches it (preview.ts): water never appears from nowhere.

import type { WaterModel } from "./water";

/** Tiles of `depth` a running source's water, or a seed's, reaches (1), as the simulation moves
 *  it (see the file comment). Emitter tiles and wet seed tiles are fed; other dry tiles never are. */
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
      // (level counts: a lake the pre-fill filled to its spill level stands exactly at its rim,
      // and its source overflows it there)
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

/** The tiles of a model's stored lakes (its `retained` water: a carve's oxbow lakes), as a mask, or
 *  null when it has none: they are their own cause (D216), fed as a source's water is. */
export function storedTiles(m: WaterModel): Uint8Array | null {
  if (!m.retained?.length) return null;
  const mask = new Uint8Array(m.W * m.H);
  for (const r of m.retained) for (const i of r.tiles) mask[i] = 1;
  return mask;
}
