// Fill (D387 (3), D394): a hollow filled with standing water to a chosen level, with no source. The
// water is stored as a carve's sealed oxbow lake's is (water.ts RetainedWater, D216): every settle
// starts the hollow's tiles from it, then runs the game's own rules, so it evaporates as unfed water
// does in the game (1e-4 a second, 1e-3 under 0.02 deep, times the cluster-saturation modifier, D29),
// and its evaporation is not the water still changing (D222). Nothing here sets a rate of its own:
// `fillDays` reads the same rules to say roughly how long the water will last.

import { evapModifier } from "./moisture";
import { SECONDS_PER_DAY, type RetainedWater, type WaterModel } from "./water";

/** The water a Fill to `level` at tile (x, y) stores: the hollow's tiles (4-connected, every one
 *  whose floor, with a partial obstacle's height, stands below the level), ascending, with their
 *  floors and depths to the level, clean. A plain one-line reason instead when the hollow doesn't
 *  hold water at that level: off the map, the level at or below the ground there, the water would
 *  spill off the map, or (with the map's water, `depth`) water already stands at that level. */
export function fillLake(m: WaterModel, x: number, y: number, level: number, depth?: ArrayLike<number> | null): { lake: RetainedWater } | { reason: string } {
  const { W, H, floor: F, dam } = m;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return { reason: `(${x}, ${y}) is off the map` };
  if (!Number.isFinite(level)) return { reason: "the level must be a number" };
  const top = (i: number) => F[i] + (dam && dam[i] >= 0 ? dam[i] : 0);
  const at = y * W + x;
  if (!(top(at) < level)) {
    return { reason: F[at] >= level ? `level ${fmt(level)} is at or below the ground at (${x}, ${y}), which stands at ${fmt(F[at])}` : `a natural dam at (${x}, ${y}) stands above level ${fmt(level)}` };
  }
  // the edge drains, except beside an emitter's tile (water.ts: the edge beside a source is a wall)
  const emitting = new Uint8Array(W * H);
  for (const e of m.emitters) for (const i of e.cells) emitting[i] = 1;
  const N = W * H;
  const seen = new Uint8Array(N);
  const queue = new Int32Array(N);
  seen[at] = 1;
  queue[0] = at;
  let tail = 1;
  for (let h = 0; h < tail; h++) {
    const c = queue[h];
    const cx = c % W;
    const cy = (c - cx) / W;
    if ((cx === 0 || cy === 0 || cx === W - 1 || cy === H - 1) && !emitting[c]) {
      return { reason: `at level ${fmt(level)} the water would spill off the map at (${cx}, ${cy}): the hollow doesn't hold it` };
    }
    for (let k = 0; k < 4; k++) {
      let n: number;
      if (k === 0) n = cy > 0 ? c - W : -1;
      else if (k === 1) n = cx > 0 ? c - 1 : -1;
      else if (k === 2) n = cy < H - 1 ? c + W : -1;
      else n = cx < W - 1 ? c + 1 : -1;
      if (n < 0 || seen[n] || !(top(n) < level)) continue;
      seen[n] = 1;
      queue[tail++] = n;
    }
  }
  const tiles = Array.from(queue.subarray(0, tail)).sort((a, b) => a - b);
  if (depth && tiles.every((i) => F[i] + depth[i] >= level - 1e-9)) return { reason: `water already stands at level ${fmt(level)} there` };
  return {
    lake: {
      tiles,
      floor: tiles.map((i) => F[i]),
      depth: tiles.map((i) => level - F[i]),
      contamination: tiles.map(() => 0),
    },
  };
}

/** Why a stored Fill no longer fits the map (null when it does): its hollow at its level, measured
 *  on the map now, must be the tiles and floors it stores. */
export function fillProblem(m: WaterModel, at: readonly [number, number], level: number, lake: RetainedWater): string | null {
  const r = fillLake(m, at[0], at[1], level);
  if ("reason" in r) return r.reason;
  const t = r.lake.tiles;
  if (t.length !== lake.tiles.length || t.some((i, k) => i !== lake.tiles[k] || r.lake.floor[k] !== lake.floor[k])) return "the hollow is no longer the one measured: measure the fill again";
  return null;
}

/** Roughly how long a Fill's water lasts in game days, by the game's evaporation (D29): its surface
 *  stays flat while it sinks, each tile losing 1e-4 a second (1e-3 under 0.02 deep) times its
 *  cluster-saturation modifier, shared over the pool; tiles dry as the surface passes their floor,
 *  and a pool that splits as it sinks goes on as separate pools (the last to dry is the answer). The
 *  water round it (another lake beside it) is left out. */
export function fillDays(W: number, H: number, lake: RetainedWater): number {
  const floor = new Map<number, number>();
  let surface = -Infinity;
  for (let k = 0; k < lake.tiles.length; k++) {
    floor.set(lake.tiles[k], lake.floor[k]);
    const s = lake.floor[k] + lake.depth[k];
    if (s > surface) surface = s;
  }
  if (!floor.size) return 0;
  const mark = new Int32Array(W * H);
  const stamp = { n: 0 };
  return poolSeconds(W, H, [...floor.keys()], floor, surface, mark, stamp) / SECONDS_PER_DAY;
}

/** Seconds the pool of `tiles` (connected, wet below `surface`) takes to dry, splitting as it sinks. */
function poolSeconds(W: number, H: number, tiles: number[], floor: Map<number, number>, surface: number, mark: Int32Array, stamp: { n: number }): number {
  let s = surface;
  let wet = tiles.filter((i) => floor.get(i)! < s);
  let t = 0;
  while (wet.length) {
    const parts = components(W, H, wet, mark, stamp);
    if (parts.length > 1) {
      let last = 0;
      for (const p of parts) last = Math.max(last, poolSeconds(W, H, p, floor, s, mark, stamp));
      return t + last;
    }
    // the highest floor still under water: the next tiles to dry
    let a = -Infinity;
    for (const i of wet) if (floor.get(i)! > a) a = floor.get(i)!;
    const mod = modifiers(W, H, wet, mark, stamp);
    let deep = 0;
    let shallowAll = 0;
    for (let k = 0; k < wet.length; k++) {
      const f = floor.get(wet[k])!;
      deep += 1e-4 * mod[k];
      shallowAll += (f === a ? 1e-3 : 1e-4) * mod[k];
    }
    const area = wet.length;
    // down to 0.02 above the highest floor every tile is deeper than 0.02; the last 0.02 the tiles
    // on that floor evaporate at the shallow rate
    if (s > a + 0.02) {
      t += ((s - (a + 0.02)) * area) / deep;
      s = a + 0.02;
    }
    t += ((s - a) * area) / shallowAll;
    s = a;
    wet = wet.filter((i) => floor.get(i)! < s);
  }
  return t;
}

/** 4-connected parts of `tiles`. */
function components(W: number, H: number, tiles: number[], mark: Int32Array, stamp: { n: number }): number[][] {
  const inSet = ++stamp.n;
  for (const i of tiles) mark[i] = inSet;
  const done = ++stamp.n;
  const out: number[][] = [];
  for (const s of tiles) {
    if (mark[s] !== inSet) continue;
    mark[s] = done;
    const part = [s];
    for (let h = 0; h < part.length; h++) {
      const c = part[h];
      const x = c % W;
      const y = (c - x) / W;
      for (const n of [y > 0 ? c - W : -1, x > 0 ? c - 1 : -1, y < H - 1 ? c + W : -1, x < W - 1 ? c + 1 : -1]) {
        if (n < 0 || mark[n] !== inSet) continue;
        mark[n] = done;
        part.push(n);
      }
    }
    out.push(part);
  }
  return out;
}

/** Each tile's evaporation modifier from its cluster saturation (water.ts `updateEvapMod`): WN = 1 +
 *  wet 8-neighbours, sat = min(8, max(WN, max over wet 4-neighbours of WN − 1)), the modifier
 *  `evapModifier(sat)`. The saturation is moisture.ts `clusterSaturation`'s, on the pool's own tiles
 *  only (a whole-map pass for every level the pool sinks through would cost far more). */
function modifiers(W: number, H: number, wet: number[], mark: Int32Array, stamp: { n: number }): Float64Array {
  const s = ++stamp.n;
  for (const i of wet) mark[i] = s;
  const isWet = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mark[y * W + x] === s;
  const wn = new Map<number, number>();
  for (const i of wet) {
    const x = i % W;
    const y = (i - x) / W;
    let c = 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && isWet(x + dx, y + dy)) c++;
    wn.set(i, c);
  }
  const mod = new Float64Array(wet.length);
  for (let k = 0; k < wet.length; k++) {
    const i = wet[k];
    const x = i % W;
    const y = (i - x) / W;
    let best = wn.get(i)!;
    if (isWet(x, y - 1)) best = Math.max(best, wn.get(i - W)! - 1);
    if (isWet(x - 1, y)) best = Math.max(best, wn.get(i - 1)! - 1);
    if (isWet(x, y + 1)) best = Math.max(best, wn.get(i + W)! - 1);
    if (isWet(x + 1, y)) best = Math.max(best, wn.get(i + 1)! - 1);
    mod[k] = evapModifier(Math.min(8, best));
  }
  return mod;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
