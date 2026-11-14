// The objects' patterns (D496, D497; D135: our own art, drawn in code, no game texture): one small texture array the
// object program samples where a model's part carries a pattern (materials.ts `objectMaterial`, a vertex's `lod` less
// its view, entities3d.ts `Model.card`), each layer one material's picture at its measured figures, drawn once a page
// in the textures' worker (no three.js here) into the page's texture (materials.ts `objectAtlasTexture`). A texel is
// the part's albedo over its colour, a third of it (`PATTERN_GAIN`): each layer averages to the part's colour, so the
// light look, which samples nothing, draws each part in its mean.
//
// Layer 1, the ruins' ivy, as the game's `Ivy_Wet` and `Ivy_Dry` draw it (one atlas, EnvironmentURP5, cut at alpha
// 0.312): cards of hanging trails of five-lobed leaves about 0.16 m across, and cards of light brown stems climbing from
// a column's foot, both seen through where the cut takes the texture away. Numbers read from the game's atlas with
// tools/game-model-albedo.py (2048², 6.4 m of model a unit of UV): its leaves' texels (over the cut) average
// (0.148, 0.180, 0.095), from 0.56 to 1.31 times that in lightness (the 5th to the 95th percentile, its normal map's
// shading drawn in), its stems' (0.236, 0.203, 0.124), 0.035 m wide. Ours: 128 texels a metre, a 256² layer, 2 m a
// side: the upper half four strips of trails 0.5 m wide and 1 m long (`IVY_TRAILS`: three running on from storey to
// storey, one hanging from a column's top), the lower half a root of stems (`IVY_ROOT`) and stems that run on
// (`IVY_RUN`, tiling up and down), each 1 m square.
//
// Layers 2 to 4, the district center's (DistrictCenter.Folktails, EnvironmentURP5, uncut; numbers read from its
// textures with tools/game-model-albedo.py over the UVs its model gives them), each tiling every way:
// - the thatch (`ThatchedRoof`, 2.49 m of roof a unit of UV, v up the slope): four courses a unit, each a row of pale
//   blades pointing up the roof under a dark row of cut stalk ends speckled light; its texels' lightness from 0.56 to
//   1.38 times its mean (the 5th to the 95th percentile), the dark rows 0.58 of it and redder (0.411, 0.272, 0.120),
//   the blades' tips 1.31 and paler (0.748, 0.649, 0.407), each blade about 0.036 m across;
// - the dark planks (`IrregularPlanks_Brown`, the walls and the tower, 1.61 m a unit, v across the boards): eight
//   boards a unit, 0.2 m each, laid along u, wavering; a fifth of it their light edges (0.348, 0.294, 0.201), three
//   quarters their dark grained body (0.173, 0.121, 0.084), the rest the grey dark between them (0.095, 0.084, 0.075);
// - the pale wood (`BaseWood_LightBrown`, the posts, frames, floor and railings, and the brown of the platform, which
//   draws the same picture darker: 1.45 m a unit): boards 0.09 m wide along v, near white between them (0.83 of
//   white), their body (0.617, 0.569, 0.504) streaked with darker grain (0.52, 0.47, 0.41), a fifth of it each.

import { RUIN } from "./palette";

/** A layer's side in texels. */
export const PATTERN_SIZE = 256;
/** The layers, by the number a model's part gives (0 none). */
export const PATTERN = { ivy: 1, thatch: 2, planks: 3, wood: 4 } as const;
export const PATTERN_LAYERS = 4;
/** Where a pattern's alpha cuts the part away: the game's ivy's `_Cutoff` (the other layers are never cut). */
export const PATTERN_CUT = 0.312;
/** A texel is the part's albedo over its colour divided by this. */
export const PATTERN_GAIN = 3;
/** Metres of a part a unit of each tiling layer's UV, as the game's model maps its textures. */
export const PATTERN_TILE = { thatch: 2.49, planks: 1.61, wood: 1.45 } as const;

/** The ivy's texels a metre. */
const IVY_PX = 128;
/** The game's ivy leaves' mean albedo over its cut, and its stems' (palette.ts RUIN). */
const IVY_LEAF = RUIN.ivy;
const IVY_STEM = RUIN.ivyStem;

/** A region of a layer, in UV (0–1, v up): x, y, width, height. */
export type Region = readonly [number, number, number, number];
const S = PATTERN_SIZE;
/** The ivy's four strips of trails (0.5 m by 1 m): three running through the strip, the same at its foot as at its top
 *  (a storey's below its column's top: one storey's runs on into the next), the most first, and one hanging from its
 *  top (the column's top storey). */
export const IVY_TRAILS: readonly Region[] = [0, 1, 2, 3].map((s) => [(s * 64) / S, 128 / S, 64 / S, 128 / S] as const);
/** Stems from a root at the foot of the region's middle, branching up to its top (1 m square). */
export const IVY_ROOT: Region = [0, 0, 128 / S, 128 / S];
/** Stems running up through the region, the same at its foot as at its top (1 m square). */
export const IVY_RUN: Region = [128 / S, 0, 128 / S, 128 / S];

function hash(a: number, b: number, k: number): number {
  let h = (a * 374761393 + b * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** An ivy leaf, pointing down, its stalk at the notch on top, in a unit square (−0.5 to 0.5): for each of
 *  LEAF² cells its coverage and its shade (lighter toward the stalk, darker at the rim, its veins lighter: the light
 *  the game's normal map gives it). */
const LEAF = 48;
function leafStamp(): { cover: Float32Array; shade: Float32Array } {
  const lobes: [number, number][] = [
    [-90, 0.5],
    [-90 - 60, 0.43],
    [-90 + 60, 0.43],
    [-90 - 122, 0.36],
    [-90 + 122, 0.36],
  ];
  // (its outline's reach by angle, a table of 256)
  const table = new Float32Array(256);
  for (let k = 0; k < 256; k++) {
    const t = (k / 256) * 2 * Math.PI - Math.PI;
    let r = 0.27;
    for (const [a, l] of lobes) {
      let d = Math.abs(t - (a * Math.PI) / 180);
      d = Math.min(d, 2 * Math.PI - d);
      r = Math.max(r, 0.27 + (l - 0.27) * Math.exp(-d / 0.32));
    }
    table[k] = r;
  }
  const reach = (t: number) => {
    const f = ((t + Math.PI) / (2 * Math.PI)) * 256;
    const k = Math.floor(f);
    return table[k & 255] + (table[(k + 1) & 255] - table[k & 255]) * (f - k);
  };
  const cover = new Float32Array(LEAF * LEAF);
  const shade = new Float32Array(LEAF * LEAF);
  const SS = 4;
  for (let j = 0; j < LEAF; j++)
    for (let i = 0; i < LEAF; i++) {
      let c = 0;
      for (let b = 0; b < SS; b++)
        for (let a = 0; a < SS; a++) {
          const x = (i + (a + 0.5) / SS) / LEAF - 0.5;
          const y = (j + (b + 0.5) / SS) / LEAF - 0.5 + 0.04;
          if (Math.hypot(x, y) < reach(Math.atan2(y, x))) c++;
        }
      const x = (i + 0.5) / LEAF - 0.5;
      const y = (j + 0.5) / LEAF - 0.5 + 0.04;
      const d = Math.hypot(x, y);
      const t = Math.atan2(y, x);
      const r = reach(t);
      let vein = 0;
      for (const [a] of lobes) {
        let dt = Math.abs(t - (a * Math.PI) / 180);
        dt = Math.min(dt, 2 * Math.PI - dt);
        if (dt * d < 0.012 && d < r * 0.8) vein = 1;
      }
      cover[j * LEAF + i] = c / (SS * SS);
      shade[j * LEAF + i] = (1 + 0.3 * (y / 0.5)) * (1 - 0.22 * smooth(0.6, 1, d / r)) * (1 + 0.12 * vein);
    }
  return { cover, shade };
}

/** A layer being drawn: colour premultiplied by coverage, and coverage. */
class Canvas {
  rgb = new Float32Array(S * S * 3);
  a = new Float32Array(S * S);
  /** Lay a colour with coverage `c` over texel (x, y). */
  over(x: number, y: number, c: number, r: number, g: number, b: number): void {
    if (c <= 0 || x < 0 || y < 0 || x >= S || y >= S) return;
    const k = y * S + x;
    const keep = 1 - c;
    this.rgb[k * 3] = r * c + this.rgb[k * 3] * keep;
    this.rgb[k * 3 + 1] = g * c + this.rgb[k * 3 + 1] * keep;
    this.rgb[k * 3 + 2] = b * c + this.rgb[k * 3 + 2] * keep;
    this.a[k] = c + this.a[k] * keep;
  }
}

/** A leaf `size` metres across centred at (x, y) (metres in the layer), turned by `turn` from pointing down, within the
 *  box `clip` (texels), its colour `rgb` before its shade. */
function leaf(
  cv: Canvas,
  st: ReturnType<typeof leafStamp>,
  x: number,
  y: number,
  size: number,
  turn: number,
  rgb: readonly number[],
  clip: readonly number[],
): void {
  const px = size * IVY_PX;
  const cx = x * IVY_PX;
  const cy = y * IVY_PX;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const half = px * 0.75;
  for (let ty = Math.max(clip[1], Math.floor(cy - half)); ty < Math.min(clip[3], Math.ceil(cy + half)); ty++)
    for (let tx = Math.max(clip[0], Math.floor(cx - half)); tx < Math.min(clip[2], Math.ceil(cx + half)); tx++) {
      const dx = tx + 0.5 - cx;
      const dy = ty + 0.5 - cy;
      // (in the leaf's own square)
      const u = (cos * dx + sin * dy) / px + 0.5;
      const v = (-sin * dx + cos * dy) / px + 0.5;
      if (u <= 0 || v <= 0 || u >= 1 || v >= 1) continue;
      // bilinear in the stamp
      const fx = u * LEAF - 0.5;
      const fy = v * LEAF - 0.5;
      const i = Math.max(0, Math.min(LEAF - 2, Math.floor(fx)));
      const j = Math.max(0, Math.min(LEAF - 2, Math.floor(fy)));
      const ax = Math.min(1, Math.max(0, fx - i));
      const ay = Math.min(1, Math.max(0, fy - j));
      const at = (q: Float32Array) =>
        (q[j * LEAF + i] * (1 - ax) + q[j * LEAF + i + 1] * ax) * (1 - ay) +
        (q[(j + 1) * LEAF + i] * (1 - ax) + q[(j + 1) * LEAF + i + 1] * ax) * ay;
      const c = at(st.cover);
      if (c <= 0.001) continue;
      const s = at(st.shade);
      cv.over(tx, ty, c, rgb[0] * s, rgb[1] * s, rgb[2] * s);
    }
}

/** A stem along the points `path` (metres in the layer), `w0` wide at its start to `w1` at its end, round (lighter
 *  down its middle), within `clip` (texels). */
function stem(
  cv: Canvas,
  path: readonly (readonly [number, number])[],
  w0: number,
  w1: number,
  rgb: readonly number[],
  clip: readonly number[],
): void {
  for (let s = 0; s + 1 < path.length; s++) {
    const [ax, ay] = path[s].map((q) => q * IVY_PX);
    const [bx, by] = path[s + 1].map((q) => q * IVY_PX);
    const wa = ((w0 + (w1 - w0) * (s / (path.length - 1))) * IVY_PX) / 2;
    const wb = ((w0 + (w1 - w0) * ((s + 1) / (path.length - 1))) * IVY_PX) / 2;
    const m = Math.max(wa, wb) + 1;
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    for (
      let ty = Math.max(clip[1], Math.floor(Math.min(ay, by) - m));
      ty < Math.min(clip[3], Math.ceil(Math.max(ay, by) + m));
      ty++
    )
      for (
        let tx = Math.max(clip[0], Math.floor(Math.min(ax, bx) - m));
        tx < Math.min(clip[2], Math.ceil(Math.max(ax, bx) + m));
        tx++
      ) {
        const t = Math.min(1, Math.max(0, ((tx + 0.5 - ax) * dx + (ty + 0.5 - ay) * dy) / L2));
        const d = Math.hypot(tx + 0.5 - ax - t * dx, ty + 0.5 - ay - t * dy);
        const w = wa + (wb - wa) * t;
        const c = Math.min(1, Math.max(0, w + 0.5 - d));
        if (c <= 0) continue;
        const k = cv.a[ty * S + tx];
        // (over itself where segments meet: no darker seam)
        if (k >= c && k > 0.99) continue;
        const sh = 0.75 + 0.4 * (1 - Math.min(1, d / Math.max(w, 0.5)) ** 2);
        cv.over(tx, ty, c, rgb[0] * sh, rgb[1] * sh, rgb[2] * sh);
      }
  }
}

/** A trail in a strip of trails, from (x0, top) down `length` metres, swaying, its stem, then its leaves alternately
 *  each side; `running`, a trail through the whole strip, the same at its foot as at its top (its stem and leaves
 *  drawn again a metre above and below, the strip's clip keeping what falls in it), or else hanging from its top, its
 *  leaves smaller toward its end. */
function trail(
  cv: Canvas,
  seed: number,
  x0: number,
  top: number,
  length: number,
  running: boolean,
  clip: readonly number[],
  leaves: (readonly number[])[],
  gap = 0.072,
  leafSize = 0.21,
): void {
  const sway = 0.025 + 0.025 * hash(seed, 1, 3);
  const phase = hash(seed, 2, 3) * 6.28;
  // (a running trail's sway whole periods a metre)
  const turns = running ? 2 * Math.PI * (1 + Math.floor(hash(seed, 3, 3) * 2)) : 7;
  const at = (t: number): [number, number] => [x0 + sway * Math.sin(phase + t * turns), top - t];
  const copies = running ? [-1, 0, 1] : [0];
  for (const c of copies) {
    const path: [number, number][] = [];
    for (let t = 0; t <= length - (running ? 0 : 0.05) + 1e-6; t += 0.05) path.push([at(t)[0], at(t)[1] + c]);
    stem(
      cv,
      path,
      0.012,
      running ? 0.012 : 0.008,
      IVY_STEM.map((v) => v * 0.7),
      clip,
    );
  }
  const n = Math.round(length / gap);
  for (let k = 0; k < n; k++) {
    const t = running ? (k + 0.2 + 0.6 * hash(seed, k, 4)) / n : 0.04 + (k / n) * (length - 0.04);
    const [x, y] = at(t);
    const side = k % 2 ? 1 : -1;
    const size = (running ? leafSize : 0.24 - 0.08 * (t / length)) * (0.85 + 0.3 * hash(seed, k, 5));
    // (kept whole within the strip's sides: no leaf cut straight)
    const half = 0.45 * size;
    const lx = Math.max(
      clip[0] / IVY_PX + half,
      Math.min(clip[2] / IVY_PX - half, x + side * (0.025 + 0.025 * hash(seed, k, 6))),
    );
    for (const c of copies)
      leaves.push([lx, y - 0.01 + c, size, side * (0.15 + 0.6 * hash(seed, k, 7)), hash(seed, k, 8), ...clip]);
  }
}

/** The ivy's layer (`IVY_TRAILS`, `IVY_ROOT`, `IVY_RUN`). */
function drawIvy(): Canvas {
  const cv = new Canvas();
  const st = leafStamp();
  const leaves: (readonly number[])[] = [];
  // the trails: each strip 0.5 m wide from 1 m up to 2 m, 2 texels kept clear at its sides (no neighbour in its mips);
  // the first three running through it, the most first, the last hanging from its top (a column's top storey)
  // (each: its trails' places across the strip, the gap between their leaves, their leaves' size)
  const running: [number[], number, number][] = [
    [[0.16, 0.34], 0.072, 0.16],
    [[0.17, 0.35], 0.085, 0.15],
    [[0.25], 0.08, 0.15],
  ];
  running.forEach(([xs, gap, size], s) => {
    const clip = [s * 64 + 2, 128, s * 64 + 62, 256];
    xs.forEach((x, k) => trail(cv, s * 16 + k, s * 0.5 + x, 2, 1, true, clip, leaves, gap, size));
  });
  // (x in the strip, metres down from its top to start, length)
  const hanging: [number, number, number][] = [
    [0.12, 0, 0.9],
    [0.25, 0.02, 0.6],
    [0.37, 0.01, 0.78],
  ];
  hanging.forEach(([x, down, length], k) =>
    trail(cv, 48 + k, 1.5 + x, 2 - 0.04 - down, length, false, [194, 129, 254, 255], leaves),
  );
  // the stems: a root at the foot of the left square branching up, and stems running through the right one (each
  // stem's top where its foot is, so the square tiles up and down)
  const rootClip = [2, 0, 126, 127];
  const runClip = [130, 0, 254, 128];
  const branch = (
    seed: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w0: number,
    w1: number,
    clip: number[],
    wave = 0.05,
  ): void => {
    const path: [number, number][] = [];
    const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.04));
    const ph = hash(seed, 9, 9) * 6.28;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      path.push([x0 + (x1 - x0) * t + wave * Math.sin(ph + t * 9) * Math.sin(Math.PI * t), y0 + (y1 - y0) * t]);
    }
    stem(cv, path, w0, w1, IVY_STEM, clip);
  };
  for (const [k, top] of [0.12, 0.36, 0.64, 0.88].entries()) {
    const fork = 0.08 + 0.18 * hash(k, 1, 10);
    branch(k, 0.5, 0.0, 0.5 + (top - 0.5) * 0.3, fork, 0.04, 0.035, rootClip, 0.01);
    branch(k + 8, 0.5 + (top - 0.5) * 0.3, fork, top, 1.0, 0.035, 0.022, rootClip);
    // a twig off it
    const ty = fork + (1 - fork) * (0.3 + 0.4 * hash(k, 2, 10));
    const tx = 0.5 + (top - 0.5) * (0.3 + 0.7 * ((ty - fork) / (1 - fork)));
    branch(k + 16, tx, ty, tx + (k % 2 ? 0.14 : -0.14), ty + 0.16, 0.022, 0.012, rootClip, 0.03);
  }
  for (const [k, x] of [0.22, 0.52, 0.8].entries()) {
    // (a wave whole periods long: the same at its foot and its top)
    const path: [number, number][] = [];
    const ph = hash(k, 3, 11) * 6.28;
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      path.push([1 + x + 0.05 * Math.sin(ph + 2 * Math.PI * t), -0.02 + 1.04 * t]);
    }
    stem(cv, path, 0.024, 0.024, IVY_STEM, runClip);
    const ty = 0.25 + 0.5 * hash(k, 4, 11);
    const tx = 1 + x + 0.05 * Math.sin(ph + 2 * Math.PI * ty);
    branch(k + 24, tx, ty, tx + (k % 2 ? 0.12 : -0.12), ty + 0.14, 0.02, 0.011, runClip, 0.03);
  }
  // the leaves last, from the top down (each lower one over the one above it)
  leaves.sort((a, b) => b[1] - a[1]);
  for (const [x, y, size, turn, tone, ...clip] of leaves) {
    const k = 0.66 + 0.62 * tone;
    leaf(
      cv,
      st,
      x,
      y,
      size,
      turn,
      [IVY_LEAF[0] * k * (0.96 + 0.08 * hash(tone * 1e6, 0, 12)), IVY_LEAF[1] * k, IVY_LEAF[2] * k],
      clip,
    );
  }
  // each part's mean over the cut the game's (the stems' half, the trails' half), and the cut-away texels in it (no
  // darker fringe in the mips)
  for (const [y0, y1, want] of [
    [128, 256, IVY_LEAF],
    [0, 128, IVY_STEM],
  ] as const) {
    const sum = [0, 0, 0];
    let n = 0;
    for (let k = y0 * S; k < y1 * S; k++)
      if (cv.a[k] >= PATTERN_CUT) {
        for (let c = 0; c < 3; c++) sum[c] += cv.rgb[k * 3 + c] / cv.a[k];
        n++;
      }
    const scale = want.map((w, c) => (n ? (w * n) / sum[c] : 1));
    for (let k = y0 * S; k < y1 * S; k++)
      for (let c = 0; c < 3; c++)
        cv.rgb[k * 3 + c] = cv.a[k] > 0.004 ? (cv.rgb[k * 3 + c] / cv.a[k]) * scale[c] : want[c];
  }
  return cv;
}

/** A tiling layer being drawn: its colour at each texel, wrapping every way. */
class Tile {
  rgb = new Float32Array(S * S * 3);
  /** Lay (r, g, b) over texel (x, y) (wrapped) with coverage `a`. */
  set(x: number, y: number, r: number, g: number, b: number, a = 1): void {
    const k = ((y & (S - 1)) * S + (x & (S - 1))) * 3;
    const keep = 1 - a;
    this.rgb[k] = r * a + this.rgb[k] * keep;
    this.rgb[k + 1] = g * a + this.rgb[k + 1] * keep;
    this.rgb[k + 2] = b * a + this.rgb[k + 2] * keep;
  }
  /** Each channel over the layer's mean of it: the texels as the part's albedo over its colour. */
  relative(): Float32Array {
    const mean = [0, 0, 0];
    for (let k = 0; k < S * S; k++) for (let c = 0; c < 3; c++) mean[c] += this.rgb[k * 3 + c] / (S * S);
    const out = new Float32Array(S * S * 3);
    for (let k = 0; k < S * S; k++) for (let c = 0; c < 3; c++) out[k * 3 + c] = this.rgb[k * 3 + c] / mean[c];
    return out;
  }
}

/** The thatch's layer: four courses, each pale blades pointing up the roof into a dark row of cut stalk ends speckled
 *  light (a quarter of the course), the next course's blades rising from under it. */
function drawThatch(): Tile {
  const tl = new Tile();
  const DARK = [0.36, 0.23, 0.095];
  const MID = [0.6, 0.465, 0.24];
  const TIP = [0.71, 0.62, 0.41];
  const COURSE = S / 4;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = 0.8 + 0.4 * hash(x, y, 20);
      tl.set(x, y, DARK[0] * k, DARK[1] * k, DARK[2] * k);
    }
  for (let c = 0; c < 4; c++) {
    const y0 = c * COURSE;
    // two tiers of blades, the taller behind: each a point from its foot up to its tip, darker at its foot, paler at
    // its tip
    for (const [tier, top, count] of [
      [0, 0.74, 140],
      [1, 0.5, 120],
    ] as const)
      for (let b = 0; b < count; b++) {
        const seed = c * 1000 + tier * 500 + b;
        const cx = ((b + hash(seed, 1, 21)) / count) * S;
        const foot = y0 - 0.06 * COURSE + 0.06 * COURSE * hash(seed, 2, 21);
        const tip = y0 + (top - 0.12 + 0.24 * hash(seed, 3, 21)) * COURSE;
        const half = 1.3 + 1.1 * hash(seed, 4, 21);
        const tone = 0.9 + 0.2 * hash(seed, 5, 21);
        const lean = (hash(seed, 6, 21) - 0.5) * 3;
        for (let y = Math.floor(foot); y <= Math.ceil(tip); y++) {
          const t = (y - foot) / (tip - foot);
          if (t < 0 || t > 1) continue;
          const w = half * Math.min(1, (1 - t) * 3);
          const mx = cx + lean * t;
          // (from the dark at its foot to the blade's colour, then to the tip's)
          const f = 0.5 + 0.5 * Math.min(1, t * 2.5);
          const g = Math.min(1, Math.max(0, t - 0.35) * 1.5);
          const r0 = (DARK[0] + (MID[0] - DARK[0]) * f) * (1 - g) + TIP[0] * g;
          const g0 = (DARK[1] + (MID[1] - DARK[1]) * f) * (1 - g) + TIP[1] * g;
          const b0 = (DARK[2] + (MID[2] - DARK[2]) * f) * (1 - g) + TIP[2] * g;
          for (let x = Math.floor(mx - w - 1); x <= Math.ceil(mx + w + 1); x++) {
            const d = Math.abs(x + 0.5 - mx);
            const a = Math.min(1, Math.max(0, w + 0.5 - d));
            if (a <= 0) continue;
            const sh = tone * (0.92 + 0.12 * (1 - d / Math.max(w, 0.5)));
            tl.set(x, y, r0 * sh, g0 * sh, b0 * sh, a);
          }
        }
      }
    // the cut stalk ends in the dark row
    for (let d = 0; d < 150; d++) {
      const seed = c * 1000 + 900 + d;
      const cx = hash(seed, 1, 22) * S;
      const cy = y0 + (0.74 + 0.24 * hash(seed, 2, 22)) * COURSE;
      const r = 0.8 + 0.7 * hash(seed, 3, 22);
      const g = 0.4 + 0.6 * hash(seed, 4, 22);
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          const a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy)));
          if (a > 0) tl.set(x, y, MID[0] + (TIP[0] - MID[0]) * g, MID[1] + (TIP[1] - MID[1]) * g, MID[2] + (TIP[2] - MID[2]) * g, a);
        }
    }
  }
  return tl;
}

/** The dark planks' layer: eight boards along u over the dark between them, wavering, light edged, grained along their
 *  length, running on without an end (a wall's boards span it, as the game's do). */
function drawPlanks(): Tile {
  const tl = new Tile();
  const GAP = [0.095, 0.084, 0.075];
  const BODY = [0.173, 0.121, 0.084];
  const EDGE = [0.348, 0.294, 0.201];
  const BOARD = S / 8;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = 0.85 + 0.3 * hash(x >> 1, y, 33);
      tl.set(x, y, GAP[0] * k, GAP[1] * k, GAP[2] * k);
    }
  for (let b = 0; b < 8; b++) {
    const ph = hash(b, 1, 30) * 6.28;
    const ph2 = hash(b, 2, 30) * 6.28;
    // (each board a little lighter or darker than the next)
    const tone = 0.86 + 0.28 * hash(b, 3, 30);
    for (let x = 0; x < S; x++) {
      const s = (x / S) * 2 * Math.PI;
      // (whole waves a unit: it tiles)
      const mid = b * BOARD + BOARD / 2 + 2 * Math.sin(s * 2 + ph) + 0.7 * Math.sin(s * 5 + ph2);
      const half = 14.2 + 0.8 * Math.sin(s * 3 + ph2);
      const edge = 3.0 + 0.9 * Math.sin(s * 7 + ph) + 0.5 * hash(x, b, 31);
      for (let y = Math.floor(mid - half); y <= Math.ceil(mid + half); y++) {
        const d = Math.abs(y + 0.5 - mid);
        const a = Math.min(1, Math.max(0, half + 0.5 - d));
        if (a <= 0) continue;
        if (d > half - edge) {
          const k = 0.92 + 0.16 * hash(x >> 2, y, 34);
          tl.set(x, y, EDGE[0] * k, EDGE[1] * k, EDGE[2] * k, a);
        } else {
          // (the grain: streaks along the board, lighter and darker by where across it)
          const k = tone * (0.82 + 0.3 * hash(Math.floor((y + 0.5 - mid) * 1.6 + 40), b, 32) + 0.08 * Math.sin(s * 9 + y * 0.7 + ph));
          tl.set(x, y, BODY[0] * k, BODY[1] * k, BODY[2] * k, a);
        }
      }
    }
  }
  return tl;
}

/** The pale wood's layer: sixteen boards along v, near white between them, grained darker and lighter along their
 *  length. */
function drawWood(): Tile {
  const tl = new Tile();
  const LINE = [0.83, 0.81, 0.8];
  const BODY = [0.617, 0.569, 0.504];
  const GRAIN = [0.52, 0.47, 0.41];
  const LIGHT = [0.72, 0.68, 0.62];
  const BOARD = S / 16;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const b = Math.floor(x / BOARD);
      const across = (x % BOARD) + 0.5;
      const t = (y / S) * 2 * Math.PI;
      // (grain streaks, a few to a board, wavering, whole waves a unit)
      const w = across + 1.2 * Math.sin(t * 2 + b * 1.7) + 0.6 * Math.sin(t * 5 + b * 0.9);
      const h = hash(Math.floor(w / 2.6) + 7, b, 40);
      const col = across < 1.5 ? LINE : h < 0.3 ? GRAIN : h > 0.82 ? LIGHT : BODY;
      const k = 0.95 + 0.1 * hash(x, y >> 2, 41);
      tl.set(x, y, col[0] * k, col[1] * k, col[2] * k);
    }
  return tl;
}

let made: Uint8Array | null = null;
/** Every layer's texels, RGBA, layer by layer (made once). */
export function patternTexels(): Uint8Array {
  if (made) return made;
  const out = new Uint8Array(S * S * 4 * PATTERN_LAYERS);
  const byte = (v: number) => Math.round(Math.min(1, Math.max(0, v / PATTERN_GAIN)) * 255);
  // the ivy over its leaves' colour (its cards' colour, entities3d.ts `drape`), cut by its alpha
  const ivy = drawIvy();
  for (let k = 0; k < S * S; k++) {
    for (let c = 0; c < 3; c++) out[k * 4 + c] = byte(ivy.rgb[k * 3 + c] / IVY_LEAF[c]);
    out[k * 4 + 3] = Math.round(Math.min(1, ivy.a[k]) * 255);
  }
  // the tiling layers, never cut
  [drawThatch, drawPlanks, drawWood].forEach((draw, l) => {
    const rel = draw().relative();
    const o = (l + 1) * S * S * 4;
    for (let k = 0; k < S * S; k++) {
      for (let c = 0; c < 3; c++) out[o + k * 4 + c] = byte(rel[k * 3 + c]);
      out[o + k * 4 + 3] = 255;
    }
  });
  return (made = out);
}

/** A pattern's alpha at (u, v) (`layer` as PATTERN; the nearest texel): what the cut keeps, for the tests. */
export function patternAlpha(layer: number, u: number, v: number): number {
  const t = patternTexels();
  const x = Math.min(S - 1, Math.max(0, Math.floor(u * S)));
  const y = Math.min(S - 1, Math.max(0, Math.floor(v * S)));
  return t[((layer - 1) * S * S + y * S + x) * 4 + 3] / 255;
}
