// Drought, analytically (PLAN §10): every source stops for the whole drought. Water below each
// basin's spill level stays, water above it drains through the map edges, and each pool loses what
// its surface evaporates: 1e-4 per second times the tile's saturation modifier (0.0535 a day on
// wide water, more at a pool's corners and on narrow water), shared over the pool because its
// surface stays flat. tests/unit/water.test.ts compares this with the simulation run with the
// sources off (within 5% of the stored volume). prototype/watersim.py `drought_storage` is the same.

import { clusterSaturation } from "./moisture";
import { spillLevels } from "./prefill";
import { TICKS_PER_DAY, DT, type WaterModel } from "./water";

const SECONDS_PER_DAY = TICKS_PER_DAY * 2 * DT;

/** Depth left per tile after `days` of drought, from the settled `depth`. */
export function droughtStorage(m: WaterModel, depth: ArrayLike<number>, days: number): Float64Array {
  const { W, H } = m;
  const N = W * H;
  const spill = spillLevels(m);
  // the level water on a tile drains to: its spill level, except on a weir, whose own water runs
  // off over its lowest neighbour
  const own = spill.slice();
  if (m.dam) {
    for (let i = 0; i < N; i++) {
      if (m.dam[i] < 0) continue;
      const x = i % W;
      const y = (i - x) / W;
      let lo = x === 0 || y === 0 || x === W - 1 || y === H - 1 ? m.floor[i] : Infinity;
      if (y > 0 && spill[i - W] < lo) lo = spill[i - W];
      if (x > 0 && spill[i - 1] < lo) lo = spill[i - 1];
      if (y < H - 1 && spill[i + W] < lo) lo = spill[i + W];
      if (x < W - 1 && spill[i + 1] < lo) lo = spill[i + 1];
      own[i] = lo > m.floor[i] ? lo : m.floor[i];
    }
  }
  const kept = new Float64Array(N);
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const surface = m.floor[i] + depth[i];
    const k = (surface < own[i] ? surface : own[i]) - m.floor[i];
    kept[i] = k > 0 ? k : 0;
    wet[i] = kept[i] > 0 ? 1 : 0;
  }
  // pools: 4-connected wet tiles at one spill level
  const sat = clusterSaturation(wet, W, H);
  const label = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const area: number[] = [];
  for (let s = 0; s < N; s++) {
    if (!wet[s] || label[s] >= 0) continue;
    const lab = area.length;
    label[s] = lab;
    let head = 0;
    let tail = 0;
    queue[tail++] = s;
    while (head < tail) {
      const c = queue[head++];
      const x = c % W;
      const y = (c - x) / W;
      for (let k = 0; k < 4; k++) {
        let n: number;
        if (k === 0) n = y > 0 ? c - W : -1;
        else if (k === 1) n = x > 0 ? c - 1 : -1;
        else if (k === 2) n = y < H - 1 ? c + W : -1;
        else n = x < W - 1 ? c + 1 : -1;
        if (n < 0 || !wet[n] || label[n] >= 0 || own[n] !== own[c]) continue;
        label[n] = lab;
        queue[tail++] = n;
      }
    }
    area.push(tail);
  }
  const evap = new Float64Array(area.length);
  for (let i = 0; i < N; i++) {
    if (label[i] < 0) continue;
    const t = 10 - sat[i];
    evap[label[i]] += 1e-4 * (0.0595 * (t * t) + 0.101 * t + 0.72) * SECONDS_PER_DAY;
  }
  for (let i = 0; i < N; i++) {
    if (label[i] < 0) continue;
    const drop = (evap[label[i]] / area[label[i]]) * days;
    const k = kept[i] - drop;
    kept[i] = k > 0 ? k : 0;
  }
  return kept;
}
