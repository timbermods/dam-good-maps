// The cliffs' normal map, ours (D497; docs/progress/3d-view.md, "The cliffs' relief as the game draws it"): the game's
// TerrainURP draws every wall (its `Cliff` material, the `_USE_TRIPLANAR_SPLATMAP` variant, at every quality) with a
// triplanar normal map, `Cliff_N`, at world × `_Normal_Triplanar_Tile` 0.125 (one repeat 8 tiles), Shader Graph's
// whiteout blend by |n| / Σ|n| and its full strength, sampled trilinear at a slant of 16. A wall's mesh normal is square
// to one axis (its blocks' vertex normals are), so the blend is that axis's projection alone. Its relief is a wall of
// hewn stones, about half a tile each in rough courses, their faces flat or chamfered and cut deep between them, on a
// repeat of its own (its albedo, `CliffDetail`, repeats every 2.2 tiles: the two don't line up). Theirs cannot ship; this
// is made here, in code, to the statistics `python tools/game-cliff-normal.py --measure` reads in theirs (numbers only:
// no texel of the game's is read here or stored in git), and tests/unit/cliff-normal.test.ts holds them there.
//
// Ours is the same kind of wall: a Voronoi of stones in courses (one point a cell, each row shifted), each stone a
// tilted face cut by a few chamfers, falling to the gap between it and its neighbours at a slope of its own (the height
// the lowest of the face, its chamfers and the gap's slope × the distance to the stone's edge, so it meets its
// neighbour's at zero: one height, its gradient exact a texel). Stored as the game stores its own (a unit normal's x
// and y, each a byte 127.5 + 127.5 × it, read × 2 − 1), x in R and y in G, `CLIFF_NORMAL_SIZE` square over the 8-tile
// repeat. Its mips (the GPU's box filter, as the game's stored mips are within their compression's noise) thin its
// slopes with distance as the game's do. Pure TypeScript, no three.js: made once a page in the textures' own worker
// (high/fields.ts `textureBake`), the texture flat at the game's mean until then.

import { hash } from "./waterTextures";

/** The game's `Cliff_N` as `tools/game-cliff-normal.py --measure` reads it (Timberborn 1.1.2.8-ffc2de0-sw, BC7 2048²,
 *  256 texels a tile, its normal's x = a and y = g, × 2 − 1), in its first mip (1024², 128 texels a tile, our top: what
 *  a camera farther than about 12 tiles samples at 1080 rows): the share of x's power by wavelength (`bands`, tiles:
 *  8–4, …, 0.0625–0.03125, finer; y's within 0.006 of it), x's and y's spread and mean (the surface tilted 0.4° on
 *  average), x's percentiles (1, 5, 25, 50, 75, 95, 99 %: flat faces within ±0.15 for half of it, the cuts between the
 *  stones past ±0.7 for a tenth), the share of neighbouring texels whose x differs by under 0.01 (flat faces), and x's
 *  spread by mip (`mips`, the top's 2048² first): it falls as the mips average the stones out, so a far wall reads
 *  flatter. */
export const GAME_CLIFF_NORMAL = {
  tiling: 0.125,
  bands: [8, 4, 2, 1, 0.5, 0.25, 0.125, 0.0625, 0.03125, 0] as const,
  power: [0.0003, 0.0013, 0.0152, 0.1118, 0.2895, 0.3343, 0.1552, 0.0634, 0.0292] as const,
  spread: [0.354, 0.358] as const,
  mean: [-0.0052, -0.0054] as const,
  percentiles: [-0.827, -0.694, -0.145, -0.004, 0.122, 0.702, 0.82] as const,
  flat: 0.818,
  mips: [0.36, 0.354, 0.344, 0.323, 0.284, 0.217, 0.145, 0.079] as const,
} as const;

/** Ours: stones across the repeat (`cells`, x and y: 15 × 17, as the game's), how far each strays from its cell's middle
 *  (`jitter`, x and y, cells) and each course's shift along (up to `shift`, cells); each stone's face height
 *  (`face`), the spread of its tilt (`tilt`), its four chamfers (each from `chamfer` [from, to] of the cell out of its
 *  middle, falling at `chamferSlope` [from, to]) and the slope of its cut (`cut`, [from, to]), heights in cells; and
 *  the gradient per tile (`scale`, x and y) the normal is made from (its `x = −∂h/∂u / √(1 + |∇h|²)`). Tuned to the
 *  game's spread by mip, its percentiles and its power by band (the test). */
export const CLIFF_STONES = {
  cells: [15, 17] as const,
  jitter: [0.5, 0.3] as const,
  shift: 0.5,
  face: 0.1,
  tilt: 0.09,
  chamfer: [0.22, 0.4] as const,
  chamferSlope: [0.09, 0.21] as const,
  cut: [0.6, 0.9] as const,
  scale: [(15 / 8) * 0.9, (17 / 8) * 0.81] as const,
  seed: 811,
} as const;

/** Texels across ours (one repeat, 8 tiles: 128 a tile), the game's first mip: its top (2048²) holds 3 % more of the
 *  slopes' variance, which only a camera nearer than about 12 tiles samples (8 MB more on the GPU). */
export const CLIFF_NORMAL_SIZE = 1024;

/** The byte a normal's component is stored as (the game's encoding: a unorm byte read × 2 − 1). */
export const cliffByte = (v: number): number => Math.max(0, Math.min(255, Math.round(127.5 + 127.5 * v)));

const CHAMFERS = 4;

/** The cliffs' relief (a unit normal's x in R and y in G), `size` square (a power of two), two bytes a texel. */
export function makeCliffNormal(size: number): Uint8Array {
  const S = CLIFF_STONES;
  const [CX, CY] = S.cells;
  const r = (i: number, j: number, k: number) => hash(i, j, S.seed * 64 + k);
  const between = (lo: number, hi: number, t: number) => lo + (hi - lo) * t;
  // each stone: its point (cells, unwrapped: column i's point near i + ½ + its course's shift), its tilt, its cut's
  // slope, and its chamfers (a direction, how far out, how steep)
  const n = CX * CY;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  const cut = new Float64Array(n);
  const chamfer = new Float64Array(n * CHAMFERS * 4);
  for (let j = 0; j < CY; j++) {
    const shift = r(0, j, 1) * S.shift;
    for (let i = 0; i < CX; i++) {
      const s = j * CX + i;
      px[s] = i + 0.5 + shift + (r(i, j, 2) - 0.5) * S.jitter[0];
      py[s] = j + 0.5 + (r(i, j, 3) - 0.5) * S.jitter[1];
      // (a Gaussian tilt, by Box–Muller)
      const rad = Math.sqrt(-2 * Math.log(1 - r(i, j, 4))) * S.tilt;
      const a = 2 * Math.PI * r(i, j, 5);
      tx[s] = rad * Math.cos(a);
      ty[s] = rad * Math.sin(a);
      cut[s] = between(S.cut[0], S.cut[1], r(i, j, 6));
      const turn = 2 * Math.PI * r(i, j, 7);
      for (let k = 0; k < CHAMFERS; k++) {
        const d = turn + (k * 2 * Math.PI) / CHAMFERS + (r(i, j, 8 + k) - 0.5) * 0.8;
        const o = (s * CHAMFERS + k) * 4;
        chamfer[o] = Math.cos(d);
        chamfer[o + 1] = Math.sin(d);
        chamfer[o + 2] = between(S.chamfer[0], S.chamfer[1], r(i, j, 12 + k));
        chamfer[o + 3] = between(S.chamferSlope[0], S.chamferSlope[1], r(i, j, 16 + k));
      }
    }
  }
  // the stones round a texel: rows j − 1 … j + 1, columns i − 2 … i + 2 (a course's shift and jitter keep its nearest
  // within them), each its point where it lies round this texel (wrapped by the repeat)
  const NC = 15;
  const cx = new Float64Array(NC);
  const cy = new Float64Array(NC);
  const cs = new Int32Array(NC);
  const out = new Uint8Array(size * size * 2);
  for (let y = 0; y < size; y++) {
    const v = ((y + 0.5) / size) * CY;
    const j0 = Math.floor(v);
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * CX;
      const i0 = Math.floor(u);
      let m = 0;
      let best = Infinity;
      let b = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j0 + dj;
        const wj = ((jj % CY) + CY) % CY;
        for (let di = -2; di <= 2; di++) {
          const ii = i0 + di;
          const wi = ((ii % CX) + CX) % CX;
          const s = wj * CX + wi;
          cx[m] = px[s] + (ii - wi);
          cy[m] = py[s] + (jj - wj);
          cs[m] = s;
          const d = (cx[m] - u) * (cx[m] - u) + (cy[m] - v) * (cy[m] - v);
          if (d < best) {
            best = d;
            b = m;
          }
          m++;
        }
      }
      const s = cs[b];
      // the distance to the stone's edge (to the nearest bisector) and its gradient
      let edge = Infinity;
      let ex = 0;
      let ey = 0;
      for (let k = 0; k < NC; k++) {
        if (k === b) continue;
        const dx = cx[k] - cx[b];
        const dy = cy[k] - cy[b];
        const l = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / l;
        const uy = dy / l;
        const d = ((cx[k] + cx[b]) / 2 - u) * ux + ((cy[k] + cy[b]) / 2 - v) * uy;
        if (d < edge) {
          edge = d;
          ex = -ux;
          ey = -uy;
        }
      }
      // the face (tilted, cut by its chamfers), or the cut down to the edge, whichever is lower
      const ox = u - cx[b];
      const oy = v - cy[b];
      let h = S.face + tx[s] * ox + ty[s] * oy;
      let gx = tx[s];
      let gy = ty[s];
      for (let k = 0; k < CHAMFERS; k++) {
        const o = (s * CHAMFERS + k) * 4;
        const hk = S.face + tx[s] * ox + ty[s] * oy - chamfer[o + 3] * (ox * chamfer[o] + oy * chamfer[o + 1] - chamfer[o + 2]);
        if (hk < h) {
          h = hk;
          gx = tx[s] - chamfer[o + 3] * chamfer[o];
          gy = ty[s] - chamfer[o + 3] * chamfer[o + 1];
        }
      }
      if (cut[s] * edge < h) {
        gx = cut[s] * ex;
        gy = cut[s] * ey;
      }
      gx *= S.scale[0];
      gy *= S.scale[1];
      const k = 1 / Math.sqrt(1 + gx * gx + gy * gy);
      const o = (y * size + x) * 2;
      out[o] = cliffByte(-gx * k);
      out[o + 1] = cliffByte(-gy * k);
    }
  }
  return out;
}
