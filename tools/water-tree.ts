// Water tree: whether a map's water is a drainage tree (a trunk, a few tributaries that grow at each join, wide dry
// ground between them) or a web of thin threads of one width each going its own way out, measured on the settled water
// of a map as the player sees it (planning's finding on #236, "ruled water" round 2, 2026-11-15).
//
//   npx tsx tools/water-tree.ts <out> [<out> …]       the measures of every map in each folder: rows, totals, per theme
//   npx tsx tools/water-tree.ts map.timber …          the measures of these files
//   npx tsx tools/water-tree.ts --json <file> …       the same, and every map's row written to <file> as JSON
//
// The water: the settled water a .timber stores on the surface, `WET` deep or more (a thin course's head and its
// shallows run under the 0.1 `tools/ruled-water.ts` reads, and cut there a course read as pieces). The lakes: the
// water in a disc of radius 8.5 all water (`LAKE_R2`, 17 tiles across, so a river and its pools stay channel, where
// `ruled-water.ts`'s wide water, 10 across, took a 256² trunk for a lake); the rest is channel. The sea: a part of the
// lakes touching the map's border with `SEA` of the map or more, along `SEA_SHORE` of its side.
//
// (a) Courses. Every course begins at a head, and every head is the game's: the map's clean water sources (a
//   `WaterSource` with a strength; badwater sources are left out), those within 3 tiles of each other one head (a
//   river's mouth is a row of them). `inflows` are the heads on the map's border, `springs` the rest; `flow` their
//   strength. A head's system is the part of the water (8-connected, the sea taken out) it stands in. A course is
//   - `joined` when its system holds another head: its water meets another course's (at a join or in a lake) before
//     it leaves;
//   - `alone` when its system holds no other head and reaches the map's border (`edge`) or the sea (`sea`): it goes
//     its own way out;
//   - `lost` otherwise: its water ends inland, in a pond or a hollow, or spreads thin and stops.
//   `systems` are the parts holding a head; `heads/system` the heads in each on average.
// (b) Wet share on day 1: the land (tiles under `WET` deep) the game's moisture reaches from the water, `sim/soil.ts`
//   `gameMoistureReach` (sim/soil3d.ts `moistureReach3d`, the rule the game's soil settles to, on the stored water,
//   its contamination and the map's objects) at `MOIST_MIN` or more, as a share of the land. `spacing`: the land per
//   tile of channel centre line, about the width of dry ground between parallel threads.
// (b') Irrigable dry (planning's rule 5 for the water tree, 2026-11-15): the land the moisture does not reach on day 1
//   that a short canal could water: within `IRR_CANAL` tiles' walk over the land (four sides) of a course's clean water
//   (`WET` deep or more, not the sea, under 0.1 contaminated), and at most `IRR_LIFT` levels above that water's surface
//   (the nearest water's, by the walk); as a share of the land. The aim is dry ground a player can water, not reach.
// (c) Width by order. The channels' centre line is their Zhang–Suen thinning (`ruled-water.ts` `thin`). Its tiles'
//   crossing number (the runs of line tiles round each tile's eight) is 1 at an end, 2 along a line, 3 or more at a
//   join (touching join tiles are one join). The join tiles taken out cut the line into links (8-connected, never
//   linking two tiles beside the same join, which would close a join round its corner). Lines under `MIN_LINE` tiles
//   in all (a puddle's) are left out. A line's end is a head's when a head's source lies within its half-width plus
//   `HEAD_REACH` tiles; else a way out's when the sea or a wet border tile lies within its half-width plus 2; else a
//   lake's when another lake does; else stray. A link whose every end is stray (the thinning's spurs, the
//   shallows' fingers) is dropped, again and again until none is left.
//   Width at a centre-line tile: from the nearest dry tile (distance d1, by a nearest-source flood) straight back
//   across the water through the tile to the first dry tile on the other side (d2, half-tile steps): d1 + d2 − 1
//   (a channel n tiles wide reads n); where the far side runs off the map, 2·d1 − 1.
//   - `width`: the median over the centre line; `oneWidth`: the share of the centre line within 1 tile of that median;
//     `thin`: the share 4 tiles wide or less.
//   - The paths. The way down along the line: each line tile's distance along it from the nearest way out (a line
//     tile read as a way out's end would be; on a part with none, as a lake's). Each head's path starts at the line tile
//     nearest its sources (within `HEAD_LINE`) and steps down the way down, tile by tile, until a way out or a tile
//     an earlier path took: there it joins it. The paths are drawn longest first, so the trunk is drawn whole and
//     every tributary ends at its join; `course` is the paths' mean length in tiles.
//   - `w1`: the median width of the first order (each path above the first join onto it); `w2`: of the rest.
//   - `joins`: the joins the paths make; `wider`: those where the path below the join (its tiles `NEAR` down from it)
//     is a tile or more wider (medians) than both the path joining (its last `NEAR` tiles) and the one it joins above
//     the join (its `NEAR` tiles up from it). (The thinning's own joins, a braid's or a pool's, are not read, nor a
//     head's whose path is under `NEAR[0]` tiles, a spring on another's water that brings no stream of its own, nor
//     one under `NEAR[0]` tiles from a way out, with no stretch below it to read.) A join through a lake: the paths
//     that end in one lake (not the sea) against the lake's outlet stretch below it, read as that many joins less one.
// (d) The start's own water: the water nearest the start's middle tile, on a trunk, a tributary, a lake, the sea or
//   other water (a pond, a stretch no head's path takes).
// (e) Order: the paths that join none are trunks; those that join another are tributaries, or brooks when their
//   median width is `BROOK_WIDTH` or less.

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTimber } from "../src/core/format/timber";
import { storedWater, surfaceOf } from "../src/core/format/world";
import * as portable from "../src/core/math/portable";
import { startOfObjects } from "../src/core/analysis/easyStart";
import { mapObjects, specifiedStrength, type MapObject } from "../src/core/sim/model";
import { gameMoistureReach } from "../src/core/sim/soil";
import { MOIST_MIN } from "../src/core/sim/soil3d";
import { thin } from "./ruled-water";

/** Water this deep or more is the water read here. */
export const WET = 0.02;
/** Lakes: water in a disc of this radius² all water (17 tiles across: a river, 8.4 wide at most by D26, and its
 *  pools stay channel). */
export const LAKE_R2 = 72.25;
/** A lake touching the border with this share of the map or more is the sea, */
export const SEA = 0.02;
/** where it runs along the border for this share of the map's side (round 3: a trunk 17 wide leaving by an edge is a
 *  lake by `LAKE_R2` but no sea, and the tributaries joining it were counted alone). */
export const SEA_SHORE = 0.25;
/** Sources this close (Chebyshev) are one head. */
export const HEAD_GAP = 3;
/** A line's end within its half-width and this many tiles of a source is a head's. */
export const HEAD_REACH = 4;
/** A head's path starts at the centre line's tile nearest its sources within this many tiles. */
export const HEAD_LINE = 12;
/** Lines shorter than this in all are a puddle's, left out. */
export const MIN_LINE = 8;
/** The stretch of each link read at a join, in tiles along the line from it. */
export const NEAR = [4, 20] as const;
/** Irrigable dry (b'): a short canal's walk from a course's water, and the levels above its surface it may lift. */
export const IRR_CANAL = 24;
/** A path that joins another no wider than this (median) is a brook (e). */
export const BROOK_WIDTH = 2.5;
/** How far from the start's middle tile its own water is looked for (d). */
export const START_REACH = 40;
export const IRR_LIFT = 2;

const N8: readonly [number, number][] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export interface Head {
  x: number;
  y: number;
  kind: "inflow" | "spring";
  flow: number;
  fate: "joined" | "edge" | "sea" | "lost";
}

export interface WaterTree {
  heads: Head[];
  courses: number;
  inflows: number;
  springs: number;
  joined: number;
  alone: number;
  edge: number;
  sea: number;
  lost: number;
  systems: number;
  centre: number;
  land: number;
  spacing: number;
  wetShare: number;
  /** Irrigable dry, a share of the land (b'). */
  irrigable: number;
  width: number;
  oneWidth: number;
  thin: number;
  w1: number;
  w2: number;
  joins: number;
  wider: number;
  /** The heads' paths in all, each from its head down to its join or way out (tiles). */
  courseLen: number;
  /** The start's own water (d): the nearest water to the start's middle tile, on a trunk (a path that joins none), a
   *  tributary (one that joins another), a lake, the sea, other water (a pond, a stretch no head's path takes), or none
   *  within `START_REACH`. */
  startOn: "trunk" | "tributary" | "lake" | "sea" | "other" | "none";
  /** The heads' paths by order (e): trunks (a path that joins none), tributaries (one that joins another, its median
   *  width over `BROOK_WIDTH`) and brooks (one that joins another, no wider). */
  trunks: number;
  tributaries: number;
  brooks: number;
  /** For a picture: 1 the centre line kept, 2 a join, 3 a join wider below. */
  marks: Uint8Array;
}

const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The lakes: tiles in a disc of radius² `LAKE_R2` that is all water (the map's outside counts as water). */
function lakesOf(wet: Uint8Array, W: number, H: number): Uint8Array {
  const R = Math.floor(portable.sqrt(LAKE_R2));
  const disc: [number, number][] = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= LAKE_R2) disc.push([dx, dy]);
  const isWet = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || wet[y * W + x] === 1;
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!wet[y * W + x] || !disc.every(([dx, dy]) => isWet(x + dx, y + dy))) continue;
      for (const [dx, dy] of disc) {
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
      }
    }
  return out;
}

/** The 8-connected parts of a mask: each tile's part (−1 off the mask) and the parts' tiles. */
function parts(mask: Uint8Array, W: number, H: number): { of: Int32Array; tiles: number[][] } {
  const of = new Int32Array(W * H).fill(-1);
  const tiles: number[][] = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || of[s] >= 0) continue;
    const id = tiles.length;
    const q = [s];
    of[s] = id;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W,
        y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (mask[j] && of[j] < 0) {
          of[j] = id;
          q.push(j);
        }
      }
    }
    tiles.push(q);
  }
  return { of, tiles };
}

interface Net {
  link: Int32Array;
  links: { tiles: number[]; ends: number[]; joins: number[] }[];
  joinTiles: number[][];
}

/** The centre line's joins and links (see the header). */
function network(line: Uint8Array, W: number, H: number): Net {
  const N = W * H;
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? line[y * W + x] : 0);
  const kind = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (!line[i]) continue;
    const x = i % W,
      y = (i - x) / W;
    const P = N8.map(([dx, dy]) => at(x + dx, y + dy));
    let A = 0;
    for (let k = 0; k < 8; k++) if (!P[k] && P[(k + 1) % 8]) A++;
    kind[i] = A <= 1 ? 1 : A === 2 ? 2 : 3;
  }
  const join = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (kind[i] === 3) join[i] = 1;
  const J = parts(join, W, H);
  // (each tile's joins beside it, to keep links from closing round a join's corner)
  const besideJoin = (i: number): number[] => {
    const x = i % W,
      y = (i - x) / W;
    const out: number[] = [];
    for (const [dx, dy] of N8) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = J.of[yy * W + xx];
      if (j >= 0 && !out.includes(j)) out.push(j);
    }
    return out;
  };
  const link = new Int32Array(N).fill(-1);
  const links: Net["links"] = [];
  for (let s = 0; s < N; s++) {
    if (!kind[s] || kind[s] === 3 || link[s] >= 0) continue;
    const id = links.length;
    const tiles = [s];
    link[s] = id;
    const js = new Set<number>();
    for (let k = 0; k < tiles.length; k++) {
      const i = tiles[k];
      const bi = besideJoin(i);
      for (const j of bi) js.add(j);
      const x = i % W,
        y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!kind[j] || kind[j] === 3 || link[j] >= 0) continue;
        if (bi.length && besideJoin(j).some((b) => bi.includes(b))) continue;
        link[j] = id;
        tiles.push(j);
      }
    }
    links.push({ tiles, ends: tiles.filter((t) => kind[t] === 1), joins: [...js] });
  }
  return { link, links, joinTiles: J.tiles };
}

/** The measures of one map's settled water: `heights` its ground, `depth` and `contamination` the water on it,
 *  `objects` the map's (its water sources are the heads). */
export function waterTree(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number>, contamination: ArrayLike<number>, objects: readonly MapObject[]): WaterTree {
  const N = W * H;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = depth[i] >= WET ? 1 : 0;
  const wide = lakesOf(wet, W, H);
  const onBorder = (i: number) => {
    const x = i % W,
      y = (i - x) / W;
    return x === 0 || y === 0 || x === W - 1 || y === H - 1;
  };
  // ---- the sea
  const sea = new Uint8Array(N);
  for (const p of parts(wide, W, H).tiles) if (p.length >= SEA * N && p.filter(onBorder).length >= SEA_SHORE * Math.min(W, H)) for (const i of p) sea[i] = 1;
  // ---- (a) the heads and their systems
  const srcs = objects.filter((o) => o.template === "WaterSource" && specifiedStrength(o.components) > 0 && o.x >= 0 && o.y >= 0 && o.x < W && o.y < H);
  const groups: MapObject[][] = [];
  for (const o of srcs) {
    const near = groups.filter((g) => g.some((p) => Math.max(Math.abs(p.x - o.x), Math.abs(p.y - o.y)) <= HEAD_GAP));
    if (!near.length) groups.push([o]);
    else {
      near[0].push(o);
      for (const g of near.slice(1)) {
        near[0].push(...g);
        groups.splice(groups.indexOf(g), 1);
      }
    }
  }
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = wet[i] && !sea[i] ? 1 : 0;
  const sys = parts(land, W, H);
  const systemOf = (g: MapObject[]): number => {
    for (const o of g) if (sys.of[o.y * W + o.x] >= 0) return sys.of[o.y * W + o.x];
    // (a source's own tile dry: the nearest water within the gap)
    for (const o of g)
      for (let r = 1; r <= HEAD_GAP; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const xx = o.x + dx,
              yy = o.y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H && sys.of[yy * W + xx] >= 0) return sys.of[yy * W + xx];
          }
    return -1;
  };
  const sysOf = groups.map(systemOf);
  const count = new Map<number, number>();
  for (const s of sysOf) if (s >= 0) count.set(s, (count.get(s) ?? 0) + 1);
  const touchesSea = (s: number): boolean => {
    for (const i of sys.tiles[s]) {
      const x = i % W,
        y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && sea[yy * W + xx]) return true;
      }
    }
    return false;
  };
  const heads: Head[] = groups.map((g, k) => {
    const s = sysOf[k];
    const fate: Head["fate"] = s >= 0 && count.get(s)! > 1 ? "joined" : s >= 0 && sys.tiles[s].some(onBorder) ? "edge" : s >= 0 && touchesSea(s) ? "sea" : s < 0 && g.some((o) => sea[o.y * W + o.x]) ? "sea" : "lost";
    const x = Math.round(g.reduce((a, o) => a + o.x, 0) / g.length),
      y = Math.round(g.reduce((a, o) => a + o.y, 0) / g.length);
    return { x, y, kind: g.some((o) => onBorder(o.y * W + o.x)) ? "inflow" : "spring", flow: Math.round(g.reduce((a, o) => a + specifiedStrength(o.components), 0) * 100) / 100, fate };
  });
  // ---- (c) the centre line, its widths and joins
  const channel = new Uint8Array(N);
  for (let i = 0; i < N; i++) channel[i] = wet[i] && !wide[i] ? 1 : 0;
  const line = thin(channel, W, H);
  {
    const L = parts(line, W, H);
    for (const p of L.tiles) if (p.length < MIN_LINE) for (const i of p) line[i] = 0;
  }
  // (the nearest dry tile, by a nearest-source flood)
  const src = new Int32Array(N).fill(-1);
  {
    const q: number[] = [];
    for (let i = 0; i < N; i++)
      if (!wet[i]) {
        src[i] = i;
        q.push(i);
      }
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W,
        y = (i - x) / W;
      const s = src[i];
      const sx = s % W,
        sy = (s - sx) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (src[j] >= 0) {
          const o = src[j];
          const ox = o % W,
            oy = (o - ox) / W;
          if ((xx - ox) * (xx - ox) + (yy - oy) * (yy - oy) <= (xx - sx) * (xx - sx) + (yy - sy) * (yy - sy)) continue;
        }
        src[j] = s;
        q.push(j);
      }
    }
  }
  const half = (i: number): number => {
    const s = src[i];
    if (s < 0) return W + H;
    const x = i % W,
      y = (i - x) / W;
    return portable.hypot((s % W) - x, Math.floor(s / W) - y);
  };
  const widthAt = (i: number): number => {
    const s = src[i];
    if (s < 0) return W + H;
    const x = i % W,
      y = (i - x) / W;
    const d1 = half(i);
    const ux = (x - (s % W)) / d1,
      uy = (y - Math.floor(s / W)) / d1;
    for (let t = 0.5; t < W + H; t += 0.5) {
      const xx = Math.round(x + ux * t),
        yy = Math.round(y + uy * t);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) return 2 * d1 - 1;
      if (!wet[yy * W + xx]) return d1 + portable.hypot(xx - x, yy - y) - 1;
    }
    return 2 * d1 - 1;
  };
  // (an end is a head's when a head's source lies within its half-width plus `HEAD_REACH`; else an outlet's when wide
  // water or a wet border tile lies within its half-width plus 2, the sea's or the border's being a way out)
  const srcTile = new Uint8Array(N);
  for (const o of srcs) srcTile[o.y * W + o.x] = 1;
  const within = (e: number, R: number, f: (j: number) => boolean): boolean => {
    const x = e % W,
      y = (e - x) / W;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (dx * dx + dy * dy > R * R || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (f(yy * W + xx)) return true;
      }
    return false;
  };
  const endKind = (e: number): "head" | "out" | "lake" | "stray" => {
    const r = Math.ceil(half(e));
    if (within(e, r + HEAD_REACH, (j) => srcTile[j] === 1)) return "head";
    if (within(e, r + 2, (j) => sea[j] === 1 || (wet[j] === 1 && onBorder(j)))) return "out";
    if (within(e, r + 2, (j) => wide[j] === 1)) return "lake";
    return "stray";
  };
  // (the line's stray ends, ends no head's water begins at and no water takes, are the thinning's spurs and the
  // shallows' fingers: dropped, link by link, until none is left)
  let net = network(line, W, H);
  for (let pass = 0; pass < 50; pass++) {
    let cut = false;
    for (const l of net.links)
      if (l.ends.length && l.ends.every((e) => endKind(e) === "stray") && l.joins.length) {
        for (const t of l.tiles) line[t] = 0;
        cut = true;
      }
    if (!cut) break;
    net = network(line, W, H);
  }
  const wOf = new Float64Array(N);
  const widths: number[] = [];
  for (let i = 0; i < N; i++)
    if (line[i]) {
      wOf[i] = widthAt(i);
      widths.push(wOf[i]);
    }
  const med = median(widths);
  let one = 0,
    thinN = 0;
  for (const w of widths) {
    if (Math.abs(w - med) <= 1) one++;
    if (w <= 4) thinN++;
  }
  const marks = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (line[i]) marks[i] = 1;
  // (the way down: along the line from its ways out, its tiles by the border's water or the sea; a part with none,
  // from its tiles by a lake; never from a head's own)
  const toOut = new Int32Array(N).fill(-1);
  const lineKind = new Map<number, ReturnType<typeof endKind>>();
  for (let i = 0; i < N; i++) if (line[i]) lineKind.set(i, endKind(i));
  for (const want of ["out", "lake"] as const) {
    const q: number[] = [];
    for (const [i, k] of lineKind)
      if (toOut[i] < 0 && k === want) {
        toOut[i] = 0;
        q.push(i);
      }
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W,
        y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (line[j] && toOut[j] < 0) {
          toOut[j] = toOut[i] + 1;
          q.push(j);
        }
      }
    }
  }
  // (each head's path: from the line tile nearest its sources, within `HEAD_LINE`, down the way down tile by tile; the
  // longest first, each later one ending where it meets a path drawn before it: a join)
  const starts: { k: number; t: number }[] = [];
  groups.forEach((g, k) => {
    let best = -1,
      bd = HEAD_LINE * HEAD_LINE + 1;
    for (const o of g)
      for (let dy = -HEAD_LINE; dy <= HEAD_LINE; dy++)
        for (let dx = -HEAD_LINE; dx <= HEAD_LINE; dx++) {
          const xx = o.x + dx,
            yy = o.y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          const d = dx * dx + dy * dy;
          if (line[j] && toOut[j] >= 0 && (d < bd || (d === bd && j < best))) {
            bd = d;
            best = j;
          }
        }
    if (best >= 0) starts.push({ k, t: best });
  });
  starts.sort((a, b) => toOut[b.t] - toOut[a.t] || a.t - b.t);
  const by = new Int32Array(N).fill(-1);
  const pathOf: number[][] = [];
  const below = (t: number): number => {
    const x = t % W,
      y = (t - x) / W;
    let best = -1;
    for (const [dx, dy] of N8) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (line[j] && toOut[j] >= 0 && toOut[j] < toOut[t] && (best < 0 || toOut[j] < toOut[best] || (toOut[j] === toOut[best] && j < best))) best = j;
    }
    return best;
  };
  const firstJoin: number[] = [];
  const ended: boolean[] = [];
  let joins = 0,
    wider = 0,
    pathLen = 0;
  const midWidth = (ts: number[]) => median(ts.slice(NEAR[0], NEAR[1] + 1).map((t) => wOf[t])) || median(ts.map((t) => wOf[t]));
  starts.forEach(({ t }, p) => {
    const path: number[] = [];
    let c = t;
    let met = -1;
    while (c >= 0) {
      if (by[c] >= 0) {
        met = c;
        break;
      }
      by[c] = p;
      path.push(c);
      c = below(c);
    }
    pathOf.push(path);
    firstJoin.push(path.length);
    ended.push(met < 0);
    pathLen += path.length;
    if (met < 0) return;
    const into = pathOf[by[met]];
    const at = into.indexOf(met);
    firstJoin[by[met]] = Math.min(firstJoin[by[met]], at);
    const down: number[] = [];
    for (let d = met, n = 0; d >= 0 && n <= NEAR[1]; d = below(d), n++) down.push(d);
    // (a head that starts on another's water, its path shorter than `NEAR[0]`, brings no stream of its own; a join at
    // the way out, under `NEAR[0]` tiles below it, has no stretch below to read: neither is read as a join)
    if (path.length < NEAR[0] || down.length < NEAR[0]) return;
    // (a join: the incoming path's last stretch, the path it meets above and below the join)
    joins++;
    const above = into.slice(0, at).reverse();
    const wIn = midWidth(path.slice().reverse());
    const wAbove = above.length ? midWidth(above) : 0;
    const wBelow = midWidth(down);
    const grew = wBelow >= Math.max(wIn, wAbove) + 1;
    if (grew) wider++;
    marks[met] = grew ? 3 : 2;
  });
  // (a join through a lake: the paths that end in one lake, not the sea, are joined there, and the lake's outlet is
  // the stretch below them: two or more coming in are read as that many joins less one, wider when the outlet's
  // stretch, its line tiles `NEAR` down from the lake, is a tile or more wider (medians) than each path coming in (its
  // last `NEAR` tiles). The outlet: the line tile by the lake, on no path that comes in, farthest along the way down
  // from a way out. A lake with no outlet on the line, or under `NEAR[0]` tiles of it, is not read.)
  const lakeMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) lakeMask[i] = wide[i] && !sea[i] ? 1 : 0;
  const lakeParts = parts(lakeMask, W, H);
  const lakeAt = (t: number): number => {
    const R = Math.ceil(half(t)) + 2;
    const x = t % W,
      y = (t - x) / W;
    let best = -1,
      bd = Infinity;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx,
          yy = y + dy;
        const d = dx * dx + dy * dy;
        if (d > R * R || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lakeParts.of[j] >= 0 && (d < bd || (d === bd && lakeParts.of[j] < best))) {
          bd = d;
          best = lakeParts.of[j];
        }
      }
    return best;
  };
  const into = new Map<number, number[]>();
  pathOf.forEach((path, p) => {
    if (!ended[p] || path.length < NEAR[0]) return;
    const L = lakeAt(path[path.length - 1]);
    if (L < 0) return;
    const list = into.get(L) ?? [];
    list.push(p);
    into.set(L, list);
  });
  for (const [L, ps] of [...into].sort((a, b) => a[0] - b[0])) {
    if (ps.length < 2) continue;
    const onIn = new Set<number>();
    for (const p of ps) for (const t of pathOf[p]) onIn.add(t);
    let out = -1;
    for (const [t] of lineKind)
      if (!onIn.has(t) && toOut[t] > 0 && below(t) >= 0 && lakeAt(t) === L && (out < 0 || toOut[t] > toOut[out] || (toOut[t] === toOut[out] && t < out))) out = t;
    if (out < 0) continue;
    const down: number[] = [];
    for (let d = out, n = 0; d >= 0 && n <= NEAR[1]; d = below(d), n++) down.push(d);
    if (down.length < NEAR[0]) continue;
    joins += ps.length - 1;
    const wBelow = midWidth(down);
    const grew = ps.every((p) => wBelow >= midWidth(pathOf[p].slice().reverse()) + 1);
    if (grew) wider += ps.length - 1;
    marks[out] = grew ? 3 : 2;
  }
  // (first order: each path above the first join onto it; the rest is below a join)
  const w1: number[] = [],
    w2: number[] = [];
  pathOf.forEach((path, p) => path.forEach((t, n) => (n < firstJoin[p] ? w1 : w2).push(wOf[t])));
  // ---- (b) the wet share, day 1
  const reach = gameMoistureReach(W, H, heights, depth, contamination, objects);
  let landN = 0,
    moist = 0;
  for (let i = 0; i < N; i++) {
    if (wet[i]) continue;
    landN++;
    if (reach.value[i] >= MOIST_MIN) moist++;
  }
  // ---- (b') irrigable dry: dry on day 1, a short canal from a course's clean water and within its lift
  const dist = new Int32Array(N).fill(-1);
  const surf = new Float64Array(N);
  const q: number[] = [];
  for (let i = 0; i < N; i++)
    if (wet[i] && !sea[i] && !(contamination[i] >= 0.1)) {
      dist[i] = 0;
      surf[i] = heights[i] + depth[i];
      q.push(i);
    }
  let irr = 0;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    if (dist[i] >= IRR_CANAL) continue;
    const x = i % W,
      y = (i - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      if (dist[j] >= 0 || wet[j]) continue;
      dist[j] = dist[i] + 1;
      surf[j] = surf[i];
      q.push(j);
      if (!(reach.value[j] >= MOIST_MIN) && heights[j] <= surf[j] + IRR_LIFT) irr++;
    }
  }
  // ---- (d) the start's own water: the water nearest its middle tile, and the line tile nearest that water's
  let startOn: WaterTree["startOn"] = "none";
  const st = startOfObjects(objects, heights, W);
  if (st) {
    let bw = -1,
      bd = Infinity;
    for (let dy = -START_REACH; dy <= START_REACH; dy++)
      for (let dx = -START_REACH; dx <= START_REACH; dx++) {
        const xx = st.x + dx,
          yy = st.y + dy;
        const d = dx * dx + dy * dy;
        if (d > START_REACH * START_REACH || xx < 0 || yy < 0 || xx >= W || yy >= H || !wet[yy * W + xx]) continue;
        if (d < bd || (d === bd && yy * W + xx < bw)) {
          bd = d;
          bw = yy * W + xx;
        }
      }
    if (bw >= 0) {
      if (sea[bw]) startOn = "sea";
      else if (wide[bw]) startOn = "lake";
      else {
        // (the line tile nearest that water, on a path: the path's own kind; on none, a stretch no head's path takes)
        const bx = bw % W,
          by0 = (bw - bx) / W;
        let bt = -1,
          btd = Infinity;
        for (let dy = -12; dy <= 12; dy++)
          for (let dx = -12; dx <= 12; dx++) {
            const xx = bx + dx,
              yy = by0 + dy;
            const d = dx * dx + dy * dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H || !line[yy * W + xx] || by[yy * W + xx] < 0) continue;
            if (d < btd || (d === btd && yy * W + xx < bt)) {
              btd = d;
              bt = yy * W + xx;
            }
          }
        startOn = bt < 0 ? "other" : ended[by[bt]] ? "trunk" : "tributary";
      }
    }
  }
  // ---- (e) the paths by order
  let trunks = 0,
    tributaries = 0,
    brooks = 0;
  pathOf.forEach((path, p) => {
    if (ended[p]) trunks++;
    else if (median(path.map((t) => wOf[t])) <= BROOK_WIDTH) brooks++;
    else tributaries++;
  });
  const n = (f: Head["fate"]) => heads.filter((h) => h.fate === f).length;
  return {
    heads,
    courses: heads.length,
    inflows: heads.filter((h) => h.kind === "inflow").length,
    springs: heads.filter((h) => h.kind === "spring").length,
    joined: n("joined"),
    alone: n("edge") + n("sea"),
    edge: n("edge"),
    sea: n("sea"),
    lost: n("lost"),
    systems: count.size,
    centre: widths.length,
    land: landN,
    spacing: widths.length ? landN / widths.length : 0,
    wetShare: landN ? moist / landN : 0,
    irrigable: landN ? irr / landN : 0,
    width: med,
    oneWidth: widths.length ? one / widths.length : 0,
    thin: widths.length ? thinN / widths.length : 0,
    w1: median(w1),
    w2: median(w2),
    joins,
    wider,
    courseLen: pathLen,
    startOn,
    trunks,
    tributaries,
    brooks,
    marks,
  };
}

/** The measures of a .timber file, on its stored water on the surface (water under an overhang left out). */
export function waterTreeOfFile(path: string): WaterTree {
  const file = readTimber(new Uint8Array(readFileSync(path)));
  const w = file.world;
  const W = w.sizeX,
    H = w.sizeY;
  const heights = surfaceOf(w);
  const water = storedWater(w.singletons, W, H);
  const depth = new Float32Array(W * H);
  const contamination = new Float32Array(W * H);
  water.tile.forEach((t, k) => {
    if ((water.floor[k] < 0 || water.floor[k] === heights[t]) && water.depth[k] > depth[t]) {
      depth[t] = water.depth[k];
      contamination[t] = water.contamination[k];
    }
  });
  return waterTree(W, H, heights, depth, contamination, mapObjects(w));
}

// ------------------------------------------------------------------------------------------- the command

const pct = (x: number) => `${(100 * x).toFixed(1)} %`;

function row(name: string, m: WaterTree): string {
  return (
    `${name.padEnd(16)} courses ${String(m.courses).padStart(3)} (in ${m.inflows}, springs ${String(m.springs).padStart(2)}) joined ${String(m.joined).padStart(2)} alone ${String(m.alone).padStart(2)} (edge ${m.edge}, sea ${m.sea}) lost ${m.lost}  systems ${String(m.systems).padStart(2)}` +
    `  spacing ${m.spacing.toFixed(1).padStart(5)}  wet ${pct(m.wetShare).padStart(7)}  irrigable ${pct(m.irrigable).padStart(7)}  width ${m.width.toFixed(1)} one ${pct(m.oneWidth)} thin ${pct(m.thin)} w1 ${m.w1.toFixed(1)} w2 ${m.w2.toFixed(1)}  joins ${m.joins} wider ${m.wider}  course ${m.courses ? Math.round(m.courseLen / m.courses) : 0}  start ${m.startOn}  order ${m.trunks}/${m.tributaries}/${m.brooks}`
  );
}

export function total(name: string, ms: WaterTree[]): string {
  const s = (f: (m: WaterTree) => number) => ms.reduce((a, m) => a + f(m), 0);
  const courses = s((m) => m.courses);
  const centre = s((m) => m.centre);
  const land = s((m) => m.land);
  const joins = s((m) => m.joins);
  const wmean = (f: (m: WaterTree) => number) => s((m) => f(m) * m.centre) / Math.max(1, centre);
  return (
    `${name} (${ms.length} maps): courses ${(courses / ms.length).toFixed(1)} a map (inflows ${s((m) => m.inflows)}, springs ${s((m) => m.springs)}), joined ${pct(s((m) => m.joined) / Math.max(1, courses))}, alone ${pct(s((m) => m.alone) / Math.max(1, courses))} (edge ${s((m) => m.edge)}, sea ${s((m) => m.sea)}), lost ${s((m) => m.lost)};` +
    ` heads/system ${(courses / Math.max(1, s((m) => m.systems))).toFixed(2)}; spacing ${(land / Math.max(1, centre)).toFixed(1)}; wet ${pct(s((m) => m.wetShare * m.land) / Math.max(1, land))}; irrigable ${pct(s((m) => m.irrigable * m.land) / Math.max(1, land))};` +
    ` width ${wmean((m) => m.width).toFixed(1)}, one width ${pct(wmean((m) => m.oneWidth))}, thin ${pct(wmean((m) => m.thin))}, w1 ${wmean((m) => m.w1).toFixed(1)}, w2 ${wmean((m) => m.w2).toFixed(1)};` +
    ` joins ${joins}, wider below ${s((m) => m.wider)} (${pct(s((m) => m.wider) / Math.max(1, joins))}); course length ${(s((m) => m.courseLen) / Math.max(1, courses)).toFixed(0)};` +
    ` order (trunks/tributaries/brooks) ${s((m) => m.trunks)}/${s((m) => m.tributaries)}/${s((m) => m.brooks)};` +
    ` start on ${(["trunk", "tributary", "lake", "sea", "other", "none"] as const).map((k) => `${k} ${ms.filter((m) => m.startOn === k).length}`).join(", ")}`
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const args = process.argv.slice(2);
  const k = args.indexOf("--json");
  const jsonOut = k >= 0 ? args[k + 1] : undefined;
  const paths: string[] = [];
  for (const a of args.filter((x, i) => !x.startsWith("--") && !(k >= 0 && i === k + 1))) {
    if (statSync(a).isDirectory())
      for (const f of readdirSync(a).sort()) {
        if (f.endsWith(".timber")) paths.push(join(a, f));
      }
    else paths.push(a);
  }
  const all: { name: string; m: WaterTree }[] = [];
  for (const p of paths) {
    const name = basename(p).replace(/\.timber$/, "");
    const m = waterTreeOfFile(p);
    all.push({ name, m });
    console.log(row(name, m));
  }
  console.log(total("ALL", all.map((r) => r.m)));
  const themes = [...new Set(all.map((r) => r.name.replace(/-\d+$/, "")))];
  if (themes.length > 1) for (const t of themes) console.log(total(`  ${t}`, all.filter((r) => r.name.replace(/-\d+$/, "") === t).map((r) => r.m)));
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(all.map(({ name, m: { marks: _marks, ...m } }) => ({ name, m }))));
}
