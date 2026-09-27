// One real place from one survey patch (Real places, second round: Kyler, 2026-09-25 and 26; PLAN
// §20 D151, D152, D164, D171, D200, D214, D224): the land as it is, the water sources where water
// begins, the start where the start requirements hold, and the map built and checked as the
// gallery builds it (src/core/places/place.ts). tools/places-convert.ts runs it on many patches and
// chooses.
//
// 1. The terrain: the survey's patch, cropped and quantised to 16 levels (hydro.ts), as it is. No
//    wall or rim along the edges (D151), and water may drain off the map (D152).
// 2. The sources (D171), only where water begins, and only where the real place has water (Kyler,
//    2026-09-27, D271): ESA WorldCover's permanent water and OpenStreetMap's permanent rivers on
//    the patch (worldcover.ts, osm.ts; `observed`). Each stretch of it begins where a river comes
//    into the map (a row across its mouth: channel tiles on the edge at the channel's level, about
//    0.5 of strength each as the generator's mouth rows have, up to 12), or at a spring at its
//    head; a lake gets one spring in its middle, fed what it evaporates; the sea and dry land get
//    none (`beginnings`). At most 8. The rivers' flow is the survey's, twice the generator's water
//    strength for the map's size (`density("water_strength_per_10k")`), shared by the square root
//    of the area each drains, at most 8 a tile. A spring whose water would stand mostly off the
//    real water goes (`offWater`). Then the water settles, and any source the water of another
//    reaches (water.source_in_flow) or whose water never reaches the map's edge (water.outflow)
//    goes, its flow shared among the rest; again, until none does; and a lake's spring whose lake
//    the land cannot hold. A place with no observed water is dry, and its note says so.
//    Rivers, not floods (Kyler, 2026-09-26, D214): the flow stays near the official maps' range
//    for the size (`FLOW_CAP`). When the water does not settle, the conversion keeps fewer and
//    larger rivers at the same flow (the 3 largest groups, then the largest, as Pick a place's
//    designed water uses one head on small maps and three on large ones; D271 brought it back),
//    and at 256² it also tries the cap's flow. Before D214 it tried 4 and 8 times the generator's
//    strength instead, which made floods.
// 3. The start: flat dry 3×3s with a dry ring and their door's tile on their level, the best in
//    each 8×8 block by moist land near, then scored by the walk to clean water a pump reaches
//    (start.water) and the moist land within 20 tiles' walk (where groves and bushes grow); the
//    best are tried in turn: the place is built (its resources planned on the ground) and checked
//    with every check of the generate profile and the starting-logs floor (D224: at least its logs
//    within 20 tiles' walk, the resources planting toward it), and the first that passes is the
//    start. When none
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
import { encodeHeights, buildPlace, logFloorProblem, placeNotes, placeProblems, type PlaceData } from "../../src/core/places/place";
import { moistureBarrier, waterModel, type MapObject } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle, prefill, spillLevels, type CanonicalWater } from "../../src/core/sim/prefill";
import { DIFFICULTY_RULES } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { crop, detrend, quantise, rivers, type Edge, type Entry, type Head } from "./hydro";
import { riverTiles } from "./osm";
import { readWater } from "./worldcover";

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
  /** Source groups taken out because another's water reached them, theirs reached no edge,
   *  theirs stood mostly off the real place's water, or a lake's spring whose lake the land does
   *  not hold (D271). */
  dropped?: { inFlow: number; noOutflow: number; offWater?: number; unheld?: number };
  /** The source groups the real place's water gives (at most `GROUPS`), and those kept. */
  beginnings?: number;
  rivers?: number;
  /** How the settled water matches the real place's (`observedMatch`), and the stretches of sea
   *  that got no source. */
  observed?: { water: number; recall: number | null; precision: number | null };
  sea?: number;
  /** The land (D300): the share of its overall tilt kept, and the tiles of bed lowered under the
   *  real water. */
  tiltKept?: number;
  beds?: number;
  /** The land fitted to the levels above the lowest (its real water lay on the lowest, D300), and
   *  smoothed (a 3×3 median) where its levels came only a few metres apart. */
  lifted?: boolean;
  smoothed?: boolean;
  /** The water floor's spring (D300), when the place needed one: where, how strong, and why (no
   *  water in its square, or its real water out of the start's reach). It is also in `sources`. */
  spring?: { at: [number, number]; strength: number; why: "dry" | "far" };
  /** The start came from the shore-first ranking (D214): none of the first ranking's passed. */
  moved?: boolean;
  settled?: boolean;
  ticks?: number;
  /** The playability checks the place falls short of (D245: information; it ships as it is), and
   *  its notes (`placeNotes`). */
  shortOf?: string[];
  notes?: string[];
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
  const flat = detrend(raw, size + 2 * HALO, size, HALO, m[4], Number(m[5])).raw;
  return { size, heights: quantise(crop(flat, size + 2 * HALO, size, HALO), m[4], Number(m[5])) };
}

/** A source group: its tiles and its flow. A lake's spring (`lake`) gives what the lake's surface
 *  evaporates (`feed`), not a share of the rivers' flow. */
export type Group = { tiles: number[]; share: number; lake?: true; feed?: number; entry?: true; cells?: number[] };

/** A tile counts as observed water when this share of its WorldCover pixels is (D271). */
export const WET = 0.15;
/** Near observed water: a tile with this share in the 3×3 round it (a river narrower than a tile). */
const NEAR = 0.05;
/** A stretch of observed water worth a source of its own: this many tiles' worth, at least. */
const MIN_WATER = 3;
/** Observed water touching the map's edge, low (at most 3 m above the sea) and wide (a twentieth
 *  of the map) is the sea: the land has no rim to hold it (D151), so it gets no source. */
const SEA = { metres: 3, share: 0.05 };
/** What a lake's surface evaporates, a second per tile (sim/drought.ts: 1e-4 on wide water), with
 *  a fifth more for its outflow: a lake's spring gives that much (as Pick a place's signature water
 *  does), so the lake stands where the real one does without spreading over the land round it. */
export const LAKE_FEED = 1.2e-4;
/** A stretch crossing the edge in places whose median heights differ by more than this (metres)
 *  flows through: a river, however wide and flat. */
const RIVER_DROP = 5;
/** A lake the map's edge cuts: the flat surface the elevation data gives it spills over the edge,
 *  so its spring gives this many times its evaporation, to cover it. */
const EDGE_LAKE = 4;

/** Where water begins, from the real place's water (Kyler, 2026-09-27, D271): ESA WorldCover's
 *  permanent water on the patch (`obs`, worldcover.ts), so the sources go only where the real place
 *  has rivers and lakes (D171: where water begins), and dry land stays dry. Each stretch of observed
 *  water on the map (a river, a lake, at least MIN_WATER tiles' worth) begins where the land's
 *  largest river comes in beside it across the edge (a mouth row there), else at its highest tile
 *  (a river's head: a spring); a lake at a spring in its middle, fed what it evaporates. A stretch the water of a higher one already runs through (the routing's path
 *  passes within a tile of it: a river WorldCover sees in pieces) gets none. The sea gets none.
 *  Each shares the flow by the square root of the area its water gathers from (the survey's
 *  routing, halo included). */
export function beginnings(raw: Float32Array, obs: Float32Array, size: number, h: Uint8Array, flow: number, metres: Float32Array = raw): { groups: Group[]; sea: number; labels: Int32Array; kind: Uint8Array } {
  const W = size + 2 * HALO;
  const N = size * size;
  const found = rivers(raw, size, HALO);
  const { to, acc } = found.drainage;
  const halo = (i: number) => (Math.floor(i / size) + HALO) * W + (i % size) + HALO;
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = obs[halo(i)] >= WET ? 1 : 0;
  const { labels, sizes } = components(mask, size, size, false);
  const weight = new Float64Array(sizes.length);
  const top = new Int32Array(sizes.length).fill(-1);
  const onEdge = new Uint8Array(sizes.length);
  const lows: number[][] = sizes.map(() => []);
  const cells: number[][] = sizes.map(() => []);
  for (let i = 0; i < N; i++) {
    const c = labels[i];
    if (c < 0) continue;
    cells[c].push(i);
    weight[c] += obs[halo(i)];
    const x = i % size;
    const y = (i - x) / size;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) onEdge[c] = 1;
    const r = raw[halo(i)];
    lows[c].push(metres[halo(i)]);
    if (top[c] < 0 || r > raw[halo(top[c])]) top[c] = i;
  }
  /** A lake, not a river (Pick a place's test): its surface flat (the middle of its core within 8
   *  m), a fifth of it or more inside the stretch's own water, and more than 12 tiles; and broad
   *  (its middle 3 tiles or more from its shore). */
  const lakeLike = (c: number) => {
    const list = cells[c];
    if (list.length <= 12) return false;
    let inner = 0;
    for (const i of list) {
      const x = i % size;
      const y = (i - x) / size;
      if (x > 0 && y > 0 && x < size - 1 && y < size - 1 && labels[i - 1] === c && labels[i + 1] === c && labels[i - size] === c && labels[i + size] === c) inner++;
    }
    const core = list.filter((i) => obs[halo(i)] > 0.8).map((i) => raw[halo(i)]).sort((a, b) => a - b);
    const q = (p: number) => core[Math.floor((core.length - 1) * p)];
    // and broad: a river a few tiles wide is not a lake, however flat
    return core.length > 5 && q(0.7) - q(0.3) < 8 && inner / list.length > 0.2 && middle(c).depth >= 3;
  };
  /** The tile of a stretch farthest from its shore and the map's edge (4 steps), the first such,
   *  and how far that is. */
  const middle = (c: number): { i: number; depth: number } => {
    const dist = new Int32Array(N).fill(-1);
    const queue: number[] = [];
    for (const i of cells[c]) {
      const x = i % size;
      const y = (i - x) / size;
      const shore = x === 0 || y === 0 || x === size - 1 || y === size - 1 || labels[i - 1] !== c || labels[i + 1] !== c || labels[i - size] !== c || labels[i + size] !== c;
      if (shore) {
        dist[i] = 0;
        queue.push(i);
      }
    }
    let best = queue[0];
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      if (dist[i] > dist[best]) best = i;
      for (const j of [i - 1, i + 1, i - size, i + size])
        if (j >= 0 && j < N && labels[j] === c && dist[j] < 0) {
          dist[j] = dist[i] + 1;
          queue.push(j);
        }
    }
    return { i: best, depth: dist[best] };
  };
  /** Where a stretch crosses the map's edge: each run of its edge tiles (along the edge, gaps of
   *  at most 2), its middle tile and its median height, highest first. */
  const edgeRuns = (c: number): { i: number; z: number }[] => {
    const ring: number[] = [];
    for (let t = 0; t < size; t++) ring.push(t);
    for (let t = 1; t < size; t++) ring.push(t * size + size - 1);
    for (let t = size - 2; t >= 0; t--) ring.push((size - 1) * size + t);
    for (let t = size - 2; t > 0; t--) ring.push(t * size);
    const runs: number[][] = [];
    let gap = 99;
    for (const i of ring) {
      if (labels[i] === c) {
        if (gap > 2 || !runs.length) runs.push([]);
        runs[runs.length - 1].push(i);
        gap = 0;
      } else gap++;
    }
    if (runs.length > 1 && labels[ring[0]] === c && labels[ring[ring.length - 1]] === c) runs[0].push(...runs.pop()!);
    return runs
      .map((r) => {
        const zs = r.map((i) => raw[halo(i)]).sort((a, b) => a - b);
        return { i: r[Math.floor(r.length / 2)], z: zs[Math.floor(zs.length / 2)] };
      })
      .sort((a, b) => b.z - a.z);
  };
  let sea = 0;
  const starts: { c: number; i: number; entry: boolean }[] = [];
  for (let c = 0; c < sizes.length; c++) {
    if (weight[c] < MIN_WATER) continue;
    const zs = lows[c].sort((a, b) => a - b);
    if (onEdge[c] && weight[c] > SEA.share * N && zs[Math.floor(zs.length / 2)] <= SEA.metres) {
      sea++;
      continue;
    }
    // where a stretch touches the edge, it begins where the land's largest river comes in beside
    // it (the survey's routing), when one does: a river and the ponds along it are one stretch,
    // and its highest tile may be a pond up a side valley
    let entry: Entry | null = null;
    if (onEdge[c])
      for (const e of found.entries) {
        if (entry && entry.area >= e.area) continue;
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = e.x + dx;
            const yy = e.y + dy;
            if (xx >= 0 && yy >= 0 && xx < size && yy < size && labels[yy * size + xx] === c) near = true;
          }
        if (near) entry = e;
      }
    if (entry) {
      starts.push({ c, i: entry.y * size + entry.x, entry: true });
      continue;
    }
    // no river of the routing's comes in beside it: where it crosses the edge in two places or
    // more, and is long for its width (more than 12 times the square of its middle's distance from
    // its shore: a circle is about 3) or its crossings' levels differ by more than RIVER_DROP, it
    // is a wide river flowing through, and begins at the highest crossing; a lake the edge cuts is
    // round and level
    const crossings = edgeRuns(c);
    const long = cells[c].length > 12 * middle(c).depth ** 2;
    if (crossings.length > 1 && (long || crossings[0].z - crossings[crossings.length - 1].z > RIVER_DROP)) {
      starts.push({ c, i: crossings[0].i, entry: true });
      continue;
    }
    starts.push({ c, i: top[c], entry: false });
  }
  // highest first: a stretch the water of a higher one runs through needs no source
  starts.sort((a, b) => raw[halo(b.i)] - raw[halo(a.i)] || a.i - b.i);
  const fed = new Uint8Array(sizes.length);
  const entries: Entry[] = [];
  const heads: Head[] = [];
  const lakes: Group[] = [];
  // each stretch's kind, for its bed (`lowerBeds`): 1 a river, 2 a lake
  const kind = new Uint8Array(sizes.length);
  for (const s of starts) {
    // a stretch a river comes in to is that river's; else a broad, flat one is a lake
    const lake = !s.entry && lakeLike(s.c);
    kind[s.c] = lake ? 2 : 1;
    // a river coming in across the edge brings its own water: nothing on the map feeds it; a lake
    // gets its spring even so (its feed is small, and a river's water that does reach it takes the
    // spring away: water.source_in_flow's rule, below)
    if (fed[s.c] && !s.entry && !lake) continue;
    // the water's way down from here, on the routing: the stretches it passes within a tile of (a
    // lake's spring gives only what the lake evaporates: the stretches below it need their own)
    for (let p = halo(s.i), n = 0; !lake && p >= 0 && n < 4 * W; p = to[p], n++) {
      const px = (p % W) - HALO;
      const py = Math.floor(p / W) - HALO;
      if (px < -1 || py < -1 || px > size || py > size) break;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = px + dx;
          const yy = py + dy;
          if (xx >= 0 && yy >= 0 && xx < size && yy < size && labels[yy * size + xx] >= 0) fed[labels[yy * size + xx]] = 1;
        }
    }
    const x = s.i % size;
    const y = (s.i - x) / size;
    // a lake begins at a spring in its middle (the tile farthest from its shore and the map's
    // edge) that gives what it evaporates; a lake the map's edge cuts loses water over that edge,
    // so it gets EDGE_LAKE times as much
    if (lake) {
      const feed = LAKE_FEED * weight[s.c] * (onEdge[s.c] ? EDGE_LAKE : 1);
      lakes.push({ tiles: [middle(s.c).i], share: feed, lake: true, feed, cells: cells[s.c] });
      continue;
    }
    const area = Math.max(acc[halo(s.i)], sizes[s.c]);
    const edge: Edge | null = y <= 1 ? "south" : y >= size - 2 ? "north" : x <= 1 ? "west" : x >= size - 2 ? "east" : null;
    if (edge) entries.push({ x: edge === "west" ? 0 : edge === "east" ? size - 1 : x, y: edge === "south" ? 0 : edge === "north" ? size - 1 : y, edge, area });
    else heads.push({ x, y, area });
  }
  const groups = entries.length || heads.length ? groupsOf(entries, heads, size, h, flow) : [];
  return { groups: [...groups, ...lakes.filter((l) => !groups.some((g) => g.tiles.includes(l.tiles[0])))], sea, labels, kind };
}

/** The bed under the real water, a level down (Kyler, 2026-09-27, D300; as Pick a place's signature
 *  water lays it): a river's tiles each a level below their own, a lake's at a level below its
 *  median, so the water stays in the real river's course and the real lake's basin instead of
 *  spreading as a sheet over the flat the levels make of it. The sea's is left (it gets no water).
 *  Returns the tiles lowered. */
export function lowerBeds(h: Uint8Array, labels: Int32Array, kind: Uint8Array, size: number): number {
  const N = size * size;
  const lists: number[][] = Array.from(kind, () => []);
  for (let i = 0; i < N; i++) if (labels[i] >= 0 && kind[labels[i]]) lists[labels[i]].push(i);
  let lowered = 0;
  lists.forEach((list, c) => {
    if (!list.length) return;
    const zs = list.map((i) => h[i]).sort((a, b) => a - b);
    const level = zs[Math.floor(zs.length / 2)];
    for (const i of list) {
      const z = kind[c] === 2 ? Math.min(h[i], level - 1) : h[i] - 1;
      const bed = Math.max(0, z);
      if (bed < h[i]) {
        h[i] = bed;
        lowered++;
      }
    }
  });
  return lowered;
}

/** The source groups of rivers coming in and heads inside, with their share of the flow: each
 *  river's mouth row (as many tiles as its share gives at about PER_TILE each, centred on the
 *  channel's lowest tile on the edge, along the channel at its level), and each head's spring. */
function groupsOf(entries: Entry[], heads: Head[], size: number, h: Uint8Array, flow: number): Group[] {
  const all = [...entries, ...heads].sort((a, b) => b.area - a.area).slice(0, GROUPS);
  const sum = all.reduce((s, g) => s + Math.sqrt(g.area), 0);
  const shareOf = (area: number) => (flow * Math.sqrt(area)) / sum;
  entries = entries.filter((e) => all.includes(e));
  heads = heads.filter((e) => all.includes(e));
  const out: (Group & { area: number })[] = [];
  const taken = new Uint8Array(size * size);
  const along = (e: Edge, t: number) => (e === "south" ? t : e === "north" ? (size - 1) * size + t : e === "west" ? t * size : t * size + size - 1);
  for (const e of entries) {
    const t0 = e.edge === "south" || e.edge === "north" ? e.x : e.y;
    // the channel's level at the crossing: the lowest edge tile within 2
    let tc = t0;
    for (let t = Math.max(0, t0 - 2); t <= Math.min(size - 1, t0 + 2); t++) if (h[along(e.edge, t)] < h[along(e.edge, tc)]) tc = t;
    const level = h[along(e.edge, tc)];
    if (taken[along(e.edge, tc)]) continue;
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
      tiles.push(along(e.edge, t));
    }
    if (!tiles.length) continue;
    for (const i of tiles) taken[i] = 1;
    out.push({ area: e.area, tiles, share: shareOf(e.area), entry: true });
  }
  for (const s of heads) {
    const i = s.y * size + s.x;
    if (taken[i]) continue;
    // not on a mouth's row or next to one: that water is already there
    if (out.some((g) => g.tiles.some((t) => Math.max(Math.abs((t % size) - s.x), Math.abs(Math.floor(t / size) - s.y)) <= 3))) continue;
    taken[i] = 1;
    out.push({ area: s.area, tiles: [i], share: shareOf(s.area) });
  }
  out.sort((a, b) => b.area - a.area);
  // the flow of a river or head that got no source goes to the rest
  const got = out.reduce((s, g) => s + g.share, 0);
  return out.map((g) => ({ tiles: g.tiles, share: (g.share * flow) / got, ...(g.entry ? { entry: true as const } : {}) }));
}

/** Each group's share of the flow, and its tiles' strengths (at most 8 a tile, at least 0.1; a
 *  lake's spring at least 0.01), to a thousandth, their sum at most `flow`. */
function strengths(groups: Group[], size: number, flow = Infinity): [number, number, number][] {
  // the least a tile gets can lift the sum over the flow: the rest give up the difference (D214's
  // cap holds for all of it), a few rounds at most
  let scale = 1;
  for (let round = 0; ; round++) {
    const out: [number, number, number][] = [];
    for (const g of groups) {
      const each = Math.min(8, Math.max(g.lake ? 0.01 : 0.1, (g.share * scale) / g.tiles.length));
      for (const i of g.tiles) out.push([i % size, Math.floor(i / size), Math.round(each * 1000) / 1000]);
    }
    const sum = out.reduce((s, [, , v]) => s + v, 0);
    // (each rounded to a thousandth: half a thousandth a source over is the rounding's)
    if (sum <= flow + out.length * 0.0005 || round >= 8) return out;
    scale *= flow / sum;
  }
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
function starts(h: Uint8Array, W: number, H: number, water: Pick<CanonicalWater, "depth" | "contamination">, M: ArrayLike<number>, shoreFirst = false): [number, number][] {
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
 *  rest), which the built map's description and the resources' seed use. It fails only when no
 *  start on the land meets the absolutes (D245: the checks that are not about playability, and the
 *  starting-logs floor) or the land has no river or start at all; a place short of a playability
 *  check is converted and says so (`shortOf`, `notes`). */
export function convertRow(row: string, meta: PlaceMeta, flows?: readonly number[]): Converted {
  const t0 = performance.now();
  const m = /^(.+)-(\d+)-(\d+)-(\w+)-(\d+)$/.exec(row);
  if (!m) throw new Error(`not a survey row: ${row}`);
  const size = Number(m[2]);
  const metres = readPatch(`${m[1]}-${m[2]}-${m[3]}`);
  // 1. most of the land's overall tilt out before its levels (D300), then the levels
  const { raw, keep, smoothed } = detrend(metres, size + 2 * HALO, size, HALO, m[4], CAP);
  const h = quantise(crop(raw, size + 2 * HALO, size, HALO), m[4], CAP);
  const fail = (reason: string, extra: Partial<Converted> = {}): Converted => ({ row, ok: false, reason, size, ms: Math.round(performance.now() - t0), ...extra });

  const obs = observed(`${m[1]}-${m[2]}-${m[3]}`, meta.lat, meta.lon);
  // the bed a level down under the real water (D300); where real water lies on the lowest level,
  // the land is fitted to the levels above it, so its bed has a level to go down to
  const found = beginnings(raw, obs, size, h, 1, metres);
  let lifted = false;
  for (let i = 0; i < h.length && !lifted; i++) if (!h[i] && found.labels[i] >= 0 && found.kind[found.labels[i]]) lifted = true;
  if (lifted) {
    const up = quantise(crop(raw, size + 2 * HALO, size, HALO), m[4], CAP - 1);
    for (let i = 0; i < h.length; i++) h[i] = up[i] + 1;
  }
  const beds = lowerBeds(h, found.labels, found.kind, size);
  const land = { tiltKept: Math.round(keep * 1000) / 1000, beds, ...(lifted ? { lifted } : {}), ...(smoothed ? { smoothed } : {}) };

  // 2 and 3 at each flow up to the size's cap (D214), the sources where the real place's water
  // begins (D271); where the water keeps moving, fewer and larger rivers at the same flow (D214,
  // D271: the 3 largest, then the largest). The first that falls short of nothing, else the one
  // with the fewest notes, then the fewest shortfalls, in that order of trying
  let best: Converted | null = null;
  let last: Converted | null = null;
  const rank = (r: Converted) => [r.notes?.length ?? 0, r.shortOf?.length ?? 0];
  flows: for (const times of flows ?? flowsFor(size)) {
    let r: Converted | null = null;
    for (const most of FEWER) {
      if (r && (r.settled !== false || (r.rivers ?? 0) <= most)) break;
      r = { ...attempt(row, meta, raw, metres, obs, size, h, times, most, fail), ...land };
      last = r;
      if (r.ok && !r.shortOf?.length) return { ...r, ms: Math.round(performance.now() - t0) };
      if (!r.ok && /^start: no flat/.test(r.reason ?? "")) break flows;
      if (r.ok) {
        const [a1, b1] = rank(r);
        const [a0, b0] = best ? rank(best) : [Infinity, Infinity];
        if (a1 < a0 || (a1 === a0 && b1 < b0)) best = r;
      }
      if (!r.ok) break;
    }
    // more flow only spreads water wider; a dry place has none to give
    if ((r!.cover ?? 0) > MAX_COVER || !r!.rivers) break;
  }
  return { ...(best ?? last!), ms: Math.round(performance.now() - t0) };
}

/** How much of a tile OpenStreetMap's river line counts as (osm.ts): enough to be water, never a
 *  lake's core. */
const OSM_RIVER = 0.5;

/** The real place's water on a patch (D271): ESA WorldCover's permanent water, and OpenStreetMap's
 *  permanent rivers where WorldCover misses them (a narrow river, one in a gorge's shade). */
export function observed(patch: string, lat: number, lon: number): Float32Array {
  const obs = readWater(patch);
  const lines = riverTiles(patch, lat, lon);
  for (let i = 0; i < obs.length; i++) if (lines[i]) obs[i] = Math.max(obs[i], OSM_RIVER);
  return obs;
}

/** The water floor's spring (D300): the strengths tried, smallest first; the tiles tried at each;
 *  the starts it is sought near, in turn; the starts tried with its water. */
const SPRING_STRENGTHS = [0.1, 0.2, 0.4, 0.7, 1, 1.5, 2, 3, 5];
const SPRING_CANDIDATES = 12;
const SPRING_STARTS = 4;
const SPRING_START_TRIES = 10;

/** Rivers kept, at most, in turn, where the water keeps moving (D214, D271). */
const FEWER = [GROUPS, 3, 1];

/** How the settled water matches the real place's (D271): the observed water on the map (in tiles'
 *  worth), the share of it the water stands on (within a tile), and the share of the water
 *  standing on or beside observed water. */
function observedMatch(obs: Float32Array, size: number, depth: ArrayLike<number>): NonNullable<Converted["observed"]> {
  const W = size + 2 * HALO;
  const at = (x: number, y: number) => obs[(y + HALO) * W + x + HALO];
  const wet = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && depth[y * size + x] > 0.001;
  let water = 0;
  let found = 0;
  let wetTiles = 0;
  let onWater = 0;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const o = at(x, y);
      let nearWet = false;
      let nearObs = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (wet(x + dx, y + dy)) nearWet = true;
          nearObs = Math.max(nearObs, at(x + dx, y + dy));
        }
      water += o;
      if (nearWet) found += o;
      if (wet(x, y)) {
        wetTiles++;
        if (nearObs >= NEAR) onWater++;
      }
    }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { water: Math.round(water), recall: water >= 1 ? r(found / water) : null, precision: wetTiles ? r(onWater / wetTiles) : null };
}

/** Whether a group's water stands mostly off the real place's water: its water alone (the settle's
 *  starting state, `prefill`: the lakes it fills to their spill level and the channels it runs
 *  in), spread over every flat its channels cross (where the settle lays a thin sheet), covers more
 *  tiles with no observed water within 3 tiles than three times the tiles near it, and 200 more. A
 *  river's water spreads over the flat floor the 16 levels give its valley, so the rule is loose:
 *  it takes water that would cover a crater floor where the real place has a small lake
 *  (Ngorongoro). It is asked only of water that begins on the map: a river coming in across the
 *  edge always stays. A lake's is strict: its basin starts full to its spill level, so a spring whose
 *  basin is larger than the real lake would fill it all; it goes when more of its water stands over
 *  a tile from the real lake than on it, and 50 more. */
export function offWater(g: Group, obs: Float32Array, size: number, h: Uint8Array): boolean {
  const W = size + 2 * HALO;
  const N = size * size;
  const model = waterModel(size, size, h, sourceEntities(strengths([g], size), h, size).map(mapObject));
  const depth = prefill(model).depth;
  // the water spreads over every flat its channels cross (the settle's thin sheets): each wet tile's
  // level, out to the tiles of that level joined to it
  const wet = new Uint8Array(N);
  const queue: number[] = [];
  for (let i = 0; i < N; i++)
    if (depth[i] > 0.05) {
      wet[i] = 1;
      queue.push(i);
    }
  if (!g.lake)
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      const x = i % size;
      for (const j of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size])
        if (j >= 0 && j < N && !wet[j] && h[j] === h[i]) {
          wet[j] = 1;
          queue.push(j);
        }
    }
  let on = 0;
  let off = 0;
  for (let i = 0; i < N; i++) {
    if (!wet[i]) continue;
    const x = i % size;
    const y = (i - x) / size;
    // a lake's water within a tile of the real lake; a river's within 3 tiles of its river
    const r = g.lake ? 1 : 3;
    let near = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) near = Math.max(near, obs[(y + dy + HALO) * W + x + dx + HALO]);
    // observed water as its stretches are (WET), not a few wet pixels on a marsh
    if (near < WET) off++;
    else on++;
  }
  return g.lake ? off > on + 50 : off > 3 * on + 200;
}

/** One conversion at one flow, `times` the generator's water strength for the map's size, with at
 *  most `most` rivers (the largest). */
function attempt(row: string, meta: PlaceMeta, raw: Float32Array, metres: Float32Array, obs: Float32Array, size: number, h: Uint8Array, times: number, most: number, fail: (reason: string, extra?: Partial<Converted>) => Converted): Converted {
  const N = size * size;
  const flow = (times * density("water_strength_per_10k", N) * N) / 1e4;
  const found = beginnings(raw, obs, size, h, flow, metres);
  const land = found.groups.length;
  // the groups whose water would stand mostly off the real water go (D271)
  // (a river coming in across the edge is real water that runs on wherever the land takes it: it stays)
  let groups = found.groups.filter((g) => g.entry || !offWater(g, obs, size, h));
  const off = land - groups.length;
  // the rivers share the flow; each lake keeps its own feed
  // the lakes' feeds come out of the flow (D214's cap holds for all of it), half of it at most
  // when there are rivers too; the rivers share the rest
  const riversOf = (list: Group[]) => {
    const rivers = list.filter((g) => !g.lake);
    const lakes = list.filter((g) => g.lake);
    const want = lakes.reduce((s, g) => s + g.feed!, 0);
    const scale = want ? Math.min(1, (rivers.length ? flow / 2 : flow) / want) : 1;
    const left = flow - want * scale;
    const share = rivers.reduce((s, g) => s + g.share, 0);
    return [...rivers.map((g) => ({ ...g, share: (g.share * left) / share })), ...lakes.map((g) => ({ ...g, share: g.feed! * scale }))];
  };
  groups = riversOf([...groups.filter((g) => !g.lake).sort((a, b) => b.share - a.share).slice(0, most), ...groups.filter((g) => g.lake)]);
  const dropped: NonNullable<Converted["dropped"]> = { inFlow: 0, noOutflow: 0, offWater: off };
  let sources = strengths(groups, size, flow);
  let model = waterModel(size, size, h, sourceEntities(sources, h, size).map(mapObject));
  let water = canonicalSettle(model);
  for (let round = 0; round < 16 && groups.length; round++) {
    const objects = sourceEntities(sources, h, size).map(mapObject);
    const inFlow = new Set(sourcesInFlow(model, objects, water.depth).inFlow);
    const pools = noOutflow(model, water.depth);
    // which groups go: a group goes when any of its tiles is flagged
    let at = 0;
    const gone = groups.map((g) => {
      const idx = g.tiles.map(() => at++);
      const flow = idx.some((k) => inFlow.has(k));
      // a lake's own water may stay in its basin: that is the real lake
      const pool = !g.lake && idx.some((k) => pools.has(k));
      return flow ? "flow" : pool ? "pool" : null;
    });
    if (!gone.some(Boolean)) break;
    // a river coming in across the edge is where its water begins: when water from the map
    // reaches it (spread over a flat floor the 16 levels give its valley), the source whose water
    // does goes instead: of the others, the smallest whose leaving frees a river coming in (tried on
    // the settle's starting state), one a round; else the smallest river coming in that is reached
    if (groups.some((g, k) => g.entry && gone[k] === "flow")) {
      const flowing = groups.map((_, k) => k).filter((k) => groups[k].entry && gone[k] === "flow");
      groups.forEach((g, k) => {
        if (g.entry && gone[k] === "flow") gone[k] = null;
      });
      const reached = (list: Group[]) => {
        const objs = sourceEntities(strengths(list, size, flow), h, size).map(mapObject);
        const m = waterModel(size, size, h, objs);
        const hit = new Set(sourcesInFlow(m, objs, prefill(m).depth).inFlow);
        let at = 0;
        return list.map((g) => g.tiles.map(() => at++).some((k) => hit.has(k)));
      };
      const others = groups.map((_, k) => k).filter((k) => !groups[k].entry && !gone[k]).sort((a, b) => groups[a].share - groups[b].share);
      let culprit = -1;
      for (const k of others) {
        const without = groups.filter((_, j) => j !== k);
        const still = reached(without);
        if (flowing.some((f) => !still[f < k ? f : f - 1])) {
          culprit = k;
          break;
        }
      }
      if (culprit < 0) culprit = flowing.sort((a, b) => groups[a].share - groups[b].share)[0];
      gone[culprit] = "flow";
    }
    const keep = groups.filter((_, k) => !gone[k]);
    // keep the strongest where it is, if every one would go: it is where water begins, if
    // anything is (a pool it fills is information, D245)
    if (!keep.length) break;
    for (const g of gone) if (g === "flow") dropped.inFlow++;
    else if (g === "pool") dropped.noOutflow++;
    groups = riversOf(keep);
    sources = strengths(groups, size, flow);
    model = waterModel(size, size, h, sourceEntities(sources, h, size).map(mapObject));
    water = canonicalSettle(model);
  }
  // a lake the land cannot hold (the elevation data's lake surface is a flat that is no basin, and
  // the spring's water only makes a thin disc on it) loses its spring: less than half the real lake
  // under water
  const unheld = groups.filter((g) => g.lake && g.cells!.filter((i) => water.depth[i] > 0.001).length < g.cells!.length / 2);
  if (unheld.length) {
    dropped.unheld = unheld.length;
    groups = riversOf(groups.filter((g) => !unheld.includes(g)));
    sources = strengths(groups, size, flow);
    model = waterModel(size, size, h, sourceEntities(sources, h, size).map(mapObject));
    water = canonicalSettle(model);
  }
  const cover = waterCover(water.depth);
  // water that has not settled in 4 days is kept as it is (D245 (6): the file holds the water the
  // editor shows, and it goes on moving in the game as modelled), with its note
  const base = { heights: encodeHeights(h), sources, dropped, settled: water.settled, ticks: water.ticks, flow: times, cover, beginnings: land, rivers: groups.length, observed: observedMatch(obs, size, water.depth), ...(found.sea ? { sea: found.sea } : {}) };

  // 3. the start: the best positions, each built and checked in full
  const objects = sourceEntities(sources, h, size).map(mapObject);
  const M = moisture(h, water.depth, water.contamination, size, size, moistureBarrier(size, size, objects));
  const first = starts(h, size, size, water, M).slice(0, TRIES);
  if (!first.length) return fail("start: no flat dry 3×3 with a dry ring on this land", base);
  // none of the first passes every check: the start moves to the water (D214), the shore-first
  // ranking's starts not yet tried
  const tried = new Set(first.map(([x, y]) => y * size + x));
  const shore = () => starts(h, size, size, water, M, true).filter(([x, y]) => !tried.has(y * size + x)).slice(0, SHORE_TRIES);
  let best: Converted | null = null;
  let blocked: string[] | null = null;
  let count = 0;
  // the water floor (D300) first: a start with water a pump reaches, then the fewest notes
  const dry = (r: Converted) => (r.shortOf!.includes("start.water") ? 1 : 0);
  const better = (r: Converted, b: Converted | null) => !b || dry(r) < dry(b) || (dry(r) === dry(b) && (r.notes!.length < b.notes!.length || (r.notes!.length === b.notes!.length && r.shortOf!.length < b.shortOf!.length)));
  const passing: Converted[] = [];
  for (const moved of [false, true]) {
    for (const start of moved ? shore() : first) {
      count++;
      const place: PlaceData = { format: 2, ...meta, W: size, H: size, heights: base.heights, sources, start };
      const built = buildPlace(place, water);
      const v = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
      const { blocking, shortOf } = placeProblems(v.report.checks);
      // the starting-logs floor (D224, D227), an absolute the validators do not carry yet
      if (logFloorProblem(built.logs)) blocking.push("start.log_floor");
      if (blocking.length) {
        if (!blocked || blocking.length < blocked.length) blocked = blocking;
        continue;
      }
      const advisories = v.report.checks.filter((c) => !c.ok && c.advisory && c.applicable !== false).map((c) => c.id);
      const notes = placeNotes(v.report.checks);
      const r: Converted = { row, ok: true, size, ...base, start, shortOf, notes, advisories, ...(moved ? { moved } : {}), ms: 0 };
      if (!shortOf.length) return r;
      passing.push(r);
      if (better(r, best)) best = r;
    }
  }
  if (!best) return fail(`the best of ${count} starts fails ${blocked!.join(", ")}`, base);
  if (!dry(best)) return best;
  // no start reaches water a pump works from, even moved to it (D214): the water floor's spring
  // near the start (D300), at the best starts in turn
  const order = passing.filter((r) => dry(r)).sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const why = groups.length ? "far" : "dry";
  for (const r of order.slice(0, SPRING_STARTS)) {
    const got = springNear(r, meta, raw, size, h, sources, water, why);
    if (got) return got;
  }
  // none near those starts: a hollow anywhere, the start moved to it
  return (order.length && springNear(order[0], meta, raw, size, h, sources, water, why, true)) || best;
}

/** The water floor (Kyler, 2026-09-27, D300), like the starting-logs floor: every place has water a
 *  pump reaches from the start. Where no start reaches any (the place has no water in its square,
 *  or its real water is out of reach even with the start moved to it, D214), one natural spring
 *  stands where the land drains near the start: in a hollow the spring fills (a pond) first, then
 *  on the tiles the most land drains to, within the rule's walk of the start (those whose water
 *  would not run past it first); the smallest strength that works (SPRING_STRENGTHS). With the
 *  spring's water the start is chosen again as D214 moves it, to the water (the shore-first
 *  ranking), and the place is built and checked in full: nothing that blocks, and water a pump
 *  reaches from the start. */
function springNear(r: Converted, meta: PlaceMeta, raw: Float32Array, size: number, h: Uint8Array, sources: [number, number, number][], water: CanonicalWater, why: "dry" | "far", wide = false): Converted | null {
  const N = size * size;
  const W = size + 2 * HALO;
  const rules = DIFFICULTY_RULES.normal;
  const [sx, sy] = r.start!;
  const centre = { x: sx + 1, y: sy + 1 };
  const walk = walkDistance(h, size, size, null, [], centre, 24);
  const { acc, to } = rivers(raw, size, HALO).drainage;
  /** Whether a spring here would run past the start: the land's way down from it (the routing)
   *  passes within 3 tiles of the start's middle. */
  const pastStart = (i: number) => {
    for (let p = ((i - (i % size)) / size + HALO) * W + (i % size) + HALO, n = 0; p >= 0 && n < 4 * W; p = to[p], n++) {
      const x = (p % W) - HALO;
      const y = Math.floor(p / W) - HALO;
      if (Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y)) <= 3) return true;
    }
    return false;
  };
  const hollow = spillLevels(waterModel(size, size, h, []));
  // the candidates: within the walk, off the start's ground, dry now
  const cands: { i: number; score: number }[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % size;
    const y = (i - x) / size;
    if (!h[i] || water.depth[i] > 0 || Math.max(Math.abs(x - centre.x), Math.abs(y - centre.y)) <= 3) continue;
    const pond = hollow[i] - h[i] >= PUMP_DEPTH ? 2 : 0;
    if (wide) {
      // wide: a hollow anywhere on the map, nearest the start first (the start then moves to it)
      if (pond && x > 3 && y > 3 && x < size - 4 && y < size - 4) cands.push({ i, score: -Math.hypot(x - centre.x, y - centre.y) });
      continue;
    }
    if (reachAt(walk, size, size, i) > rules.waterWithin - 2) continue;
    const clear = pastStart(i) ? 0 : 1;
    cands.push({ i, score: (pond + clear) * 1e12 + acc[(y + HALO) * W + x + HALO] });
  }
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const dbg = process.env.DGM_SPRING_DEBUG ? (...a: unknown[]) => console.log(...a) : () => undefined;
  dbg("spring", r.row, r.start, cands.length);
  const picked: number[] = [];
  for (const c of cands) {
    if (picked.length >= SPRING_CANDIDATES) break;
    if (picked.some((j) => Math.max(Math.abs((j % size) - (c.i % size)), Math.abs(Math.floor(j / size) - Math.floor(c.i / size))) < 4)) continue;
    picked.push(c.i);
  }
  // water that settles first; then water that goes on moving, with its note (D245 (6))
  for (const steady of [true, false])
  for (const strength of SPRING_STRENGTHS)
    for (const i of picked) {
      const spring: [number, number, number] = [i % size, Math.floor(i / size), strength];
      const all = [...sources, spring];
      const objects = sourceEntities(all, h, size).map(mapObject);
      const model = waterModel(size, size, h, objects);
      // the settle's starting state first (quick): a start with a pump's water within its walk
      const first = prefill(model);
      const shoreOf = (w: Pick<CanonicalWater, "depth" | "contamination">, limit: number) => {
        const M = moisture(h, w.depth, w.contamination, size, size, moistureBarrier(size, size, objects));
        return starts(h, size, size, w, M, true)
          .slice(0, limit)
          .filter(([x, y]) => pumpShoreDistance(walkDistance(h, size, size, null, [], { x: x + 1, y: y + 1 }, 24), h, size, size, w.depth, w.contamination).distance <= rules.waterWithin);
      };
      const here = pumpShoreDistance(walk, h, size, size, first.depth, first.contamination).distance <= rules.waterWithin;
      if (!here && !shoreOf(first, 1).length) {
        dbg("no shore start", spring);
        continue;
      }
      const settled = canonicalSettle(model);
      if (steady && !settled.settled) continue;
      // never inside another source's water (D171), nor any other inside the spring's
      if (sourcesInFlow(model, objects, settled.depth).inFlow.length) continue;
      // its own start first (it met the floors), then the start moved to the spring's water
      const own = pumpShoreDistance(walk, h, size, size, settled.depth, settled.contamination).distance <= rules.waterWithin ? [[sx, sy] as [number, number]] : [];
      for (const start of [...own, ...shoreOf(settled, SPRING_START_TRIES).filter(([x, y]) => x !== sx || y !== sy)]) {
        const place: PlaceData = { format: 2, ...meta, W: size, H: size, heights: r.heights!, sources: all, start };
        const built = buildPlace(place, settled);
        const v = validateMap(built.file, { profile: "generate", designedFor: "normal", features: [], water: { model: built.model, settled: built.settle } });
        const { blocking, shortOf } = placeProblems(v.report.checks);
        if (logFloorProblem(built.logs)) blocking.push("start.log_floor");
        if (blocking.length || shortOf.includes("start.water")) {
          dbg("checks", spring, start, blocking, shortOf);
          continue;
        }
        const advisories = v.report.checks.filter((c) => !c.ok && c.advisory && c.applicable !== false).map((c) => c.id);
        const moved = start[0] !== sx || start[1] !== sy;
        return { ...r, sources: all, start, ...(moved ? { moved: true } : {}), spring: { at: [spring[0], spring[1]], strength, why }, settled: settled.settled, ticks: settled.ticks, cover: waterCover(settled.depth), shortOf, notes: placeNotes(v.report.checks), advisories };
      }
    }
  return null;
}
