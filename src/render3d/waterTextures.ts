// The textures the water's flow carries, ours (Q9 P5, investigation/notes/water_and_soil.md): the game draws its
// water's surface with two textures that ride the outflow, `PhysicalWaterAlbedo` (it multiplies the colour) and
// `Water_N` (the surface's normal: lit as it is, × `_NormalBoost` 4 for the camera highlight alone). Theirs cannot ship; these are made here, in code, to the
// statistics `python tools/game-water-shader.py --textures` measures in theirs (`GAME_FLOW_TEXTURES`; numbers only:
// no texel of the game's is read here or stored in git), and tests/unit/water-flow-surface.test.ts holds them there.
//
// One RG texture, `WATER_TEXTURE_SIZE` square (2048², as the game's), one repeat `1 / WATER_FLOW.tiling` tiles across
// (as the game's):
// - R the light network: bright gaps with crisp edges round irregular cells, as caustics, dense and bright in patches a
//   tile or two across and faint between them (the albedo's first principal component, a near-neutral brightness, at
//   the game's distribution and its power by scale down to its texel);
// - G the blue blobs inside the cells (its second, red against blue).
// The normal's slopes x and y (the normal the game lights; × `boost` for its camera highlight) have their own RG
// texture, `NORMAL_TEXTURE_SIZE` square over the same repeat (`makeWaterNormal`): the gradient of a Gaussian height at
// the game's power by wavelength.
// The albedo is `albedoOf(r, g)` (`WATER_ALBEDO`), display values (0–1), fitted so its mean and covariance are the
// game's. Pure TypeScript, no three.js: made once a page in a worker of its own (high/fields.ts `textureBake`), the
// texture a single texel at its mean until then (renderer.ts, materials.ts `waterSurfaceTexture`).

/** The flow's numbers, the game's (its `PhysicalWater_Opaque` material, Q9 P5, P11; ps 419-446, 794-813): two phases
 *  of the time × `speed` (2.5 s each), half a cycle apart, mixed by |2 frac − 1|; each samples at xz × `tiling` −
 *  flow × frac × `strength`, and jumps by `jumpA` or `jumpB` each cycle; the flow is each column's outflow (right −
 *  left, top − bottom) ÷ `maxOutflow` (`Timberborn.WaterSystemRendering` `MaxOutflow`); the normal's slopes × (1 +
 *  badwater share) (`_Contamination_Normal_Strength` 2), and × `boost` more for the camera highlight alone (its URP
 *  light takes the normal unboosted: ps 904-910). */
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
    /** Its first principal component's score (the distance from the mean along `components[0]`): `percentiles` at
     *  `PATTERN_PERCENTILES`, its `range` (min, max), its power by wavelength (`power`, `ALBEDO_BANDS`, tiles: 16–8,
     *  …, 0.25–0.125, 0.125 to 512²'s texel pair, to 1024²'s, to its own) and the share of its spread left after a blur
     *  over 0.125, 0.25, 0.5, 1 and 2 tiles (`broad`). Mostly dim, with bright lines dense in patches a tile or two
     *  across and sparse between them: the broad mottle open water shows from afar. `fine`: the spread of its part
     *  finer than 512²'s texel pair (0.065 tile) in its top (123 texels a tile) and its first mip (61): what a camera
     *  nearer than 31 pixels a tile draws that a 512² texture cannot. */
    first: {
      percentiles: [-11.2, -9.4, -8.3, -7.6, -5.3, -3.6, -1.9, -0.7, 1.6, 3.9, 7.9, 14.4, 27.6, 39.7, 50.1, 62.8],
      range: [-16.3, 119.3],
      power: [0.0025, 0.021, 0.0588, 0.1285, 0.1962, 0.2524, 0.211, 0.0892, 0.0275, 0.0122],
      fine: [2.74, 2.08],
      broad: [0.474, 0.317, 0.187, 0.09, 0.035],
    },
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
    /** The share of the slopes' power by wavelength (`NORMAL_BANDS`, tiles: 16–8, …, 0.125–0.0625, under 0.0625), x
     *  and y averaged (each within 0.013 of it): a tenth of it under 0.125 tiles, the fine ripples that make the
     *  camera highlight's specks close up. The texture is 4096² (246 texels a tile). */
    power: [0.0015, 0.0165, 0.065, 0.294, 0.273, 0.1395, 0.1055, 0.0645, 0.04],
    /** Its slopes' spread (x, y) in its mip of 61 texels a tile (the 4 × 4 texels' mean), the most our 1024² holds. */
    spread61: [0.114, 0.117],
    /** Its slopes' mean (x, y) as the shader unpacks them: the surface tilted 0.9° on average, toward +x and +y of the
     *  texture, which its frame puts along the map's x and y: the normal's x along the object's x, its y along
     *  ± cross(up, x) by its mesh's tangent sign (ps 118-130; the water mesh sets no tangents), read as the map's +y
     *  because the probe's frames at both poses agree with it and not with −y. The camera highlight takes it × 4. */
    mean: [0.0102, 0.0119],
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
 *  tiles: 64–32, 32–16, 16–8, 8–4, 4–2, 2–1, 1–0.5, 0.5–0.25, 0.25–0.125, under 0.125; `DETAIL_FINE_BANDS`) and of its
 *  spread left after a blur over 0.25, 0.5, 1, 2 and 4 tiles (`broad`). The game's is 2048² (31 texels a tile). */
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
    power: [0.023, 0.172, 0.289, 0.225, 0.117, 0.071, 0.041, 0.025, 0.018, 0.013],
    broad: [0.89, 0.82, 0.68, 0.48, 0.26],
  },
  second: { axis: [-0.178, -0.089, 0.98], spread: 2.72, fromFirst: [-1.4788, -0.21611, 0.008023], rest: 0.89 },
} as const;

/** The percentiles `GAME_BADWATER_TEXTURE` gives (as fractions). */
export const PATTERN_PERCENTILES = [0.01, 0.05, 0.1, 0.25, 0.5, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.97, 0.98, 0.99] as const;

/** Texels across the albedo's texture (one repeat, 1 / 0.06 = 16.7 tiles: 123 texels a tile), the game's
 *  `PhysicalWaterAlbedo`'s size: 4 % of the game's power lies under 512²'s texel pair (0.065 tile), the fine part a
 *  camera nearer than about 31 pixels a tile draws (`materials.ts` `waterSurfaceTexture`, two bytes a texel). */
export const WATER_TEXTURE_SIZE = 2048;

/** Texels across badwater's pattern and the water sources' (`makeBadwaterTexture`, `makeSourceShape`), over the
 *  albedo's repeat (31 texels a tile; the game's is 2048²). */
export const BADWATER_TEXTURE_SIZE = 512;

/** Texels across the normal's texture (one repeat, 16.7 tiles: 61 texels a tile), its own (`materials.ts`
 *  `waterNormalTexture`, two bytes a texel): the game's `Water_N` is 4096² (246 a tile), and its mip of 61 a tile
 *  holds all but 2 % of its slopes' spread; at 512² (31 a tile) ours held nothing finer than 0.125 tile, where the
 *  game's has a tenth of its power. Kept at 1024² (fix/water-texture-resolution): a camera under 61 pixels a tile
 *  samples the game's mips no finer than this, and nearer, up to 123 pixels a tile, the game's next mip holds 0.9 %
 *  more of its slopes' variance (2048², 8 MB more on the GPU); 4096²'s top, 1.9 % (43 MB). */
export const NORMAL_TEXTURE_SIZE = 1024;

/** The bands of wavelength (tiles) the albedo's power is measured in (`GAME_FLOW_TEXTURES.albedo.first.power`): 16–8,
 *  …, 0.25–0.125, then 0.125 to the texel pair of 512², of 1024² and under. */
export const ALBEDO_BANDS = [16, 8, 4, 2, 1, 0.5, 0.25, 0.125, (2 / 512) / WATER_FLOW.tiling, (2 / 1024) / WATER_FLOW.tiling, 0] as const;

/** The bands of wavelength (tiles) the normal's slopes are made in (`GAME_FLOW_TEXTURES.normal.power`). */
export const NORMAL_BANDS = [16, 8, 4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0] as const;

/** How the network and blobs are drawn (tuned so the albedo's statistics land on the game's, its power by wavelength
 *  down to its own texel among them). */
const NET = {
  /** Cells across a repeat (0.56 tiles a cell), and the small cells' (0.33 tiles) where they cluster. */
  cells: [30, 50] as const,
  /** The lines' width (cell units). */
  width: 0.11,
  /** The lines' edge: their profile e^(−t^(2 `edge`)), t the distance across over the width, flat-topped with a crisp
   *  edge two or three texels wide, as the game's bright gaps between its dark cells (a Gaussian's soft edge holds
   *  nothing finer than a sixteenth of a tile). */
  edge: 4,
  /** A grain a texel (the network × 1 + `grain` × a random in ±0.5): the game's bright gaps are speckled, its finest
   *  octave's power. */
  grain: 0.25,
  /** The small cells' share where they cluster. */
  small: 0.6,
  /** The background's brightness variation under the lines. */
  ground: 0.22,
  /** The blue blobs' threshold over their noise, and how far into a cell they keep from its edge (cell units). */
  blob: 0.36,
  inside: 0.3,
  /** The patches the lines are bright in (the game's network is dense and bright in patches a tile or two across and
   *  faint between them): the network × e^(`patchy` × a Gaussian field of unit spread whose power by wavelength is
   *  `patches` (`DETAIL_BANDS`, tiles: 64–32, …, under 0.5)), then remapped by rank to the game's distribution. */
  patchy: 0.7,
  patches: [0, 0, 0, 0.05, 0.2, 0.4, 0.35, 0] as readonly number[],
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

/** `valueNoise(l, (x + 0.5) / size, (y + 0.5) / size)` at every texel's middle of a row of a `size`-square grid: the
 *  same values, each column's cells and weights worked out once. The row's values for row `y` (its own buffer,
 *  refilled each call). */
export function noiseRows(l: { p: number; q: number; v: Float64Array }, size: number): (y: number) => Float64Array {
  const p = l.p;
  const q = l.q;
  const lv = l.v;
  const x0 = new Int32Array(size);
  const x1 = new Int32Array(size);
  const fxs = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const x = ((i + 0.5) / size) * p;
    const ix = Math.floor(x);
    const fx = x - ix;
    fxs[i] = fx * fx * (3 - 2 * fx);
    x0[i] = wrap(ix, p);
    x1[i] = wrap(ix + 1, p);
  }
  const out = new Float64Array(size);
  return (j) => {
    const y = ((j + 0.5) / size) * q;
    const iy = Math.floor(y);
    let fy = y - iy;
    fy = fy * fy * (3 - 2 * fy);
    const y0 = wrap(iy, q) * p;
    const y1 = wrap(iy + 1, q) * p;
    for (let i = 0; i < size; i++) {
      const fx = fxs[i];
      const a = lv[y0 + x0[i]];
      const b = lv[y0 + x1[i]];
      const c = lv[y1 + x0[i]];
      const d = lv[y1 + x1[i]];
      out[i] = a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
    }
    return out;
  };
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

/** How the fields are stored: the network's byte is 255 × its score's place in the game's range
 *  (`GAME_FLOW_TEXTURES.albedo.first.range`), the blobs' 255 × field / `blob` (none reach it), the normal's slopes
 *  128 + 127 × slope / `slope` (`makeWaterNormal`). */
const STORE = { blob: 0.55, slope: 0.5 };

/** The albedo the shaders draw from the texture's R (network) and G (blobs) bytes, display values 0–1:
 *  base + network × R / 255 + blobs × G / 255. Fitted to the texture (`fitAlbedo`, held by a test): the two fields
 *  along the game's first two principal components at their spreads (the blobs made independent of the network
 *  first), round the game's mean, so the albedo's mean and covariance are the game's. */
export const WATER_ALBEDO = {
  base: [0.25293, 0.25343, 0.25463] as readonly [number, number, number],
  network: [0.2405, 0.28744, 0.31572] as readonly [number, number, number],
  blobs: [-0.12968, 0.00966, 0.11809] as readonly [number, number, number],
  /** The game's mean (`GAME_FLOW_TEXTURES.albedo.mean` / 255): the Standard look's own colour is multiplied by the
   *  albedo over it, the texture's variation alone, so its calibration to the game's screen holds. */
  mean: [68.6 / 255, 73.8 / 255, 77.8 / 255] as readonly [number, number, number],
  /** The texture's mean R and G bytes: a texel of them draws the mean albedo (the texture until it is made). */
  flat: [31.05, 25.96] as readonly [number, number],
};

/** The texture (RG bytes, two a texel: R the network, G the blobs) at `size` texels square (a power of two). */
export function makeWaterTexture(size: number): Uint8Array {
  const n = size * size;
  const net = new Float64Array(n);
  const data = new Uint8Array(n * 2);
  const v1 = new Float64Array(3);
  const v2 = new Float64Array(3);
  const [P1, P2] = NET.cells;
  const pts1 = cellPoints(P1, 21);
  const pts2 = cellPoints(P2, 31);
  // (each noise at the texels' middles, a row at a time)
  const warpX = noiseRows(lattice(8, 11), size);
  const warpY = noiseRows(lattice(8, 12), size);
  const widths = noiseRows(lattice(16, 13), size);
  const clusters = noiseRows(lattice(6, 14), size);
  const brights = noiseRows(lattice(10, 15), size);
  const grounds = noiseRows(lattice(40, 16), size);
  const patches = noiseRows(lattice(30, 17), size);
  const fines = noiseRows(lattice(64, 18), size);
  // (the bright patches' field, at a spread of one, made at `PATCH_SIZE` (it holds nothing finer than half a tile)
  // and read between its texels)
  const bright = patchRows(size);
  // (the lines' profile by their distance across over their width, squared)
  const profile = (t2: number) => {
    let q = t2;
    for (let j = 1; j < NET.edge; j++) q *= t2;
    return Math.exp(-q);
  };
  for (let y = 0; y < size; y++) {
    const [warpXs, warpYs, widthsAt, clustersAt, brightsAt, groundsAt, patchesAt, finesAt, brightAt] = [warpX(y), warpY(y), widths(y), clusters(y), brights(y), grounds(y), patches(y), fines(y), bright(y)];
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      // a gentle warp so the cells are irregular, as caustics are
      const wx = warpXs[x] - 0.5;
      const wy = warpYs[x] - 0.5;
      voronoi(u * P1 + wx * 0.9, v * P1 + wy * 0.9, P1, pts1, v1);
      const w = NET.width * (0.6 + 0.8 * widthsAt[x]);
      const e1 = v1[1] - v1[0];
      const line1 = profile((e1 / w) ** 2);
      // the small cells in clusters, by a broad noise
      const cluster = Math.min(1, Math.max(0, (clustersAt[x] - 0.45) * 2.5)) * NET.small;
      let line2 = 0;
      if (cluster > 0) {
        voronoi(u * P2 + wx * 1.4, v * P2 + wy * 1.4, P2, pts2, v2);
        line2 = profile(((v2[1] - v2[0]) / (w * 1.2)) ** 2) * cluster;
      }
      // the lines brighter in some places than others, all of it bright in patches a tile or two across and faint
      // between them
      const i = y * size + x;
      net[i] = (Math.max(line1, line2) * (0.35 + 0.65 * brightsAt[x]) + NET.ground * groundsAt[x]) * brightAt[x] * (1 + NET.grain * (hash(x, y, 23) - 0.5));
      // blue blobs inside the large cells: soft toward the cell's edge, broken by noise, some cells more than others
      const inside = 1 - Math.exp(-((e1 / NET.inside) ** 2));
      const patch = Math.max(0, patchesAt[x] * 0.75 + finesAt[x] * 0.25 - NET.blob);
      data[i * 2 + 1] = Math.min(255, Math.round(((0.35 + 0.65 * v1[2]) * inside * patch * 255) / STORE.blob));
    }
  }
  // (the network as bytes by its rank, so its distribution is the game's albedo's first component, its long bright
  // tail, stored over the game's range)
  const F = GAME_FLOW_TEXTURES.albedo.first;
  const at = percentileValue(F.percentiles, F.range[0], F.range[1], n);
  const R = bytesByRank(net, (r) => Math.max(0, Math.min(255, Math.round(((at(r) - F.range[0]) / (F.range[1] - F.range[0])) * 255))));
  for (let i = 0; i < n; i++) data[i * 2] = R[i];
  return data;
}

/** Texels across the bright patches' field (`NET.patches`: nothing finer than half a tile, 16 texels a wavelength). */
const PATCH_SIZE = 512;

/** The bright patches' field (`NET`), e^(`patchy` × a Gaussian field of unit spread), at the texels' middles of a
 *  `size`-square grid, a row at a time (its own buffer, refilled each call): made at `PATCH_SIZE` (or `size`, if
 *  smaller) and read between its texels, bilinearly, wrapping. */
function patchRows(size: number): (y: number) => Float64Array {
  const m = Math.min(size, PATCH_SIZE);
  const f = realSpectralField(m, 1 / WATER_FLOW.tiling, DETAIL_BANDS, NET.patches, 19);
  let q = 0;
  for (let i = 0; i < f.length; i++) q += f[i] * f[i];
  q = Math.sqrt(q / f.length);
  for (let i = 0; i < f.length; i++) f[i] = Math.exp((NET.patchy * f[i]) / q);
  // (texel i of `size` at m's coordinate (i + 0.5) m / size − 0.5: its two texels and the weight of the second)
  const x0 = new Int32Array(size);
  const x1 = new Int32Array(size);
  const fx = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const c = ((i + 0.5) * m) / size - 0.5;
    const k = Math.floor(c);
    fx[i] = c - k;
    x0[i] = wrap(k, m);
    x1[i] = wrap(k + 1, m);
  }
  const out = new Float64Array(size);
  return (j) => {
    const a = x0[j] * m;
    const b = x1[j] * m;
    const t = fx[j];
    for (let i = 0; i < size; i++) {
      const top = f[a + x0[i]] + (f[a + x1[i]] - f[a + x0[i]]) * fx[i];
      const bot = f[b + x0[i]] + (f[b + x1[i]] - f[b + x0[i]]) * fx[i];
      out[i] = top + (bot - top) * t;
    }
    return out;
  };
}

/** A distribution given by its `percentiles` at `PATTERN_PERCENTILES` and its ends `lo` and `hi`: the value at rank r
 *  of `n` (its share (r + 0.5) / n), straight between. */
function percentileValue(percentiles: readonly number[], lo: number, hi: number, n: number): (r: number) => number {
  const ps = [0, ...PATTERN_PERCENTILES, 1];
  const vs = [lo, ...percentiles, hi];
  return (r) => {
    const p = (r + 0.5) / n;
    let k = 0;
    while (k < ps.length - 2 && p > ps[k + 1]) k++;
    return vs[k] + ((vs[k + 1] - vs[k]) * (p - ps[k])) / (ps[k + 1] - ps[k]);
  };
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
  const ps = [0, ...PATTERN_PERCENTILES, 1];
  const vs = [lo, ...percentiles, hi];
  // (each value's rank by a stable sort of the indices, so equal values take their ranks in index order)
  const order = rankOrder(v);
  for (let r = 0, k = 0; r < n; r++) {
    const p = (r + 0.5) / n;
    while (k < ps.length - 2 && p > ps[k + 1]) k++;
    v[order[r]] = vs[k] + ((vs[k + 1] - vs[k]) * (p - ps[k])) / (ps[k + 1] - ps[k]);
  }
}

/** The indices of `v` (finite values) in ascending order of their values, equal values (−0 and 0 among them) in index
 *  order: a stable sort, by four passes of a radix sort on the doubles' bits (each made to order as unsigned: a
 *  positive's sign bit set, a negative's every bit flipped), several times faster than a comparison sort. */
export function rankOrder(v: Float64Array): Uint32Array {
  const n = v.length;
  // (the bits, as two 32-bit halves, little-endian as every browser's)
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = v[i] === 0 ? 0 : v[i];
  const bits = new Uint32Array(f.buffer);
  const key = new Uint16Array(n * 4);
  const count = new Uint32Array(4 * 65536);
  for (let i = 0; i < n; i++) {
    let lo = bits[i * 2];
    let hi = bits[i * 2 + 1];
    if (hi & 0x80000000) {
      lo = ~lo;
      hi = ~hi;
    } else hi |= 0x80000000;
    const k = i * 4;
    key[k] = lo & 0xffff;
    key[k + 1] = lo >>> 16;
    key[k + 2] = hi & 0xffff;
    key[k + 3] = hi >>> 16;
    count[key[k]]++;
    count[65536 + key[k + 1]]++;
    count[131072 + key[k + 2]]++;
    count[196608 + key[k + 3]]++;
  }
  let a = new Uint32Array(n);
  let b = new Uint32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  for (let pass = 0; pass < 4; pass++) {
    const c = pass * 65536;
    // (a pass whose digit is the same for every value leaves the order as it is)
    if (count[c + key[pass]] === n) continue;
    for (let d = 0, sum = 0; d < 65536; d++) {
      const t = count[c + d];
      count[c + d] = sum;
      sum += t;
    }
    for (let r = 0; r < n; r++) {
      const i = a[r];
      b[count[c + key[i * 4 + pass]]++] = i;
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

/** Badwater's pattern (RGBA bytes) at `size` texels square, one repeat as the surface's: R the base colour's pattern,
 *  G the emissive detail's (`GAME_BADWATER_TEXTURE`); B unused (0: the still detail albedo has a texture of its own at
 *  the game's size, `makeDetailField`); A the water sources' own pattern (Q9 P7, `makeSourceShape`), sampled round
 *  each source in every look. */
export function makeBadwaterTexture(size: number): Uint8Array {
  const n = size * size;
  const P = BAD_PATTERN;
  const base = new Float64Array(n);
  const glow = new Float64Array(n);
  const oct = P.octaves.map(([p], k) => lattice(p, 61 + k));
  // (the noises at the texels' middles, a row at a time)
  const warpX = noiseRows(lattice(10, 71), size);
  const warpY = noiseRows(lattice(10, 72), size);
  const [C1, C2] = P.cells;
  const pts1 = cellPoints(C1, 81);
  const pts2 = cellPoints(C2, 91);
  const pts3 = cellPoints(P.specks.cells, 101);
  const lwarpX = noiseRows(lattice(8, 73), size);
  const lwarpY = noiseRows(lattice(8, 74), size);
  const wobX = noiseRows(lattice(40, 83), size);
  const wobY = noiseRows(lattice(40, 84), size);
  const widths = noiseRows(lattice(20, 75), size);
  const clusters = noiseRows(lattice(7, 76), size);
  const brights = noiseRows(lattice(24, 77), size);
  const hazes = noiseRows(lattice(30, 78), size);
  const v1 = new Float64Array(4);
  const v2 = new Float64Array(4);
  const v3 = new Float64Array(3);
  // a line between two cells, wider and brighter where three meet, so the cells read rounded
  const lineOf = (v: Float64Array, width: number) => Math.exp(-(((v[1] - v[0]) / width) ** 2)) * (1 + P.junction * Math.exp(-(((v[3] - v[0]) / (width * 3)) ** 2)));
  for (let y = 0; y < size; y++) {
    const [warpXs, warpYs, lwarpXs, lwarpYs, wobXs, wobYs, widthsAt, clustersAt, brightsAt, hazesAt] = [warpX(y), warpY(y), lwarpX(y), lwarpY(y), wobX(y), wobY(y), widths(y), clusters(y), brights(y), hazes(y)];
    for (let x = 0; x < size; x++) {
      const u0 = (x + 0.5) / size;
      const w0 = (y + 0.5) / size;
      const i = y * size + x;
      // the base: octaves of value noise, warped into clouds
      const u = u0 + ((warpXs[x] - 0.5) * P.warp) / 10;
      const w = w0 + ((warpYs[x] - 0.5) * P.warp) / 10;
      let h = 0;
      for (let k = 0; k < oct.length; k++) h += P.octaves[k][1] * valueNoise(oct[k], u - Math.floor(u), w - Math.floor(w));
      base[i] = h + P.grain * hash(x, y, 79);
      // the glow: lines round warped cells, small cells where they cluster, specks inside them, a faint haze
      // (a broad warp so the cells are irregular, and a fine one so their lines wobble)
      const wx = lwarpXs[x] - 0.5 + (wobXs[x] - 0.5) * P.wobble;
      const wy = lwarpYs[x] - 0.5 + (wobYs[x] - 0.5) * P.wobble;
      const lw = P.width * (0.6 + 0.8 * widthsAt[x]);
      voronoi3(u0 * C1 + wx * 0.8, w0 * C1 + wy * 0.8, C1, pts1, v1);
      let line = lineOf(v1, lw);
      const cluster = Math.min(1, Math.max(0, (clustersAt[x] - 0.4) * 2.5)) * P.small;
      if (cluster > 0) {
        voronoi3(u0 * C2 + wx * 1.4, w0 * C2 + wy * 1.4, C2, pts2, v2);
        line = Math.max(line, lineOf(v2, lw * 1.3) * cluster);
      }
      voronoi(u0 * P.specks.cells, w0 * P.specks.cells, P.specks.cells, pts3, v3);
      const speck = v3[2] < P.specks.share ? Math.exp(-((v3[0] / P.specks.radius) ** 2)) * P.specks.light : 0;
      const haze = Math.max(0, hazesAt[x] - 0.55) * P.haze;
      glow[i] = Math.max(line * (0.45 + 0.55 * brightsAt[x]), speck) + haze;
    }
  }
  const G = GAME_BADWATER_TEXTURE;
  toPercentiles(base, G.base.percentiles, 30, 220);
  toPercentiles(glow, G.glow.percentiles, 0, 255);
  const shape = makeSourceShape(size);
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[i * 4] = Math.round(base[i]);
    data[i * 4 + 1] = Math.round(glow[i]);
    data[i * 4 + 3] = shape[i];
  }
  return data;
}

/** How the still detail albedo is drawn (tuned so its statistics land on the game's, `GAME_DETAIL_TEXTURE`): its first
 *  component a Gaussian field made from a spectrum (`power`: the share of its power in each band of wavelength,
 *  `DETAIL_FINE_BANDS`, before the rank remap, which moves some of it toward the fine bands), then remapped by rank to
 *  the game's distribution, its last hundredth straight from the 99th percentile to `top` (the game's brightest texels
 *  are lone specks, so its maximum would lift the spread). */
export const DETAIL_PATTERN = {
  power: [0.03, 0.212, 0.338, 0.213, 0.087, 0.052, 0.03, 0.018, 0.0127, 0.0088],
  top: 75,
};

/** Texels across the still detail's texture (one repeat, 1 / 0.015 = 66.7 tiles: 31 texels a tile, as the game's
 *  2048² `PhysicalWaterDetailAlbedo`), its own (`materials.ts` `detailTexture`, one byte a texel). */
export const DETAIL_TEXTURE_SIZE = 2048;

/** The bands of wavelength (tiles) the detail's power was first measured and made in (64–32, 32–16, …, 1–0.5, under
 *  0.5), which the sources' pattern keeps. */
const DETAIL_BANDS = [64, 32, 16, 8, 4, 2, 1, 0.5, 0] as const;

/** The detail's bands at the game's resolution (`GAME_DETAIL_TEXTURE.first.power`): 64–32, …, 1–0.5, 0.5–0.25,
 *  0.25–0.125, under 0.125 (the fine swirl inside its bright patches, which only a texture of 31 texels a tile holds). */
export const DETAIL_FINE_BANDS = [64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125, 0] as const;

/** How the detail's first component is stored in its texture's byte: 255 × (score − lo) / (hi − lo), the
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
      const r = re[i];
      re[i] = re[j];
      re[j] = r;
      const m = im[i];
      im[i] = im[j];
      im[j] = m;
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
    // (a band with no power is left at 0)
    if (b < 0 || !power[b]) continue;
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

/** The phases `realSpectralField` draws from (a full turn in this many steps). */
const PHASES = 4096;

/** A tiling real Gaussian field `size` square (a power of two) whose power in each band of `bands` (wavelengths in
 *  tiles, one repeat `repeat` tiles across) is `power`'s share, spread evenly over the band's frequencies (each the
 *  band's amplitude), random phases (seed `s`), as `spectralField` but made from half the spectrum (the other half its mirror, conjugated, so
 *  the field is real): half the random numbers and half the transforms, the columns each a contiguous run and the
 *  rows two at a time (one the real part of a transform, the other its imaginary). Row-major. With `axis` (0 x, 1 y),
 *  that field's slope along the axis instead: the gradient of a height whose slopes carry `power` by band, the two axes
 *  of one seed the two slopes of one surface. */
function realSpectralField(size: number, repeat: number, bands: readonly number[], power: readonly number[], s: number, axis?: 0 | 1): Float64Array {
  const N = size;
  const half = N / 2;
  // (each band by the squared frequency, cycles a repeat: a table of every k² the plane holds)
  const band = new Int8Array(2 * half * half + 1).fill(-1);
  const count = new Float64Array(power.length);
  for (let b = 0; b < power.length; b++) {
    const from = Math.max(1, Math.ceil((repeat / bands[b]) ** 2));
    const to = Math.max(from, bands[b + 1] > 0 ? Math.min(band.length, Math.ceil((repeat / bands[b + 1]) ** 2)) : band.length);
    if (!power[b]) continue;
    band.fill(b, from, to);
    // (its frequencies over the plane, kx and ky each −N/2 + 1 … N/2: by rows, those with kx² in [from − ky², to − ky²))
    const within = (q: number) => (q <= 0 ? 0 : Math.min(half, Math.ceil(Math.sqrt(q)) - 1));
    for (let ky = -half + 1; ky <= half; ky++) {
      const at = (q: number) => {
        // the kx with kx² < q: 0 … m and −1 … −m, the plane's kx = N/2 too where q passes it
        const m = within(q);
        return q <= 0 ? 0 : 1 + 2 * Math.min(m, half - 1) + (m >= half ? 1 : 0);
      };
      count[b] += at(to - ky * ky) - at(from - ky * ky);
    }
  }
  const amp = power.map((p, b) => (count[b] ? Math.sqrt(p / count[b]) : 0));
  // (random phases from a table: each frequency the band's amplitude, its phase one of `PHASES`)
  const cos = new Float64Array(PHASES);
  const sin = new Float64Array(PHASES);
  for (let k = 0; k < PHASES; k++) (cos[k] = Math.cos((TAU * k) / PHASES)), (sin[k] = Math.sin((TAU * k) / PHASES));
  // the half spectrum, column by column (kx 0…N/2, each its N values of ky)
  const C = half + 1;
  const re = new Float64Array(C * N);
  const im = new Float64Array(C * N);
  for (let kx = 0; kx <= half; kx++) {
    const edge = kx === 0 || kx === half;
    for (let y = 0; y < N; y++) {
      const ky = y <= half ? y : y - N;
      // (on the two self-mirrored columns, half of each is the other half's mirror, set below)
      if (edge && ky < 0) continue;
      const b = band[kx * kx + ky * ky];
      if (b < 0) continue;
      const i = kx * N + y;
      const ph = (hash(i, 0, s) * PHASES) | 0;
      let ar = amp[b] * cos[ph];
      let ai = amp[b] * sin[ph];
      if (axis !== undefined) {
        // (a slope: × i k_axis / |k|, so the band's power is the gradient's; none at the Nyquist, whose sign is
        // ambiguous)
        if (kx === half || ky === half) continue;
        const w = (axis === 0 ? kx : ky) / Math.sqrt(kx * kx + ky * ky);
        const r0 = ar;
        ar = -ai * w;
        ai = r0 * w;
      }
      re[i] = ar;
      // (real where it is its own mirror)
      if (edge && (ky === 0 || ky === half)) continue;
      im[i] = ai;
      if (edge) {
        re[kx * N + (N - y)] = re[i];
        im[kx * N + (N - y)] = -im[i];
      }
    }
  }
  const tw = twiddles(N);
  for (let kx = 0; kx <= half; kx++) fft(re.subarray(kx * N, kx * N + N), im.subarray(kx * N, kx * N + N), tw);
  // the rows, two at a time: Z(kx) = Y(kx, y) + i Y(kx, y + 1), with Y(N − kx, y) = conj(Y(kx, y)); its transform is
  // row y in its real part and row y + 1 in its imaginary
  const out = new Float64Array(N * N);
  const zr = new Float64Array(N);
  const zi = new Float64Array(N);
  for (let y = 0; y < N; y += 2) {
    for (let kx = 0; kx <= half; kx++) {
      const i = kx * N + y;
      const ar = re[i];
      const ai = im[i];
      const br = re[i + 1];
      const bi = im[i + 1];
      zr[kx] = ar - bi;
      zi[kx] = ai + br;
      if (kx > 0 && kx < half) {
        // (conj(A) + i conj(B))
        zr[N - kx] = ar + bi;
        zi[N - kx] = br - ai;
      }
    }
    fft(zr, zi, tw);
    out.set(zr, y * N);
    out.set(zi, (y + 1) * N);
  }
  return out;
}

/** Each value of `v` as a byte by its rank (`byteOfRank`, 0 the smallest, never decreasing with the rank), as a stable
 *  sort's ranks would give, without sorting: the texels whose rank starts a new byte are found by a histogram of the
 *  values and a sort of the few in their bins, and every value is placed among them. Equal values take one byte. */
function bytesByRank(v: Float64Array, byteOfRank: (r: number) => number): Uint8Array {
  const n = v.length;
  const b0 = byteOfRank(0);
  const b1 = byteOfRank(n - 1);
  // the rank at which each byte past the first begins
  const starts: number[] = [];
  for (let b = b0 + 1; b <= b1; b++) {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (byteOfRank(mid) >= b) hi = mid;
      else lo = mid + 1;
    }
    starts.push(lo);
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = v[i];
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const K = 65536;
  const scale = max > min ? (K - 1e-6) / (max - min) : 0;
  const bins = new Uint16Array(n);
  const first = new Uint32Array(K + 1);
  for (let i = 0; i < n; i++) {
    const j = ((v[i] - min) * scale) | 0;
    bins[i] = j;
    first[j + 1]++;
  }
  for (let j = 0; j < K; j++) first[j + 1] += first[j];
  // the bins the starts fall in, their values sorted, and each start's value (the value at its rank)
  const at = new Int32Array(K).fill(-1);
  const startBin = starts.map((r) => {
    let lo = 0;
    let hi = K - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (first[mid] <= r) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  });
  let pooled = 0;
  for (const j of startBin)
    if (at[j] < 0) {
      at[j] = pooled;
      pooled += first[j + 1] - first[j];
    }
  const pool = new Float64Array(pooled);
  const fill = new Int32Array(K);
  for (let i = 0; i < n; i++) {
    const j = bins[i];
    if (at[j] >= 0) pool[at[j] + fill[j]++] = v[i];
  }
  for (let j = 0; j < K; j++) if (at[j] >= 0) pool.subarray(at[j], at[j] + fill[j]).sort();
  const value = starts.map((r, k) => pool[at[startBin[k]] + r - first[startBin[k]]]);
  // the bytes below each bin (the starts before it), and the starts inside it
  const below = new Uint16Array(K);
  const inside: number[][] = [];
  for (let j = 0, k = 0; j < K; j++) {
    while (k < starts.length && startBin[k] < j) k++;
    below[j] = k;
    if (at[j] >= 0) {
      const own: number[] = [];
      for (let q = k; q < starts.length && startBin[q] === j; q++) own.push(value[q]);
      inside[j] = own;
    }
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const j = bins[i];
    let b = b0 + below[j];
    if (at[j] >= 0) for (const t of inside[j]) if (v[i] >= t) b++;
    out[i] = b;
  }
  return out;
}

/** The still detail albedo's first component (Q9 P6) as stored bytes (`DETAIL_STORE`), `size` square (a power of
 *  two; the game's `DETAIL_TEXTURE_SIZE`), one repeat `1 / GAME_DETAIL_TEXTURE.tiling` tiles across: a Gaussian field
 *  with the game's spectrum (`DETAIL_FINE_BANDS`), remapped by rank to the game's distribution (its long bright tail),
 *  centred, each rounded and held to 0–255 (a texel a hair past the store's range is its end, never wrapped round to
 *  the other). */
export function makeDetailField(size: number): Uint8Array {
  const f = realSpectralField(size, 1 / GAME_DETAIL_TEXTURE.tiling, DETAIL_FINE_BANDS, DETAIL_PATTERN.power, 301);
  const G = GAME_DETAIL_TEXTURE.first;
  // (the game's distribution at a rank's share p: its percentiles, straight between, the range's ends at 0 and 1)
  const ps = [0, ...PATTERN_PERCENTILES, 1];
  const vs = [G.range[0], ...G.percentiles, DETAIL_PATTERN.top];
  const n = f.length;
  const valueAt = (r: number) => {
    const p = (r + 0.5) / n;
    let k = 0;
    while (k < ps.length - 2 && p > ps[k + 1]) k++;
    return vs[k] + ((vs[k + 1] - vs[k]) * (p - ps[k])) / (ps[k + 1] - ps[k]);
  };
  // (centred: a score is a distance from the mean, so the texture's mean is the game's: the distribution's own)
  let m = 0;
  for (let k = 0; k < ps.length - 1; k++) m += ((ps[k + 1] - ps[k]) * (vs[k] + vs[k + 1])) / 2;
  const [lo, hi] = DETAIL_STORE;
  return bytesByRank(f, (r) => Math.min(255, Math.max(0, Math.round((255 * (valueAt(r) - m - lo)) / (hi - lo)))));
}

/** The normal the flow carries (Q9 P5, P11; the game's `Water_N`), two bytes a texel (its slopes x and y, 128 + 127 ×
 *  slope / 0.5), `size` square (a power of two), one repeat 16.7 tiles: the gradient of a Gaussian height whose slopes
 *  carry the game's power by wavelength (`GAME_FLOW_TEXTURES.normal.power`, `NORMAL_BANDS`; Gaussian as the game's
 *  are, its 5th and 95th percentiles ±1.6 spreads), at its spread in its mip of 61 texels a tile (`spread61`), round
 *  its mean (`mean`). */
export function makeWaterNormal(size: number): Uint8Array {
  const G = GAME_FLOW_TEXTURES.normal;
  const out = new Uint8Array(size * size * 2);
  for (const axis of [0, 1] as const) {
    const f = realSpectralField(size, 1 / WATER_FLOW.tiling, NORMAL_BANDS, G.power, 501, axis);
    let q = 0;
    for (let i = 0; i < f.length; i++) q += f[i] * f[i];
    const k = G.spread61[axis] / Math.sqrt(q / f.length);
    for (let i = 0; i < f.length; i++) out[i * 2 + axis] = Math.max(0, Math.min(255, Math.round(128 + (127 * (f[i] * k + G.mean[axis])) / STORE.slope)));
  }
  return out;
}

/** The share of a tiling field's power (`size` square, a power of two, one repeat `repeat` tiles across) in each band
 *  of wavelength `bands` (tiles; as tools/game-water-shader.py measures the game's), its mean left out. */
export function powerByBand(f: ArrayLike<number>, size: number, repeat: number, bands: readonly number[]): number[] {
  const n = size * size;
  let m = 0;
  for (let i = 0; i < n; i++) m += f[i] / n;
  const re = Float64Array.from({ length: n }, (_, i) => f[i] - m);
  const im = new Float64Array(n);
  const tw = twiddles(size);
  for (let y = 0; y < size; y++) fft(re.subarray(y * size, y * size + size), im.subarray(y * size, y * size + size), tw);
  const cr = new Float64Array(size);
  const ci = new Float64Array(size);
  const out = new Array<number>(bands.length - 1).fill(0);
  let total = 0;
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) (cr[y] = re[y * size + x]), (ci[y] = im[y * size + x]);
    fft(cr, ci, tw);
    const kx = x < size / 2 ? x : x - size;
    for (let y = 0; y < size; y++) {
      const ky = y < size / 2 ? y : y - size;
      const k = Math.sqrt(kx * kx + ky * ky);
      if (!k) continue;
      const p = cr[y] * cr[y] + ci[y] * ci[y];
      total += p;
      const wave = repeat / k;
      for (let b = 0; b < out.length; b++)
        if (wave <= bands[b] && wave > bands[b + 1]) {
          out[b] += p;
          break;
        }
    }
  }
  return out.map((p) => p / total);
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
  const n = data.length / 2;
  let mr = 0;
  let mg = 0;
  for (let i = 0; i < n; i++) {
    mr += data[i * 2];
    mg += data[i * 2 + 1];
  }
  mr /= n;
  mg /= n;
  let vr = 0;
  let vg = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    const r = data[i * 2] - mr;
    const g = data[i * 2 + 1] - mg;
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
  uniform sampler2D normalTex;
  uniform sampler2D badwaterTex;
  uniform sampler2D detailTex;
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
  /** The surface the flow carries at the phases' points: RG the albedo's fields, BA the slopes (their own texture,
   *  ${NORMAL_TEXTURE_SIZE}², over the same repeat). */
  vec4 waterSurfaceAt(vec2 pa, vec2 pb, float w) {
    vec2 ua = pa * ${g(WATER_FLOW.tiling)};
    vec2 ub = pb * ${g(WATER_FLOW.tiling)};
    return mix(vec4(texture2D(waterTex, ua).rg, texture2D(normalTex, ua).rg), vec4(texture2D(waterTex, ub).rg, texture2D(normalTex, ub).rg), w);
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
  /** The game's still detail albedo at g (tiles; Q9 P6, makeDetailField, detailOf): its own texture at g ×
   *  ${g(GAME_DETAIL_TEXTURE.tiling)} (one repeat ${g(Math.round(1 / GAME_DETAIL_TEXTURE.tiling * 10) / 10)} tiles, ${DETAIL_TEXTURE_SIZE}² as the game's), not carried by the flow, its colour (display
   *  values) by the first component and the second by it. */
  vec3 waterDetailAt(vec2 g) {
    float b = texture2D(detailTex, g * ${g(GAME_DETAIL_TEXTURE.tiling)}).r;
    return ${v3(DETAIL_COLOUR.base)} + ${v3(DETAIL_COLOUR.lin)} * b + ${v3(DETAIL_COLOUR.quad)} * b * b;
  }
  /** The surface's normal from its slopes, × (1 + the badwater share), as the game lights it (Q9 P11, ps 782-785 and
   *  904-910: its URP light, the ambient, the sun, its glint and the reflection, takes the texture's normal unboosted),
   *  or × ${g(WATER_FLOW.boost)} more for its camera highlight alone (\`boost\`, ps 794-799: \`_NormalBoost\`). */
  vec3 waterFlowNormal(vec4 s, float share, float boost) {
    vec2 sl = (s.ba * 255.0 - 128.0) / 127.0 * ${g(STORE.slope)};
    float z = sqrt(max(0.0, 1.0 - dot(sl, sl)));
    vec2 b = sl * boost * (1.0 + share);
    return normalize(vec3(b.x, z, -b.y));
  }
  #define WATER_NORMAL_BOOST ${g(WATER_FLOW.boost)}
`;
