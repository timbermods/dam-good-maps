// The resource baseline (Kyler's "Resources like the official maps", 2026-09-25): how many trees,
// berry bushes and how much scrap a map carries for its size and settings, and where they go, as
// the official maps have them (investigation/official-baselines.json). The generator's
// `planResources` and Real places (and later Pick a place) all use it:
//
// - `resourceBudget`: the amounts. Each is the official median for the map's size (the calibration
//   table), moved within the official maps' typical range (their 25th to 75th percentile) by the
//   seed, so maps differ, then scaled by its setting (Forests, Berries, Ruins). Mine sites come from
//   their setting (1–4).
// - `planGroves`: trees in single-species groves with clearings between them, living on moist
//   ground and stored dead on dry ground, with the species mix; dense at the heart, thinning out.
// - `planPatches`: berry bushes in a few large patches beside water.
// - `planRuinFields` and `ruinColumns`: irregular fields on one level, each with its own mix of
//   heights (some fields short, some tall), a few towers among shorter columns, and mixed models.
// - `pickMineSite`: a mine site on flat, dry 5×5 ground with a level ring round it, away from water,
//   in its distance band from the start, on ground the colony walks to when there is any.
// - `planBaseline` and `baselineEntities`: all of it on one map's ground, for places that are not
//   generated (Real places, Pick a place): near the start first, for the start requirements.
//
// Everything is deterministic (PLAN §2.1): basic arithmetic, the seeded streams and literal tables.

import { bush, ruin, tree, TREE_LOGS, type EntitySpec } from "../format/entities";
import { coordinatesForMinCorner, FOOTPRINTS, footprintTiles, ORIENTATIONS, type Orientation } from "../format/footprints";
import { entityId } from "../features/ids";
import { growBlob, pickSeeds, punchHoles } from "../gen/blobs";
import { density, FOREST, OFFICIAL_LAYOUT as L, RUIN_HEIGHT_SHARES } from "../gen/calibrated";
import { expDet } from "../math/detmath";
import { hash32, tileHash01 } from "../math/hash";
import { distanceFrom } from "../math/grid";
import { stream, type Rng } from "../math/rng";
import { resourceBudget, type ResourceBudget, type ResourceSettings } from "./budget";
import { MAP_TREES, type MapTree } from "./measure";

export { officialRange, resourceBudget, type ResourceBudget, type ResourceSettings } from "./budget";

// ------------------------------------------------------------------------------------------ ground

/** The ground resources are placed on. `taken` marks tiles nothing more may take (objects, the
 *  start, water sources, what the planners placed); the planners add their own tiles to it. */
export interface BaselineGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** Settled water depth. */
  water: ArrayLike<number>;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
  taken: Uint8Array;
}

/** A living plant's soil: moist, dry-footed and clean. */
export const moistAt = (g: BaselineGround, i: number) => g.moisture[i] > 0 && !(g.water[i] > 0) && !(g.soilContamination[i] > 0);
const freeAt = (g: BaselineGround, i: number) => !g.taken[i] && !(g.water[i] > 0);

function centreOf(tiles: readonly number[], W: number): [number, number] {
  let cx = 0;
  let cy = 0;
  for (const i of tiles) {
    cx += i % W;
    cy += (i - (i % W)) / W;
  }
  return [cx / tiles.length, cy / tiles.length];
}

/** The `keep` tiles of a blob, densest at its heart: ranked by distance from the middle (as a share
 *  of the farthest) with a random share mixed in, so the edge thins out raggedly. */
export function thinCluster(rng: Rng, blob: readonly number[], W: number, keep: number, ragged: number): number[] {
  if (keep >= blob.length) return [...blob];
  const [cx, cy] = centreOf(blob, W);
  const r = blob.map((i) => {
    const dx = (i % W) - cx;
    const dy = (i - (i % W)) / W - cy;
    return Math.sqrt(dx * dx + dy * dy);
  });
  let rmax = 0;
  for (const v of r) if (v > rmax) rmax = v;
  if (rmax === 0) rmax = 1;
  const key = blob.map((_, k) => (1 - ragged) * (r[k] / rmax) + ragged * rng.float());
  const order = blob.map((_, k) => k).sort((a, b) => key[a] - key[b] || a - b);
  return order
    .slice(0, keep)
    .map((k) => blob[k])
    .sort((a, b) => a - b);
}

/** Mark tiles, and a ring of `ring` tiles round them, in `mask`. */
function markRing(mask: Uint8Array, tiles: readonly number[], W: number, H: number, ring: number): void {
  for (const i of tiles) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) mask[yy * W + xx] = 1;
      }
  }
}

// ------------------------------------------------------------------------------------------ groves

export interface Grove {
  /** The trees' tiles, ascending. */
  tiles: number[];
  /** The ground the grove took, its gaps included. */
  area: number[];
  species: MapTree;
  /** On moist ground (alive); else on dry ground (dead, or living succulents). */
  living: boolean;
}

/** Trees per grove by the Grove size setting: official median 40 at Normal. */
export const GROVE_SIZE = {
  scattered: { median: L.grove.median / 2, cap: 120 },
  normal: { median: L.grove.median, cap: L.grove.cap },
  bigWoods: { median: L.grove.median * 2, cap: 400 },
} as const;
/** The share of a grove's ground that holds a tree, for its trees to have about 41% of their
 *  neighbours in trees (the official grove fill), and how raggedly its edge thins. */
const GROVE_AREA_FILL = 0.52;
const GROVE_RAGGED = 0.75;
/** Clear ground round each grove, so groves stay apart (a grove is trees within 2 tiles). */
const GROVE_CLEARING = 2;

export interface GroveOptions {
  rng: Rng;
  groveSize: ResourceSettings["groveSize"];
  speciesMix: ResourceSettings["speciesMix"];
  /** Groves stay inside this mask (the start's walk). */
  within?: Uint8Array | null;
  /** Ground kept clear round earlier groves (shared between calls, so every grove keeps apart). */
  clearings?: Uint8Array;
  /** Seed tiles near water weigh more for living groves. */
  waterDist?: Float64Array | null;
  /** Grow each grove to exactly this many trees (near the start) instead of drawing its size. */
  size?: number;
}

/** A single grove of about `n` trees seeded at `seedTile`: its ground grown as a blob over the
 *  allowed tiles, then thinned from the edge. With too little room it keeps every tile it could
 *  take (so a narrow valley floor still gives its trees). */
export function growGroveAt(g: BaselineGround, rng: Rng, allowed: Uint8Array, seedTile: number, n: number, fill = GROVE_AREA_FILL): { area: number[]; tiles: number[] } | null {
  return growCluster(g, rng, allowed, seedTile, n, fill, GROVE_RAGGED);
}

/** A blob of about n / fill tiles thinned to n from its edge; a blob the ground cut short keeps
 *  every tile up to n. */
function growCluster(g: BaselineGround, rng: Rng, allowed: Uint8Array, seedTile: number, n: number, fill: number, ragged: number): { area: number[]; tiles: number[] } | null {
  if (!allowed[seedTile]) return null;
  const want = Math.max(n, Math.round(n / fill));
  const blob = growBlob(rng, allowed, g.W, g.H, seedTile, want, 1.5);
  const keep = blob.length >= want ? n : Math.min(n, blob.length);
  return { area: blob, tiles: thinCluster(rng, blob, g.W, Math.max(1, keep), ragged) };
}

/** Trees in groves (see the file's header): `living` trees in groves on moist ground and `dry` in
 *  groves on dry ground (dead pines, birches and oaks, or living succulents), each grove one
 *  species, drawn by what is left of each species' share. Returns what it placed; it may place
 *  fewer where the ground runs out. */
export function planGroves(g: BaselineGround, want: { living: number; dry: number }, o: GroveOptions): Grove[] {
  const { W, H } = g;
  const N = W * H;
  const out: Grove[] = [];
  const clear = o.clearings ?? new Uint8Array(N);
  const size = GROVE_SIZE[o.groveSize];
  const mix = [o.speciesMix.pine, o.speciesMix.birch, o.speciesMix.oak, o.speciesMix.succulent];
  const mixTotal = mix.reduce((a, b) => a + b, 0) || 1;
  const total = want.living + want.dry;
  // what is left of each species' share of the trees
  const left = mix.map((w) => (w / mixTotal) * total);
  for (const living of [true, false]) {
    let need = living ? want.living : want.dry;
    let misses = 0;
    while (need >= 3 && misses < 40) {
      const allowed = new Uint8Array(N);
      const weight = new Float64Array(N);
      let any = false;
      for (let i = 0; i < N; i++) {
        if (!freeAt(g, i) || clear[i] || (o.within && !o.within[i])) continue;
        if (living !== moistAt(g, i)) continue;
        allowed[i] = 1;
        weight[i] = living && o.waterDist ? (o.waterDist[i] <= 6 ? 3 : o.waterDist[i] <= 16 ? 1.5 : 1) : 1;
        any = true;
      }
      if (!any) break;
      const seeds = pickSeeds(o.rng, weight, W, 1, 1);
      if (!seeds.length) break;
      let n = o.size ?? Math.max(5, Math.min(size.cap, Math.floor(o.rng.logNormal(size.median, L.grove.sigma))));
      n = Math.min(n, need < 5 ? 5 : need);
      const grown = growGroveAt(g, o.rng, allowed, seeds[0], n);
      if (!grown || grown.tiles.length < 3) {
        clear[seeds[0]] = 1;
        misses++;
        continue;
      }
      // the species: by what is left of each (succulents only on dry ground)
      const w = living ? [left[0], left[1], left[2], 0] : [...left];
      let k = w.some((v) => v > 0) ? o.rng.weighted(w.map((v) => Math.max(0, v))) : o.rng.weighted(mix.map((v, j) => (living && j === 3 ? 0 : v)));
      if (living && k === 3) k = 0;
      const species = MAP_TREES[k];
      left[k] -= grown.tiles.length;
      for (const i of grown.area) g.taken[i] = 1;
      markRing(clear, grown.area, W, H, GROVE_CLEARING);
      out.push({ tiles: grown.tiles, area: grown.area, species, living });
      need -= grown.tiles.length;
      misses = 0;
    }
  }
  return out;
}

// ----------------------------------------------------------------------------------------- patches

export interface Patch {
  tiles: number[];
  area: number[];
}

/** The share of a patch's ground that holds a bush (official patches: 63% of neighbours). */
const PATCH_AREA_FILL = 0.74;
const PATCH_RAGGED = 0.55;
/** Patches keep this far apart where there is room (official median clearing 29 tiles). */
const PATCH_SPACING = 14;

export interface PatchOptions {
  rng: Rng;
  within?: Uint8Array | null;
  waterDist: Float64Array;
  /** Centres of patches placed so far (shared between calls). */
  centres?: [number, number][];
  /** Bushes per patch, else drawn from the official sizes. */
  size?: number;
}

/** A patch of about `n` bushes seeded at `seedTile` (as `growGroveAt`). */
export function growPatchAt(g: BaselineGround, rng: Rng, allowed: Uint8Array, seedTile: number, n: number, fill = PATCH_AREA_FILL): { area: number[]; tiles: number[] } | null {
  return growCluster(g, rng, allowed, seedTile, n, fill, PATCH_RAGGED);
}

/** `want` berry bushes in patches on moist ground beside water (see the file's header). */
export function planPatches(g: BaselineGround, want: number, o: PatchOptions): Patch[] {
  const { W, H } = g;
  const N = W * H;
  const out: Patch[] = [];
  const centres = o.centres ?? [];
  let need = want;
  let misses = 0;
  let spacing = PATCH_SPACING;
  while (need >= 3 && misses < 30) {
    const allowed = new Uint8Array(N);
    const weight = new Float64Array(N);
    let any = false;
    for (let i = 0; i < N; i++) {
      if (!freeAt(g, i) || !moistAt(g, i) || (o.within && !o.within[i])) continue;
      allowed[i] = 1;
      const d = o.waterDist[i];
      const x = i % W;
      const y = (i - x) / W;
      if (centres.some(([cx, cy]) => (x - cx) * (x - cx) + (y - cy) * (y - cy) < spacing * spacing)) continue;
      weight[i] = d <= L.patchWater ? 4 : d <= 2 * L.patchWater ? 1 : 0.15;
      any = true;
    }
    if (!any) {
      if (spacing > 0) {
        spacing = spacing > 6 ? 6 : 0;
        continue;
      }
      break;
    }
    const seeds = pickSeeds(o.rng, weight, W, 1, 1);
    if (!seeds.length) break;
    let n = o.size ?? Math.max(8, Math.min(L.patch.cap, Math.floor(o.rng.logNormal(L.patch.median, L.patch.sigma))));
    n = Math.min(n, Math.max(3, need));
    // along the bank where there is room for it, as the official patches lie
    const bank = new Uint8Array(N);
    for (let i = 0; i < N; i++) bank[i] = allowed[i] && o.waterDist[i] <= 2 * L.patchWater ? 1 : 0;
    let grown = bank[seeds[0]] ? growPatchAt(g, o.rng, bank, seeds[0], n) : null;
    if (!grown || grown.tiles.length < n / 2) grown = growPatchAt(g, o.rng, allowed, seeds[0], n);
    if (!grown || grown.tiles.length < 3) {
      g.taken[seeds[0]] = 1;
      misses++;
      continue;
    }
    for (const i of grown.area) g.taken[i] = 1;
    centres.push(centreOf(grown.tiles, W));
    out.push(grown);
    need -= grown.tiles.length;
    misses = 0;
  }
  return out;
}

// ------------------------------------------------------------------------------------------- ruins

export interface RuinField {
  /** The columns' tiles, in growth order. */
  tiles: number[];
  /** −1 (a field of short columns) to 1 (a tall one); 0 is the official mix. */
  tallness: number;
}

export interface RuinColumns {
  storeys: number[];
  variants: string[];
  orientations: Orientation[];
  scrap: number;
}

/** How strongly tallness tilts the storey mix: at ±1 a field's mean is about 2.4 or 3.8 storeys
 *  (the official fields' 10th and 90th percentiles are 2.2 and 3.9). */
const TILT = 0.17;
/** How much a column's height follows its neighbours' (0: none): official neighbours differ by 1.8
 *  storeys on average, a little less than unrelated columns would. */
const CLUMP = 0.6;

const VARIANT_IDS = Object.keys(L.ruinVariants);
const VARIANT_W = Object.values(L.ruinVariants) as number[];
const ORIENT_IDS = Object.keys(L.ruinOrientations) as Orientation[];
const ORIENT_W = Object.values(L.ruinOrientations) as number[];

/** The storey mix of a field of this tallness: the official shares, tilted. */
export function storeyMix(tallness: number): number[] {
  return RUIN_HEIGHT_SHARES.map((s, k) => s * expDet(TILT * tallness * (k + 1 - 3)));
}

/** Mean storeys of a field of this tallness. */
export function meanStoreys(tallness: number): number {
  const m = storeyMix(tallness);
  let a = 0;
  let b = 0;
  m.forEach((w, k) => {
    a += w * (k + 1);
    b += w;
  });
  return a / b;
}

/** Heights, models and turns of a ruin field's columns (its tiles in order): storeys drawn from the
 *  field's own mix, placed by a mildly clumped key, so a few tall towers stand among shorter
 *  columns; variants and orientations in the official shares. */
export function ruinColumns(tiles: readonly number[], W: number, rng: Rng, tallness: number): RuinColumns {
  const n = tiles.length;
  const mix = storeyMix(tallness);
  const hs: number[] = [];
  for (let k = 0; k < n; k++) hs.push(rng.weighted(mix) + 1);
  const xs = tiles.map((i) => i % W);
  const ys = tiles.map((i) => (i - (i % W)) / W);
  const x0 = xs.reduce((a, v) => Math.min(a, v), Infinity);
  const y0 = ys.reduce((a, v) => Math.min(a, v), Infinity);
  const cell = 2.5;
  const gx = Math.floor((xs.reduce((a, v) => Math.max(a, v), -Infinity) - x0) / cell) + 2;
  const gy = Math.floor((ys.reduce((a, v) => Math.max(a, v), -Infinity) - y0) / cell) + 2;
  const lat: number[] = [];
  for (let k = 0; k < gx * gy; k++) lat.push(rng.float());
  const keys = tiles.map((_, k) => {
    const fx = (xs[k] - x0) / cell;
    const fy = (ys[k] - y0) / cell;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const a = lat[iy * gx + ix] * (1 - tx) + lat[iy * gx + ix + 1] * tx;
    const b = lat[(iy + 1) * gx + ix] * (1 - tx) + lat[(iy + 1) * gx + ix + 1] * tx;
    return CLUMP * (a * (1 - ty) + b * ty) + (1 - CLUMP) * rng.float();
  });
  const order = tiles.map((_, k) => k).sort((a, b) => keys[b] - keys[a] || a - b);
  const sorted = [...hs].sort((a, b) => b - a);
  const storeys = new Array<number>(n);
  order.forEach((k, rank) => (storeys[k] = sorted[rank]));
  const variants = tiles.map(() => VARIANT_IDS[rng.weighted(VARIANT_W)]);
  const orientations = tiles.map(() => ORIENT_IDS[rng.weighted(ORIENT_W)]);
  let scrap = 0;
  for (const h of storeys) scrap += 15 * h;
  return { storeys, variants, orientations, scrap };
}

export interface RuinFieldOptions {
  rng: Rng;
  /** Straight distance from the start (null: no start). Fields keep `minStart` tiles from it. */
  startDist?: Float64Array | null;
  minStart: number;
  /** Least distance between field centres. */
  spacing?: number;
  /** Columns in the median field at this map's size. */
  fieldMedian: number;
  /** The scrap a field of these tiles and tallness yields (the caller's own stream, so the build
   *  reproduces it); else an estimate from its mean storeys. */
  scrapOf?: (tiles: number[], tallness: number) => number;
  /** Stop after this many fields. */
  maxFields?: number;
}

/** A field's ground: an ellipse of random aspect (1–2) and direction round its seed, which the blob
 *  fills irregularly. */
const AXES: readonly [number, number][] = [
  [1, 0],
  [0.7071067811865476, 0.7071067811865476],
  [0, 1],
  [-0.7071067811865476, 0.7071067811865476],
];

/** Ruin fields holding about `scrap` scrap (see the file's header), on dry flat ground away from the
 *  start (on moist ground too when dry ground is scarce), each on one level with a one-tile moat.
 *  Returns the fields and the scrap they hold. */
export function planRuinFields(g: BaselineGround, scrap: number, o: RuinFieldOptions): { fields: RuinField[]; scrap: number } {
  const { W, H } = g;
  const N = W * H;
  const spacing = o.spacing ?? 18;
  const ruinFree = new Uint8Array(N);
  let allowedCount = 0;
  // two tiles off water: a column needs a dry neighbour at its level for its scavenger
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = g.water[i] > 0 ? 1 : 0;
  const nearWater = new Uint8Array(N);
  markRing(nearWater, [...wet.keys()].filter((i) => wet[i]), W, H, 1);
  const far = (i: number) => !o.startDist || o.startDist[i] >= o.minStart;
  for (let i = 0; i < N; i++) {
    ruinFree[i] = freeAt(g, i) && !nearWater[i] && !(g.moisture[i] > 0) && far(i) ? 1 : 0;
    allowedCount += ruinFree[i];
  }
  if (allowedCount < 0.05 * N) for (let i = 0; i < N; i++) ruinFree[i] = freeAt(g, i) && !nearWater[i] && far(i) ? 1 : 0;
  const fields: RuinField[] = [];
  const centres: [number, number][] = [];
  let left = scrap;
  for (let tries = 0; left > 0 && tries < 200 && fields.length < (o.maxFields ?? 64); tries++) {
    // (to a thousandth: the feature stores it, and its build draws the same heights)
    const tallness = Math.round(o.rng.range(-1, 1) * 1000) / 1000;
    const perColumn = 15 * meanStoreys(tallness);
    let size = Math.floor(o.rng.logNormal(o.fieldMedian, 0.35));
    size = Math.max(12, Math.min(Math.round(2.2 * o.fieldMedian), size));
    size = Math.min(size, Math.ceil(left / perColumn));
    if (size < 10) break;
    const cands: number[] = [];
    for (let i = 0; i < N; i++) if (ruinFree[i]) cands.push(i);
    if (!cands.length) break;
    const s = o.rng.pick(cands);
    const sx = s % W;
    const sy = (s - sx) / W;
    if (centres.some(([cx, cy]) => (sx - cx) * (sx - cx) + (sy - cy) * (sy - cy) < spacing * spacing)) continue;
    // an ellipse of the field's ground: its area about the field's columns over the official fill
    const aspect = 1 + o.rng.float();
    const [ax, ay] = AXES[o.rng.int(0, 4)];
    const areaTiles = size / L.fieldFill / 0.85;
    const major = Math.sqrt((areaTiles * aspect) / Math.PI);
    const minor = Math.sqrt(areaTiles / (aspect * Math.PI));
    const level = g.heights[s];
    const allowed = new Uint8Array(N);
    const r = Math.ceil(major) + 1;
    for (let y = Math.max(0, sy - r); y <= Math.min(H - 1, sy + r); y++)
      for (let x = Math.max(0, sx - r); x <= Math.min(W - 1, sx + r); x++) {
        const i = y * W + x;
        if (!ruinFree[i] || g.heights[i] !== level) continue;
        const dx = x - sx;
        const dy = y - sy;
        const u = (dx * ax + dy * ay) / major;
        const v = (-dx * ay + dy * ax) / minor;
        if (u * u + v * v <= 1) allowed[i] = 1;
      }
    const holes = 0.04 + 0.06 * o.rng.float();
    let tiles = growBlob(o.rng, allowed, W, H, s, Math.floor(size / (1 - holes)), 2);
    if (tiles.length < Math.max(10, Math.floor(size / 2))) {
      ruinFree[s] = 0;
      continue;
    }
    tiles = punchHoles(o.rng, tiles, W, holes);
    const got = o.scrapOf ? o.scrapOf(tiles, tallness) : Math.round(tiles.length * perColumn);
    fields.push({ tiles, tallness });
    left -= got;
    // take the field and a one-tile moat so fields never touch
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && xx < W && yy >= 0 && yy < H) ruinFree[yy * W + xx] = 0;
        }
      g.taken[i] = 1;
    }
    centres.push(centreOf(tiles, W));
  }
  return { fields, scrap: scrap - left };
}

// -------------------------------------------------------------------------------------- mine sites

export interface MineSpot {
  /** The rotated footprint's south-west corner, as a map object's placement. */
  x: number;
  y: number;
  orientation: Orientation;
  tiles: [number, number][];
  /** The colony walks to its ring without player stairs. */
  reachable: boolean;
}

export interface MineGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** Tiles a mine site may not take: water and its flood margin, rivers, other objects, the start's
   *  zone, the map's border and kept ground. */
  blocked: Uint8Array;
  /** Straight distance from the start's 3×3. */
  startDist: Float64Array;
  /** Walk regions (analysis/regions.ts `walkRegions`) and the start's region: a site whose level
   *  ring touches it is reachable. */
  regions?: Int32Array | null;
  root?: number;
}

/** A mine site (UndergroundRuins, 5×5) on flat free ground with a level ring round it, its nearest
 *  tile between `lo` and `hi` tiles from the start: at least `far` tiles out when the band has room
 *  there (the official maps' mine sites stand a median 95 tiles out, their nearest 61; a site on the
 *  band's edge is in the way of moving the start), and on ground the colony walks to when there is
 *  any at that distance.
 *  Null when nothing fits. `fits` is the caller's placement rule (objects.ts `fitProblems`). */
export function pickMineSite(m: MineGround, rng: Rng, band: { lo: number; hi: number; far?: number }, fits: (tiles: [number, number][]) => boolean): MineSpot | null {
  const { W, H, heights: h, blocked, startDist: sd } = m;
  const N = W * H;
  const orientation: Orientation = ORIENTATIONS[rng.int(0, 4)];
  const size = FOOTPRINTS.UndergroundRuins.size;
  const side = Math.max(size[0], size[1]) + 2;
  // the largest square of level, free tiles with its south-west corner at each tile
  const sq = new Int32Array(N);
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      if (blocked[i]) continue;
      if (x === W - 1 || y === H - 1) {
        sq[i] = 1;
        continue;
      }
      const a = i + 1;
      const c = i + W;
      const d = i + W + 1;
      if (h[a] !== h[i] || h[c] !== h[i] || h[d] !== h[i]) sq[i] = 1;
      else sq[i] = 1 + Math.min(sq[a], sq[c], sq[d]);
    }
  const reach = (x: number, y: number) => {
    // the ring round the footprint: the square's border tiles
    if (!m.regions || m.root === undefined || m.root < 0) return false;
    for (let k = 0; k < side; k++)
      for (const [tx, ty] of [
        [x - 1 + k, y - 1],
        [x - 1 + k, y - 2 + side],
        [x - 1, y - 1 + k],
        [x - 2 + side, y - 1 + k],
      ])
        if (tx >= 0 && ty >= 0 && tx < W && ty < H && m.regions[ty * W + tx] === m.root) return true;
    return false;
  };
  const near: number[] = [];
  const any: number[] = [];
  const far = band.far ?? band.lo;
  for (let y = 1; y + side <= H; y++)
    for (let x = 1; x + side <= W; x++) {
      const i = (y - 1) * W + (x - 1);
      if (sq[i] < side) continue;
      const d = sd[y * W + x];
      if (d < band.lo - side || d > band.hi + side) continue;
      (reach(x, y) ? near : any).push(y * W + x);
    }
  const beyond = (cands: number[]) => cands.filter((i) => sd[i] >= far);
  for (const [cands, reachable] of [
    [beyond(near), true],
    [beyond(any), false],
    [near, true],
    [any, false],
  ] as const) {
    for (let tries = 0; tries < 40 && cands.length; tries++) {
      const pick = cands[rng.int(0, cands.length)];
      const x = pick % W;
      const y = (pick - x) / W;
      const [cx, cy] = coordinatesForMinCorner(size[0], size[1], x, y, orientation);
      const tiles = footprintTiles("UndergroundRuins", { template: "UndergroundRuins", x: cx, y: cy, z: 0, orientation, flipped: false });
      let d = Infinity;
      for (const [tx, ty] of tiles) if (tx >= 0 && ty >= 0 && tx < W && ty < H) d = Math.min(d, sd[ty * W + tx]);
      if (d < band.lo || d > band.hi) continue;
      if (!fits(tiles)) continue;
      return { x, y, orientation, tiles, reachable };
    }
  }
  return null;
}

// ------------------------------------------------------------------------- one map, for places

export interface BaselineInput {
  ground: BaselineGround;
  settings: ResourceSettings;
  seed: number;
  /** The start's centre, and how far the colony walks from it to each tile (slopes allowed; null
   *  to leave the start requirements to the caller). */
  start?: { x: number; y: number } | null;
  walk?: Float64Array | null;
  /** What to grow within 20 tiles' walk of the start first (the start requirements, with a
   *  margin): starting wood in logs of grown trees (D164) and living berry bushes. */
  nearStart?: { wood: number; bushes: number };
  /** Ruins keep this far from the start (straight tiles). */
  ruinsClear?: number;
}

export interface BaselinePlan {
  /** Its seed: which living trees are saplings (`isYoungAt`). */
  seed: number;
  budget: ResourceBudget;
  groves: Grove[];
  patches: Patch[];
  fields: (RuinField & { columns: RuinColumns })[];
}

/** How far near-start resources may be walked to (the start requirements count 20, D85). */
export const NEAR_WALK = 20;

/** Whether the living tree on tile (x, y) is stored as a sapling, as the generator stores a share of
 *  them (FOREST.youngShare): its logs do not count as starting wood until it grows (D164). */
export function isYoungAt(seed: number, x: number, y: number): boolean {
  return tileHash01(hash32(seed, "resources", "young"), x, y) < FOREST.youngShare;
}

/** The starting wood a living tree of the near-start groves gives on average: its species' logs by
 *  the mix of pines, birches and oaks (living groves are never succulents), times the share grown. */
export function woodPerTree(mix: ResourceSettings["speciesMix"]): number {
  const w = mix.pine + mix.birch + mix.oak;
  const logs = w > 0 ? (mix.pine * TREE_LOGS.Pine + mix.birch * TREE_LOGS.Birch + mix.oak * TREE_LOGS.Oak) / w : TREE_LOGS.Pine;
  return logs * (1 - FOREST.youngShare);
}

/** Every resource on one map's ground, in the generator's order: ruin fields, bushes near the start,
 *  groves near the start, the other bushes, the other groves. Mine sites are map objects: place them
 *  first with `pickMineSite` and mark their tiles taken. */
export function planBaseline(inp: BaselineInput): BaselinePlan {
  const g = inp.ground;
  const { W, H } = g;
  const N = W * H;
  const budget = resourceBudget(W, H, inp.settings, inp.seed);
  const rng = stream(inp.seed, "resources", "place");
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = g.water[i] > 0 ? 1 : 0;
  const waterDist = distanceFrom(wet, W, H);
  let startDist: Float64Array | null = null;
  if (inp.start) {
    const m = new Uint8Array(N);
    for (let y = inp.start.y - 1; y <= inp.start.y + 1; y++) for (let x = inp.start.x - 1; x <= inp.start.x + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) m[y * W + x] = 1;
    startDist = distanceFrom(m, W, H);
  }
  const fieldRng = (tiles: number[]) => stream(inp.seed, "resources", "ruinField", tiles[0]);
  const ruins = planRuinFields(g, budget.scrap, {
    rng,
    startDist,
    minStart: inp.ruinsClear ?? 22,
    fieldMedian: density("ruin_field_columns", W * H),
    scrapOf: (tiles, t) => ruinColumns(tiles, W, fieldRng(tiles), t).scrap,
  });
  const fields = ruins.fields.map((f) => ({ ...f, columns: ruinColumns(f.tiles, W, fieldRng(f.tiles), f.tallness) }));
  let near: Uint8Array | null = null;
  if (inp.walk) {
    near = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (inp.walk[i] <= NEAR_WALK) near[i] = 1;
  }
  const patches: Patch[] = [];
  const groves: Grove[] = [];
  const centres: [number, number][] = [];
  const clearings = new Uint8Array(N);
  let bushes = 0;
  let living = 0;
  if (near && inp.nearStart) {
    for (const p of planPatches(g, inp.nearStart.bushes, { rng, within: near, waterDist, centres, size: Math.max(12, Math.ceil(inp.nearStart.bushes / 2)) })) {
      patches.push(p);
      bushes += p.tiles.length;
    }
    // groves until the grown trees within the walk give the starting wood asked for (D164)
    const size = Math.max(10, Math.ceil(inp.nearStart.wood / woodPerTree(inp.settings.speciesMix) / 3));
    let wood = 0;
    for (let k = 0; wood < inp.nearStart.wood && k < 40; k++) {
      const got = planGroves(g, { living: size, dry: 0 }, { rng, groveSize: inp.settings.groveSize, speciesMix: inp.settings.speciesMix, within: near, clearings, waterDist, size });
      if (!got.length) break;
      for (const gr of got) {
        groves.push(gr);
        living += gr.tiles.length;
        for (const i of gr.tiles) if (!isYoungAt(inp.seed, i % W, (i - (i % W)) / W)) wood += TREE_LOGS[gr.species] ?? 0;
      }
    }
  }
  for (const p of planPatches(g, budget.bushes - bushes, { rng, waterDist, centres })) patches.push(p);
  const moistFree = countMoistFree(g);
  const livingWant = Math.max(0, Math.min(budget.living - succulentsOf(budget, inp.settings), Math.floor(L.moistCover * moistFree)) - living);
  const dry = Math.max(0, budget.trees - living - livingWant);
  groves.push(...planGroves(g, { living: livingWant, dry }, { rng, groveSize: inp.settings.groveSize, speciesMix: inp.settings.speciesMix, clearings, waterDist }));
  return { seed: inp.seed, budget, groves, patches, fields };
}

/** The succulents a budget's trees hold by the species mix (they live on dry ground). */
export function succulentsOf(b: ResourceBudget, s: ResourceSettings): number {
  const m = s.speciesMix;
  const total = m.pine + m.birch + m.oak + m.succulent;
  return total > 0 ? Math.round((b.trees * m.succulent) / total) : 0;
}

function countMoistFree(g: BaselineGround): number {
  let n = 0;
  for (let i = 0; i < g.W * g.H; i++) if (freeAt(g, i) && moistAt(g, i)) n++;
  return n;
}

/** A plan's trees, bushes and ruin columns as map entities (format/entities.ts), with ids hashed
 *  from `owner`, the template and the tile: living trees where the soil is moist, a share of them
 *  saplings (`isYoungAt`), dead ones on dry soil (succulents alive on dry soil only), every bush
 *  ripe. */
export function baselineEntities(plan: BaselinePlan, g: Pick<BaselineGround, "W" | "moisture" | "soilContamination" | "water">, heights: ArrayLike<number>, owner: string): EntitySpec[] {
  const W = g.W;
  const at = (i: number, template: string) => ({ id: entityId(owner, template, i), owner, x: i % W, y: (i - (i % W)) / W, z: heights[i] });
  const out: EntitySpec[] = [];
  for (const p of plan.patches) for (const i of p.tiles) out.push(bush({ ...at(i, "BlueberryBush"), ripe: true }));
  for (const gr of plan.groves)
    for (const i of gr.tiles) {
      const moist = g.moisture[i] > 0 && !(g.soilContamination[i] > 0);
      const x = i % W;
      const y = (i - x) / W;
      const growth = isYoungAt(plan.seed, x, y) ? Math.round((0.2 + 0.75 * tileHash01(hash32(plan.seed, "resources", "growth"), x, y)) * 1000) / 1000 : 1;
      if (gr.species === "Succulent") {
        if (moist) continue;
        out.push(tree({ ...at(i, "Succulent"), species: "Succulent", growth }));
      } else out.push(tree({ ...at(i, gr.species), species: gr.species, dead: !moist, ...(moist ? { growth } : {}) }));
    }
  for (const f of plan.fields)
    f.tiles.forEach((i, k) => {
      const h = f.columns.storeys[k];
      out.push(ruin({ ...at(i, `RuinColumnH${h}`), height: h, variant: f.columns.variants[k], orientation: f.columns.orientations[k] }));
    });
  return out;
}
