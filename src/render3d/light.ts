// Light baked when the mesh is built (ROADMAP "Map look", D86): per-tile data for the terrain
// shader (height, soil, sky visibility, water over the top) and a soft sun-shadow map. Pure
// TypeScript and deterministic: the same map always bakes the same bytes.
//
// - Sky visibility (broad ambient occlusion): how much of the sky a tile's top sees, from the
//   highest ground within 5 tiles in 8 directions. The bottom of a gorge sees less sky.
// - Sun shadows: the sun shines from the north-west. A sweep from the sun's side carries the top
//   of the shadow volume across the map (`shadowTops`): a point is in shadow when it lies below
//   it. Two sweeps with the sun a little higher and lower give the penumbra, so shadows are soft
//   and widen with the distance from what casts them. Trees and ruins cast shadows too.
// - Contact shadows at the foot of walls are drawn by the shader from the tile data (the heights
//   of the neighbours next to each point), so they stay sharp at every zoom.
// All of this is the light of open air. A face whose air is under a roof (a cave, an overhang, an
// arch) takes that air's own light instead, from the light volume (caveLight.ts).

import { DEAD, YOUNG, type EntityView, type SoilView, type SurfaceWater } from "./model";
import { LIGHT } from "./palette";

/** Shadow samples per tile, along each axis. */
export const SHADOW_RES = 2;

/** Shadow-top heights are stored as bytes: (top + 2) × 9, so −2 to 26.3 levels at 0.11 steps. */
export const SHADOW_SCALE = 9;
export const SHADOW_OFFSET = 2;

export function encodeTop(t: number): number {
  return Math.max(0, Math.min(255, Math.round((t + SHADOW_OFFSET) * SHADOW_SCALE)));
}

export function decodeTop(b: number): number {
  return b / SHADOW_SCALE - SHADOW_OFFSET;
}

const SKY_DIRS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const SKY_STEPS = [1, 2, 3, 5];

/** Sky visibility per tile, 0–255 (255: the whole sky). */
export function skyVisibility(W: number, H: number, heights: Uint8Array): Uint8Array {
  const out = new Uint8Array(W * H);
  skyVisibilityRect(W, H, heights, out, 0, 0, W - 1, H - 1);
  return out;
}

/** How far a tile's sky reaches: a change of height moves the sky of the tiles this far round it. */
export const SKY_REACH = SKY_STEPS[SKY_STEPS.length - 1];

/** Sky visibility of the tiles of a rectangle, into `out` (the terrain changed there: live
 *  editing redoes only the tiles round what a brush changed). */
export function skyVisibilityRect(W: number, H: number, heights: Uint8Array, out: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) out[y * W + x] = skyAt(W, H, heights, x, y, heights[y * W + x]);
}

/** The sky a point of tile (x, y) at height h sees, 0–255 (on the tile's top, its sky visibility; higher
 *  up, over a drop, more of the sky). */
export function skyAt(W: number, H: number, heights: Uint8Array, x: number, y: number, h: number): number {
  const norm = 2 / Math.PI;
  let occ = 0;
  for (const [dx, dy] of SKY_DIRS) {
    const len = dx && dy ? Math.SQRT2 : 1;
    let best = 0;
    for (const k of SKY_STEPS) {
      const xx = x + dx * k;
      const yy = y + dy * k;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
      const s = (heights[yy * W + xx] - h) / (k * len);
      if (s > best) best = s;
    }
    occ += Math.atan(best) * norm;
  }
  // the horizon's angle averaged over the directions; walls hide the sky's low part only
  return Math.round(255 * Math.max(0, 1 - (occ / SKY_DIRS.length) * 0.9));
}

/** The level each tile's tallest caster stands on (`objectCasters`' arrays): on a tile with terrain above terrain, the
 *  run whose top it stands on casts it (a tree on a cave's floor casts from the floor, not the roof). */
const casterLevels = new WeakMap<Float32Array, Uint8Array>();

/** The run top a tile's caster stands on (null: not known, the column's highest). */
function casterLevel(casters: Float32Array, i: number): number | null {
  const levels = casterLevels.get(casters);
  return levels ? levels[i] : null;
}

/** Extra height that objects add to the shadow casters of their tile (trees, ruins, the start). */
export function objectCasters(W: number, H: number, e: EntityView | null): Float32Array | null {
  if (!e || !e.count) return null;
  const out = new Float32Array(W * H);
  const levels = new Uint8Array(W * H);
  casterLevels.set(out, levels);
  const tall: Record<string, number> = { Pine: 1.35, Oak: 1.2, Birch: 1.15, Succulent: 0.5, StartingLocation: 2.2 };
  for (let k = 0; k < e.count; k++) {
    const t = e.templates[e.template[k]];
    const x = e.x[k];
    const y = e.y[k];
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    let add = tall[t] ?? 0;
    const ruin = /^RuinColumnH(\d)$/.exec(t);
    if (ruin) add = Number(ruin[1]) * 0.85;
    if (!add) continue;
    const f = e.flags[k];
    if (f & DEAD) add *= t === "StartingLocation" ? 1 : 0.35;
    if (f & YOUNG) add *= 0.5;
    const i = y * W + x;
    if (add > out[i]) {
      out[i] = add;
      levels[i] = Math.max(0, e.z[k]);
    }
  }
  return out;
}

/** The top of the shadow volume at each shadow sample (W·R × H·R, row-major from the south-west),
 *  for the sun at `elevation`: a point at height z is lit when z is at or above it. */
export function shadowTops(W: number, H: number, heights: Uint8Array, casters: Float32Array | null, elevation: number): Float32Array {
  const out = new Float32Array(W * SHADOW_RES * H * SHADOW_RES);
  shadowTopsInto(out, W, H, heights, casters, elevation, 0, W * SHADOW_RES - 1, 0, H * SHADOW_RES - 1);
  return out;
}

/** The shadow tops of the samples sx0…sx1 × sy0…sy1, into `out` (the whole map's tops, the rest
 *  already right). A top depends only on the samples to its north-west, so the tops that change
 *  when some tiles do lie south-east of them, within `shadowReach` samples: live editing redoes
 *  just those, with the same arithmetic as the whole map. With `rock` (terrain above terrain), a tile that is not
 *  one plain run casts here only its run on the map's floor; its runs above air are added by `voxelTop`. */
export function shadowTopsInto(out: Float32Array, W: number, H: number, heights: Uint8Array, casters: Float32Array | null, elevation: number, sx0: number, sx1: number, sy0: number, sy1: number, rock: ShadowRock | null = null): void {
  const R = SHADOW_RES;
  const SW = W * R;
  const SH = H * R;
  // the sun is toward (−x, +y): the sample the light comes through is one west and one north
  const drop = (Math.SQRT2 / R) * Math.tan(elevation);
  const occ = rock
    ? (sx: number, sy: number): number => {
        const i = Math.floor(sy / R) * W + Math.floor(sx / R);
        if (!rock.flag[i]) return heights[i] + (casters ? casters[i] : 0);
        // (an object on the run from the map's floor casts from it)
        return rock.bottom[i] + (casters && casters[i] && casterLevel(casters, i) === rock.bottom[i] ? casters[i] : 0);
      }
    : (sx: number, sy: number): number => {
        const i = Math.floor(sy / R) * W + Math.floor(sx / R);
        return heights[i] + (casters ? casters[i] : 0);
      };
  for (let sx = Math.max(0, sx0); sx <= Math.min(SW - 1, sx1); sx++) {
    for (let sy = Math.max(0, sy0); sy <= Math.min(SH - 1, sy1); sy++) {
      if (sx === 0 || sy === SH - 1) {
        out[sy * SW + sx] = -SHADOW_OFFSET;
        continue;
      }
      const up = (sy + 1) * SW + sx - 1;
      const top = Math.max(occ(sx - 1, sy + 1), out[up]) - drop;
      out[sy * SW + sx] = top;
    }
  }
}

/** The rock that casts the baked shadows on a map with terrain above terrain (3D view, item 8): for each tile that
 *  is not one plain run from z = 0, the top of its run on the map's floor (0 when air is at its bottom) and its runs
 *  above air (bottom, top). The sweep carries the rock from the floor as it carries a plain tile's height; the runs
 *  above air cast shadows of their own, with gaps between them the sun shines through (under an overhang, through
 *  an arch). Null on a map without terrain above terrain: the shadows are the heightfield's, byte for byte. */
export interface ShadowRock {
  /** 1 on the tiles that are not one plain run from z = 0. */
  readonly flag: Uint8Array;
  /** On those tiles, the top of the run standing on the map's floor (0: air at the bottom). */
  readonly bottom: Uint8Array;
  /** On those tiles, where their runs above air start in `runs` and how many there are. */
  readonly first: Int32Array;
  readonly count: Uint8Array;
  /** The runs above air: bottom and top levels, in order up each column. */
  readonly runs: Uint8Array;
  /** The tiles. */
  readonly tiles: readonly number[];
  /** How many of those tiles lie at or before each tile ((W + 1) × (H + 1) sums of `flag`): whether a ray's samples
   *  can cross any, in one look. */
  readonly sums: Int32Array;
}

const rockCache = new WeakMap<ReadonlyMap<number, Uint8Array>, ShadowRock>();

/** The shadows' rock of a terrain's columns (kept for the same columns), or null when there are none. */
export function shadowRock(W: number, H: number, columns: ReadonlyMap<number, Uint8Array>): ShadowRock | null {
  if (!columns.size) return null;
  const had = rockCache.get(columns);
  if (had && had.flag.length === W * H) return had;
  const flag = new Uint8Array(W * H);
  const bottom = new Uint8Array(W * H);
  const first = new Int32Array(W * H);
  const count = new Uint8Array(W * H);
  const runs: number[] = [];
  for (const [i, c] of columns) {
    flag[i] = 1;
    let z = 0;
    while (z < c.length && c[z]) z++;
    bottom[i] = z;
    first[i] = runs.length;
    while (z < c.length) {
      while (z < c.length && !c[z]) z++;
      if (z >= c.length) break;
      const lo = z;
      while (z < c.length && c[z]) z++;
      runs.push(lo, z);
    }
    count[i] = (runs.length - first[i]) / 2;
  }
  const sums = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) sums[(y + 1) * (W + 1) + x + 1] = flag[y * W + x] + sums[y * (W + 1) + x + 1] + sums[(y + 1) * (W + 1) + x] - sums[y * (W + 1) + x];
  const rock: ShadowRock = { flag, bottom, first, count, runs: Uint8Array.from(runs), tiles: [...columns.keys()], sums };
  rockCache.set(columns, rock);
  return rock;
}

// scratch for the runs above air along a sample's ray (bottom, top pairs), one list for each sun
let spansHi = new Float64Array(64);
let spansLo = new Float64Array(64);

/** Of the shadow's pieces (the sweep's top `base`, the rock from the floor up, and the `n` / 2 runs above air in
 *  `spans`), the top the ground at `h` takes: the piece it lies in gives its top; ground lit through a gap takes the
 *  top of the highest piece below it. */
function pieceTop(spans: Float64Array, n: number, base: number, h: number): number {
  let top = base;
  for (;;) {
    let grown = false;
    let next = Infinity;
    for (let k = 0; k < n; k += 2) {
      if (spans[k + 1] <= top) continue;
      if (spans[k] <= top) {
        top = spans[k + 1];
        grown = true;
      } else if (spans[k] < next) next = spans[k];
    }
    if (grown) continue;
    // the piece ends at top: the ground lies in it, or above it in a gap (lit up to the next piece)
    if (h < top || next === Infinity || h < next) return top;
    // the next piece starts at or under the ground: carry on from it
    top = next;
    for (let k = 0; k < n; k += 2) if (spans[k] === next && spans[k + 1] > top) top = spans[k + 1];
  }
}

function grow(a: Float64Array) {
  const more = new Float64Array(a.length * 2);
  more.set(a);
  return more;
}

/** The two shadow tops (the sun a little higher and lower) a sample takes on a map with terrain above terrain, into
 *  `out`: the sweep's tops (the rock from the floor up) with the runs above air upstream of the sample, each lowered
 *  as the sweep lowers a height, judged at the sample's own ground `h` (`pieceTop`). `bound`: no run above air (with
 *  its objects) reaches higher. */
function voxelTops(out: Float64Array, sx: number, sy: number, baseHi: number, baseLo: number, h: number, W: number, SH: number, rock: ShadowRock, casters: Float32Array | null, dropHi: number, dropLo: number, bound: number): void {
  out[0] = baseHi;
  out[1] = baseLo;
  // (most samples' rays cross no tile with terrain above terrain before they clear it: one look at the sums of the
  // tiles the ray's samples lie in; two samples a tile)
  const J = Math.min(sx, SH - 1 - sy, Math.floor(Math.max((bound - baseHi) / dropHi, (bound - baseLo) / dropLo)));
  if (J < 1) return;
  const S = rock.sums;
  const W1 = W + 1;
  const tx0 = (sx - J) >> 1;
  const tx1 = ((sx - 1) >> 1) + 1;
  const ty0 = (sy + 1) >> 1;
  const ty1 = ((sy + J) >> 1) + 1;
  if (S[ty1 * W1 + tx1] - S[ty0 * W1 + tx1] - S[ty1 * W1 + tx0] + S[ty0 * W1 + tx0] === 0) return;
  const { flag, first, count, runs } = rock;
  const levels = casters ? casterLevels.get(casters) : undefined;
  let nHi = 0;
  let nLo = 0;
  for (let j = 1; j <= J; j++) {
    const i = ((sy + j) >> 1) * W + ((sx - j) >> 1);
    if (!flag[i]) continue;
    const fallHi = j * dropHi;
    const fallLo = j * dropLo;
    const r0 = first[i];
    const r1 = r0 + 2 * count[i];
    for (let k = r0; k < r1; k += 2) {
      const lo = runs[k];
      // (an object casts from the run it stands on: the one whose top is its level, or, not known, the highest)
      const on = levels ? runs[k + 1] === levels[i] : k === r1 - 2;
      const hi = runs[k + 1] + (casters !== null && on ? casters[i] : 0);
      if (hi - fallHi > baseHi) {
        if (nHi + 2 > spansHi.length) spansHi = grow(spansHi);
        spansHi[nHi++] = lo - fallHi;
        spansHi[nHi++] = hi - fallHi;
      }
      if (hi - fallLo > baseLo) {
        if (nLo + 2 > spansLo.length) spansLo = grow(spansLo);
        spansLo[nLo++] = lo - fallLo;
        spansLo[nLo++] = hi - fallLo;
      }
    }
  }
  if (nHi) out[0] = pieceTop(spansHi, nHi, baseHi, h);
  if (nLo) out[1] = pieceTop(spansLo, nLo, baseLo, h);
}

/** At least the highest any run above air reaches, with the objects standing on it: rays need not look further. */
function rockBound(rock: ShadowRock, casters: Float32Array | null): number {
  let bound = -SHADOW_OFFSET;
  for (const i of rock.tiles) {
    if (!rock.count[i]) continue;
    bound = Math.max(bound, rock.runs[rock.first[i] + 2 * rock.count[i] - 1] + (casters ? casters[i] : 0));
  }
  return bound;
}

/** The shadow map's bytes of samples sx0…sx1 × sy0…sy1 from the sweep's tops (with the rock above air when there
 *  is any). `kept`: the sweep's tops before an edit of heights alone (the rock and the objects as they were) and the
 *  tiles it changed: a sample outside them whose tops did not move keeps its bytes (they depend on nothing else). */
function shadowBytes(tops: { hi: Float32Array; lo: Float32Array }, bytes: Uint8Array, W: number, H: number, heights: Uint8Array, casters: Float32Array | null, rock: ShadowRock | null, sx0: number, sx1: number, sy0: number, sy1: number, kept?: { hi: Float32Array; lo: Float32Array; x0: number; y0: number; x1: number; y1: number }): void {
  const R = SHADOW_RES;
  const SW = W * R;
  const SH = H * R;
  const dropHi = (Math.SQRT2 / R) * Math.tan(LIGHT.sunElevation + LIGHT.penumbra);
  const dropLo = (Math.SQRT2 / R) * Math.tan(LIGHT.sunElevation - LIGHT.penumbra);
  const bound = rock ? rockBound(rock, casters) : 0;
  const two = new Float64Array(2);
  for (let sy = Math.max(0, sy0); sy <= Math.min(SH - 1, sy1); sy++)
    for (let sx = Math.max(0, sx0); sx <= Math.min(SW - 1, sx1); sx++) {
      const k = sy * SW + sx;
      let hi = tops.hi[k];
      let lo = tops.lo[k];
      if (kept) {
        const o = (sy - sy0) * (sx1 - sx0 + 1) + sx - sx0;
        const tx = Math.floor(sx / R);
        const ty = Math.floor(sy / R);
        if (kept.hi[o] === hi && kept.lo[o] === lo && (tx < kept.x0 || tx > kept.x1 || ty < kept.y0 || ty > kept.y1)) continue;
      }
      if (rock && sx > 0 && sy < SH - 1) {
        // (a tile with terrain above terrain is judged at its lowest floor, the level its cave or overhang opens onto
        // the ground beside it: the shadow map is filtered across the line, so the two agree there; its roof's top,
        // above that floor's piece of shadow or in the sun, comes out lit as before)
        const i = Math.floor(sy / R) * W + Math.floor(sx / R);
        const h = rock.flag[i] ? rock.bottom[i] : heights[i];
        voxelTops(two, sx, sy, hi, lo, h, W, SH, rock, casters, dropHi, dropLo, bound);
        hi = two[0];
        lo = two[1];
      }
      bytes[k * 4] = encodeTop(hi);
      bytes[k * 4 + 1] = encodeTop(lo);
      bytes[k * 4 + 3] = 255;
    }
}

/** How far (in samples) a change of height reaches through the shadows: the tallest step a map
 *  can have (22 levels and an object on it), divided by how fast the lowest sun's shadow falls. */
export function shadowReach(): number {
  const drop = (Math.SQRT2 / SHADOW_RES) * Math.tan(LIGHT.sunElevation - LIGHT.penumbra);
  return Math.ceil(30 / drop) + 2;
}

/** The two shadow tops (the sun a little higher and lower) of the whole map (with `rock`, the sweep's: the runs above
 *  air are added as the bytes are written). */
export function shadowTopsPair(W: number, H: number, heights: Uint8Array, casters: Float32Array | null, rock: ShadowRock | null = null): { hi: Float32Array; lo: Float32Array } {
  const tops = (elevation: number) => {
    const out = new Float32Array(W * SHADOW_RES * H * SHADOW_RES);
    shadowTopsInto(out, W, H, heights, casters, elevation, 0, W * SHADOW_RES - 1, 0, H * SHADOW_RES - 1, rock);
    return out;
  };
  return { hi: tops(LIGHT.sunElevation + LIGHT.penumbra), lo: tops(LIGHT.sunElevation - LIGHT.penumbra) };
}

/** The shadow map's samples `shadowPairRect` redoes for tiles x0…x1 × y0…y1 (unclipped): the
 *  shadows they cast reach south-east of them. */
export function shadowPairArea(x0: number, y0: number, x1: number, y1: number): { sx0: number; sy0: number; sx1: number; sy1: number } {
  const R = SHADOW_RES;
  const reach = shadowReach();
  return { sx0: R * x0, sx1: R * (x1 + 1) + reach, sy0: R * y0 - reach, sy1: R * (y1 + 1) };
}

/** The side of the blocks of tiles `castersChangedRects` gathers changed casters by. */
const CASTER_BLOCK = 8;

/** The tiles whose casters differ between `a` and `b` (no casters: none anywhere), as rectangles to redo the shadows
 *  round: `shadowPairRect` on each of them, in any order, gives the bytes of baking the whole map again (a sample a
 *  change reaches lies in that change's rectangle's area, and each area is redone from the samples north-west of it).
 *  The changed tiles of each block of CASTER_BLOCK² tiles, or their one bounding rectangle where that redoes fewer
 *  samples: plants drowned here and there across a map redo their own shadows, not the map's. Null when none differ. */
export function castersChangedRects(W: number, H: number, a: Float32Array | null, b: Float32Array | null): { x0: number; y0: number; x1: number; y1: number }[] | null {
  if (!a && !b) return null;
  const B = CASTER_BLOCK;
  const bw = Math.ceil(W / B);
  const blocks = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  const all = { x0: W, y0: H, x1: -1, y1: -1 };
  for (let i = 0; i < W * H; i++) {
    if ((a ? a[i] : 0) === (b ? b[i] : 0)) continue;
    const x = i % W;
    const y = (i - x) / W;
    const k = Math.floor(y / B) * bw + Math.floor(x / B);
    const r = blocks.get(k);
    if (r) {
      r.x0 = Math.min(r.x0, x);
      r.x1 = Math.max(r.x1, x);
      r.y0 = Math.min(r.y0, y);
      r.y1 = Math.max(r.y1, y);
    } else blocks.set(k, { x0: x, y0: y, x1: x, y1: y });
    all.x0 = Math.min(all.x0, x);
    all.x1 = Math.max(all.x1, x);
    all.y0 = Math.min(all.y0, y);
    all.y1 = Math.max(all.y1, y);
  }
  if (!blocks.size) return null;
  // (the samples a rectangle redoes, on the map)
  const SW = W * SHADOW_RES;
  const SH = H * SHADOW_RES;
  const cost = (r: { x0: number; y0: number; x1: number; y1: number }) => {
    const p = shadowPairArea(r.x0, r.y0, r.x1, r.y1);
    return Math.max(0, Math.min(SW - 1, p.sx1) - Math.max(0, p.sx0) + 1) * Math.max(0, Math.min(SH - 1, p.sy1) - Math.max(0, p.sy0) + 1);
  };
  const rects = [...blocks.values()];
  let sum = 0;
  for (const r of rects) sum += cost(r);
  return sum < cost(all) ? rects : [all];
}

/** Redo the tops of a pair round tiles that changed (x0…x1 × y0…y1), and write their bytes into
 *  the shadow map `bytes` (RGBA per sample). Equal to baking the whole map again. `rock`: the map's
 *  terrain above terrain (`shadowRock`), whose runs above air cast shadows with gaps under them. */
export function shadowPairRect(tops: { hi: Float32Array; lo: Float32Array }, bytes: Uint8Array, W: number, H: number, heights: Uint8Array, casters: Float32Array | null, x0: number, y0: number, x1: number, y1: number, rock: ShadowRock | null = null, heightsOnly = false): void {
  const { sx0, sy0, sx1, sy1 } = shadowPairArea(x0, y0, x1, y1);
  // (with terrain above terrain, after an edit of heights alone (`heightsOnly`: the same rock and objects), the
  // tops before it: the samples whose tops stay keep their bytes)
  let kept: { hi: Float32Array; lo: Float32Array; x0: number; y0: number; x1: number; y1: number } | undefined;
  if (rock && heightsOnly) {
    const SW = W * SHADOW_RES;
    const ax0 = Math.max(0, sx0);
    const ax1 = Math.min(SW - 1, sx1);
    const ay0 = Math.max(0, sy0);
    const ay1 = Math.min(H * SHADOW_RES - 1, sy1);
    const w = ax1 - ax0 + 1;
    if (w > 0 && ay1 >= ay0) {
      kept = { hi: new Float32Array(w * (ay1 - ay0 + 1)), lo: new Float32Array(w * (ay1 - ay0 + 1)), x0, y0, x1, y1 };
      for (let sy = ay0; sy <= ay1; sy++) {
        kept.hi.set(tops.hi.subarray(sy * SW + ax0, sy * SW + ax1 + 1), (sy - ay0) * w);
        kept.lo.set(tops.lo.subarray(sy * SW + ax0, sy * SW + ax1 + 1), (sy - ay0) * w);
      }
    }
    shadowTopsInto(tops.hi, W, H, heights, casters, LIGHT.sunElevation + LIGHT.penumbra, sx0, sx1, sy0, sy1, rock);
    shadowTopsInto(tops.lo, W, H, heights, casters, LIGHT.sunElevation - LIGHT.penumbra, sx0, sx1, sy0, sy1, rock);
    if (kept) shadowBytes(tops, bytes, W, H, heights, casters, rock, ax0, ax1, ay0, ay1, kept);
    return;
  }
  shadowTopsInto(tops.hi, W, H, heights, casters, LIGHT.sunElevation + LIGHT.penumbra, sx0, sx1, sy0, sy1, rock);
  shadowTopsInto(tops.lo, W, H, heights, casters, LIGHT.sunElevation - LIGHT.penumbra, sx0, sx1, sy0, sy1, rock);
  shadowBytes(tops, bytes, W, H, heights, casters, rock, sx0, sx1, sy0, sy1);
}

/** The shadow map as RGBA bytes (W·R × H·R): R the shadow top with the sun a little higher, G a
 *  little lower (the penumbra between them). `rock` as for `shadowPairRect`. */
export function shadowMap(W: number, H: number, heights: Uint8Array, casters: Float32Array | null, keep?: { hi: Float32Array; lo: Float32Array }, rock: ShadowRock | null = null): Uint8Array {
  const tops = shadowTopsPair(W, H, heights, casters, rock);
  if (keep) {
    keep.hi = tops.hi;
    keep.lo = tops.lo;
  }
  const out = new Uint8Array(tops.hi.length * 4);
  shadowBytes(tops, out, W, H, heights, casters, rock, 0, W * SHADOW_RES - 1, 0, H * SHADOW_RES - 1);
  return out;
}

/** How lit a point at height z is, 0–1, from its shadow sample (the shader's rule). */
export function litFraction(z: number, topHigh: number, topLow: number): number {
  const span = Math.max(0.05, topLow - topHigh);
  return Math.max(0, Math.min(1, (z - topHigh) / span));
}

/** The water byte's steps a level of depth to three levels deep (`waterByte`; the terrain shader reads the depth back
 *  from it). */
export const WATER_BYTE_STEPS = 60;
/** The water byte's last value in steps (three levels deep); above it, a byte is whole levels (`waterByte`). */
export const WATER_BYTE_FINE = 1 + 3 * WATER_BYTE_STEPS;

/** Water over a tile's top as a byte: 0 dry; to three levels deep 1 + depth × 60 rounded up; deeper (a dammed reservoir, an
 *  imported map's) 178 + K, its surface at most K + 0.05 over the top and more than K − 0.95 (K from 4 to 77). So the
 *  terrain shader knows exactly whether a layer cut takes the water's surface away (the water's shader cuts it at the
 *  cut's 0.05), however deep the water: `soilOf`. */
export function waterByte(sw: SurfaceWater | null, heights: Uint8Array, i: number): number {
  if (!sw) return 0;
  const s = sw.surface[i];
  if (!(s === s)) return 0;
  if (sw.floor[i] < heights[i] - 0.01) return 0; // water in a cave under the top
  const depth = sw.depth[i];
  // (rounded up, a hair's tolerance for the product's own rounding: a surface more than 0.05 over the cut, which 3/60
  // is exactly, never reads as at or under it)
  const fine = 1 + Math.ceil(depth * WATER_BYTE_STEPS - 1e-9);
  if (fine <= WATER_BYTE_FINE) return fine;
  return Math.min(255, Math.max(WATER_BYTE_FINE, WATER_BYTE_FINE - 3 + Math.ceil(depth - 0.05)));
}

/** Soil bytes as the tile data's two nibbles: moisture (levels 1–15, 0 dry) above contamination
 *  (1–15, 0 clean). Any moisture or contamination stays above 0. */
export function soilNibbles(moisture: number, contamination: number): number {
  const m = moisture > 0 ? Math.max(1, Math.min(15, Math.round(moisture / 15))) : 0;
  const c = contamination > 0 ? Math.max(1, Math.min(15, Math.round(contamination / 17))) : 0;
  return (m << 4) | c;
}

/** The terrain shader's per-tile data, RGBA bytes (W × H): R the height, G the soil nibbles,
 *  B the sky visibility, A the water over the top. */
export function tileData(W: number, H: number, heights: Uint8Array, sky: Uint8Array, soil: SoilView | null, sw: SurfaceWater | null, into?: Uint8Array): Uint8Array {
  const N = W * H;
  const out = into ?? new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const o = i * 4;
    out[o] = heights[i];
    out[o + 1] = soil ? soilNibbles(soil.moisture[i], soil.contamination[i]) : 0;
    out[o + 2] = sky[i];
    out[o + 3] = waterByte(sw, heights, i);
  }
  return out;
}

/** The tile data of a rectangle's tiles only, into `out` (live editing). */
export function tileDataRect(W: number, H: number, heights: Uint8Array, sky: Uint8Array, soil: SoilView | null, sw: SurfaceWater | null, out: Uint8Array, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const i = y * W + x;
      const o = i * 4;
      out[o] = heights[i];
      out[o + 1] = soil ? soilNibbles(soil.moisture[i], soil.contamination[i]) : 0;
      out[o + 2] = sky[i];
      out[o + 3] = waterByte(sw, heights, i);
    }
}

/** `soilNibbles` of each moisture byte (high nibble) and each contamination byte (low), for `tileDataChanges`. */
const NIBBLE_M = Uint8Array.from({ length: 256 }, (_, v) => soilNibbles(v, 0));
const NIBBLE_C = Uint8Array.from({ length: 256 }, (_, v) => soilNibbles(0, v));

/** A run of tiles in one row (x0…x1 of row y). */
export interface TileSpan {
  y: number;
  x0: number;
  x1: number;
}

/** What `tileDataChanges` rewrote: the runs of tiles whose bytes changed, row by row, and the runs where a tile became
 *  or stopped being wet or contaminated (the contamination outline reads only those two). */
export interface TileChanges {
  rows: TileSpan[];
  edgeRows: TileSpan[];
}

/** Brings the tile data `out` up to the map as it stands, writing only the tiles whose bytes differ from what `tileData`
 *  gives (so `out` ends exactly as a whole `tileData`), and says where. A tile's bytes depend on that tile alone, so the
 *  changed ones are found by comparing, whatever came before: a water update, new soil, or both. The cheap path for the
 *  frequent update (moving water changes a few tiles; the whole map's bytes are neither rewritten nor uploaded). */
export function tileDataChanges(W: number, H: number, heights: Uint8Array, sky: Uint8Array, soil: SoilView | null, sw: SurfaceWater | null, out: Uint8Array): TileChanges {
  const rows: TileSpan[] = [];
  const edgeRows: TileSpan[] = [];
  const moisture = soil?.moisture;
  const contamination = soil?.contamination;
  const surface = sw?.surface;
  for (let y = 0; y < H; y++) {
    let lo = -1;
    let hi = -1;
    let elo = -1;
    let ehi = -1;
    for (let x = 0, i = y * W; x < W; x++, i++) {
      const o = i * 4;
      // (the same values as `soilNibbles` and `waterByte`, the dry tile and the plain soil without a call)
      const g = moisture ? NIBBLE_M[moisture[i]] | NIBBLE_C[contamination![i]] : 0;
      const a = surface && surface[i] === surface[i] ? waterByte(sw, heights, i) : 0;
      const og = out[o + 1];
      const oa = out[o + 3];
      if (out[o] === heights[i] && og === g && out[o + 2] === sky[i] && oa === a) continue;
      out[o] = heights[i];
      out[o + 1] = g;
      out[o + 2] = sky[i];
      out[o + 3] = a;
      if (lo < 0) lo = x;
      hi = x;
      if (((og & 15) > 0) !== ((g & 15) > 0) || oa > 0 !== a > 0) {
        if (elo < 0) elo = x;
        ehi = x;
      }
    }
    if (lo >= 0) rows.push({ y, x0: lo, x1: hi });
    if (elo >= 0) edgeRows.push({ y, x0: elo, x1: ehi });
  }
  return { rows, edgeRows };
}
