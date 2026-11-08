// The textures the water's flow carries, ours (Q9 P5, investigation/notes/water_and_soil.md): the game draws its
// water's surface with two textures that ride the outflow, `PhysicalWaterAlbedo` (it multiplies the colour) and
// `Water_N` (the surface's normal, × `_NormalBoost` 4). Theirs cannot ship; these are made here, in code, to the
// statistics `python tools/game-water-shader.py --textures` measures in theirs (`GAME_FLOW_TEXTURES`; numbers only:
// no texel of the game's is read here or stored in git), and tests/unit/water-flow-surface.test.ts holds them there.
//
// One RGBA texture, `WATER_TEXTURE_SIZE` square, one repeat `1 / WATER_FLOW.tiling` tiles across (as the game's):
// - R the light network: thin bright lines round irregular cells, as caustics (the albedo's first principal
//   component, a near-neutral brightness);
// - G the blue blobs inside the cells (its second, red against blue);
// - B, A the normal's slopes x and y (before the boost), the slopes of a warped value-noise height.
// The albedo is `albedoOf(r, g)` (`WATER_ALBEDO`), display values (0–1), fitted so its mean and covariance are the
// game's. Pure TypeScript, no three.js: made once a page in the renderer's bake worker (a few hundred milliseconds),
// the texture flat at its mean until then (renderer.ts).

/** The flow's numbers, the game's (its `PhysicalWater_Opaque` material, Q9 P5, P11; ps 419-446, 794-813): two phases
 *  of the time × `speed` (2.5 s each), half a cycle apart, mixed by |2 frac − 1|; each samples at xz × `tiling` −
 *  flow × frac × `strength`, and jumps by `jumpA` or `jumpB` each cycle; the flow is each column's outflow (right −
 *  left, top − bottom) ÷ `maxOutflow` (`Timberborn.WaterSystemRendering` `MaxOutflow`); the normal's slopes × `boost`,
 *  × (1 + badwater share) more (`_Contamination_Normal_Strength` 2). */
export const WATER_FLOW = {
  speed: 0.4,
  tiling: 0.06,
  strength: 2,
  jumpA: [0.3, 0.42] as const,
  jumpB: [0.58, 0.73] as const,
  maxOutflow: 14,
  boost: 4,
} as const;

/** The game's textures as `tools/game-water-shader.py --textures` measures them (Timberborn 1.1.2.8-ffc2de0-sw):
 *  display values 0–255 per channel (the game renders in Gamma colour space, so these are what its shader
 *  multiplies), their spread (standard deviation), 5th/50th/95th percentiles, and the autocorrelation's half-width
 *  in tiles (the shift at which a field's autocorrelation first falls to a half, averaged over four directions). */
export const GAME_FLOW_TEXTURES = {
  albedo: {
    mean: [68.6, 73.8, 77.8],
    spread: [9.0, 8.0, 8.9],
    p5: [59.0, 68.0, 69.0],
    p50: [67.0, 71.0, 75.0],
    p95: [86.0, 90.0, 96.0],
    /** Its luma's autocorrelation half-width. */
    feature: 0.079,
    /** Its colour's first two principal components: a near-neutral brightness, and red against blue. */
    components: [
      { axis: [0.57, 0.584, 0.578], spread: 13.74 },
      { axis: [0.738, -0.055, -0.672], spread: 5.99 },
    ],
  },
  normal: {
    /** The unpacked slopes x and y (× 2 − 1, before the boost): mean about 0.01, spread, percentiles. */
    spread: 0.118,
    p5: -0.184,
    p95: 0.204,
    feature: 0.153,
  },
} as const;

/** Badwater's pattern as `tools/game-water-shader.py --textures` measures the game's (`WaterContaminationAlbedoEmissionSource`,
 *  t9, Q9 P9; Timberborn 1.1.2.8-ffc2de0-sw), 0–255, raw: the flow carries it at the albedo's coordinates. Its R picks
 *  the base colour between `_Base_Contamination_Color_A` and `_B` (waterPalette.ts `GAME_BADWATER`): a grimy mottle,
 *  broad dark clouds over a fine grain (`broad`: the share of its spread left after a blur over a quarter of a tile).
 *  Its G is the emissive detail's pattern: thin bright lines round cells (median 0.13 square tiles; some cells a tile
 *  or more across), brightest where they meet, small specks inside the cells, black elsewhere (most of it). Its R and G
 *  are independent (correlation 0.015). `percentiles` at `PATTERN_PERCENTILES`. */
export const GAME_BADWATER_TEXTURE = {
  base: {
    mean: 122.1,
    spread: 29.5,
    percentiles: [51, 72, 83, 103, 123, 130, 133, 137, 142, 147, 153, 160, 170, 176, 180, 186],
    feature: 0.045,
    broad: 0.33,
  },
  glow: {
    mean: 19.6,
    spread: 47.0,
    percentiles: [0, 0, 0, 0, 0, 0, 1, 3, 10, 23, 40, 72, 118, 167, 211, 253],
    /** The share of texels at 0. */
    zero: 0.627,
    feature: 0.057,
    broad: 0.25,
  },
} as const;

/** The still detail albedo as `tools/game-water-shader.py --textures` measures the game's (`PhysicalWaterDetailAlbedo`,
 *  t5, Q9 P6; Timberborn 1.1.2.8-ffc2de0-sw), display values 0–255: sampled at xz × `tiling` (one repeat 66.7 tiles),
 *  still, it is overlaid on clean water's colour × its albedo and on badwater's base colour. Broad clouds several tiles
 *  across, mostly dim, with sparse bright patches (a long upper tail) whose insides carry a fine swirl. Its colour is
 *  nearly one field: its first principal component (`first`, a greenish brightness) carries 96 % of its variance; the
 *  second (`second`, blue against red, 2.72) is uncorrelated with it but follows it (the dim texels lean blue, the
 *  middle red, the brightest blue again), so a quadratic in the first (`fromFirst`: c2 = k0 + k1 c1 + k2 c1²) carries
 *  all of it but 0.89; the third is nothing (0.4). The first's `percentiles` at `PATTERN_PERCENTILES`, its `range`
 *  (min, max), the autocorrelation's half-width (`feature`, tiles), the share of its power by wavelength (`power`,
 *  tiles: 64–32, 32–16, 16–8, 8–4, 4–2, 2–1, 1–0.5, under 0.5) and of its spread left after a blur over 0.25, 0.5,
 *  1, 2 and 4 tiles (`broad`). */
export const GAME_DETAIL_TEXTURE = {
  tiling: 0.015,
  mean: [69.7, 88.7, 95.3],
  spread: [9.9, 8.9, 3.7],
  first: {
    axis: [0.73, 0.656, 0.192],
    spread: 13.58,
    range: [-19.9, 99.5],
    percentiles: [-16.0, -12.7, -11.5, -8.9, -3.4, -1.2, 0.1, 2.3, 5.0, 7.8, 10.6, 17.5, 28.1, 35.6, 43.3, 53.5],
    feature: 1.5,
    power: [0.023, 0.172, 0.289, 0.225, 0.117, 0.071, 0.041, 0.056],
    broad: [0.89, 0.82, 0.68, 0.48, 0.26],
  },
  second: { axis: [-0.178, -0.089, 0.98], spread: 2.72, fromFirst: [-1.4788, -0.21611, 0.008023], rest: 0.89 },
} as const;

/** The percentiles `GAME_BADWATER_TEXTURE` gives (as fractions). */
export const PATTERN_PERCENTILES = [0.01, 0.05, 0.1, 0.25, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.97, 0.98, 0.99] as const;

/** Texels across the texture (one repeat, 1 / 0.06 = 16.7 tiles: 31 texels a tile). */
export const WATER_TEXTURE_SIZE = 512;

/** How the network and blobs are drawn (tuned so the albedo's statistics land on the game's). */
const NET = {
  /** Cells across a repeat (0.66 tiles a cell), and the small cells' (0.4 tiles) where they cluster. */
  cells: [25, 42] as const,
  /** The lines' width (cell units). */
  width: 0.075,
  /** The small cells' share where they cluster. */
  small: 0.6,
  /** The background's brightness variation under the lines. */
  ground: 0.22,
  /** The blue blobs' threshold over their noise, and how far into a cell they keep from its edge (cell units). */
  blob: 0.36,
  inside: 0.3,
};

const TAU = Math.PI * 2;

export function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** i into 0…p − 1 (i within a period of it). */
const wrap = (i: number, p: number) => (i < 0 ? i + p : i >= p ? i - p : i);

/** A tiling value noise's lattice (period `p` cells across, `q` down; `q` = `p` by default): a random a cell. */
export function lattice(p: number, s: number, q = p): { p: number; q: number; v: Float64Array } {
  const v = new Float64Array(p * q);
  for (let y = 0; y < q; y++) for (let x = 0; x < p; x++) v[y * p + x] = hash(x, y, s);
  return { p, q, v };
}

/** Tiling value noise at (u, v), 0–1 across the repeat (its lattice's periods across it). */
export function valueNoise(l: { p: number; q: number; v: Float64Array }, u: number, v: number): number {
  const p = l.p;
  const q = l.q;
  const x = u * p;
  const y = v * q;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = wrap(ix, p);
  const x1 = wrap(ix + 1, p);
  const y0 = wrap(iy, q) * p;
  const y1 = wrap(iy + 1, q) * p;
  const a = l.v[y0 + x0];
  const b = l.v[y0 + x1];
  const c = l.v[y1 + x0];
  const d = l.v[y1 + x1];
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
}

/** A tiling Voronoi's feature points (period `p` cells, one a cell, jittered) and each cell's random. */
export function cellPoints(p: number, s: number): Float64Array {
  const c = new Float64Array(p * p * 3);
  for (let y = 0; y < p; y++)
    for (let x = 0; x < p; x++) {
      const i = (y * p + x) * 3;
      c[i] = 0.1 + 0.8 * hash(x, y, s);
      c[i + 1] = 0.1 + 0.8 * hash(x, y, s + 1);
      c[i + 2] = hash(x, y, s + 2);
    }
  return c;
}

/** Tiling Voronoi (period `p` cells, its points `c`) at (x, y) in cells: the nearest two feature points' distances
 *  and the nearest cell's random. */
export function voronoi(x: number, y: number, p: number, c: Float64Array, out: Float64Array): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 81;
  let f2 = 81;
  let id = 0;
  for (let j = -1; j <= 1; j++) {
    const cy = wrap(wrap(iy + j, p), p) * p;
    for (let i = -1; i <= 1; i++) {
      const k = (cy + wrap(wrap(ix + i, p), p)) * 3;
      const dx = ix + i + c[k] - x;
      const dy = iy + j + c[k + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = c[k + 2];
      } else if (d < f2) f2 = d;
    }
  }
  out[0] = Math.sqrt(f1);
  out[1] = Math.sqrt(f2);
  out[2] = id;
}

/** As `voronoi`, with the third nearest feature point's distance too (out[3]). */
function voronoi3(x: number, y: number, p: number, c: Float64Array, out: Float64Array): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let f1 = 81;
  let f2 = 81;
  let f3 = 81;
  for (let j = -1; j <= 1; j++) {
    const cy = wrap(wrap(iy + j, p), p) * p;
    for (let i = -1; i <= 1; i++) {
      const k = (cy + wrap(wrap(ix + i, p), p)) * 3;
      const dx = ix + i + c[k] - x;
      const dy = iy + j + c[k + 1] - y;
      const d = dx * dx + dy * dy;
      if (d < f1) {
        f3 = f2;
        f2 = f1;
        f1 = d;
        out[2] = c[k + 2];
      } else if (d < f2) {
        f3 = f2;
        f2 = d;
      } else if (d < f3) f3 = d;
    }
  }
  out[0] = Math.sqrt(f1);
  out[1] = Math.sqrt(f2);
  out[3] = Math.sqrt(f3);
}

/** The surface's height: octaves of value noise, a little longer along x than y (the game's normal map's ripples
 *  run that way), warped so no lattice shows: their periods across a repeat (x, y) and amplitudes. */
const RIPPLES = { octaves: [[16, 16, 1], [32, 32, 0.5], [64, 64, 0.3], [128, 128, 0.16]] as const, warp: 0.6 };

/** How the fields are stored: the network's and the blobs' bytes are 255 × field / its `net` or `blob` (none
 *  reach it), the slopes' 128 + 127 × slope / `slope` (slopes the game's spread, by `slopeGain` on the waves). */
const STORE = { net: 1.2, blob: 0.55, slope: 0.5, slopeGain: 0.008493 };

/** The albedo the shaders draw from the texture's R (network) and G (blobs) bytes, display values 0–1:
 *  base + network × R / 255 + blobs × G / 255. Fitted to the texture (`fitAlbedo`, held by a test): the two fields
 *  along the game's first two principal components at their spreads (the blobs made independent of the network
 *  first), round the game's mean, so the albedo's mean and covariance are the game's. */
export const WATER_ALBEDO = {
  base: [0.25564, 0.25419, 0.25387] as readonly [number, number, number],
  network: [0.14005, 0.17849, 0.2033] as readonly [number, number, number],
  blobs: [-0.13336, 0.00994, 0.12143] as readonly [number, number, number],
  /** The game's mean (`GAME_FLOW_TEXTURES.albedo.mean` / 255): the Standard look's own colour is multiplied by the
   *  albedo over it, the texture's variation alone, so its calibration to the game's screen holds. */
  mean: [68.6 / 255, 73.8 / 255, 77.8 / 255] as readonly [number, number, number],
  /** The texture's mean R and G bytes: a texel of them draws the mean albedo (the texture until it is made). */
  flat: [48.88, 25.74] as readonly [number, number],
};

/** The texture (RGBA bytes) at `size` texels square. */
export function makeWaterTexture(size: number): Uint8Array {
  const n = size * size;
  const net = new Float64Array(n);
  const blob = new Float64Array(n);
  const v1 = new Float64Array(3);
  const v2 = new Float64Array(3);
  const [P1, P2] = NET.cells;
  const pts1 = cellPoints(P1, 21);
  const pts2 = cellPoints(P2, 31);
  const warpX = lattice(8, 11);
  const warpY = lattice(8, 12);
  const widths = lattice(16, 13);
  const clusters = lattice(6, 14);
  const brights = lattice(10, 15);
  const grounds = lattice(40, 16);
  const patches = lattice(30, 17);
  const fines = lattice(64, 18);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // a gentle warp so the cells are irregular, as caustics are
      const wx = valueNoise(warpX, u, v) - 0.5;
      const wy = valueNoise(warpY, u, v) - 0.5;
      voronoi(u * P1 + wx * 0.9, v * P1 + wy * 0.9, P1, pts1, v1);
      const w = NET.width * (0.6 + 0.8 * valueNoise(widths, u, v));
      const e1 = v1[1] - v1[0];
      const line1 = Math.exp(-((e1 / w) ** 2));
      // the small cells in clusters, by a broad noise
      const cluster = Math.min(1, Math.max(0, (valueNoise(clusters, u, v) - 0.45) * 2.5)) * NET.small;
      let line2 = 0;
      if (cluster > 0) {
        voronoi(u * P2 + wx * 1.4, v * P2 + wy * 1.4, P2, pts2, v2);
        line2 = Math.exp(-(((v2[1] - v2[0]) / (w * 1.2)) ** 2)) * cluster;
      }
      // the lines brighter in some places than others
      const bright = 0.35 + 0.65 * valueNoise(brights, u, v);
      const ground = NET.ground * valueNoise(grounds, u, v);
      net[y * size + x] = Math.max(line1, line2) * bright + ground;
      // blue blobs inside the large cells: soft toward the cell's edge, broken by noise, some cells more than others
      const inside = 1 - Math.exp(-((e1 / NET.inside) ** 2));
      const patch = Math.max(0, valueNoise(patches, u, v) * 0.75 + valueNoise(fines, u, v) * 0.25 - NET.blob);
      blob[y * size + x] = (0.35 + 0.65 * v1[2]) * inside * patch;
    }
  // the normal: the slopes of the height, by central differences (it tiles, so they wrap)
  const height = new Float64Array(n);
  const oct = RIPPLES.octaves.map(([px, py], k) => lattice(px, 41 + k, py));
  const hwX = lattice(6, 51);
  const hwY = lattice(6, 52);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u0 = (x + 0.5) / size;
      const v0 = (y + 0.5) / size;
      const u = u0 + (valueNoise(hwX, u0, v0) - 0.5) * RIPPLES.warp / 6;
      const v = v0 + (valueNoise(hwY, u0, v0) - 0.5) * RIPPLES.warp / 6;
      let h = 0;
      for (let k = 0; k < oct.length; k++) h += RIPPLES.octaves[k][2] * valueNoise(oct[k], u - Math.floor(u), v - Math.floor(v));
      height[y * size + x] = h;
    }
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      sx[i] = -(height[y * size + wrap(x + 1, size)] - height[y * size + wrap(x - 1, size)]) * 0.5 * size;
      sy[i] = -(height[wrap(y + 1, size) * size + x] - height[wrap(y - 1, size) * size + x]) * 0.5 * size;
    }
  const data = new Uint8Array(n * 4);
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  for (let i = 0; i < n; i++) {
    data[i * 4] = byte((net[i] / STORE.net) * 255);
    data[i * 4 + 1] = byte((blob[i] / STORE.blob) * 255);
    data[i * 4 + 2] = byte(128 + (127 * sx[i] * STORE.slopeGain) / STORE.slope);
    data[i * 4 + 3] = byte(128 + (127 * sy[i] * STORE.slopeGain) / STORE.slope);
  }
  return data;
}

/** How badwater's pattern is drawn (tuned so its statistics land on the game's, `GAME_BADWATER_TEXTURE`): the base's
 *  octaves of value noise (their periods across a repeat and amplitudes) and their warp; the glow's large cells and
 *  its small ones where they cluster (cells across a repeat), the lines' width (cell units), the specks inside them
 *  (cells across a repeat, their radius in cell units and how many cells have one) and the soft glow under them. */
const BAD_PATTERN = {
  octaves: [[8, 0.17], [16, 0.25], [32, 0.25], [64, 0.3], [128, 0.4], [256, 0.45]] as const,
  grain: 0.5,
  warp: 0.5,
  cells: [24, 50] as const,
  width: 0.05,
  junction: 1.5,
  wobble: 0.35,
  small: 0.75,
  specks: { cells: 140, radius: 0.16, share: 0.35, light: 0.5 },
  haze: 1.6,
};

/** Values `v` (raw, any scale) remapped by their rank so their distribution is the game's: `percentiles` at
 *  `PATTERN_PERCENTILES`, `lo` and `hi` at the ends, straight between (in place). */
function toPercentiles(v: Float64Array, percentiles: readonly number[], lo: number, hi: number): void {
  const n = v.length;
  // (each value's rank from a sorted copy by bisection, equal values in index order as a stable sort would have them:
  // a native typed sort, several times faster than sorting the indices through a comparator)
  const sorted = Float64Array.from(v).sort();
  const taken = new Int32Array(n);
  const ps = [0, ...PATTERN_PERCENTILES, 1];
  const vs = [lo, ...percentiles, hi];
  const at = new Float64Array(n);
  for (let r = 0, k = 0; r < n; r++) {
    const p = (r + 0.5) / n;
    while (k < ps.length - 2 && p > ps[k + 1]) k++;
    at[r] = vs[k] + ((vs[k + 1] - vs[k]) * (p - ps[k])) / (ps[k + 1] - ps[k]);
  }
  for (let i = 0; i < n; i++) {
    const x = v[i];
    let a = 0;
    let b = n - 1;
    while (a < b) {
      const m = (a + b) >> 1;
      if (sorted[m] < x) a = m + 1;
      else b = m;
    }
    v[i] = at[a + taken[a]++];
  }
}

/** Badwater's pattern (RGBA bytes) at `size` texels square, one repeat as the surface's: R the base colour's pattern,
 *  G the emissive detail's (`GAME_BADWATER_TEXTURE`); B the still detail albedo's (Q9 P6, `makeDetailField`), which
 *  shares the texture but is sampled at its own tiling, still, in every look; A the water sources' own pattern (Q9 P7,
 *  `makeSourceShape`), sampled round each source in every look. */
export function makeBadwaterTexture(size: number): Uint8Array {
  const n = size * size;
  const P = BAD_PATTERN;
  const base = new Float64Array(n);
  const glow = new Float64Array(n);
  const oct = P.octaves.map(([p], k) => lattice(p, 61 + k));
  const warpX = lattice(10, 71);
  const warpY = lattice(10, 72);
  const [C1, C2] = P.cells;
  const pts1 = cellPoints(C1, 81);
  const pts2 = cellPoints(C2, 91);
  const pts3 = cellPoints(P.specks.cells, 101);
  const lwarpX = lattice(8, 73);
  const lwarpY = lattice(8, 74);
  const wobX = lattice(40, 83);
  const wobY = lattice(40, 84);
  const widths = lattice(20, 75);
  const clusters = lattice(7, 76);
  const brights = lattice(24, 77);
  const hazes = lattice(30, 78);
  const v1 = new Float64Array(4);
  const v2 = new Float64Array(4);
  const v3 = new Float64Array(3);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u0 = (x + 0.5) / size;
      const w0 = (y + 0.5) / size;
      const i = y * size + x;
      // the base: octaves of value noise, warped into clouds
      const u = u0 + ((valueNoise(warpX, u0, w0) - 0.5) * P.warp) / 10;
      const w = w0 + ((valueNoise(warpY, u0, w0) - 0.5) * P.warp) / 10;
      let h = 0;
      for (let k = 0; k < oct.length; k++) h += P.octaves[k][1] * valueNoise(oct[k], u - Math.floor(u), w - Math.floor(w));
      base[i] = h + P.grain * hash(x, y, 79);
      // the glow: lines round warped cells, small cells where they cluster, specks inside them, a faint haze
      // (a broad warp so the cells are irregular, and a fine one so their lines wobble)
      const wx = valueNoise(lwarpX, u0, w0) - 0.5 + (valueNoise(wobX, u0, w0) - 0.5) * P.wobble;
      const wy = valueNoise(lwarpY, u0, w0) - 0.5 + (valueNoise(wobY, u0, w0) - 0.5) * P.wobble;
      const lw = P.width * (0.6 + 0.8 * valueNoise(widths, u0, w0));
      // a line between two cells, wider and brighter where three meet, so the cells read rounded
      const lineOf = (v: Float64Array, width: number) => Math.exp(-(((v[1] - v[0]) / width) ** 2)) * (1 + P.junction * Math.exp(-(((v[3] - v[0]) / (width * 3)) ** 2)));
      voronoi3(u0 * C1 + wx * 0.8, w0 * C1 + wy * 0.8, C1, pts1, v1);
      let line = lineOf(v1, lw);
      const cluster = Math.min(1, Math.max(0, (valueNoise(clusters, u0, w0) - 0.4) * 2.5)) * P.small;
      if (cluster > 0) {
        voronoi3(u0 * C2 + wx * 1.4, w0 * C2 + wy * 1.4, C2, pts2, v2);
        line = Math.max(line, lineOf(v2, lw * 1.3) * cluster);
      }
      voronoi(u0 * P.specks.cells, w0 * P.specks.cells, P.specks.cells, pts3, v3);
      const speck = v3[2] < P.specks.share ? Math.exp(-((v3[0] / P.specks.radius) ** 2)) * P.specks.light : 0;
      const haze = Math.max(0, valueNoise(hazes, u0, w0) - 0.55) * P.haze;
      glow[i] = Math.max(line * (0.45 + 0.55 * valueNoise(brights, u0, w0)), speck) + haze;
    }
  const G = GAME_BADWATER_TEXTURE;
  toPercentiles(base, G.base.percentiles, 30, 220);
  toPercentiles(glow, G.glow.percentiles, 0, 255);
  const detail = makeDetailField(size);
  const shape = makeSourceShape(size);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round(base[i]);
    data[i * 4 + 1] = Math.round(glow[i]);
    data[i * 4 + 2] = detail[i];
    data[i * 4 + 3] = shape[i];
  }
  return data;
}

/** How the still detail albedo is drawn (tuned so its statistics land on the game's, `GAME_DETAIL_TEXTURE`): its first
 *  component a Gaussian field made from a spectrum (`power`: the share of its power in each band of wavelength,
 *  `DETAIL_BANDS`, before the rank remap, which moves some of it), then remapped by rank to the game's distribution,
 *  its last hundredth straight from the 99th percentile to `top` (the game's brightest texels are lone specks, so its
 *  maximum would lift the spread). */
export const DETAIL_PATTERN = {
  power: [0.023, 0.251, 0.278, 0.234, 0.098, 0.059, 0.033, 0.045],
  top: 75,
};

/** The bands of wavelength (tiles) the detail's power is measured and made in: 64–32, 32–16, …, 1–0.5, under 0.5. */
const DETAIL_BANDS = [64, 32, 16, 8, 4, 2, 1, 0.5, 0] as const;

/** How the detail's first component is stored in badwater's texture's B byte: 255 × (score − lo) / (hi − lo), the
 *  score its distance from the mean along its axis (`GAME_DETAIL_TEXTURE.first`; its range inside). */
export const DETAIL_STORE = [-20, 100] as const;

/** The detail albedo (display values, 0–1) the shader draws from a texel's B byte (0–255): the mean, the first
 *  component's score along its axis, and the second's by the first (`fromFirst`). */
export function detailOf(b: number): [number, number, number] {
  const G = GAME_DETAIL_TEXTURE;
  const s1 = DETAIL_STORE[0] + ((DETAIL_STORE[1] - DETAIL_STORE[0]) * b) / 255;
  const [k0, k1, k2] = G.second.fromFirst;
  const s2 = k0 + k1 * s1 + k2 * s1 * s1;
  return [0, 1, 2].map((k) => (G.mean[k] + G.first.axis[k] * s1 + G.second.axis[k] * s2) / 255) as [number, number, number];
}

/** The detail's colour as the shader draws it from its stored byte (0–1): `base` + `lin` × b + `quad` × b², display
 *  values (`detailOf`, multiplied out). */
export const DETAIL_COLOUR = (() => {
  const G = GAME_DETAIL_TEXTURE;
  const [lo, hi] = DETAIL_STORE;
  const w = hi - lo;
  const [k0, k1, k2] = G.second.fromFirst;
  // s1 = lo + w b; s2 = k0 + k1 s1 + k2 s1² = (k0 + k1 lo + k2 lo²) + (k1 w + 2 k2 lo w) b + k2 w² b²
  const c0 = k0 + k1 * lo + k2 * lo * lo;
  const c1 = k1 * w + 2 * k2 * lo * w;
  const c2 = k2 * w * w;
  const at = (k: number) => [G.mean[k] + G.first.axis[k] * lo + G.second.axis[k] * c0, G.first.axis[k] * w + G.second.axis[k] * c1, G.second.axis[k] * c2].map((v) => v / 255);
  const rows = [0, 1, 2].map(at);
  return { base: rows.map((r) => r[0]), lin: rows.map((r) => r[1]), quad: rows.map((r) => r[2]) };
})();

/** The byte (B) of the detail's mean, 0–255: the texture until it is made. */
export const DETAIL_FLAT = Math.round((255 * -DETAIL_STORE[0]) / (DETAIL_STORE[1] - DETAIL_STORE[0]));

/** The FFT's twiddles for `n` points: cos and sin of −τk/n, k < n/2 (each pass of length `len` reads every n/len-th). */
function twiddles(n: number): { cos: Float64Array; sin: Float64Array } {
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((-TAU * k) / n);
    sin[k] = Math.sin((-TAU * k) / n);
  }
  return { cos, sin };
}

/** An in-place radix-2 FFT of `n` complex values (`re`, `im`, a power of two long), forward, with `tw` its twiddles
 *  (`twiddles(n)`). */
function fft(re: Float64Array, im: Float64Array, tw: { cos: Float64Array; sin: Float64Array }): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = n / len;
    for (let i = 0; i < n; i += len)
      for (let k = 0; k < len / 2; k++) {
        const wr = tw.cos[k * step];
        const wi = tw.sin[k * step];
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
  }
}

/** A tiling Gaussian field `size` square (a power of two) whose power in each band of `DETAIL_BANDS` (one repeat
 *  `repeat` tiles across) is `power`'s share, spread evenly over the band's frequencies, random phases (seed `s`). */
function spectralField(size: number, repeat: number, power: readonly number[], s: number): Float64Array {
  const n = size * size;
  const band = new Int8Array(n).fill(-1);
  const count = new Float64Array(power.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const ky = y < size / 2 ? y : y - size;
      const kx = x < size / 2 ? x : x - size;
      const k = Math.sqrt(kx * kx + ky * ky);
      if (k === 0) continue;
      const wave = repeat / k;
      for (let b = 0; b < power.length; b++)
        if (wave <= DETAIL_BANDS[b] && wave > DETAIL_BANDS[b + 1]) {
          band[y * size + x] = b;
          count[b]++;
          break;
        }
    }
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const b = band[i];
    if (b < 0 || !count[b]) continue;
    // (a complex Gaussian by Box-Muller, × the band's amplitude a frequency)
    const r = Math.sqrt(-2 * Math.log(1 - hash(i, 0, s))) * Math.sqrt(power[b] / count[b]);
    const a = TAU * hash(i, 1, s);
    re[i] = r * Math.cos(a);
    im[i] = r * Math.sin(a);
  }
  const rr = new Float64Array(size);
  const ri = new Float64Array(size);
  const tw = twiddles(size);
  for (let pass = 0; pass < 2; pass++)
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const at = pass ? i * size + j : j * size + i;
        rr[i] = re[at];
        ri[i] = im[at];
      }
      fft(rr, ri, tw);
      for (let i = 0; i < size; i++) {
        const at = pass ? i * size + j : j * size + i;
        re[at] = rr[i];
        im[at] = ri[i];
      }
    }
  return re;
}

/** The still detail albedo's first component (Q9 P6) as stored bytes (`DETAIL_STORE`), `size` square (a power of
 *  two), one repeat `1 / GAME_DETAIL_TEXTURE.tiling` tiles across: a Gaussian field with the game's spectrum, remapped by
 *  rank to the game's distribution (its long bright tail), centred, each rounded and held to 0–255 (a texel a hair
 *  past the store's range is its end, never wrapped round to the other). */
export function makeDetailField(size: number): Uint8Array {
  const f = spectralField(size, 1 / GAME_DETAIL_TEXTURE.tiling, DETAIL_PATTERN.power, 301);
  const G = GAME_DETAIL_TEXTURE.first;
  toPercentiles(f, G.percentiles, G.range[0], DETAIL_PATTERN.top);
  // (centred: a score is a distance from the mean, so the texture's mean is the game's)
  let m = 0;
  for (let i = 0; i < f.length; i++) m += f[i] / f.length;
  const [lo, hi] = DETAIL_STORE;
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.min(255, Math.max(0, Math.round((255 * (f[i] - m - lo)) / (hi - lo))));
  return out;
}

/** The water sources' own pattern as `tools/game-water-shader.py --textures` measures the game's (`WaterSourceShape`,
 *  Q9 P7; Timberborn 1.1.2.8-ffc2de0-sw), 0–255, grey: the game draws it round a seep and a badwater source in polar
 *  coordinates (its u the distance from the source's middle, its v the angle), so its blobs stream out in rings. Soft
 *  blobs over black (a quarter of it under 6), `percentiles` at `PATTERN_PERCENTILES`; the share of its power by
 *  cycles a repeat (`power`: 1–2, 2–4, 4–8, 8–16, 16–32, 32–64, 64–128, 128 and more), most at 4–16; the
 *  autocorrelation's half-width (`feature`, a repeat's share: 27 texels of 1024), alike in every direction. */
export const GAME_SOURCE_SHAPE = {
  mean: 62.9,
  spread: 61.8,
  percentiles: [0, 0, 0, 6, 47, 66, 76, 88, 102, 118, 136, 158, 187, 202, 212, 227],
  power: [0.107, 0.079, 0.311, 0.332, 0.122, 0.023, 0.004, 0.022],
  feature: 27 / 1024,
} as const;

/** How the sources' pattern is drawn (tuned so its statistics land on the game's, `GAME_SOURCE_SHAPE`): a Gaussian field
 *  made from a spectrum (`power`, by the same bands, before the rank remap), remapped by rank to the game's distribution. */
export const SOURCE_PATTERN = {
  // (the first band's eight frequencies carry three times the game's share in: the rank remap, which lifts the black
  // floor's edges, moves it up the bands)
  power: [0.31, 0.055, 0.28, 0.31, 0.09, 0.014, 0.003, 0.017],
};

/** The water sources' pattern (Q9 P7) as bytes, `size` square (a power of two), one repeat: a Gaussian field with the
 *  game's spectrum, remapped by rank to the game's distribution. It rides in badwater's texture's A. */
export function makeSourceShape(size: number): Uint8Array {
  // (the bands are made in wavelengths of a 64-tile repeat: 64–32 is 1–2 cycles a repeat)
  const f = spectralField(size, 64, SOURCE_PATTERN.power, 401);
  toPercentiles(f, GAME_SOURCE_SHAPE.percentiles, 0, 255);
  return Uint8Array.from(f, (v) => Math.min(255, Math.max(0, Math.round(v))));
}

/** The share of a tiling field's spread (`size` square, one repeat `repeat` tiles across) left after a Gaussian blur
 *  over `sigma` tiles (as tools/game-water-shader.py measures the game's "broad" share). */
export function broadShare(f: ArrayLike<number>, size: number, sigma = 0.25, repeat = 1 / WATER_FLOW.tiling): number {
  const s = (sigma * size) / repeat;
  const r = Math.ceil(s * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, j) => Math.exp(-((j - r) ** 2) / (2 * s * s)));
  const kn = k.reduce((a, b) => a + b, 0);
  const n = size * size;
  const a = new Float64Array(n);
  const b = new Float64Array(n);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let j = -r; j <= r; j++) v += f[y * size + wrap(wrap(x + j, size), size)] * k[j + r];
      a[y * size + x] = v / kn;
    }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (let j = -r; j <= r; j++) v += a[wrap(wrap(y + j, size), size) * size + x] * k[j + r];
      b[y * size + x] = v / kn;
    }
  const sd = (g: ArrayLike<number>) => {
    let m = 0;
    for (let i = 0; i < n; i++) m += g[i];
    m /= n;
    let q = 0;
    for (let i = 0; i < n; i++) q += (g[i] - m) ** 2;
    return Math.sqrt(q / n);
  };
  return sd(b) / sd(f);
}

/** The albedo fitted to a texture's bytes (`WATER_ALBEDO`'s numbers). */
export function fitAlbedo(data: Uint8Array): { base: number[]; network: number[]; blobs: number[] } {
  const n = data.length / 4;
  let mr = 0;
  let mg = 0;
  for (let i = 0; i < n; i++) {
    mr += data[i * 4];
    mg += data[i * 4 + 1];
  }
  mr /= n;
  mg /= n;
  let vr = 0;
  let vg = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] - mr;
    const g = data[i * 4 + 1] - mg;
    vr += r * r;
    vg += g * g;
    c += r * g;
  }
  const sr = Math.sqrt(vr / n);
  const sg = Math.sqrt(vg / n);
  const rho = c / n / (sr * sg);
  // z1 = (R − mr) / sr; z2 = the blobs less what the network explains, standardised, turned toward blue
  // (−(G − mg) / sg + rho z1) / √(1 − rho²)
  const q = Math.sqrt(1 - rho * rho);
  const [c1, c2] = GAME_FLOW_TEXTURES.albedo.components;
  const mean = GAME_FLOW_TEXTURES.albedo.mean;
  const network: number[] = [];
  const blobs: number[] = [];
  const base: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a1 = c1.axis[k] * c1.spread;
    const a2 = c2.axis[k] * c2.spread;
    // albedo × 255 = mean + a1 z1 + a2 z2 = mean + R (a1 / sr + a2 rho / (sr q)) − G a2 / (sg q) + the rest
    const kr = a1 / sr + (a2 * rho) / (sr * q);
    const kg = -a2 / (sg * q);
    network.push((kr * 255) / 255);
    blobs.push((kg * 255) / 255);
    base.push((mean[k] - kr * mr - kg * mg) / 255);
  }
  return { base, network, blobs };
}

/** The albedo (display values, 0–1) the shader draws from a texel's R and G bytes (0–255). */
export function albedoOf(r: number, g: number): [number, number, number] {
  const a = WATER_ALBEDO;
  return [0, 1, 2].map((k) => a.base[k] + (a.network[k] * r) / 255 + (a.blobs[k] * g) / 255) as [number, number, number];
}

/** A texel's slopes (x, y) as the shader unpacks them from its B and A bytes, before the boost. */
export function slopesOf(b: number, a: number): [number, number] {
  return [((b - 128) / 127) * STORE.slope, ((a - 128) / 127) * STORE.slope];
}

/** The autocorrelation's half-width of a tiling field (`size` square, one repeat `repeat` tiles across), in tiles: the
 *  shift at which it first falls to a half, averaged over the four directions (as tools/game-water-shader.py
 *  `feature_scale` measures the game's). */
export function featureTiles(f: ArrayLike<number>, size: number, repeat = 1 / WATER_FLOW.tiling): number {
  const n = size * size;
  let m = 0;
  for (let i = 0; i < n; i++) m += f[i];
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (f[i] - m) ** 2;
  const half: number[] = [];
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    for (let s = 1; s < size / 2; s++) {
      let c = 0;
      for (let y = 0; y < size; y++) {
        const yy = wrap(y + dy * s, size) * size;
        for (let x = 0; x < size; x++) c += (f[y * size + x] - m) * (f[yy + wrap(x + dx * s, size)] - m);
      }
      if (c / v < 0.5) {
        half.push(s * Math.hypot(dx, dy));
        break;
      }
    }
  }
  return (half.reduce((a, b) => a + b, 0) / half.length) * (repeat / size);
}

const g = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(Math.round(v * 1e6) / 1e6));
const v2 = (v: readonly number[]) => `vec2(${v.map(g).join(", ")})`;
const v3 = (v: readonly number[]) => `vec3(${v.map(g).join(", ")})`;

/** The flow's surface in GLSL, for the water's shaders (both looks): the texture (`waterTex`), the flow from a flow
 *  texel (high/bake.ts `flowByte`), the two phases' sample, the albedo and the normal. */
export const WATER_FLOW_GLSL = /* glsl */ `
  uniform sampler2D waterTex;
  uniform sampler2D badwaterTex;
  /** The flow the textures ride (the game's: each column's outflows ÷ 14) from a flow texel's RG (high/bake.ts
   *  flowByte). */
  vec2 waterFlowOf(vec2 rg) {
    vec2 e = (rg * 255.0 - 128.0) / 127.0;
    return e * abs(e);
  }
  /** Where the flow's two phases sample at g (tiles) with flow f at time t, as the game's (waterTextures.ts WATER_FLOW;
   *  Q9 P5): two phases of t × ${g(WATER_FLOW.speed)}, half a cycle apart, each at g × ${g(WATER_FLOW.tiling)} less the flow ×
   *  its fraction × ${g(WATER_FLOW.strength)}, jumping each cycle (pa, pb, in tiles), cross-faded by w = |2 frac − 1| so neither is
   *  seen to jump. */
  void waterPhases(vec2 g, vec2 f, float t, out vec2 pa, out vec2 pb, out float w) {
    float ph = t * ${g(WATER_FLOW.speed)};
    float a = fract(ph);
    float b = fract(ph + 0.5);
    pa = g + (fract(floor(ph) * ${v2(WATER_FLOW.jumpA)}) - f * a * ${g(WATER_FLOW.strength)}) / ${g(WATER_FLOW.tiling)};
    pb = g + (fract(floor(ph + 0.5) * ${v2(WATER_FLOW.jumpB)}) - f * b * ${g(WATER_FLOW.strength)}) / ${g(WATER_FLOW.tiling)};
    w = abs(2.0 * a - 1.0);
  }
  /** The surface the flow carries at the phases' points: RG the albedo's fields, BA the slopes. */
  vec4 waterSurfaceAt(vec2 pa, vec2 pb, float w) {
    return mix(texture2D(waterTex, pa * ${g(WATER_FLOW.tiling)}), texture2D(waterTex, pb * ${g(WATER_FLOW.tiling)}), w);
  }
  /** The albedo the surface carries (waterTextures.ts WATER_ALBEDO), display values: about ${v3(WATER_ALBEDO.mean.map((m) => Math.round(m * 1000) / 1000))} on
   *  average, as the game's. */
  vec3 waterAlbedo(vec4 s) {
    return ${v3(WATER_ALBEDO.base)} + ${v3(WATER_ALBEDO.network)} * s.r + ${v3(WATER_ALBEDO.blobs)} * s.g;
  }
  #define WATER_ALBEDO_MEAN ${v3(WATER_ALBEDO.mean)}
  /** Badwater's pattern the flow carries at the phases' points (makeBadwaterTexture; Q9 P9: the game samples its t9 at
   *  the albedo's coordinates): R the base colour's, G the emissive detail's, 0–1. */
  vec2 badwaterPatternAt(vec2 pa, vec2 pb, float w) {
    return mix(texture2D(badwaterTex, pa * ${g(WATER_FLOW.tiling)}).rg, texture2D(badwaterTex, pb * ${g(WATER_FLOW.tiling)}).rg, w);
  }
  /** The game's still detail albedo at g (tiles; Q9 P6, makeDetailField, detailOf): badwater's texture's B at g ×
   *  ${g(GAME_DETAIL_TEXTURE.tiling)} (one repeat ${g(Math.round(1 / GAME_DETAIL_TEXTURE.tiling * 10) / 10)} tiles), not carried by the flow, its colour (display values) by the
   *  first component and the second by it. */
  vec3 waterDetailAt(vec2 g) {
    float b = texture2D(badwaterTex, g * ${g(GAME_DETAIL_TEXTURE.tiling)}).b;
    return ${v3(DETAIL_COLOUR.base)} + ${v3(DETAIL_COLOUR.lin)} * b + ${v3(DETAIL_COLOUR.quad)} * b * b;
  }
  /** The surface's normal from its slopes, × ${g(WATER_FLOW.boost)} and × (1 + the badwater share) more, as the game's
   *  (Q9 P11). */
  vec3 waterFlowNormal(vec4 s, float share) {
    vec2 sl = (s.ba * 255.0 - 128.0) / 127.0 * ${g(STORE.slope)};
    float z = sqrt(max(0.0, 1.0 - dot(sl, sl)));
    vec2 b = sl * ${g(WATER_FLOW.boost)} * (1.0 + share);
    return normalize(vec3(b.x, z, -b.y));
  }
`;
