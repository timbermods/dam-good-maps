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

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** i into 0…p − 1 (i within a period of it). */
const wrap = (i: number, p: number) => (i < 0 ? i + p : i >= p ? i - p : i);

/** A tiling value noise's lattice (period `p` cells across, `q` down; `q` = `p` by default): a random a cell. */
function lattice(p: number, s: number, q = p): { p: number; q: number; v: Float64Array } {
  const v = new Float64Array(p * q);
  for (let y = 0; y < q; y++) for (let x = 0; x < p; x++) v[y * p + x] = hash(x, y, s);
  return { p, q, v };
}

/** Tiling value noise at (u, v), 0–1 across the repeat (its lattice's periods across it). */
function valueNoise(l: { p: number; q: number; v: Float64Array }, u: number, v: number): number {
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
function cellPoints(p: number, s: number): Float64Array {
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
function voronoi(x: number, y: number, p: number, c: Float64Array, out: Float64Array): void {
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

/** The autocorrelation's half-width of a tiling field (`size` square), in tiles: the shift at which it first falls
 *  to a half, averaged over the four directions (as tools/game-water-shader.py `feature_scale` measures the game's). */
export function featureTiles(f: ArrayLike<number>, size: number): number {
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
  return (half.reduce((a, b) => a + b, 0) / half.length) * (1 / WATER_FLOW.tiling / size);
}

const g = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(Math.round(v * 1e6) / 1e6));
const v2 = (v: readonly number[]) => `vec2(${v.map(g).join(", ")})`;
const v3 = (v: readonly number[]) => `vec3(${v.map(g).join(", ")})`;

/** The flow's surface in GLSL, for the water's shaders (both looks): the texture (`waterTex`), the flow from a flow
 *  texel (high/bake.ts `flowByte`), the two phases' sample, the albedo and the normal. */
export const WATER_FLOW_GLSL = /* glsl */ `
  uniform sampler2D waterTex;
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
  /** The surface's normal from its slopes, × ${g(WATER_FLOW.boost)} and × (1 + the badwater share) more, as the game's
   *  (Q9 P11). */
  vec3 waterFlowNormal(vec4 s, float share) {
    vec2 sl = (s.ba * 255.0 - 128.0) / 127.0 * ${g(STORE.slope)};
    float z = sqrt(max(0.0, 1.0 - dot(sl, sl)));
    vec2 b = sl * ${g(WATER_FLOW.boost)} * (1.0 + share);
    return normalize(vec3(b.x, z, -b.y));
  }
`;
