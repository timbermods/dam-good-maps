// One real place from one survey patch (Real places, second round: Kyler, 2026-09-25 and 26; PLAN
// §20 D151, D152, D164, D171, D200, D214): the land as it is, the water sources where water begins,
// the start where the start requirements hold, and the map built and checked as the gallery builds
// it (src/core/places/place.ts). tools/places-convert.ts runs it on many patches and chooses.
//
// 1. The terrain: the survey's patch, cropped and quantised to 16 levels (hydro.ts), as it is. No
//    wall or rim along the edges (D151), and water may drain off the map (D152).
// 2. The sources (D171), only where water begins: a row across each river's mouth where it comes
//    into the map (channel tiles on the edge at the channel's level, about 0.5 of strength each as
//    the generator's mouth rows have, up to 12), and a spring at each channel head inside; at most
//    8 of them. The flow is the survey's, twice the generator's water strength for the map's size
//    (`density("water_strength_per_10k")`), shared by the square root of the area each drains, at
//    most 8 a tile. Then the water settles, and any source the water of another reaches
//    (water.source_in_flow) or whose water never reaches the map's edge (water.outflow) goes, its
//    flow shared among the rest; again, until none does. At least one source stays. A map whose
//    water stands on more than 60% of it, however thin, reads as flooded and fails.
//    Rivers, not floods (Kyler, 2026-09-26, D214): the flow stays near the official maps' range
//    for the size (`FLOW_CAP`). When the water does not settle or no start passes, the conversion
//    keeps fewer and larger rivers at the same flow (the 3 largest groups, then the largest, as
//    Pick a place's designed water uses one head on small maps and three on large ones), and only
//    then tries more flow, up to the cap. Before D214 it tried 4 and 8 times the generator's
//    strength instead, which made floods.
// 3. The start: flat dry 3×3s with a dry ring and their door's tile on their level, the best in
//    each 8×8 block by moist land near, then scored by the walk to clean water a pump reaches
//    (start.water) and the moist land within 20 tiles' walk (where groves and bushes grow); the
//    best are tried in turn: the place is built (its resources planned on the ground) and checked
//    with every check of the generate profile, and the first that passes is the start. When none
//    does, the start moves to the water (D214, as Pick a place's designed water places it): the
//    starts with a pump's shore within their walk come first (`walkToPumpShore`).

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { sourcesInFlow } from "../../src/core/analysis/sources";
import { components } from "../../src/core/analysis/regions";
import { PUMP_CLEAN, PUMP_DEPTH, PUMP_REACH, pumpShoreDistance, reachAt, WALK_LIMIT, walkDistance } from "../../src/core/analysis/walk";
import { MinHeap } from "../../src/core/math/grid";
import { waterSource, type EntitySpec } from "../../src/core/format/entities";
import { density } from "../../src/core/gen/calibrated";
import { encodeHeights, buildPlace, type PlaceData } from "../../src/core/places/place";
import { moistureBarrier, waterModel, type MapObject } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle, type CanonicalWater } from "../../src/core/sim/prefill";
import { DIFFICULTY_RULES } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { crop, quantise, rivers, type Edge } from "./hydro";

export const PATCHES = "investigation/landscapes/.cache/patches";
const HALO = 32;
/** Levels (the survey's library: 16). */
const CAP = 16;
/** Tiles of a river's mouth that get a source, at most. */
const MOUTH = 12;
/** A source's strength, as the generator's mouth rows give each tile (PLAN §7.6: 0.5, 0.25-1.0). */
const PER_TILE = 0.5;
/** Sources a map starts with, at most (the survey's 8). */
const GROUPS = 8;
/** Start positions tried in full, at most: the first ranking's, then the shore-first ranking's
 *  (D214), when none of the first passes. */
const TRIES = 6;
const SHORE_TRIES = 10;
/** Source groups a conversion tries, most first: the survey's (up to `GROUPS`), then fewer, the
 *  largest rivers kept (D214: at a flow near the official range, fewer and deeper rivers, as Pick a
 *  place's designed water uses one head on small maps and three on large ones). */
const GROUP_TRIES = [GROUPS, 3, 1];
/** The share of the map any water may stand on, however thin. Flat real land at 16 levels can carry
 *  a film of water over most of a map: it passes the flood check (which counts water over 0.05
 *  deep), but the map reads as flooded. */
export const MAX_COVER = 0.6;

/** The share of the map's tiles with any water on them. */
export function waterCover(depth: ArrayLike<number>): number {
  let n = 0;
  for (let i = 0; i < depth.length; i++) if (depth[i] > 0.001) n++;
  return n / depth.length;
}

/** The survey's flow: twice the generator's water strength for the map's size. */
const BASE_FLOW = 2;

/** Rivers, not floods (Kyler, 2026-09-26, D214): the most flow a place may have, as a multiple of
 *  the generator's water strength for its size (`density("water_strength_per_10k")`: 3.3, 2.2 and
 *  1.1 a second per 10,000 tiles at 96², 128² and 256²). The official maps' strongest water for
 *  each size (investigation/calibration.json, by size class, Nomads and Oasis left out as for the
 *  resources, joined in ln(area)) is 6.7, 3.4 and 4.1 per 10,000 tiles: 2.05, 1.5 and 3.75 times
 *  the generator's. The cap is that, but never under the survey's own 2× (at 128² its 4.4 is near
 *  the official 3.4): 96² 2× (6.1 in all), 128² 2× (7.2), 256² 3.75× (27, Thousand Islands' own).
 *  Before D214 a place could take 8×, twice anything official. A default the session chose
 *  (docs/decisions-pending.md). */
export const FLOW_CAP: Readonly<Record<number, number>> = { 96: 2, 128: 2, 256: 3.75 };

/** The flows tried, as multiples of the generator's water strength for the map's size: the
 *  survey's own, then the size's cap when it is higher. */
export function flowsFor(size: number): number[] {
  const cap = FLOW_CAP[size];
  if (cap === undefined) throw new Error(`no flow cap for ${size}²`);
  return cap > BASE_FLOW ? [BASE_FLOW, cap] : [cap];
}

/** A place's own fields: the resources' seed comes from `survey`, so a conversion's checks hold for
 *  whatever title the place gets. */
export type PlaceMeta = Omit<PlaceData, "format" | "W" | "H" | "heights" | "sources" | "start" | "badwater">;

/** What the conversion made of one patch in one mode. */
export interface Converted {
  /** The survey's row id: `<location>-<size>-<metres>-<mode>-16`. */
  row: string;
  ok: boolean;
  /** Why not: the checks the best start failed, or what went wrong. */
  reason?: string;
  size: number;
  heights?: string;
  sources?: [number, number, number][];
  start?: [number, number];
  /** The flow, as a multiple of the official maps' water strength for the map's size. */
  flow?: number;
  /** The share of the map any water stands on (MAX_COVER at most). */
  cover?: number;
  /** Sources taken out because another's water reached them, or theirs reached no edge. */
  dropped?: { inFlow: number; noOutflow: number };
  /** The most source groups the conversion started from (`GROUP_TRIES`), and the groups the land
   *  gives (at most `GROUPS`). */
  groups?: number;
  beginnings?: number;
  /** The start came from the shore-first ranking (D214): none of the first ranking's passed. */
  moved?: boolean;
  settled?: boolean;
  ticks?: number;
  /** Advisory checks the map does not meet (information). */
  advisories?: string[];
  ms: number;
}

/** The patch's elevations, with their halo. */
export function readPatch(key: string): Float32Array {
  const b = gunzipSync(readFileSync(`${PATCHES}/${key}.f32.gz`));
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

/** The heights of a survey row: its patch cropped and quantised in its mode. */
export function rowHeights(row: string): { size: number; heights: Uint8Array } {
  const m = /^(.+)-(\d+)-(\d+)-(\w+)-(\d+)$/.exec(row);
  if (!m) throw new Error(`not a survey row: ${row}`);
  const size = Number(m[2]);
  const raw = readPatch(`${m[1]}-${m[2]}-${m[3]}`);
  return { size, heights: quantise(crop(raw, size + 2 * HALO, size, HALO), m[4], Number(m[5])) };
}

type Group = { tiles: number[]; share: number };

/** The source groups where water begins, with their share of the flow: each river's mouth row (as
 *  many tiles as its share gives at about PER_TILE each, centred on the channel's lowest tile on the
 *  edge, along the channel at its level), and each head's spring. */
function beginnings(raw: Float32Array, size: number, h: Uint8Array, flow: number, most = GROUPS): Group[] {
  const found = rivers(raw, size, HALO);
  const all = [...found.entries, ...found.heads].sort((a, b) => b.area - a.area).slice(0, GROUPS);
  const sum = all.reduce((s, g) => s + Math.sqrt(g.area), 0);
  const shareOf = (area: number) => (flow * Math.sqrt(area)) / sum;
  const entries = found.entries.filter((e) => all.includes(e));
  const heads = found.heads.filter((e) => all.includes(e));
  const out: (Group & { area: number })[] = [];
  const taken = new Uint8Array(size * size);
  const along = (e: Edge, t: number) => (e === "south" ? t : e === "north" ? (size - 1) * size + t : e === "west" ? t * size : t * size + size - 1);
  for (const e of entries) {
    const t0 = e.edge === "south" || e.edge === "north" ? e.x : e.y;
    // the channel's level at the crossing: the lowest edge tile within 2
    let tc = t0;
    for (let t = Math.max(0, t0 - 2); t <= Math.min(size - 1, t0 + 2); t++) if (h[along(e.edge, t)] < h[along(e.edge, tc)]) tc = t;
    const level = h[along(e.edge, tc)];
    if (!level || taken[along(e.edge, tc)]) continue;
    let a = tc;
    let b = tc;
    const want = Math.max(1, Math.min(MOUTH, Math.round(shareOf(e.area) / PER_TILE)));
    while (b - a + 1 < want) {
      const left = a > 0 && h[along(e.edge, a - 1)] <= level && !taken[along(e.edge, a - 1)];
      const right = b < size - 1 && h[along(e.edge, b + 1)] <= level && !taken[along(e.edge, b + 1)];
      if (!left && !right) break;
      // grow toward the side nearer the crossing's middle first
      if (left && (!right || tc - a <= b - tc)) a--;
      else b++;
    }
    const tiles: number[] = [];
    for (let t = a; t <= b; t++) {
      const i = along(e.edge, t);
      if (h[i] > 0) tiles.push(i);
    }
    if (!tiles.length) continue;
    for (const i of tiles) taken[i] = 1;
    out.push({ area: e.area, tiles, share: shareOf(e.area) });
  }
  for (const s of heads) {
    const i = s.y * size + s.x;
    if (!h[i] || taken[i]) continue;
    // not on a mouth's row or next to one: that water is already there
    if (out.some((g) => g.tiles.some((t) => Math.max(Math.abs((t % size) - s.x), Math.abs(Math.floor(t / size) - s.y)) <= 3))) continue;
    taken[i] = 1;
    out.push({ area: s.area, tiles: [i], share: shareOf(s.area) });
  }
  out.sort((a, b) => b.area - a.area);
  // the largest `most`; the flow of a river or head that got no source goes to the rest
  const kept = out.slice(0, most);
  const got = kept.reduce((s, g) => s + g.share, 0);
  return kept.map((g) => ({ tiles: g.tiles, share: (g.share * flow) / got }));
}

/** Each group's share of the flow, and its tiles' strengths (at most 8 a tile, at least 0.1). */
function strengths(groups: Group[], size: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const g of groups) {
    const each = Math.min(8, Math.max(0.1, g.share / g.tiles.length));
    for (const i of g.tiles) out.push([i % size, Math.floor(i / size), Math.round(each * 1000) / 1000]);
  }
  return out;
}

function sourceEntities(sources: [number, number, number][], h: Uint8Array, size: number): EntitySpec[] {
  return sources.map(([x, y, strength]) => waterSource({ id: `s${x},${y}`, owner: "convert", x, y, z: h[y * size + x], strength }));
}

function mapObject(e: EntitySpec): MapObject {
  return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: { ...(e.before ?? {}), ...e.components } };
}

/** Sources whose water reaches no map edge (water.outflow's rule: their wet region touches no
 *  edge tile but a source's own). */
function noOutflow(model: ReturnType<typeof waterModel>, depth: ArrayLike<number>): Set<number> {
  const { W, H } = model;
  const N = W * H;
  const any = new Uint8Array(N);
  for (let i = 0; i < N; i++) any[i] = depth[i] > 0 ? 1 : 0;
  const { labels } = components(any, W, H, false);
  const emitting = new Uint8Array(N);
  for (const e of model.emitters) for (const i of e.cells) emitting[i] = 1;
  const drains = new Set<number>();
  for (let i = 0; i < N; i++) {
    if (labels[i] < 0 || emitting[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) drains.add(labels[i]);
  }
  const bad = new Set<number>();
  model.emitters.forEach((e, k) => {
    if (!(e.strength > 0)) return;
    const lab = labels[e.cells[0]];
    if (lab >= 0 && !drains.has(lab)) bad.add(k);
  });
  return bad;
}

const S2 = Math.SQRT2;
const WALK_DIRS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Every tile's walk to the nearest shore a pump works from (`pumpShoreDistance`'s rule: a tile
 *  beside clean water at least 0.3 deep whose surface stands 0–2 levels below it), walked back from
 *  all those shores at once. The walk (`walkDistance`: the same level, diagonals when both sides
 *  are on it; places have no slopes) is the same both ways, so a start's walk to water is the least
 *  of its 3×3's. Infinity beyond `WALK_LIMIT`. */
export function walkToPumpShore(h: Uint8Array, W: number, H: number, depth: ArrayLike<number>, contamination: ArrayLike<number>): Float64Array {
  const N = W * H;
  const d = new Float64Array(N).fill(Infinity);
  const heap = new MinHeap();
  for (let i = 0; i < N; i++) {
    if (!(depth[i] >= PUMP_DEPTH) || !(contamination[i] < PUMP_CLEAN)) continue;
    const surface = h[i] + depth[i];
    const x = i % W;
    const y = (i - x) / W;
    for (const n of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1]) {
      if (n < 0 || d[n] === 0) continue;
      if (surface >= h[n] - PUMP_REACH && surface <= h[n] + 0.01) {
        d[n] = 0;
        heap.push(0, n);
      }
    }
  }
  while (heap.size) {
    const c = heap.pop();
    const k = heap.lastKey;
    if (k > d[c]) continue;
    const x = c % W;
    const y = (c - x) / W;
    const lv = h[c];
    for (const [dx, dy] of WALK_DIRS) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const n = yy * W + xx;
      if (h[n] !== lv) continue;
      if (dx && dy && !(h[y * W + xx] === lv && h[yy * W + x] === lv)) continue;
      const nd = k + (dx && dy ? S2 : 1);
      if (nd < d[n] && nd <= WALK_LIMIT) {
        d[n] = nd;
        heap.push(nd, n);
      }
    }
  }
  return d;
}

/** Start positions, best first: flat dry 3×3s (their ring dry, their door's tile on their level),
 *  the best in each 8×8 block by moist land within 16 tiles, then by the walk to pumpable clean
 *  water and the moist land and ground within 20 tiles' walk. `shoreFirst` (D214: the start moves
 *  to the water, as Pick a place's designed water chooses it, rather than the water being made to
 *  reach the start) puts first, in each block and among them, the starts with pumpable water within
 *  their walk (`walkToPumpShore`). Returns the StartingLocation's corner tile. */
function starts(h: Uint8Array, W: number, H: number, water: CanonicalWater, M: ArrayLike<number>, shoreFirst = false): [number, number][] {
  const N = W * H;
  const D = water.depth;
  const rules = DIFFICULTY_RULES.normal;
  const toWater = shoreFirst ? walkToPumpShore(h, W, H, D, water.contamination) : null;
  const integral = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const k = (y + 1) * (W + 1) + x + 1;
      integral[k] = integral[k - 1] + integral[k - W - 1] - integral[k - W - 2] + (M[i] > 0 && !(D[i] > 0) ? 1 : 0);
    }
  const count = (x: number, y: number, r: number) => {
    const l = Math.max(0, x - r);
    const b = Math.max(0, y - r);
    const rr = Math.min(W, x + r + 1);
    const t = Math.min(H, y + r + 1);
    return integral[t * (W + 1) + rr] - integral[t * (W + 1) + l] - integral[b * (W + 1) + rr] + integral[b * (W + 1) + l];
  };
  const blocks = new Map<number, { x: number; y: number; near: number; score: number }>();
  for (let y = 3; y < H - 3; y++)
    for (let x = 3; x < W - 3; x++) {
      const i = y * W + x;
      const z = h[i];
      if (!z || D[i] > 0) continue;
      let ok = h[(y - 2) * W + x] === z;
      let walk = Infinity;
      for (let dy = -2; dy <= 2 && ok; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const j = (y + dy) * W + x + dx;
          if (D[j] > 0 || (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && h[j] !== z)) {
            ok = false;
            break;
          }
          if (toWater && Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && toWater[j] < walk) walk = toWater[j];
        }
      if (!ok) continue;
      const near = walk <= rules.waterWithin ? 1 : 0;
      const score = count(x, y, 16);
      const key = Math.floor(y / 8) * 1000 + Math.floor(x / 8);
      const old = blocks.get(key);
      if (!old || near > old.near || (near === old.near && score > old.score)) blocks.set(key, { x, y, near, score });
    }
  const scored: { x: number; y: number; score: number }[] = [];
  for (const c of [...blocks.values()].sort((a, b) => b.near - a.near || b.score - a.score || a.y - b.y || a.x - b.x).slice(0, 64)) {
    const walk = walkDistance(h, W, H, null, [], c, 24);
    const shore = pumpShoreDistance(walk, h, W, H, D, water.contamination).distance;
    let moist = 0;
    let reach = 0;
    for (let i = 0; i < N; i++) {
      const w = reachAt(walk, W, H, i);
      if (w > 20) continue;
      reach++;
      if (M[i] > 0 && !(D[i] > 0) && Math.max(Math.abs((i % W) - c.x), Math.abs(Math.floor(i / W) - c.y)) > 3) moist++;
    }
    const score = (shore <= rules.waterWithin ? 1e7 : 0) + (shore <= 12 ? 1e6 : 0) + Math.min(moist, 250) * 1000 + Math.min(reach, 999) - (Number.isFinite(shore) ? shore : 99);
    scored.push({ x: c.x, y: c.y, score });
  }
  scored.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
  return scored.map((c) => [c.x - 1, c.y - 1]);
}

/** The water cover of a conversion kept from before `cover` was recorded: its sources settled
 *  again on its terrain. */
export function coverOf(r: Converted): number {
  const h = Uint8Array.from(r.heights!, (c) => parseInt(c, 36));
  const model = waterModel(r.size, r.size, h, sourceEntities(r.sources!, h, r.size).map(mapObject));
  return waterCover(canonicalSettle(model).depth);
}

/** Convert one survey row: see the file's header. `meta` is the place's own (its id, title and the
 *  rest), which the built map's description and the resources' seed use. */
export function convertRow(row: string, meta: PlaceMeta, flows?: readonly number[]): Converted {
  const t0 = performance.now();
  const m = /^(.+)-(\d+)-(\d+)-(\w+)-(\d+)$/.exec(row);
  if (!m) throw new Error(`not a survey row: ${row}`);
  const size = Number(m[2]);
  const raw = readPatch(`${m[1]}-${m[2]}-${m[3]}`);
  const h = quantise(crop(raw, size + 2 * HALO, size, HALO), m[4], CAP);
  const fail = (reason: string, extra: Partial<Converted> = {}): Converted => ({ row, ok: false, reason, size, ms: Math.round(performance.now() - t0), ...extra });

  // 2 and 3: at each flow up to the size's cap, the survey's sources, then fewer and larger rivers
  // (see the file's header)
  let last: Converted | null = null;
  for (const times of flows ?? flowsFor(size)) {
    let wide = false;
    let land = Infinity;
    for (const most of GROUP_TRIES) {
      // no fewer groups than the land has rivers and heads: the same conversion again
      if (most >= land) continue;
      const r = attempt(row, meta, raw, size, h, times, most, fail);
      if (r.ok) return { ...r, ms: Math.round(performance.now() - t0) };
      last = r;
      land = Math.min(land, r.beginnings ?? Infinity);
      // land where no source or start fits does not change with the flow or the sources
      if (/^no river|^start: no flat/.test(r.reason ?? "")) return { ...r, ms: Math.round(performance.now() - t0) };
      if (/^water covers/.test(r.reason ?? "")) wide = true;
    }
    // more flow only spreads water wider
    if (wide) break;
  }
  return { ...last!, ms: Math.round(performance.now() - t0) };
}

/** One conversion at one flow, `times` the generator's water strength for the map's size, from at
 *  most `most` source groups. */
function attempt(row: string, meta: PlaceMeta, raw: Float32Array, size: number, h: Uint8Array, times: number, most: number, fail: (reason: string, extra?: Partial<Converted>) => Converted): Converted {
  const N = size * size;
  const flow = (times * density("water_strength_per_10k", N) * N) / 1e4;
  const land = beginnings(raw, size, h, flow).length;
  let groups = beginnings(raw, size, h, flow, most);
  if (!groups.length) return fail("no river comes in and no channel starts on this land", { beginnings: land });
  const dropped = { inFlow: 0, noOutflow: 0 };
  let sources = strengths(groups, size);
  let model = waterModel(size, size, h, sourceEntities(sources, h, size).map(mapObject));
  let water = canonicalSettle(model);
  for (let round = 0; round < 6; round++) {
    const objects = sourceEntities(sources, h, size).map(mapObject);
    const inFlow = new Set(sourcesInFlow(model, objects, water.depth).inFlow);
    const pools = noOutflow(model, water.depth);
    // which groups go: a group goes when any of its tiles is flagged
    let at = 0;
    const gone = groups.map((g) => {
      const idx = g.tiles.map(() => at++);
      const flow = idx.some((k) => inFlow.has(k));
      const pool = idx.some((k) => pools.has(k));
      return flow ? "flow" : pool ? "pool" : null;
    });
    if (!gone.some(Boolean)) break;
    const keep = groups.filter((_, k) => !gone[k]);
    if (!keep.length) {
      // keep the strongest where it is: it is where water begins, if anything is
      groups = [groups[0]];
      if (gone[0] === "pool") return fail("water.outflow: the only source's water never leaves the map", { heights: encodeHeights(h), dropped, flow: times, groups: most, beginnings: land });
      break;
    }
    for (const g of gone) if (g === "flow") dropped.inFlow++;
    else if (g === "pool") dropped.noOutflow++;
    const kept = keep.reduce((s, g) => s + g.share, 0);
    groups = keep.map((g) => ({ tiles: g.tiles, share: (g.share * flow) / kept }));
    sources = strengths(groups, size);
    model = waterModel(size, size, h, sourceEntities(sources, h, size).map(mapObject));
    water = canonicalSettle(model);
  }
  const cover = waterCover(water.depth);
  const base = { heights: encodeHeights(h), sources, dropped, settled: water.settled, ticks: water.ticks, flow: times, cover, groups: most, beginnings: land };
  if (!water.settled) return fail("water.settles: the water does not settle within 4 days", base);
  if (cover > MAX_COVER) return fail(`water covers ${Math.round(cover * 100)}% of the map (at most ${Math.round(MAX_COVER * 100)}%)`, base);

  // 3. the start: the best positions, each built and checked in full
  const objects = sourceEntities(sources, h, size).map(mapObject);
  const M = moisture(h, water.depth, water.contamination, size, size, moistureBarrier(size, size, objects));
  const first = starts(h, size, size, water, M).slice(0, TRIES);
  if (!first.length) return fail("start: no flat dry 3×3 with a dry ring on this land", base);
  // none of the first passes: the start moves to the water (D214), the shore-first ranking's
  // starts not yet tried
  const tried = new Set(first.map(([x, y]) => y * size + x));
  const shore = () => starts(h, size, size, water, M, true).filter(([x, y]) => !tried.has(y * size + x)).slice(0, SHORE_TRIES);
  let best: { failing: string[]; advisories: string[] } | null = null;
  let count = 0;
  for (const moved of [false, true]) {
    for (const start of moved ? shore() : first) {
      count++;
      const place: PlaceData = { format: 2, ...meta, W: size, H: size, heights: base.heights, sources, start };
      const built = buildPlace(place, water);
      const v = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
      const failing = v.report.checks.filter((c) => !c.ok && !c.advisory && c.applicable !== false && !c.approximate).map((c) => c.id);
      const advisories = v.report.checks.filter((c) => !c.ok && c.advisory && c.applicable !== false).map((c) => c.id);
      if (v.report.passed && !failing.length) return { row, ok: true, size, ...base, start, advisories, ...(moved ? { moved } : {}), ms: 0 };
      if (!best || failing.length < best.failing.length) best = { failing, advisories };
    }
  }
  return fail(`the best of ${count} starts fails ${best!.failing.join(", ")}`, base);
}
