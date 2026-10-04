// Waterfalls with shape and volume (Map look, PLAN §20 D201). Where water pours over a lip into
// lower water, it leaves the lip and arcs outward and down as a curved translucent ribbon with
// thickness, and lands in the pool below:
// - the ribbon's outer face is a parabola from the lip (level there, as water leaving a brink) to
//   the landing; its inner face runs a lip's depth inside it, thinning as the water falls;
// - the arc reaches further out for stronger flow and taller falls (`fallReach`);
// - whitewater where it lands (D215: more of it): a splash churning on the pool from the foot of
//   the cliff out past the impact line, and a crown of whitewater billowing up along the impact
//   line, bigger for stronger and taller falls, in the landing zone only; soft white water (D222),
//   never cells of dark water that read as cracked tiles; the water shader draws a line of foam
//   along the lip's brink (waterMesh.ts `LIP_BITS`);
// - a stepped cascade is a fall at every step, each with its own lip and splash;
// - one continuous sheet (D215): lips side by side pouring into the same water share their corners,
//   so a wide fall is one ribbon; where the lip turns a corner (an L-shaped lip, or a staircase of
//   them) the two sides' ribbons meet on the corner's diagonal, the ribbon running on round an
//   outer corner and stopping short at an inner one (a mitre, `END`), so no gap opens between them
//   as they arc out; only a free end is closed (the thickness shows) and frays.
//
// The flow at the lip: the simulation's own outflow over that side, which every water view carries
// (current.ts, D353; tests/contract/fallOutflow.test.ts pins every lip to the settle, the map's edge
// included). Water with no outflows (a force's own water while it plays) is estimated instead: at a
// drop the simulation empties the lip tile every substep, so the water pouring over a side per second
// is the lip's depth over the substep (sim/water.ts DT), shared among the sides it flows out of by
// their head (within a few per cent of the simulation's own outflow at most falls; it gives the map's
// edge no share, so a lip pouring off the map was drawn far too strong, M9b's finding).
//
// Cheap on 256² maps with many falls: each fall is one instance (16 floats) of a small shared
// template (`fallTemplate`), which the vertex shader bends into the arc (materials.ts
// `fallMaterial`); the water mesher lists a chunk's falls when it meshes the chunk's water, so only
// changed chunks are listed again, and nothing is rebuilt per frame. From afar (a tile under
// FALL_NEAR_PX pixels) a fall is a single sheet with its splash; the light look always draws that.
//
// Pure TypeScript, no three.js.

import { DT } from "../core/sim/water";
import type { SurfaceWater } from "./model";

/** A drop at least this tall into lower water is a fall (a smaller step is a curtain). */
export const FALL_MIN = 0.3;
/** Water within this of another's surface is the same water (waterMesh.ts SAME_WATER). */
const SAME_WATER = 0.35;

/** The arc's shape: the reach before its soft limit is `reach` · flow^flowPower · drop^dropPower
 *  tiles; it never passes `limit` tiles (or twice that where the pool goes on past the landing
 *  tile), nor falls below `least`. The ribbon is the lip's depth thick (`thickness` bounds it, and
 *  never more than `ofDrop` of the drop), thinning by `thinning` of it as it falls. A free end of the
 *  lip stands `inset` in from the tile's corner, and up to `narrow` more for a thin trickle (a
 *  one-wide lip carrying little water is a narrow stream). */
export const FALL_SHAPE = {
  reach: 0.55,
  flowPower: 0.7,
  dropPower: 0.45,
  limit: 1.1,
  least: 0.05,
  thickness: [0.06, 0.45] as readonly [number, number],
  ofDrop: 0.8,
  thinning: 0.4,
  inset: 0.03,
  narrow: 0.25,
  /** The ribbon stands this far off the cliff's face. */
  off: 0.015,
} as const;

/** The whitewater where a fall lands (D215: more of it). The splash on the pool reaches a spread of
 *  `base` + `reach` · (the fall's reach) + `drop` · (the drop, counted to 6 levels) tiles out past
 *  the impact line (never past its room, `edge` short of it), back to the foot of the cliff, and
 *  `side` past a free end of the lip (`back` from the cliff's face). The crown billowing up along
 *  the impact line reaches `crown[0]` + `crown[1]` · (the fall's strength) + `crown[2]` · (the drop,
 *  counted to 8 levels) tiles either side of it (at most `crown[3]`; `crownTrickle` of that for a
 *  trickle; never behind the cliff or past the pool) and `crownTall` times that high, never more
 *  than `crownOfDrop` of the drop. (The strength is the square root of the flow, within 0.25 to
 *  1.6, as the shader has it.) Soft white water (D222): past the white core the splash is a froth
 *  whose density eases from `frothFloor` to full over the noise's `froth` range, so it is denser
 *  and thinner in soft patches and never opens into cells of dark water (they read as cracked
 *  tiles); it thins only as it drifts out. */
export const FALL_SPLASH = {
  base: 0.7,
  reach: 0.6,
  drop: 0.09,
  side: 0.35,
  edge: 0.04,
  back: 0.03,
  crown: [0.14, 0.14, 0.035, 0.6] as readonly number[],
  crownTrickle: 0.55,
  crownTall: 1.25,
  crownOfDrop: 0.6,
  froth: [0.15, 0.85] as readonly number[],
  frothFloor: 0.6,
} as const;

/** Below this many pixels a tile, a fall is drawn as a single sheet (and its splash). */
export const FALL_NEAR_PX = 6;

/** Segments along the arc, near and far, and round the crown. The template spaces the arc's by the
 *  square of their share, so most bend the arc at the lip, where it turns. */
export const FALL_SEGMENTS = { near: 12, far: 4, crown: 6 } as const;

/** How each end of a lip goes on (D215): into the next lip along the same side (`joined`); free, the
 *  ribbon closed there (`free`); round an outer corner, where the same tile pours over the next side
 *  too, into the same water (`outward`: the ribbon runs on past the corner, as far as it has come out
 *  from the lip, and meets the next side's on the corner's diagonal); or round an inner corner,
 *  where the tile across it pours back into this lip's landing (`inward`: it stops short, on the
 *  diagonal, as far as it has come out, but never more than `inwardMost` of a tile, or `bothInward`
 *  where both ends turn inward, so a lip never folds over). */
export const END = { joined: 0, free: 1, outward: 2, inward: 3, inwardMost: 0.5, bothInward: 0.3 } as const;

/** Floats per fall instance:
 *  [0, 1] the lip edge's first corner (world X, Z); [2] its side (0 east, 1 west, 2 north, 3 south)
 *  + 4 × its first end + 16 × its second end (`END`); [3] the flow over it at its first corner
 *  (blocks a second per tile of edge); [4, 5] the lip's surface and [6, 7] the landing's at the two
 *  corners; [8, 9] the reach and [10, 11] the thickness at the two corners; [12, 13] the badwater
 *  share at the two corners; [14] its room at the first corner + 4 × at the second (`lipAt`);
 *  [15] the flow at its second
 *  corner. The second corner is the first plus the lip's `tangent`. Where two lips meet (straight on
 *  or round a corner) they share the corner's values: the reach and room the lesser of theirs (so
 *  neither overshoots its pool), the rest the mean. */
export const FALL_STRIDE = 16;

/** Sides as the water mesher numbers them: east, west, north (+y), south (−y), in tiles. */
const SX = [1, -1, 0, 0] as const;
const SY = [0, 0, 1, -1] as const;

/** The side facing (dx, dy), a step in tiles. */
function sideOf(dx: number, dy: number): number {
  return dx > 0 ? 0 : dx < 0 ? 1 : dy > 0 ? 2 : 3;
}

/** Along a lip on side k, in tiles: the direction from its first corner to its second (up × out,
 *  so every side's faces wind the same way). */
export function tangent(k: number): [number, number] {
  // out in the world (X, Z) is (SX, −SY), and Y × out = (outZ, −outX) = (−SY, −SX); in tiles
  // (X, −Z) that is (−SY, SX)
  return [-SY[k], SX[k]];
}

/** The first corner of side k of tile (x, y), in tiles (tile corner coordinates). */
export function firstCorner(x: number, y: number, k: number): [number, number] {
  const [tx, ty] = tangent(k);
  // the side's middle, less half the tangent
  return [x + 0.5 + SX[k] * 0.5 - tx * 0.5, y + 0.5 + SY[k] * 0.5 - ty * 0.5];
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The simulation's direction (current.ts's outflow order −y, −x, +y, +x) of each side k. */
const SIM_SIDE = [3, 1, 2, 0];

/** The water pouring over side k of tile i each second, per tile of edge (see the file comment):
 *  the simulation's own outflow over that side; without outflows, the tile's depth over the
 *  simulation's substep, shared among the sides it flows out of by their head (the neighbour's water
 *  surface, or its ground where dry; none where the neighbour's floor stands at the water's surface or
 *  above it; the map's edge counts for none). */
export function lipOutflow(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, x: number, y: number, k: number): number {
  const i = y * W + x;
  const s = sw.surface[i];
  if (!(s === s)) return 0;
  if (sw.outflow) return sw.top[i] >= 0 ? sw.outflow[sw.top[i] * 4 + SIM_SIDE[k]] : 0;
  let sum = 0;
  let mine = 0;
  for (let kk = 0; kk < 4; kk++) {
    const xx = x + SX[kk];
    const yy = y + SY[kk];
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const j = yy * W + xx;
    const ns = sw.surface[j];
    const wet = ns === ns;
    const floor = wet ? sw.floor[j] : heights[j];
    if (floor >= s) continue;
    const e = s - (wet ? ns : heights[j]);
    if (!(e > 0)) continue;
    sum += e;
    if (kk === k) mine = e;
  }
  return sum > 0 ? (sw.depth[i] / DT) * (mine / sum) : 0;
}

/** How far out (tiles) a fall of `drop` levels carrying `flow` lands: further for stronger flow and
 *  taller falls, softly limited so it lands in its pool (`room`: 1 tile, or 2 where the pool goes on
 *  past the landing tile). */
export function fallReach(flow: number, drop: number, room = 1): number {
  const S = FALL_SHAPE;
  const raw = S.reach * Math.pow(Math.max(0, flow), S.flowPower) * Math.pow(Math.max(0, drop), S.dropPower);
  const cap = S.limit * room;
  return Math.max(S.least, cap * (1 - Math.exp(-raw / cap)));
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A fall's whitewater where it lands, out from the lip edge in tiles, as the shader has it
 *  (materials.ts `fallMaterial`, `FALL_SPLASH`): the splash on the pool from `back` to `out` (its
 *  `spread` past the impact line, at `reach`), and the crown over the impact line, from `behind`
 *  toward the cliff to `ahead` out past it, and `tall` high. */
export function fallSplash(flow: number, drop: number, reach: number, room: number): { spread: number; back: number; out: number; behind: number; ahead: number; tall: number } {
  const S = FALL_SPLASH;
  const X = Math.max(reach, 1e-4);
  const h = Math.max(drop, 0.01);
  const strength = clamp(Math.sqrt(Math.max(0, flow)), 0.25, 1.6);
  const spread = S.base + S.reach * X + S.drop * Math.min(h, 6);
  const out = Math.max(S.back + 0.05, Math.min(room - S.edge, X + spread));
  const r = Math.min(S.crown[3], S.crown[0] + S.crown[1] * strength + S.crown[2] * Math.min(h, 8)) * (S.crownTrickle + (1 - S.crownTrickle) * smoothstep(0.05, 0.45, flow));
  return { spread, back: S.back, out, behind: Math.max(0, Math.min(r, X - S.back)), ahead: Math.max(0, Math.min(r, room - S.edge - X)), tall: Math.min(S.crownTall * r, S.crownOfDrop * h) };
}

/** The ribbon's thickness at the lip: the lip's depth, within bounds. */
export function fallThickness(depth: number, drop: number): number {
  const S = FALL_SHAPE;
  return Math.min(clamp(depth, S.thickness[0], S.thickness[1]), S.ofDrop * drop);
}

/** A point of the fall's arc, w from 0 (the lip) to 1 (the landing): [out, up], out from the lip's
 *  edge in tiles and up as a height; `inner` the inner face's (a thickness inside the outer one,
 *  thinning as it falls, never behind the cliff or below the landing). The outer face is the
 *  parabola up = top − (top − land) · w², out = reach · w: level at the lip, the water leaving the
 *  brink, and steeper as it falls. As the vertex shader (materials.ts `fallMaterial`) draws it. */
export function arcPoint(reach: number, top: number, land: number, thickness: number, w: number, inner = false): [number, number] {
  const h = Math.max(top - land, 0.01);
  let out = reach * w;
  let up = top - h * w * w;
  if (inner) {
    const tx = reach;
    const ty = -2 * h * w;
    const l = Math.hypot(tx, ty) || 1;
    // the outer face's normal, out and up: the tangent turned a quarter
    const nx = -ty / l;
    const ny = tx / l;
    const th = thickness * (1 - FALL_SHAPE.thinning * w);
    out = Math.max(0, out - nx * th);
    up = Math.max(land, up - ny * th);
  }
  return [out + FALL_SHAPE.off, up];
}

/** The length of the outer arc from the lip to w (tiles), for the streaks' flow down the fall. */
export function arcLength(reach: number, top: number, land: number, w: number): number {
  const h = Math.max(top - land, 0.01);
  const X = Math.max(reach, 1e-4);
  const r = Math.sqrt(X * X + 4 * h * h * w * w);
  return 0.5 * (w * r + ((X * X) / (2 * h)) * Math.asinh((2 * h * w) / X));
}

export interface Lip {
  top: number;
  land: number;
  flow: number;
  reach: number;
  thickness: number;
  bad: number;
  room: number;
  depth: number;
}

/** The fall over side k of tile (x, y), or null where none: its lip's surface, its landing's, the
 *  flow over it, its reach and thickness, its badwater share (blended, `bad`) and its room (out
 *  from the lip edge: 1 tile, 2 where the pool goes on past the landing tile, 3 where it goes on
 *  past the next too; the arc keeps within 2, the splash within all of it). */
export function lipAt(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, bad: Float32Array, x: number, y: number, k: number): Lip | null {
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const i = y * W + x;
  const top = sw.surface[i];
  if (!(top === top)) return null;
  const xx = x + SX[k];
  const yy = y + SY[k];
  if (xx < 0 || yy < 0 || xx >= W || yy >= H) return null;
  const land = sw.surface[yy * W + xx];
  if (!(land === land) || !(top - land >= FALL_MIN)) return null;
  // the pool goes on past the landing tile: the fall may reach a little further, and its splash
  // spread further still
  const same = (n: number) => {
    const x2 = xx + SX[k] * n;
    const y2 = yy + SY[k] * n;
    const s = x2 >= 0 && y2 >= 0 && x2 < W && y2 < H ? sw.surface[y2 * W + x2] : NaN;
    return s === s && Math.abs(s - land) <= SAME_WATER;
  };
  const room = same(1) ? (same(2) ? 3 : 2) : 1;
  const drop = top - land;
  const flow = lipOutflow(W, H, heights, sw, x, y, k);
  const depth = sw.depth[i];
  return { top, land, flow, reach: fallReach(flow, drop, Math.min(room, 2)), thickness: fallThickness(depth, drop), bad: bad[i], room, depth };
}

/** Whether two lips pour into the same water from the same water: one sheet. */
function joins(a: Lip, b: Lip | null): b is Lip {
  return !!b && Math.abs(a.top - b.top) <= SAME_WATER && Math.abs(a.land - b.land) <= SAME_WATER;
}

/** How the end of the lip over side k of tile (x, y) goes on (`END`), and the lip it meets there:
 *  at its second corner (s = 1) or its first (s = −1). Straight on, the next tile along the side
 *  pours the same way; round an outer corner, the same tile pours over the side that faces along
 *  the lip; round an inner corner, the tile diagonally across the corner pours back into this lip's
 *  landing tile. */
export function lipEnd(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, bad: Float32Array, x: number, y: number, k: number, s: 1 | -1, me: Lip): [number, Lip | null] {
  const [tx, ty] = tangent(k);
  const straight = lipAt(W, H, heights, sw, bad, x + s * tx, y + s * ty, k);
  if (joins(me, straight)) return [END.joined, straight];
  const outer = lipAt(W, H, heights, sw, bad, x, y, sideOf(s * tx, s * ty));
  if (joins(me, outer)) return [END.outward, outer];
  const inner = lipAt(W, H, heights, sw, bad, x + s * tx + SX[k], y + s * ty + SY[k], sideOf(-s * tx, -s * ty));
  if (joins(me, inner)) return [END.inward, inner];
  return [END.free, null];
}

/** Add the fall over side k of tile (x, y) to `out` (FALL_STRIDE floats); false where there is none.
 *  At a corner shared with another lip pouring into the same water (the next along the edge, or the
 *  one round the corner), the two share the corner's surfaces, reach, thickness, badwater share,
 *  flow and room, so the sheet runs on unbroken; elsewhere the corner is a free end. */
export function pushFall(out: number[], W: number, H: number, heights: Uint8Array, sw: SurfaceWater, bad: Float32Array, x: number, y: number, k: number): boolean {
  const me = lipAt(W, H, heights, sw, bad, x, y, k);
  if (!me) return false;
  const [ea, a] = lipEnd(W, H, heights, sw, bad, x, y, k, -1, me);
  const [eb, b] = lipEnd(W, H, heights, sw, bad, x, y, k, 1, me);
  const mean = (o: Lip | null, f: (l: Lip) => number) => (o ? (f(me) + f(o)) / 2 : f(me));
  const least = (o: Lip | null, f: (l: Lip) => number) => (o ? Math.min(f(me), f(o)) : f(me));
  const [cx, cy] = firstCorner(x, y, k);
  out.push(
    cx,
    -cy,
    k + 4 * ea + 16 * eb,
    mean(a, (l) => l.flow),
    mean(a, (l) => l.top),
    mean(b, (l) => l.top),
    mean(a, (l) => l.land),
    mean(b, (l) => l.land),
    least(a, (l) => l.reach),
    least(b, (l) => l.reach),
    mean(a, (l) => l.thickness),
    mean(b, (l) => l.thickness),
    mean(a, (l) => l.bad),
    mean(b, (l) => l.bad),
    least(a, (l) => l.room) + 4 * least(b, (l) => l.room),
    mean(b, (l) => l.flow),
  );
  return true;
}

/** A fall instance's ends and rooms, decoded: its side, how each end goes on (`END`) and the room
 *  at each corner. */
export function fallEnds(f: ArrayLike<number>): { side: number; ends: [number, number]; room: [number, number] } {
  const side = f[2] % 4;
  const ea = Math.floor(f[2] / 4) % 4;
  const eb = Math.floor(f[2] / 16);
  const rb = Math.floor(f[14] / 4);
  return { side, ends: [ea, eb], room: [f[14] - 4 * rb, rb] };
}

/** How far along the lip (tiles, from its first corner) its ribbon's end at u (0 or 1) stands when
 *  it has come `out` tiles from the lip: a free end stands `inset` in; round an outer corner it runs
 *  on by `out`, round an inner corner it stops short by `out` (up to `END.inwardMost`, or
 *  `END.bothInward` where both ends turn inward). As the vertex shader (materials.ts
 *  `fallMaterial`) places it. */
export function endAlong(ends: readonly [number, number], u: 0 | 1, out: number, inset: number = FALL_SHAPE.inset): number {
  const e = ends[u];
  const most = ends[0] === END.inward && ends[1] === END.inward ? END.bothInward : END.inwardMost;
  const run = e === END.outward ? out : e === END.inward ? -Math.min(out, most) : e === END.free ? -inset : 0;
  return u === 0 ? -run : 1 + run;
}

/** A point of a fall's outer or inner face in the world (X, Y, Z), at its end u (0 or 1) and w along
 *  the arc, as the vertex shader places it close up (a free end at its least inset): the lip's
 *  corner, along the lip to the end (`endAlong`), out along the arc (`arcPoint`). */
export function fallPoint(f: ArrayLike<number>, u: 0 | 1, w: number, inner = false): [number, number, number] {
  const { side, ends } = fallEnds(f);
  const reach = f[8 + u];
  const [out, up] = arcPoint(reach, f[4 + u], f[6 + u], f[10 + u], w, inner);
  const t = tangent(side);
  const along = endAlong(ends, u, out);
  // (in tiles: x east, y north; the world's Z is −y)
  const x = f[0] + t[0] * along + SX[side] * out;
  const y = -f[1] + t[1] * along + SY[side] * out;
  return [x, up, -y];
}

/** The shared template every fall bends (materials.ts `fallMaterial`): per vertex `rib` = (u across
 *  the lip, 0–1; w along the arc (round the crown), 0–1; 1 on the inner face or edge; kind), kind 0
 *  the ribbon's faces (close up), 1 and 2 its ends at u = 0 and 1 (close up, drawn at a free end
 *  only), 3 the single sheet from afar, 4 the splash on the pool (both), 5 the crown of whitewater
 *  along the impact line (close up). Triangles back to front as seen from outside the fall: the
 *  splash, the crown's back half, the inner face, the ends, the outer face, the crown's front half,
 *  then the far sheet; each face wound to face out of the ribbon. `layers` are those parts as runs
 *  of the index (start, count): the splash, the crown's back half, the ribbon, then the crown's
 *  front half with the far sheet. The renderer draws each layer for every fall of a chunk before
 *  the next (D222), so one tile's crown is never blended over its neighbour's ribbon, which showed
 *  as glassy panes along the foot of a fall. */
export function fallTemplate(): { rib: Float32Array; index: Uint16Array; layers: [number, number][] } {
  const rib: number[] = [];
  const index: number[] = [];
  const cuts: number[] = [0];
  let n = 0;
  const vert = (u: number, w: number, inner: number, kind: number) => {
    rib.push(u, w, inner, kind);
    return n++;
  };
  const ws = (segments: number) => Array.from({ length: segments + 1 }, (_, s) => (s / segments) ** 2);
  // (u, w) to the world winds inward (tangent × down the arc), so a face out of the ribbon takes
  // its corners (0,0), (0,1), (1,0)
  const strip = (a: number[], b: number[], out: boolean) => {
    for (let s = 0; s + 1 < a.length; s++) {
      if (out) index.push(a[s], a[s + 1], b[s], b[s], a[s + 1], b[s + 1]);
      else index.push(a[s], b[s], a[s + 1], b[s], b[s + 1], a[s + 1]);
    }
  };
  // the splash, facing up
  const s00 = vert(0, 0, 0, 4);
  const s10 = vert(1, 0, 0, 4);
  const s01 = vert(0, 1, 0, 4);
  const s11 = vert(1, 1, 0, 4);
  index.push(s00, s01, s10, s10, s01, s11);
  cuts.push(index.length);
  // the crown: an arch over the impact line, w from its foot toward the cliff (0) over its top
  // (0.5) to its foot out on the pool (1), facing out of the arch; its back half first
  const cn = FALL_SEGMENTS.crown;
  const half = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, s) => (from + s) / cn);
  const crown = (w: number[]) => strip(w.map((c) => vert(0, c, 0, 5)), w.map((c) => vert(1, c, 0, 5)), true);
  crown(half(0, cn / 2));
  cuts.push(index.length);
  const near = ws(FALL_SEGMENTS.near);
  // the inner face, facing the cliff
  strip(
    near.map((w) => vert(0, w, 1, 0)),
    near.map((w) => vert(1, w, 1, 0)),
    false,
  );
  // the ends: at u = 0 facing back along the lip, at u = 1 forward (outer edge × inner edge)
  strip(
    near.map((w) => vert(0, w, 0, 1)),
    near.map((w) => vert(0, w, 1, 1)),
    false,
  );
  strip(
    near.map((w) => vert(1, w, 0, 2)),
    near.map((w) => vert(1, w, 1, 2)),
    true,
  );
  // the outer face
  strip(
    near.map((w) => vert(0, w, 0, 0)),
    near.map((w) => vert(1, w, 0, 0)),
    true,
  );
  cuts.push(index.length);
  crown(half(cn / 2, cn));
  // the sheet from afar
  const far = ws(FALL_SEGMENTS.far);
  strip(
    far.map((w) => vert(0, w, 0, 3)),
    far.map((w) => vert(1, w, 0, 3)),
    true,
  );
  cuts.push(index.length);
  const layers = cuts.slice(1).map((end, k): [number, number] => [cuts[k], end - cuts[k]]);
  return { rib: new Float32Array(rib), index: new Uint16Array(index), layers };
}
