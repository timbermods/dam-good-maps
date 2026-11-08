// The game's still films drawn back from the shore (Q9 V3, investigation/notes/water_and_soil.md): its water's vertex
// shader (Timberborn 1.1.2.8, PhysicalWaterURP_Opaque's ForwardLit vs 381-395, added at vs 486; its Low quality's
// program is the same, so every look draws it) moves a shore vertex of a still film toward its own tile's middle. A
// vertex is a shore vertex where a side of its tile at it has no linked neighbour (a dry tile: a neighbour is linked when
// it has water; the map's edge, which our section meets, counts as linked here). An edge's middle vertices move straight
// in, across their side, by 0.15 tile; a corner moves across its one open side by 0.15, or, both its sides open, along
// its diagonal by twice 0.15 (0.21 a side); a corner whose two sides are linked stays. The shift is × saturate(2 − 20 d)
// × max(0, 1 − 100 |f|): d the water's depth over its column's floor (whole to 0.05 deep, gone from 0.1), f the flow
// the vertex averages (Q9 V1: outflow ÷ 14; gone from |f| 0.01). So a still film's outline at a shore stands up to 0.15
// tile inside its tiles, the dry ground showing between.
//
// Ours: the mesh (waterMesh.ts) gives each corner of a film's top, and of the curtains hanging from it, its shift ×
// the depth's share (`wshore`, map axes); the water's vertex shader takes the flow's share from the flow texture at
// the corner (`SHORE_FILM_VERTEX_GLSL`), so a flow changing needs no new mesh. Only the water on its tiles' tops (the
// open sky's layer, the terrain's per-tile water byte), whose depth is read as that byte has it (light.ts `waterByte`,
// 60 steps a level), so the terrain shader, which draws the bed under the water, draws the ground the film draws back
// from as dry ground on exactly the same outline (`SHORE_FILM_TERRAIN_GLSL`). Our mesh has a tile's four corners, the
// game's sixteen vertices: a straight shore is the game's, a corner with both sides open is cut a little deeper (its
// sides meet the corner's 0.21 in a straight line, where the game's middle vertices keep 0.15). Only drawn: picking,
// the editing aids and every operation read the map's water, never this outline.

import { WATER_BYTE_FINE, WATER_BYTE_STEPS } from "./light";

export const SHORE_FILM = {
  /** How far a shore vertex moves across its open side (tiles), and along its diagonal with both sides open, × √2. */
  shift: 0.15,
  /** The depth share: saturate(a − b × depth), whole to 0.05 deep, gone from 0.1. */
  depth: [2, 20] as const,
  /** The flow share: max(0, 1 − k × |f|), gone from |f| 0.01 (an outflow of 0.14). */
  flow: 100,
} as const;

/** A tile's water depth as the terrain's water byte reads it back (light.ts `waterByte`: rounded up to a sixtieth, the
 *  deep bytes past three levels). */
export function byteDepth(depth: number): number {
  const fine = 1 + Math.ceil(depth * WATER_BYTE_STEPS - 1e-9);
  return fine <= WATER_BYTE_FINE ? (fine - 1) / WATER_BYTE_STEPS : 3;
}

/** The depth's share of the shift at a column's depth (as its byte reads it). */
export function filmDepthShare(depth: number): number {
  const d = byteDepth(depth);
  return Math.max(0, Math.min(1, SHORE_FILM.depth[0] - SHORE_FILM.depth[1] * d));
}

/** The flow's share of the shift at a flow of size `f` (the game's, outflow ÷ 14). */
export function filmFlowShare(f: number): number {
  return Math.max(0, 1 - SHORE_FILM.flow * Math.abs(f));
}

/** A corner's whole shift (map axes x, y; tiles), its tile's sides at it open or not: `sx`, `sy` the corner's way out of
 *  its tile (±1), `openX` the side across x (toward x + sx), `openY` across y. */
export function cornerShift(sx: number, sy: number, openX: boolean, openY: boolean): [number, number] {
  const s = SHORE_FILM.shift;
  if (openX && openY) return [-sx * s * Math.SQRT2, -sy * s * Math.SQRT2];
  if (openX) return [-sx * s, 0];
  if (openY) return [0, -sy * s];
  return [0, 0];
}

/** The flow's share at a point of the water's vertex (tiles: the map's x, y), from the flow texture (`flowTex`, its RG
 *  the game's flow as high/bake.ts `flowByte` packs it), read at the tile corner it stands at, so a corner's tiles
 *  all move it alike. GLSL, for the water's vertex shader (after `flowTex` and `mapSize`). */
export const SHORE_FILM_VERTEX_GLSL = /* glsl */ `
  float shoreFilmFlow(vec2 g) {
    vec2 e = (texture2D(flowTex, floor(g + 0.5) / mapSize).rg * 255.0 - 128.0) / 127.0;
    return max(0.0, 1.0 - ${SHORE_FILM.flow.toFixed(1)} * length(e * abs(e)));
  }
`;

/** The terrain's side (materials.ts, a top's soil): how much of a point of tile `t` lies under its water's drawn top,
 *  1 inside, 0 on the ground a still film draws back from (the same outline the mesh and the vertex shader give it:
 *  its four corners moved, the quad between them). `depth` its water's depth as its byte reads it, `open` its sides
 *  east, west, north, south (x + 1, x − 1, y + 1, y − 1) dry, `flow` the flow's share at its corners (0,0), (1,0), (1,1),
 *  (0,1), `fr` the point in the tile, `px` a pixel's width (tiles), over which the edge softens. GLSL. */
export const SHORE_FILM_TERRAIN_GLSL = /* glsl */ `
  vec2 shoreFilmCorner(vec2 c, vec4 open, float share) {
    vec2 s = c * 2.0 - 1.0;
    float ox = c.x > 0.5 ? open.x : open.y;
    float oy = c.y > 0.5 ? open.z : open.w;
    vec2 m = ox > 0.5 && oy > 0.5 ? -s * ${(SHORE_FILM.shift * Math.SQRT2).toFixed(6)} : ox > 0.5 ? vec2(-s.x * ${SHORE_FILM.shift.toFixed(2)}, 0.0) : oy > 0.5 ? vec2(0.0, -s.y * ${SHORE_FILM.shift.toFixed(2)}) : vec2(0.0);
    return c + m * share;
  }
  float shoreFilmEdge(vec2 a, vec2 b, vec2 p) {
    vec2 e = b - a;
    return (e.x * (p.y - a.y) - e.y * (p.x - a.x)) / max(length(e), 1e-5);
  }
  float shoreFilmInside(float depth, vec4 open, vec4 flow, vec2 fr, float px) {
    float share = clamp(${SHORE_FILM.depth[0].toFixed(1)} - ${SHORE_FILM.depth[1].toFixed(1)} * depth, 0.0, 1.0);
    if (share <= 0.0 || dot(open, vec4(1.0)) < 0.5) return 1.0;
    vec2 p0 = shoreFilmCorner(vec2(0.0, 0.0), open, share * flow.x);
    vec2 p1 = shoreFilmCorner(vec2(1.0, 0.0), open, share * flow.y);
    vec2 p2 = shoreFilmCorner(vec2(1.0, 1.0), open, share * flow.z);
    vec2 p3 = shoreFilmCorner(vec2(0.0, 1.0), open, share * flow.w);
    float d = min(min(shoreFilmEdge(p0, p1, fr), shoreFilmEdge(p1, p2, fr)), min(shoreFilmEdge(p2, p3, fr), shoreFilmEdge(p3, p0, fr)));
    return smoothstep(0.0, px, d);
  }
`;
