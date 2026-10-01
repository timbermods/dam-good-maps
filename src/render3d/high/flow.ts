// The water's flow and contamination as the High water reads them (#38, investigation/maplook2
// flow.ts; #67 river.ts), from the water the view shows:
// - the flow: #38 carried the settle's own outflows into the view. The view here holds only the
//   water's depths, the same for generated maps, places, imports and every live edit, so the flow is
//   estimated from the water's surface instead: downhill along the surface, still where it is level
//   (a lake's surface falls under 2.5 × 10⁻⁴ a tile) and as fast as the settle's own rivers where it
//   falls as they do (about 1.5 × 10⁻³ a tile, 6–8 tiles a second: measured against the settle's
//   outflows on generated maps). It
//   only moves the water's detail and places its rough water; nothing plays by it, and no water is
//   simulated for it (a default the session chose: docs/decisions-pending.md #111);
// - the contamination, smoothed through neighbouring water on the same surface only (never across
//   a fall or dry ground), so a front is soft over a few tiles;
// - rough water (#67 stage 2): below falls, in rapids (fast for their own river) and in fast wakes
//   round small obstacles, never over a whole river.
// Plain arrays, no three.js: bake.ts packs them into textures' data, in a worker.

import type { SurfaceWater } from "../model";

const WET = 0.001;
/** The surface's fall a tile under which water is still, and over which it runs at full speed
 *  (tiles a second), as the settle's own flow does on generated maps (River Valley 4242, Lake Basin 3,
 *  Highlands 2 and Delta 5 at 128²: lakes 3 × 10⁻⁵ to 2 × 10⁻⁴ and under 0.15 tiles a second; rivers
 *  1.1 to 2.5 × 10⁻³ and 6 to 8 tiles a second). */
const STILL = 2.5e-4;
const RUNNING = 1.6e-3;
const FULL_SPEED = 7.5;
/** Neighbours on the same surface: a step larger than this is a fall. */
const SAME = 0.35;

function ramp(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The flow at each tile's middle (tiles a second, x east, y toward increasing rows), estimated from
 *  the water's surface. */
export function surfaceFlow(W: number, H: number, sw: SurfaceWater): Float32Array {
  const v = new Float32Array(W * H * 2);
  const { surface, depth } = sw;
  const same = (i: number, j: number) => depth[j] > WET && Math.abs(surface[j] - surface[i]) < SAME;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!(depth[i] > WET)) continue;
      const s = surface[i];
      const e = x + 1 < W && same(i, i + 1) ? surface[i + 1] : NaN;
      const w = x > 0 && same(i, i - 1) ? surface[i - 1] : NaN;
      const n = y + 1 < H && same(i, i + W) ? surface[i + W] : NaN;
      const so = y > 0 && same(i, i - W) ? surface[i - W] : NaN;
      const gx = e === e && w === w ? (e - w) / 2 : e === e ? e - s : w === w ? s - w : 0;
      const gy = n === n && so === so ? (n - so) / 2 : n === n ? n - s : so === so ? s - so : 0;
      const slope = Math.hypot(gx, gy);
      if (slope < 1e-5) continue;
      const speed = FULL_SPEED * ramp(STILL, RUNNING, slope);
      if (!speed) continue;
      v[i * 2] = (-gx / slope) * speed;
      v[i * 2 + 1] = (-gy / slope) * speed;
    }
  return v;
}

/** The contamination, smoothed twice through adjacent water on the same surface, and carried a
 *  tile into dry ground so filtering never shows a false clean rim along a badwater bank. */
export function surfaceContamination(W: number, H: number, sw: SurfaceWater): Float32Array {
  let field = sw.contamination.slice();
  for (let i = 0; i < field.length; i++) if (!(field[i] === field[i])) field[i] = 0;
  const { depth, surface } = sw;
  for (let pass = 0; pass < 2; pass++) {
    const next = field.slice();
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!(depth[i] > WET)) continue;
        let sum = 0;
        let weight = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (!(depth[j] > WET) || Math.abs(surface[j] - surface[i]) > SAME) continue;
            if (dx && dy && (!(depth[y * W + xx] > WET) || !(depth[yy * W + x] > WET))) continue;
            const wgt = (dx === 0 ? 2 : 1) * (dy === 0 ? 2 : 1);
            sum += field[j] * wgt;
            weight += wgt;
          }
        next[i] = sum / weight;
      }
    field = next;
  }
  const out = field.slice();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (depth[i] > WET) continue;
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (depth[j] > WET) {
            sum += field[j];
            count++;
          }
        }
      if (count) out[i] = sum / count;
    }
  return out;
}


export interface RoughCounts {
  falls: number;
  rapids: number;
  obstacles: number;
  wet: number;
}

/** Where the water runs rough (#67 river.ts), 0–1 a tile: trails below falls (a drop of 0.6 or
 *  more), rapids (a river's own median speed ×1.45 to ×2.1) and wakes round small obstacles in fast
 *  water; each river measured against itself, so a big river is not foamed all over. */
export function roughWater(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, velocity: Float32Array): { field: Float32Array; counts: RoughCounts } {
  const N = W * H;
  const speed = new Float32Array(N);
  for (let i = 0; i < N; i++) speed[i] = Math.hypot(velocity[i * 2], velocity[i * 2 + 1]);
  const wet = (i: number) => i >= 0 && i < N && sw.depth[i] > 0.015;
  const neighbours = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    return [x ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y ? i - W : -1, y < H - 1 ? i + W : -1];
  };
  const component = new Int32Array(N).fill(-1);
  const normal: number[] = [];
  const queue = new Int32Array(N);
  for (let start = 0; start < N; start++) {
    if (!wet(start) || component[start] >= 0) continue;
    const id = normal.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    component[start] = id;
    const moving: number[] = [];
    while (head < tail) {
      const i = queue[head++];
      if (speed[i] > 0.05) moving.push(speed[i]);
      for (const j of neighbours(i))
        if (wet(j) && component[j] < 0) {
          component[j] = id;
          queue[tail++] = j;
        }
    }
    moving.sort((a, b) => a - b);
    normal.push(moving.length ? moving[Math.floor(moving.length * 0.5)] : Infinity);
  }
  const falls = new Float32Array(N);
  const rapids = new Float32Array(N);
  const obstacles = new Float32Array(N);
  const deposit = (field: Float32Array, x: number, y: number, value: number, level: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.floor(x) + dx;
        const yy = Math.floor(y) + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        if (!wet(i) || Math.abs(sw.surface[i] - level) > SAME) continue;
        const weight = Math.max(0, 1 - Math.hypot(xx + 0.5 - x, yy + 0.5 - y) / 1.1);
        field[i] = Math.max(field[i], value * weight);
      }
  };
  const trail = (field: Float32Array, i: number, value: number, length: number) => {
    let x = (i % W) + 0.5;
    let y = Math.floor(i / W) + 0.5;
    const level = sw.surface[i];
    for (let d = 0; d <= length; d += 0.45) {
      const j = Math.floor(y) * W + Math.floor(x);
      if (x < 0 || x >= W || y < 0 || y >= H || !wet(j) || Math.abs(sw.surface[j] - level) > SAME) break;
      deposit(field, x, y, value * Math.pow(1 - d / (length + 0.15), 1.45), level);
      if (speed[j] < 0.05) break;
      x += (velocity[j * 2] / speed[j]) * 0.45;
      y += (velocity[j * 2 + 1] / speed[j]) * 0.45;
    }
  };
  for (let i = 0; i < N; i++) {
    if (!wet(i)) continue;
    // a fall feeding this pool: the largest drop from a wet neighbour above it
    let drop = 0;
    for (const j of neighbours(i)) if (wet(j)) drop = Math.max(drop, sw.surface[j] - sw.surface[i]);
    if (drop >= 0.6) trail(falls, i, Math.min(0.85, 0.38 + drop * 0.09), 2.8);
    if (speed[i] <= 0.05) continue;
    const rapid = ramp(1.45, 2.1, speed[i] / normal[component[i]]);
    if (rapid > 0) deposit(rapids, (i % W) + 0.5, Math.floor(i / W) + 0.5, rapid * 0.62, sw.surface[i]);
  }
  // water on both sides of a small solid obstacle, in the same river
  const across = (i: number, dx: number, dy: number) => {
    for (let d = 1; d <= 4; d++) {
      const x = (i % W) + dx * d;
      const y = Math.floor(i / W) + dy * d;
      if (x < 0 || x >= W || y < 0 || y >= H) return -1;
      const j = y * W + x;
      if (wet(j)) return j;
    }
    return -1;
  };
  const surrounds = (a: number, b: number) => a >= 0 && b >= 0 && component[a] === component[b] && Math.abs(sw.surface[a] - sw.surface[b]) < SAME;
  for (let i = 0; i < N; i++) {
    if (wet(i)) continue;
    const ns = neighbours(i);
    if (!ns.some(wet)) continue;
    if (!surrounds(across(i, -1, 0), across(i, 1, 0)) && !surrounds(across(i, 0, -1), across(i, 0, 1))) continue;
    for (const j of ns)
      if (wet(j) && heights[i] >= sw.surface[j] - 0.15) {
        const ratio = speed[j] / normal[component[j]];
        if (speed[j] > 0.5 && ratio > 1.12) trail(obstacles, j, 0.6 * ramp(1.12, 1.85, ratio), 1.4);
      }
  }
  const field = new Float32Array(N);
  const counts: RoughCounts = { falls: 0, rapids: 0, obstacles: 0, wet: 0 };
  for (let i = 0; i < N; i++) {
    field[i] = Math.max(falls[i], rapids[i], obstacles[i]);
    if (wet(i)) counts.wet++;
    if (falls[i] > 0.05) counts.falls++;
    if (rapids[i] > 0.05) counts.rapids++;
    if (obstacles[i] > 0.05) counts.obstacles++;
  }
  return { field, counts };
}
