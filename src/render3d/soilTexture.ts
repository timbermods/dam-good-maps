// The pattern contaminated ground takes, ours (D154, D334 as amended 2026-11-07): the game lays its `SoilContamination`
// texture over the ground (TerrainURP: lerp(the ground's albedo, its colour, the contamination's weight × its alpha),
// palette.ts `CONTAMINATION`), a network of thin rusty cracks closing small cells. Theirs cannot ship; this one is made
// here, in code, to the statistics `python tools/game-water-shader.py --soil` measures in theirs (`GAME_SOIL_TEXTURE`;
// numbers only: no texel of the game's is read here or stored in git), and tests/unit/soil-texture.test.ts holds it
// there.
//
// One RGBA texture, `SOIL_TEXTURE_SIZE` square, one repeat `CONTAMINATION.repeat` tiles across (as the game's): RGB the
// pattern's colour (a dark rust in the cracks, the game's own darker brown between them, which its mips average in),
// A how much of it covers the ground (1 in a crack, 0 between, a soft edge a texel or two wide). Pure TypeScript, no
// three.js: made once a page with the water's textures, in their own worker; the ground takes the pattern's
// mean until then (materials.ts `soilPatternTexture`).

import { cellPoints, hash, lattice, noiseRows, voronoi } from "./waterTextures";

/** The game's pattern as `tools/game-water-shader.py --soil` measures it (Timberborn 1.1.2.8-ffc2de0-sw,
 *  `SoilContamination`, 1024², BC7, read raw: the game renders in Gamma colour space, so these are what its shader
 *  lays over the ground), display values 0–255. */
export const GAME_SOIL_TEXTURE = {
  /** The share of texels whose alpha is over a half, and the mean alpha (0–1). */
  cover: 0.198,
  meanAlpha: 51.5 / 255,
  /** The colour where the alpha is over a half: its mean and spread (standard deviation) per channel. */
  vein: [78.1, 33.0, 5.2] as const,
  veinSpread: [19.6, 10.2, 4.2] as const,
  /** The colour where the alpha is under 8 (between the cracks, where the alpha hides it but its mips average it in),
   *  and the whole texture's mean colour. */
  between: [47.9, 33.0, 24.3] as const,
  mean: [53.6, 32.2, 19.3] as const,
  /** The cracks (alpha over a half): their width at their middle (twice the distance to their edge on their skeleton),
   *  median and 5th/95th percentiles, in tiles; their length a square tile (tiles); the cells they close a square tile;
   *  and the share of texels in the soft edge (alpha 8 to 240). One joined network. */
  width: { p5: 6 / 256, p50: 10 / 256, p95: 17.1 / 256 },
  length: 4.77,
  cells: 86 / 16,
  soft: 0.111,
} as const;

/** The texture's size (texels square): one repeat is `CONTAMINATION.repeat` (4) tiles, so 128 texels a tile, a crack 4
 *  to 9 texels wide. */
export const SOIL_TEXTURE_SIZE = 512;

/** How ours is made: a Voronoi network (`cells` across a repeat, so about the game's cells a square tile), its domain
 *  warped broadly (`warp`, a lattice of `warpCells`) and finely (`wobble`, `wobbleCells`) so its cracks wander, a finer
 *  network (`fineCells`) kept only where a broad noise passes `fineFrom`, thinner (`fineWidth`), for the branches and
 *  short spurs; each crack's width varies by a noise (`widthNoise` cells, from `widthRange[0]` to `[1]` of its middle),
 *  and the whole is widened until its cover is the game's. The colour's brightness varies by a noise (`colourCells`).
 *  The soft edge is `softTiles` across. */
const PATTERN = {
  cells: 8,
  warpCells: 5,
  warp: 0.3,
  wobbleCells: 24,
  wobble: 0.16,
  fineCells: 16,
  fineFrom: 0.72,
  fineWidth: 0.65,
  widthNoise: 14,
  widthRange: [0.55, 1.45] as const,
  colourCells: 22,
  softTiles: 0.011,
};

/** The pattern (RGBA bytes) at `size` texels square. */
export function makeSoilTexture(size: number): Uint8Array {
  const P = PATTERN;
  const G = GAME_SOIL_TEXTURE;
  const n = size * size;
  const tiles = 4;
  const pts = cellPoints(P.cells, 211);
  const fine = cellPoints(P.fineCells, 223);
  // (the noises at the texels' middles, a row at a time)
  const warpX = noiseRows(lattice(P.warpCells, 231), size);
  const warpY = noiseRows(lattice(P.warpCells, 232), size);
  const wobX = noiseRows(lattice(P.wobbleCells, 233), size);
  const wobY = noiseRows(lattice(P.wobbleCells, 234), size);
  const keep = noiseRows(lattice(6, 235), size);
  const widths = noiseRows(lattice(P.widthNoise, 236), size);
  const tone = noiseRows(lattice(P.colourCells, 237), size);
  const v = new Float64Array(3);
  // each texel's distance to the nearest crack's middle over that crack's width (in tiles), before the widening
  const ratio = new Float64Array(n);
  const width = new Float64Array(n);
  for (let y = 0; y < size; y++) {
    const [warpXs, warpYs, wobXs, wobYs, keepAt, widthsAt] = [warpX(y), warpY(y), wobX(y), wobY(y), keep(y), widths(y)];
    for (let x = 0; x < size; x++) {
      const u0 = (x + 0.5) / size;
      const w0 = (y + 0.5) / size;
      const u = u0 + ((warpXs[x] - 0.5) * P.warp + (wobXs[x] - 0.5) * P.wobble) / P.cells;
      const w = w0 + ((warpYs[x] - 0.5) * P.warp + (wobYs[x] - 0.5) * P.wobble) / P.cells;
      const uw = u - Math.floor(u);
      const ww = w - Math.floor(w);
      const hw = P.widthRange[0] + (P.widthRange[1] - P.widthRange[0]) * widthsAt[x];
      // (an edge's distance from its middle, in tiles: half the gap between the nearest two points, in cells, × the cell)
      voronoi(uw * P.cells, ww * P.cells, P.cells, pts, v);
      const main = (((v[1] - v[0]) / 2) * tiles) / P.cells / hw;
      voronoi(uw * P.fineCells, ww * P.fineCells, P.fineCells, fine, v);
      const kept = keepAt[x] > P.fineFrom;
      const branch = kept ? (((v[1] - v[0]) / 2) * tiles) / P.fineCells / (hw * P.fineWidth) : Infinity;
      const i = y * size + x;
      ratio[i] = Math.min(main, branch);
      width[i] = main <= branch ? hw : hw * P.fineWidth;
    }
  }
  // widened until the share of texels inside a crack is the game's
  const k = nthSmallest(Float64Array.from(ratio), Math.min(n - 1, Math.floor(G.cover * n)));
  const data = new Uint8Array(n * 4);
  for (let y = 0; y < size; y++) {
    const toneAt = tone(y);
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // (the signed distance to the crack's edge, in tiles: inside below 0)
      const edge = (ratio[i] - k) * width[i];
      const a = Math.min(1, Math.max(0, 0.5 - edge / P.softTiles));
      const z = Math.max(-2.2, Math.min(2.2, (toneAt[x] - 0.5) / 0.17 + (hash(x, y, 239) - 0.5) * 0.6));
      for (let c = 0; c < 3; c++) {
        const inCrack = G.vein[c] + G.veinSpread[c] * z;
        data[i * 4 + c] = Math.round(Math.min(255, Math.max(0, G.between[c] + (inCrack - G.between[c]) * a)));
      }
      data[i * 4 + 3] = Math.round(a * 255);
    }
  }
  return data;
}

/** The `k`th smallest of `v` (0-based; as a sorted copy's `k`th, without sorting it all): Hoare's selection, `v`
 *  reordered in place. */
export function nthSmallest(v: Float64Array, k: number): number {
  let lo = 0;
  let hi = v.length - 1;
  while (lo < hi) {
    const pivot = v[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (v[i] < pivot) i++;
      while (v[j] > pivot) j--;
      if (i <= j) {
        const t = v[i];
        v[i] = v[j];
        v[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return v[k];
  }
  return v[k];
}
