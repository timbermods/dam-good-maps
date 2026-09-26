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
  const norm = 2 / Math.PI;
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const h = heights[y * W + x];
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
      out[y * W + x] = Math.round(255 * Math.max(0, 1 - (occ / SKY_DIRS.length) * 0.9));
    }
  }
}

/** Extra height that objects add to the shadow casters of their tile (trees, ruins, the start). */
export function objectCasters(W: number, H: number, e: EntityView | null): Float32Array | null {
  if (!e || !e.count) return null;
  const out = new Float32Array(W * H);
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
    if (add > out[i]) out[i] = add;
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
 *  just those, with the same arithmetic as the whole map. */
export function shadowTopsInto(out: Float32Array, W: number, H: number, heights: Uint8Array, casters: Float32Array | null, elevation: number, sx0: number, sx1: number, sy0: number, sy1: number): void {
  const R = SHADOW_RES;
  const SW = W * R;
  const SH = H * R;
  // the sun is toward (−x, +y): the sample the light comes through is one west and one north
  const drop = (Math.SQRT2 / R) * Math.tan(elevation);
  const occ = (sx: number, sy: number): number => {
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

/** How far (in samples) a change of height reaches through the shadows: the tallest step a map
 *  can have (22 levels and an object on it), divided by how fast the lowest sun's shadow falls. */
export function shadowReach(): number {
  const drop = (Math.SQRT2 / SHADOW_RES) * Math.tan(LIGHT.sunElevation - LIGHT.penumbra);
  return Math.ceil(30 / drop) + 2;
}

/** The two shadow tops (the sun a little higher and lower) of the whole map. */
export function shadowTopsPair(W: number, H: number, heights: Uint8Array, casters: Float32Array | null): { hi: Float32Array; lo: Float32Array } {
  return { hi: shadowTops(W, H, heights, casters, LIGHT.sunElevation + LIGHT.penumbra), lo: shadowTops(W, H, heights, casters, LIGHT.sunElevation - LIGHT.penumbra) };
}

/** Redo the tops of a pair round tiles that changed (x0…x1 × y0…y1), and write their bytes into
 *  the shadow map `bytes` (RGBA per sample). Equal to baking the whole map again. */
export function shadowPairRect(tops: { hi: Float32Array; lo: Float32Array }, bytes: Uint8Array, W: number, H: number, heights: Uint8Array, casters: Float32Array | null, x0: number, y0: number, x1: number, y1: number): void {
  const R = SHADOW_RES;
  const reach = shadowReach();
  const sx0 = R * x0;
  const sx1 = R * (x1 + 1) + reach;
  const sy0 = R * y0 - reach;
  const sy1 = R * (y1 + 1);
  shadowTopsInto(tops.hi, W, H, heights, casters, LIGHT.sunElevation + LIGHT.penumbra, sx0, sx1, sy0, sy1);
  shadowTopsInto(tops.lo, W, H, heights, casters, LIGHT.sunElevation - LIGHT.penumbra, sx0, sx1, sy0, sy1);
  const SW = W * R;
  const SH = H * R;
  for (let sy = Math.max(0, sy0); sy <= Math.min(SH - 1, sy1); sy++)
    for (let sx = Math.max(0, sx0); sx <= Math.min(SW - 1, sx1); sx++) {
      const k = sy * SW + sx;
      bytes[k * 4] = encodeTop(tops.hi[k]);
      bytes[k * 4 + 1] = encodeTop(tops.lo[k]);
      bytes[k * 4 + 3] = 255;
    }
}

/** The shadow map as RGBA bytes (W·R × H·R): R the shadow top with the sun a little higher, G a
 *  little lower (the penumbra between them). */
export function shadowMap(W: number, H: number, heights: Uint8Array, casters: Float32Array | null, keep?: { hi: Float32Array; lo: Float32Array }): Uint8Array {
  const { hi, lo } = shadowTopsPair(W, H, heights, casters);
  if (keep) {
    keep.hi = hi;
    keep.lo = lo;
  }
  const out = new Uint8Array(hi.length * 4);
  for (let k = 0; k < hi.length; k++) {
    out[k * 4] = encodeTop(hi[k]);
    out[k * 4 + 1] = encodeTop(lo[k]);
    out[k * 4 + 3] = 255;
  }
  return out;
}

/** How lit a point at height z is, 0–1, from its shadow sample (the shader's rule). */
export function litFraction(z: number, topHigh: number, topLow: number): number {
  const span = Math.max(0.05, topLow - topHigh);
  return Math.max(0, Math.min(1, (z - topHigh) / span));
}

/** Water over a tile's top as a byte: 0 dry, else 1 + depth × 60 (to 255). */
export function waterByte(sw: SurfaceWater | null, heights: Uint8Array, i: number): number {
  if (!sw) return 0;
  const s = sw.surface[i];
  if (!(s === s)) return 0;
  if (sw.floor[i] < heights[i] - 0.01) return 0; // water in a cave under the top
  return Math.min(255, 1 + Math.round(sw.depth[i] * 60));
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
