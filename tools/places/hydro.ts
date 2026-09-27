// The land and its rivers, from a landscape survey patch (investigation/landscapes/, PR #16), for the
// Real places conversion (tools/places-convert.ts). The patch is the survey's: a square of
// elevations in metres with a halo of 32 tiles round the map, north up (row 0 is the south edge).
// `crop` and `quantise` are the survey's own steps (investigation/landscapes/lib/terrain.ts), ported
// so the heights are the survey's to the tile. `drainage` is its routing (a priority flood from the
// halo's edge; it only routes water, it never changes the terrain), and `rivers` reads where water
// begins from it: where a river comes into the map across its edge, and where a channel starts
// inside it (Kyler, 2026-09-25, D171: sources go only where water begins).

import { MinHeap } from "../../src/core/math/grid";

/** 8 neighbours: the four sides first. */
const DIRS: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function neighbours(i: number, W: number, H: number): number[] {
  const x = i % W;
  const y = Math.floor(i / W);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const xx = x + dx;
    const yy = y + dy;
    if (xx >= 0 && xx < W && yy >= 0 && yy < H) out.push(yy * W + xx);
  }
  return out;
}

/** The survey's routing: a priority flood from the patch's edge gives each tile its filled level
 *  and the way its water goes (`to`, the steepest way down the filled levels), and `acc` the tiles
 *  whose water passes through it. */
export function drainage(h: ArrayLike<number>, W: number, H: number): { to: Int32Array; acc: Float64Array } {
  const N = W * H;
  const filled = Float64Array.from(h);
  const seen = new Uint8Array(N);
  const rank = new Int32Array(N);
  const parent = new Int32Array(N).fill(-1);
  const order = new Int32Array(N);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++)
    if (i % W === 0 || i % W === W - 1 || i < W || i >= N - W) {
      seen[i] = 1;
      heap.push(h[i], i);
    }
  let count = 0;
  while (heap.size) {
    const i = heap.pop();
    rank[i] = count;
    order[count++] = i;
    for (const j of neighbours(i, W, H))
      if (!seen[j]) {
        seen[j] = 1;
        filled[j] = Math.max(h[j], filled[i]);
        parent[j] = i;
        heap.push(filled[j], j);
      }
  }
  const to = parent.slice();
  const acc = new Float64Array(N).fill(1);
  for (let k = 0; k < N; k++) {
    const i = order[k];
    if (parent[i] < 0) continue;
    let best = -Infinity;
    for (const j of neighbours(i, W, H)) {
      if (rank[j] >= rank[i] || filled[j] > filled[i]) continue;
      const len = i % W !== j % W && Math.floor(i / W) !== Math.floor(j / W) ? Math.SQRT2 : 1;
      const slope = (filled[i] - filled[j]) / len;
      if (slope > best) {
        best = slope;
        to[i] = j;
      }
    }
  }
  for (let k = N - 1; k >= 0; k--) {
    const i = order[k];
    if (to[i] >= 0) acc[to[i]] += acc[i];
  }
  return { to, acc };
}

/** The map's square out of the patch (the survey's `crop`). */
export function crop(h: ArrayLike<number>, W: number, size: number, halo: number): Float32Array {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[y * size + x] = h[(y + halo) * W + x + halo];
  return out;
}

/** Elevations as game levels 0..cap (the survey's `quantise`): "linear" one level per 30 m,
 *  "compressed" low relief kept and peaks flattened, "normalised" the local range. */
export function quantise(h: Float32Array, mode: string, cap: number): Uint8Array {
  const sorted = h.slice().sort();
  const lo = sorted[0];
  const span = sorted[sorted.length - 1] - lo;
  const out = new Uint8Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const u = span ? (h[i] - lo) / span : 0;
    const v = mode === "linear" ? (h[i] - lo) / 30 : mode === "compressed" ? (cap * Math.log1p(4 * u)) / Math.log(5) : cap * u;
    out[i] = Math.max(0, Math.min(cap, Math.round(v)));
  }
  return out;
}

export type Edge = "south" | "north" | "west" | "east";

/** A river coming into the map: the tile on the edge where it crosses, and the area it drains. */
export interface Entry {
  x: number;
  y: number;
  edge: Edge;
  area: number;
}

/** A channel's head inside the map: its first tile, and the area it drains there. */
export interface Head {
  x: number;
  y: number;
  area: number;
}

/** Where water begins on the map: rivers that come in across its edge (their water gathered in
 *  the halo), and channel heads inside it (and the routing, on the patch with its halo) (a tile where a channel's flow first passes the
 *  threshold, fed by no channel above it). The threshold is the survey's: 1% of the map's tiles,
 *  at least 32. A river is one entry: the strongest crossing, the weaker ones within 4 tiles along
 *  the edge dropped; a head within 3 tiles of the edge is left to the edge. */
export function rivers(raw: Float32Array, size: number, halo: number, threshold = Math.max(32, size * size * 0.01)): { entries: Entry[]; heads: Head[]; drainage: { to: Int32Array; acc: Float64Array } } {
  const W = size + 2 * halo;
  const d = drainage(raw, W, W);
  const inPatch = (i: number) => {
    const x = (i % W) - halo;
    const y = Math.floor(i / W) - halo;
    return x >= 0 && x < size && y >= 0 && y < size;
  };
  const entries: Entry[] = [];
  const incoming = new Uint16Array(raw.length);
  for (let i = 0; i < raw.length; i++) if (d.to[i] >= 0 && d.acc[i] >= threshold) incoming[d.to[i]]++;
  for (let i = 0; i < raw.length; i++) {
    const j = d.to[i];
    if (j < 0 || inPatch(i) || !inPatch(j) || d.acc[i] < threshold) continue;
    const ox = (i % W) - halo;
    const oy = Math.floor(i / W) - halo;
    const x = Math.min(size - 1, Math.max(0, ox));
    const y = Math.min(size - 1, Math.max(0, oy));
    const edge: Edge = ox < 0 ? "west" : ox >= size ? "east" : oy < 0 ? "south" : "north";
    entries.push({ x, y, edge, area: d.acc[i] });
  }
  entries.sort((a, b) => b.area - a.area || a.y - b.y || a.x - b.x);
  const rivers: Entry[] = [];
  for (const e of entries) if (!rivers.some((r) => r.edge === e.edge && Math.max(Math.abs(r.x - e.x), Math.abs(r.y - e.y)) <= 4)) rivers.push(e);
  const heads: Head[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (!inPatch(i) || d.acc[i] < threshold || incoming[i]) continue;
    const x = (i % W) - halo;
    const y = Math.floor(i / W) - halo;
    if (x < 3 || y < 3 || x >= size - 3 || y >= size - 3) continue;
    heads.push({ x, y, area: d.acc[i] });
  }
  heads.sort((a, b) => b.area - a.area || a.y - b.y || a.x - b.x);
  return { entries: rivers, heads, drainage: d };
}

/** The land's overall tilt kept, in levels across the map (Kyler, 2026-09-27, D300): enough for the
 *  water to run downhill along its real course; the rest of the tilt is taken out before the land
 *  is fitted to its levels, so the levels go to its own shape (its channels, bars and ridges), not
 *  to a smooth slope made into even stripes. */
export const TILT_LEVELS = 4;
/** Fits of the land's main surface (`detrend`): the first over every tile, the rest without the
 *  tiles far off the last. */
const TILT_ROUNDS = 4;
/** A level under this many metres once the tilt is out (`detrend`): the land is smoothed first. */
export const SMOOTH_STEP = 10;

/** The patch (its halo included, `W` a side) with most of its overall tilt taken out (D300): the
 *  plane that best fits the map's square (least squares) is found, and all of it is kept where it
 *  spans at most TILT_LEVELS of the map's levels; else only the share `keep` of it that spans
 *  TILT_LEVELS once the land is fitted to its levels as `mode` fits it. The plane is centred on the
 *  map, and fitted to its main surface (a fan's slope, not the mountain beside it). */
export function detrend(raw: Float32Array, W: number, size: number, halo: number, mode: string, cap: number): { raw: Float32Array; keep: number; tiltLevels: number; smoothed: boolean } {
  // the plane z = a + b·(x - m) + c·(y - m) over the map's square, m its middle, fitted to the
  // land's main surface: a least-squares fit, then again without the tiles far off it (more than
  // twice the median distance: a mountain, a gorge), a few times
  const m = (size - 1) / 2;
  let a = 0;
  let b = 0;
  let c = 0;
  let cut = Infinity;
  for (let round = 0; round < TILT_ROUNDS; round++) {
    let n = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let sxz = 0;
    let syz = 0;
    const res: number[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const z = raw[(y + halo) * W + x + halo];
        const r = Math.abs(z - (a + b * (x - m) + c * (y - m)));
        if (round && r > cut) continue;
        const u = x - m;
        const v = y - m;
        n++;
        sx += u;
        sy += v;
        sz += z;
        sxx += u * u;
        syy += v * v;
        sxy += u * v;
        sxz += u * z;
        syz += v * z;
      }
    // the normal equations, centred
    const mu = sx / n;
    const mv = sy / n;
    const mz = sz / n;
    const cuu = sxx / n - mu * mu;
    const cvv = syy / n - mv * mv;
    const cuv = sxy / n - mu * mv;
    const cuz = sxz / n - mu * mz;
    const cvz = syz / n - mv * mz;
    const det = cuu * cvv - cuv * cuv;
    if (!(n > 16 && det > 1e-9)) break;
    b = (cuz * cvv - cvz * cuv) / det;
    c = (cvz * cuu - cuz * cuv) / det;
    a = mz - b * mu - c * mv;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) res.push(Math.abs(raw[(y + halo) * W + x + halo] - (a + b * (x - m) + c * (y - m))));
    res.sort((p, q) => p - q);
    cut = 2 * res[res.length >> 1] + 1e-6;
  }
  const plane = (x: number, y: number) => b * (x - halo - m) + c * (y - halo - m);
  const drop = (Math.abs(b) + Math.abs(c)) * (size - 1);
  /** The kept plane's span in levels, once the land is fitted to its levels. */
  const levelsAt = (keep: number) => {
    if (mode === "linear") return (keep * drop) / 30;
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const z = raw[(y + halo) * W + x + halo] - (1 - keep) * plane(x + halo, y + halo);
        if (z < lo) lo = z;
        if (z > hi) hi = z;
      }
    return hi > lo ? (cap * keep * drop) / (hi - lo) : 0;
  };
  const full = levelsAt(1);
  let keep = 1;
  if (full > TILT_LEVELS) {
    let a = 0;
    let z = 1;
    for (let k = 0; k < 30; k++) {
      const mid = (a + z) / 2;
      if (levelsAt(mid) > TILT_LEVELS) z = mid;
      else a = mid;
    }
    keep = z;
  }
  let out: Float32Array = new Float32Array(raw.length);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) out[y * W + x] = raw[y * W + x] - (1 - keep) * plane(x, y);
  // a plain or fan whose tilt came out has levels only a few metres apart: the elevation data's
  // single-tile bumps would become levels, so a 3×3 median takes them out first
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const z = out[(y + halo) * W + x + halo];
      if (z < lo) lo = z;
      if (z > hi) hi = z;
    }
  const smoothed = keep < 1 && mode !== "linear" && (hi - lo) / cap < SMOOTH_STEP;
  if (smoothed) out = median3(out, W);
  return { raw: out, keep, tiltLevels: Math.min(full, TILT_LEVELS), smoothed };
}

/** A 3×3 median of the patch (its halo included, `W` a side): single-tile bumps and pits out,
 *  edges (cliffs, banks) kept. */
export function median3(raw: Float32Array, W: number): Float32Array {
  const out = new Float32Array(raw.length);
  const v = new Float64Array(9);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const yy = Math.min(W - 1, Math.max(0, y + dy));
          v[n++] = raw[yy * W + xx];
        }
      v.sort();
      out[y * W + x] = v[4];
    }
  return out;
}
