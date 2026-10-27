// Water sources in rows and clusters, as in Timberborn's own maps (PLAN §20 D314; amends D171's
// placement and D300's water floor). One placement rule for every source placed automatically: the
// generator, the Real places conversion and the forces. A source the player places from the shelf
// stays single (a precise edit), and aquifers are unchanged: neither uses this module.
//
// The numbers are the investigation's (investigation/source-groups/REPORT.md, PR #78: the 19 named
// official maps, measured with investigation/source-groups/measure.ts):
// - Clean water (WaterSource, 1×1) comes as a ROW ACROSS THE FLOW, never along it: sources edge to
//   edge (1 tile apart), on one ground level, the row lying along a grid axis (every official row
//   does), the total strength shared equally. Most often 3 sources, commonly 2 to 5; how many
//   follows the total strength (CLEAN_COUNTS). On a map edge the row lies along the edge (a river
//   entering); inland it stands at a valley head or below a ridge (the caller's choice of site).
// - Badwater (BadwaterSource, 3×3, needs level ground under all nine tiles) is usually one source
//   alone (49 of 59 official groups); otherwise a PAIR (never more) a few tiles apart, from
//   touching to a 2-tile gap between the squares, on one level, sharing the strength equally
//   (PAIR_OFFSETS are the ten official pairs' own offsets). Never on a map edge.
// - Where the ground doesn't allow the whole group (a narrow valley head, a slope, an object in the
//   way, a map edge), it falls back to fewer sources, down to one, and the strength is kept: the
//   fewer share it (each at most the game's cap, MAX_STRENGTH_PER_TILE per emitting tile).
// - Deterministic: everything drawn comes from the seed and the request's tile (math/rng.ts), with
//   basic operations only, so generation and replay stay exact.
//
// Not covered (the investigation's open cases): a long coastline of separate mouths (group by the
// river, one call per mouth), loose 5-8 source clusters (a row is placed instead) and a symmetric
// strength taper (equal shares cover two thirds of the official groups outright).
//
// How each caller wires it in: src/core/water/README.md.

import { FOOTPRINTS, footprintTiles, type Placement } from "../format/footprints";
import { guidFrom } from "../math/hash";
import { stream } from "../math/rng";
import { MAX_STRENGTH_PER_TILE } from "../sim/model";

export type SourceKind = "water" | "badwater";

/** Where the flow's direction was read from. */
export type FlowFrom = "given" | "edge" | "water" | "ground" | "none";

export interface SourceGroupRequest {
  kind: SourceKind;
  /** The tile the group stands on: a clean source's tile (the row's anchor, always one of its
   *  sources), or the middle tile of a badwater source's 3×3. */
  x: number;
  y: number;
  /** The group's total strength (SpecifiedStrength summed over its sources), above 0. */
  strength: number;
  /** The caller's seed (a map seed, a force's seed); the request's kind and tile are mixed in. */
  seed: number;
  /** Which way the water goes from here (downstream), any length; [0, 0] or absent: read from the
   *  map edge, the settled water or the ground, in that order. Clean water only. */
  flow?: readonly [number, number];
  /** How many sources the caller wants instead of the rule's count (a river mouth that must be
   *  sealed tile for tile, PLAN §7.6). Clean water only; still falls back on cramped ground. */
  count?: number;
}

export interface SourceGroundInput {
  W: number;
  H: number;
  /** Surface level of every tile (row-major, y * W + x). */
  heights: ArrayLike<number>;
  /** Nonzero where nothing may stand: other objects, the start's tiles, reserved ground. */
  occupied?: ArrayLike<number>;
  /** Objects whose footprints are taken (a convenience beside `occupied`). */
  objects?: readonly Placement[];
  /** Settled water depth per tile. With it, a source never stands in water when the group's own
   *  tile is dry (that water comes from elsewhere, D171). */
  depth?: ArrayLike<number>;
  /** Settled outflow per tile, four per tile in the order (−y, −x, +y, +x) as sim/water.ts keeps
   *  it: the flow's direction where no `flow` is given. */
  outflow?: ArrayLike<number>;
  /** How many levels a clean row's sources may differ from its anchor's ground (default 0: one
   *  level, as nearly every official row stands). */
  step?: number;
}

export interface GroupedSource {
  /** The entity's coordinates, orientation Cw0 (a badwater source's corner tile, its lowest x and y). */
  x: number;
  y: number;
  /** The ground level it stands on. */
  z: number;
  /** SpecifiedStrength, to a thousandth. */
  strength: number;
  /** Its tiles (y * W + x), ascending. */
  tiles: number[];
}

export interface SourceGroup {
  kind: SourceKind;
  /** The sources, along the row (a row), the anchor first (a pair), or the one (a single). Empty
   *  when refused. */
  sources: GroupedSource[];
  shape: "row" | "pair" | "single";
  /** The axis a clean row lies along ("x": sources side by side in x), null otherwise. */
  axis: "x" | "y" | null;
  flowFrom: FlowFrom | null;
  /** How many sources the rule (or the request's `count`) asked for. */
  wanted: number;
  /** Fewer than wanted: the ground didn't allow the whole group. */
  fellBack: boolean;
  /** The strength placed (the sources' sum). Equal to the request's unless the sources' cap was
   *  reached (`clamped`). */
  total: number;
  clamped: boolean;
  /** Why nothing could stand there (one plain reason), or null. */
  refused: string | null;
}

// --------------------------------------------------------------------------------------- the rule

/** How many clean sources a row gets for its total strength: the official rows' counts in four
 *  strength bands (count, maps), a gap between observed counts filled with half a map's weight. */
export const CLEAN_COUNTS: readonly { below: number; weights: readonly (readonly [number, number])[] }[] = [
  { below: 1.25, weights: [[2, 4], [3, 2], [4, 1]] }, // totals 0.75-1
  { below: 2.25, weights: [[2, 1], [3, 8], [4, 2]] }, // totals 1.5-2
  { below: 3.25, weights: [[2, 1], [3, 4], [4, 0.5], [5, 3]] }, // totals 2.5-3
  { below: Infinity, weights: [[3, 1], [4, 0.5], [5, 3]] }, // totals 3.5-4.5 (Meander's 8 counted as 5)
];
/** The least strength an official clean source has: a row never spreads thinner. */
export const CLEAN_MIN_EACH = 0.25;
/** The longest row the rule builds (past about 5 official groups spread into loose clusters). */
export const MAX_ROW = 16;
/** One badwater site in six is a pair (10 of the 59 official groups; the rest are single). */
export const PAIR_CHANCE = 10 / 59;
/** The least strength an official badwater source has: a pair needs twice it. */
export const BAD_MIN_EACH = 0.5;
/** The ten official badwater pairs' centre-to-centre offsets (Canyon, Beaverome ×2,
 *  ThousandIslands ×2, Craters ×2, HelixMountain ×2, MountainRange), turned and mirrored by the seed. */
export const PAIR_OFFSETS: readonly (readonly [number, number])[] = [
  [3, -3], [3, 4], [5, -3], [4, -3], [1, 3], [5, 5], [1, 4], [4, 2], [1, -3], [2, -4],
];
/** Water deeper than this counts as wet (D297's wet line). */
export const WET = 0.01;

const BAD_TILES = 9;

// -------------------------------------------------------------------------------------- helpers

/** `total` shared equally among `n`, to a thousandth, summing exactly (in thousandths) to it: the
 *  leftover thousandths go one each to the middle sources, so the shares stay symmetric where they
 *  can and differ by at most 0.001. */
export function shareEqually(total: number, n: number): number[] {
  const T = Math.round(total * 1000);
  const base = Math.floor(T / n);
  let rem = T - base * n;
  const out = new Array<number>(n).fill(base);
  // middle first, then outwards alternately (for n even the two middles in index order)
  const order: number[] = [];
  const lo = (n - 1) >> 1;
  const hi = n >> 1;
  for (let d = 0; lo - d >= 0 || hi + d < n; d++) {
    if (lo - d >= 0) order.push(lo - d);
    if (hi + d !== lo - d && hi + d < n) order.push(hi + d);
  }
  for (const k of order) {
    if (rem <= 0) break;
    out[k]++;
    rem--;
  }
  return out.map((v) => v / 1000);
}

/** How many clean sources the rule gives a row of this total strength, drawn from `u` in [0, 1):
 *  the band's official counts, then kept between one source per CLEAN_MIN_EACH and the game's cap. */
export function cleanCount(total: number, u: number): number {
  const band = CLEAN_COUNTS.find((b) => total < b.below)!;
  let sum = 0;
  for (const [, w] of band.weights) sum += w;
  let r = u * sum;
  let n = band.weights[band.weights.length - 1][0];
  for (const [c, w] of band.weights) {
    r -= w;
    if (r < 0) {
      n = c;
      break;
    }
  }
  const most = Math.max(1, Math.floor(total / CLEAN_MIN_EACH + 1e-9));
  const least = Math.ceil(total / MAX_STRENGTH_PER_TILE - 1e-9);
  return Math.min(MAX_ROW, Math.max(least, Math.min(n, most)));
}

interface Ground {
  W: number;
  H: number;
  h: ArrayLike<number>;
  taken: Uint8Array;
  depth: ArrayLike<number> | null;
}

function groundOf(g: SourceGroundInput): Ground {
  const { W, H } = g;
  const taken = new Uint8Array(W * H);
  if (g.occupied) for (let i = 0; i < W * H; i++) if (g.occupied[i]) taken[i] = 1;
  for (const o of g.objects ?? []) {
    if (!FOOTPRINTS[o.template]) continue;
    for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && y >= 0 && x < W && y < H) taken[y * W + x] = 1;
  }
  return { W, H, h: g.heights, taken, depth: g.depth ?? null };
}

const wet = (G: Ground, i: number) => G.depth !== null && G.depth[i] > WET;

/** A badwater source's nine tiles around (cx, cy), or a reason it can't stand there. */
function badwaterSquare(G: Ground, cx: number, cy: number): { tiles: number[]; z: number } | string {
  const { W, H, h } = G;
  if (cx - 1 < 0 || cy - 1 < 0 || cx + 1 >= W || cy + 1 >= H) return "it would reach outside the map";
  if (cx - 1 === 0 || cy - 1 === 0 || cx + 1 === W - 1 || cy + 1 === H - 1) return "a badwater source never stands on the map's edge";
  const tiles: number[] = [];
  const z = h[cy * W + cx];
  for (let y = cy - 1; y <= cy + 1; y++)
    for (let x = cx - 1; x <= cx + 1; x++) {
      const i = y * W + x;
      if (G.taken[i]) return "something already stands there";
      if (h[i] !== z) return "the ground under it is not level";
      tiles.push(i);
    }
  return { tiles, z };
}

/** The flow's direction at a clean anchor, and where it was read from. */
function flowAt(req: SourceGroupRequest, g: SourceGroundInput, G: Ground): { v: [number, number]; from: FlowFrom; edge: boolean } {
  const { W, H } = G;
  const { x, y } = req;
  const onX = x === 0 || x === W - 1; // on a west or east edge: the row lies along y
  const onY = y === 0 || y === H - 1;
  if (req.flow && (req.flow[0] !== 0 || req.flow[1] !== 0)) return { v: [req.flow[0], req.flow[1]], from: "given", edge: false };
  // a river entering on a map edge flows straight in: the row lies along the edge
  if (onX !== onY) return { v: onX ? [1, 0] : [0, 1], from: "edge", edge: true };
  if (onX && onY) return { v: [0, 0], from: "edge", edge: true }; // a corner: either edge
  if (g.outflow) {
    let vx = 0;
    let vy = 0;
    for (let yy = y - 1; yy <= y + 1; yy++)
      for (let xx = x - 1; xx <= x + 1; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const b = 4 * (yy * W + xx);
        vx += g.outflow[b + 3] - g.outflow[b + 1];
        vy += g.outflow[b + 2] - g.outflow[b];
      }
    if (Math.abs(vx) > 1e-9 || Math.abs(vy) > 1e-9) return { v: [vx, vy], from: "water", edge: false };
  }
  // downhill on the ground around it (5×5): higher ground behind, lower ahead
  const z = G.h[y * W + x];
  let vx = 0;
  let vy = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const d = z - G.h[yy * W + xx];
      vx += d * dx;
      vy += d * dy;
    }
  if (vx !== 0 || vy !== 0) return { v: [vx, vy], from: "ground", edge: false };
  return { v: [0, 0], from: "none", edge: false };
}

// ------------------------------------------------------------------------------------ placement

function refusal(req: SourceGroupRequest, wanted: number, reason: string): SourceGroup {
  return { kind: req.kind, sources: [], shape: "single", axis: null, flowFrom: null, wanted, fellBack: false, total: 0, clamped: false, refused: reason };
}

/** Strengths for `n` sources sharing `total`, each at most `cap`. */
function strengthsFor(total: number, n: number, cap: number): { each: number[]; clamped: boolean } {
  const clamped = total > n * cap + 1e-9;
  return { each: shareEqually(clamped ? n * cap : total, n), clamped };
}

/** How many clean sources the rule asks for this request, before the ground has its say: the same
 *  draw `placeSourceGroup` makes (so a caller can size a river's mouth to the row first). */
export function wantedCount(req: Pick<SourceGroupRequest, "x" | "y" | "strength" | "seed" | "count">): number {
  if (req.count !== undefined) return Math.max(1, Math.min(MAX_ROW, Math.floor(req.count)));
  return cleanCount(req.strength, stream(req.seed, "sourceGroup", "water", req.x, req.y).float());
}

function placeRow(req: SourceGroupRequest, g: SourceGroundInput, G: Ground): SourceGroup {
  const { W, H, h } = G;
  const rng = stream(req.seed, "sourceGroup", "water", req.x, req.y);
  rng.float(); // the count's draw (wantedCount)
  const uSide = rng.float();
  const uAxis = rng.float();
  const wanted = wantedCount(req);
  const a = req.y * W + req.x;
  const z = h[a];
  const step = g.step ?? 0;
  const anchorWet = wet(G, a);
  const fits = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const i = y * W + x;
    if (G.taken[i] || Math.abs(h[i] - z) > step) return false;
    return anchorWet || !wet(G, i);
  };
  const flow = flowAt(req, g, G);
  // across the flow: the axis the flow runs least along; both when it runs equally (or not at all)
  const ax = Math.abs(flow.v[0]);
  const ay = Math.abs(flow.v[1]);
  const axes: ("x" | "y")[] = ax > ay ? ["y"] : ay > ax ? ["x"] : uAxis < 0.5 ? ["x", "y"] : ["y", "x"];
  let best: { axis: "x" | "y"; lo: number; hi: number } | null = null;
  for (const axis of axes) {
    const [ex, ey] = axis === "x" ? [1, 0] : [0, 1];
    let lo = 0; // members before the anchor along the axis
    let hi = 0; // after it
    let loOpen = true;
    let hiOpen = true;
    const preferHi = uSide < 0.5;
    while (1 + lo + hi < wanted && (loOpen || hiOpen)) {
      // keep the row centred on its anchor; the seed breaks the tie for an even count
      const toHi = hiOpen && (!loOpen || hi < lo || (hi === lo && preferHi));
      if (toHi) {
        if (fits(req.x + ex * (hi + 1), req.y + ey * (hi + 1))) hi++;
        else hiOpen = false;
      } else if (fits(req.x - ex * (lo + 1), req.y - ey * (lo + 1))) lo++;
      else loOpen = false;
    }
    if (!best || lo + hi > best.lo + best.hi) best = { axis, lo, hi };
  }
  const { axis, lo, hi } = best!;
  const [ex, ey] = axis === "x" ? [1, 0] : [0, 1];
  const n = 1 + lo + hi;
  const { each, clamped } = strengthsFor(req.strength, n, MAX_STRENGTH_PER_TILE);
  const sources: GroupedSource[] = [];
  for (let k = -lo; k <= hi; k++) {
    const x = req.x + ex * k;
    const y = req.y + ey * k;
    const i = y * W + x;
    sources.push({ x, y, z: h[i], strength: each[k + lo], tiles: [i] });
  }
  const total = each.reduce((s, v) => s + Math.round(v * 1000), 0) / 1000;
  return { kind: "water", sources, shape: n > 1 ? "row" : "single", axis: n > 1 ? axis : null, flowFrom: flow.from, wanted, fellBack: n < wanted, total, clamped, refused: null };
}

function placeBadwater(req: SourceGroupRequest, G: Ground): SourceGroup {
  const rng = stream(req.seed, "sourceGroup", "badwater", req.x, req.y);
  const uPair = rng.float();
  const first = rng.int(0, PAIR_OFFSETS.length);
  const turn = rng.int(0, 8);
  const cap = MAX_STRENGTH_PER_TILE * BAD_TILES;
  const wanted = uPair < PAIR_CHANCE && req.strength >= 2 * BAD_MIN_EACH - 1e-9 ? 2 : 1;
  const anchor = badwaterSquare(G, req.x, req.y);
  if (typeof anchor === "string") return refusal(req, wanted, anchor);
  const squares = [{ cx: req.x, cy: req.y, ...anchor }];
  if (wanted === 2) {
    // the official pairs' offsets, from a seeded one, each in a seeded turn and mirror first
    for (let k = 0; k < PAIR_OFFSETS.length * 8 && squares.length < 2; k++) {
      const [ox, oy] = PAIR_OFFSETS[(first + k) % PAIR_OFFSETS.length];
      const t = (turn + Math.floor(k / PAIR_OFFSETS.length)) % 8;
      let dx = t & 1 ? oy : ox;
      let dy = t & 1 ? ox : oy;
      if (t & 2) dx = -dx;
      if (t & 4) dy = -dy;
      const sq = badwaterSquare(G, req.x + dx, req.y + dy);
      if (typeof sq === "string" || sq.z !== anchor.z) continue;
      if (!wet(G, req.y * G.W + req.x) && sq.tiles.some((i) => wet(G, i))) continue;
      squares.push({ cx: req.x + dx, cy: req.y + dy, ...sq });
    }
  }
  const { each, clamped } = strengthsFor(req.strength, squares.length, cap);
  const sources = squares.map((s, k) => ({ x: s.cx - 1, y: s.cy - 1, z: s.z, strength: each[k], tiles: s.tiles }));
  const total = each.reduce((s, v) => s + Math.round(v * 1000), 0) / 1000;
  return { kind: "badwater", sources, shape: sources.length > 1 ? "pair" : "single", axis: null, flowFrom: null, wanted, fellBack: sources.length < wanted, total, clamped, refused: null };
}

/**
 * A group of sources for one requested source, by the rule (D314): a clean row across the flow, or
 * a badwater source alone or in a pair. Pure and deterministic: the same request on the same
 * ground always gives the same group. Refused (no sources, `refused` says why) only where not even
 * one source can stand on the requested tile.
 */
export function placeSourceGroup(req: SourceGroupRequest, ground: SourceGroundInput): SourceGroup {
  const { W, H } = ground;
  if (!(req.strength > 0)) return refusal(req, 0, "a source needs a strength above 0");
  if (!Number.isInteger(req.x) || !Number.isInteger(req.y) || req.x < 0 || req.y < 0 || req.x >= W || req.y >= H) return refusal(req, 0, "it is outside the map");
  const G = groundOf(ground);
  if (req.kind === "badwater") return placeBadwater(req, G);
  if (G.taken[req.y * W + req.x]) return refusal(req, 0, "something already stands there");
  return placeRow(req, ground, G);
}

/** A clean row of `n` sources sharing `total` as the rule shares it, each at most the game's cap: the
 *  strengths of a row kept as it was placed (a generated spring's, features/build.ts). */
export function rowStrengths(total: number, n: number): number[] {
  return strengthsFor(total, n, MAX_STRENGTH_PER_TILE).each;
}

/** Tiles every source of a group takes (for the caller's `occupied` before the next group). */
export function groupTiles(group: SourceGroup): number[] {
  return group.sources.flatMap((s) => s.tiles);
}

/**
 * The one rule for a group member's id (D462, answer 5): the source at `place` (its place along the
 * row, counted round the rule's count; a badwater pair's partner is place 1) takes an id derived from
 * the anchor's (`anchorId`, place 0 keeps it). `taken` (a force's: the ids already standing or used):
 * an id taken is passed over for the next one derived from the same place, so a new source never
 * takes an id an object holds. Without `taken` (the build, which derives a group again on every
 * replay), the id depends on the anchor and the place alone.
 */
export function groupMemberId(anchorId: string, place: number, taken?: (id: string) => boolean): string {
  if (place === 0) return anchorId;
  let id = guidFrom(anchorId, "sourceGroup", place);
  for (let k = 1; taken?.(id); k++) id = guidFrom(anchorId, "sourceGroup", place, k);
  return id;
}

/**
 * The ids of a group's sources, in `group.sources`' order (PLAN §19.4's stable ids): the anchor keeps
 * `anchorId`, the caller's id for the source at the requested tile, and every other source takes an
 * id derived from it and its place along the row counted round the rule's count (its offset from the
 * anchor modulo `group.wanted`; a badwater pair's partner is the one), never its tile
 * (`groupMemberId`). The rule's count depends on the request alone, and a row is one unbroken run of
 * at most that many tiles through its anchor, so its places are distinct: two sources never share an
 * id. A group placed again for the same request on ground an edit changed (a Quake Lift raising one
 * side of a row, a stroke) keeps every id it still has: a source that stays keeps its own, and one
 * the land moves to the row's other end, the same spring, keeps the id of the one it replaces. A row
 * that loses sources loses their ids; only a longer row than before has a new one. `taken`: as
 * `groupMemberId` (a force's new group, never an id already standing; its own members count as taken
 * as they are named).
 */
export function groupIds(anchorId: string, req: SourceGroupRequest, group: SourceGroup, taken?: (id: string) => boolean): string[] {
  const named = new Set<string>([anchorId]);
  const free = taken ? (id: string) => taken(id) || named.has(id) : undefined;
  const member = (place: number) => {
    const id = groupMemberId(anchorId, place, free);
    named.add(id);
    return id;
  };
  if (req.kind === "badwater") return group.sources.map((_, k) => (k === 0 ? anchorId : member(k)));
  const n = Math.max(group.wanted, group.sources.length);
  return group.sources.map((s) => {
    const along = s.x - req.x + (s.y - req.y);
    const place = ((along % n) + n) % n;
    return place === 0 ? anchorId : member(place);
  });
}
