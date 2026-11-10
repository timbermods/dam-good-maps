// The water's depth as the game reads it (Q9 P3, investigation/notes/water_and_soil.md; the water-character audit's gap
// 7): its water's pixel shader (Timberborn 1.1.2.8, PhysicalWaterURP_Opaque's ForwardLit ps 315-347; its Low quality's
// program reads it the same way, from `_CameraDepthTexture`) takes the gap between the water and what lies behind it in
// the depth buffer, along the view: the eye-space distance between them, × the view's sine (|the ray's y|), saturated
// at `_MaxDepth` 5. So the depth it colours a pixel by (P4's ramp) and lets the ground show through by (P13) is what the
// view sees under the surface, not the column's: at a bank that faces the camera (the far bank) the thing behind the
// water is that bank's wall, and the depth falls to 0 at its foot over a band about depth ÷ tan(pitch) wide (0.7 tile a
// level at the game's 55°); at the near bank the view passes over the bank and down to the floor, so the water is at
// full depth right up to its edge; along a bank parallel to the view, the floor. The band swaps sides as the camera
// turns, and a step down in the bed shows as a lighter band before the wall where the bed rises toward the camera.
//
// Ours: the depth buffer of the game's opaque scene is the terrain (and objects; ours leave objects out), and the
// terrain is the tiles' columns with vertical walls, so the shader walks the view's ray down from the surface, tile by
// tile, through the tiles' tops (the tile texture's heights) until it meets the ground: a wall where it enters a tile
// below that tile's top, else the top inside it; its own tile's floor is its column's (the water mesh's `wcut.x`).
// With terrain above terrain (`CAVES`) a cell of air under a roof is no ground. The walk stops at `VIEW_DEPTH.max`
// levels down (the game's `_MaxDepth`: deeper reads as 5), or after `VIEW_DEPTH.steps` tiles (a view so low it would go
// on further reads the drop it has reached). The depth is the drop to that point. (The game's eye-space gap × its sine
// is the drop × the ray's share along the camera's forward axis, 1 at the middle of the screen and less toward its
// edges; ours leaves that share out: our camera's 40° field is wider than the game's, 31° to 37° (Q8), so the share
// would be smaller here than the game's at the same place on screen, and the pixel judge read clean water lighter
// than the game's by it, RMS 3.4 → 4.3.) A camera straight down (the top view, orthographic) sees the column. One walk a pixel of water's top, in every look (the
// light look as the game's Low quality, which reads the same depth: it shows no ground through it, but colours by it).
//
// `viewDepth` is the shader's walk in plain code (no caves), for the tests (tests/unit/viewDepth.test.ts).

export const VIEW_DEPTH = {
  /** The deepest the walk reads (levels): the game's `_MaxDepth`, where its depth saturates. */
  max: 5,
  /** The most tiles it crosses: at the game's 55° five levels' drop is 3.5 tiles, about six tiles' crossings. */
  steps: 16,
} as const;

/** The depth the game reads at a point of a water's top (`g` its map position in tiles, x east, y north; `y` its level;
 *  `floor` its own column's floor), seen along `ray` (map axes: x, y, and up, from the camera toward the point; any
 *  length), over ground whose tops are `heights` (W × H, a tile's top level; off the map, the nearest edge tile's). */
export function viewDepth(W: number, H: number, heights: ArrayLike<number>, g: readonly [number, number], y: number, floor: number, ray: readonly [number, number, number]): number {
  const len = Math.hypot(ray[0], ray[1], ray[2]);
  const down = -ray[2] / len;
  const hx = ray[0] / len;
  const hy = ray[1] / len;
  const hl = Math.hypot(hx, hy);
  const max = VIEW_DEPTH.max;
  if (down <= 0 || hl < 1e-5) return Math.min(y - floor, max);
  const top = (tx: number, ty: number) => heights[Math.min(H - 1, Math.max(0, ty)) * W + Math.min(W - 1, Math.max(0, tx))];
  const dx = hx / hl;
  const dy = hy / hl;
  // the drop per tile across, and the walk's state: the tile, the distance across to its next x and y sides
  const s = down / hl;
  let tx = Math.floor(g[0]);
  let ty = Math.floor(g[1]);
  const sx = dx >= 0 ? 1 : -1;
  const sy = dy >= 0 ? 1 : -1;
  const ix = Math.abs(dx) > 1e-6 ? 1 / Math.abs(dx) : Infinity;
  const iy = Math.abs(dy) > 1e-6 ? 1 / Math.abs(dy) : Infinity;
  let mx = (dx >= 0 ? tx + 1 - g[0] : g[0] - tx) * ix;
  let my = (dy >= 0 ? ty + 1 - g[1] : g[1] - ty) * iy;
  let yIn = y;
  let ground = floor;
  for (let k = 0; k < VIEW_DEPTH.steps; k++) {
    const out = Math.min(mx, my);
    const yOut = y - s * out;
    if (yOut < ground) return Math.min(y - Math.min(yIn, ground), max);
    if (y - yOut >= max) return max;
    if (mx < my) {
      tx += sx;
      mx += ix;
    } else {
      ty += sy;
      my += iy;
    }
    yIn = yOut;
    ground = top(tx, ty);
  }
  return Math.min(y - yIn, max);
}

function f(v: number): string {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}

/** The walk in GLSL, for the water's fragment shader (after the scene's uniforms, and with `CAVES` after the light
 *  volume's `roofedAir`): `waterViewDepth(g, y, floor)` at a point of a water's top (`g` map tiles, `y` its level,
 *  `floor` its column's), from the camera (`cameraPosition`, `viewMatrix`, `isOrthographic`, three.js's). */
export const VIEW_DEPTH_GLSL = /* glsl */ `
  /** The level the ground's top stands at in a tile (off the map, the nearest edge tile's). */
  float viewGroundTop(vec2 t) {
    t = clamp(t, vec2(0.0), mapSize - 1.0);
    return floor(texture2D(tileTex, (t + 0.5) / mapSize).r * 255.0 + 0.5);
  }
  /** The ground the ray meets in a tile it crosses from level yIn down to yOut: the top of the highest solid cell it
   *  reaches (with terrain above terrain, a cell of air under a roof is none), or far below where it meets none. */
  float viewGroundIn(vec2 t, float yIn, float yOut) {
    float h = viewGroundTop(t);
    #ifdef CAVES
      if (h <= yOut) return h;
      float l = min(floor(yIn), h - 1.0);
      for (int k = 0; k < 6; k++) {
        if (l < floor(yOut)) return -1e4;
        if (l < 0.0) return 0.0;
        if (!roofedAir(vec3(t, l))) return l + 1.0;
        l -= 1.0;
      }
      return -1e4;
    #else
      return h;
    #endif
  }
  float waterViewDepth(vec2 g, float y, float fl) {
    vec3 F = -normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    vec3 r = isOrthographic ? F : normalize(vec3(g.x, y, -g.y) - cameraPosition);
    float down = -r.y;
    vec2 hz = vec2(r.x, -r.z);
    float hl = length(hz);
    if (down <= 0.0 || hl < 0.00001) return min(y - fl, ${f(VIEW_DEPTH.max)});
    vec2 dir = hz / hl;
    float s = down / hl;
    vec2 t = floor(g);
    vec2 st = vec2(dir.x >= 0.0 ? 1.0 : -1.0, dir.y >= 0.0 ? 1.0 : -1.0);
    vec2 inv = vec2(abs(dir.x) > 0.000001 ? 1.0 / abs(dir.x) : 1e9, abs(dir.y) > 0.000001 ? 1.0 / abs(dir.y) : 1e9);
    vec2 m = vec2(dir.x >= 0.0 ? t.x + 1.0 - g.x : g.x - t.x, dir.y >= 0.0 ? t.y + 1.0 - g.y : g.y - t.y) * inv;
    float yIn = y;
    float ground = fl;
    for (int k = 0; k < ${VIEW_DEPTH.steps}; k++) {
      float yOut = y - s * min(m.x, m.y);
      if (k > 0) ground = viewGroundIn(t, yIn, yOut);
      if (yOut < ground) return min(y - min(yIn, ground), ${f(VIEW_DEPTH.max)});
      if (y - yOut >= ${f(VIEW_DEPTH.max)}) return ${f(VIEW_DEPTH.max)};
      if (m.x < m.y) {
        t.x += st.x;
        m.x += inv.x;
      } else {
        t.y += st.y;
        m.y += inv.y;
      }
      yIn = yOut;
    }
    return min(y - yIn, ${f(VIEW_DEPTH.max)});
  }
`;
