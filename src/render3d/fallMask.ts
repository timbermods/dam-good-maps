// The game's waterfall mask (Q9 P1, investigation/notes/water_and_soil.md), worked out from our water as the game works
// it out from its own, and read by the water's shaders in the looks that follow the game's high-quality water (Standard
// and High; the light look, as the game's Low quality, has none).
//
// The game (Timberborn 1.1.2.8) makes it only with high-quality water (`WaterQualitySetting.HighQualityWaterEnabled`,
// the Medium preset and up): its `WaterColumnPostprocessor` compute shader's `FindWaterfalls` kernel, after
// `CalculateHeights` (both read from `resources.assets`, disassembled; numbers only). Per tile and stacked column it
// reads the sixteen heights of the tile's water mesh (four by four: its edge vertices take a linked neighbour's surface,
// its inner ones the higher of its own and a linked neighbour's less 0.3, none under its own) and keeps
// smoothstep(0.35, 0.6, max(highest − lowest, highest − its own surface)). Every vertex is at least its own surface, so
// that is how far the highest linked neighbour's surface stands over its own (fallSlope.ts `tileRise`): the mask lies
// on the tile a fall lands in, the water below the step, whose slope the fall is, whole from a step of 0.6. A
// neighbour is linked when it has water (and their columns overlap, which on our ground they always do); a corner
// neighbour only where both tiles between are linked to both (`BreakCornerLinks`, `BreakCornerLinksReversed`: read
// again 2026-11-08, they keep a corner link only where the corner's tile has links to both tiles between). The pixel shader (ps 148-276) reads it in four taps round the pixel, ±0.075 tile, each weighted
// by its distance to the nearest tile corner and left out where its tile has no water, and sharpens it,
// w = saturate(m + smoothstep(0, 0.5, m)). w takes off the refraction (P2) and the camera highlight (P12) and moves the
// see-through from `_TransparencyDepth` 0.35 to `_TransparencyWaterfallDepth` 0.2 (ps 883-884).
//
// Ours rides the water's flow texture's A (high/bake.ts `bakeFlow`, stillFlow.ts): 0 a dry tile, 1 + 254 × the mask a
// wet one, so a tap knows a dry tile as the game's does.

import type { SurfaceWater } from "./model";
import { tileRise } from "./fallSlope";

export const FALL_MASK = {
  /** The step over which the mask rises from none to whole (levels): FindWaterfalls' smoothstep. */
  from: 0.35,
  to: 0.6,
  /** The pixel shader's taps round the pixel (tiles). */
  tap: 0.075,
} as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The mask of each tile, 0–1 (0 on a dry tile): how far its highest linked neighbour's surface stands over its own,
 *  through FindWaterfalls' smoothstep. */
export function fallMask(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth">): Float32Array {
  const { surface, depth } = sw;
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (surface[i] === surface[i] && depth[i] > 0) out[i] = smooth(FALL_MASK.from, FALL_MASK.to, tileRise(W, H, sw, x, y));
    }
  return out;
}

/** The mask as the flow texture's A carries it: 0 a dry tile, 1 + 254 × the mask a wet one. */
export function fallBytes(W: number, H: number, sw: Pick<SurfaceWater, "surface" | "depth">): Uint8Array {
  const m = fallMask(W, H, sw);
  const out = new Uint8Array(W * H);
  const { surface, depth } = sw;
  for (let i = 0; i < W * H; i++) out[i] = surface[i] === surface[i] && depth[i] > 0 ? 1 + Math.round(254 * m[i]) : 0;
  return out;
}

/** The mask at a point (tiles, x east and y south as the map's), as the pixel shader reads it (`FALL_MASK_GLSL`): four
 *  taps ±0.075 round it, weighted by their distance to the nearest tile corner, dry tiles left out, then sharpened. */
export function fallMaskAt(W: number, H: number, bytes: ArrayLike<number>, x: number, y: number): number {
  const cx = Math.round(x);
  const cy = Math.round(y);
  let m = 0;
  let sum = 0;
  for (const [sx, sy] of [[1, 1], [-1, -1], [-1, 1], [1, -1]]) {
    const px = x + sx * FALL_MASK.tap;
    const py = y + sy * FALL_MASK.tap;
    const tx = Math.floor(px);
    const ty = Math.floor(py);
    const b = tx >= 0 && ty >= 0 && tx < W && ty < H ? bytes[ty * W + tx] : 0;
    if (b < 0.5) continue;
    const w = Math.abs(px - cx) * Math.abs(py - cy);
    m += w * ((b - 1) / 254);
    sum += w;
  }
  m = sum > 0 ? m / sum : 0;
  const t = Math.min(1, 2 * m);
  return Math.min(1, m + t * t * (3 - 2 * t));
}

/** The mask in GLSL, for the water's shaders (after `flowTex` and `mapSize`): `waterFallMask(g)` at a point g (tiles),
 *  as `fallMaskAt`. */
export const FALL_MASK_GLSL = /* glsl */ `
  float waterFallMask(vec2 g) {
    vec2 c = floor(g + 0.5);
    float m = 0.0;
    float sum = 0.0;
    for (int k = 0; k < 4; k++) {
      vec2 s = k == 0 ? vec2(1.0, 1.0) : k == 1 ? vec2(-1.0, -1.0) : k == 2 ? vec2(-1.0, 1.0) : vec2(1.0, -1.0);
      vec2 p = g + s * ${FALL_MASK.tap};
      float b = texture2D(flowTex, (floor(p) + 0.5) / mapSize).a * 255.0;
      if (b < 0.5) continue;
      vec2 d = abs(p - c);
      float w = d.x * d.y;
      m += w * (b - 1.0) / 254.0;
      sum += w;
    }
    m = sum > 0.0 ? m / sum : 0.0;
    float t = min(1.0, 2.0 * m);
    return min(1.0, m + t * t * (3.0 - 2.0 * t));
  }
`;
