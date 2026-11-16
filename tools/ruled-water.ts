// Ruled water: lake shores that run ruler-straight and channels that run side by side, measured on the settled water
// of a map as the player sees it (planning's ruling on #236 of 2026-11-15: "drawn with a ruler?" of every widest frame).
//
//   npx tsx tools/ruled-water.ts --gen <out> [--themes all|delta,riverValley] [--seeds 1-6] [--size 256] [--jobs 3]
//   npx tsx tools/ruled-water.ts <out> [<out> …]              the measures of every map in each folder, and their totals
//   npx tsx tools/ruled-water.ts map.timber …                 the measures of these files
//   npx tsx tools/ruled-water.ts --frames <dir> map.timber …  a frame of each (north up, the marks drawn) and its numbers
//                                                             (`--plain`: no marks, the map as the game shows it)
//
// --gen makes each map (each theme in its own process, `--jobs` at once) and writes "<theme>-<seed>.timber" and a
// "<theme>-<seed>.json" beside it: the attempts, the leaks (failed attempts refused because "a river's water leaves its
// course", #1145's measure), the start's numbers (`premise/gateMap.ts` START_CHECKS, from the map's own checks), the
// checks that failed and the ruled-land row.
//
// The measures (`ruledWater`), on the water 0.1 deep or more (`validate/ruledLand.ts` `wetOf`):
// - **Wide water and channels.** A tile is wide water (a lake, a sea, a broad pool) when it lies in a disc of radius 4.5
//   tiles that is all water (the map's outside counts as water); the rest of the water is channel (D26's widest
//   channel is 8.4 tiles, so no channel holds such a disc).
// - **Straight shore.** The wide water's shore is its tiles beside dry land (four sides; not at the map's edge), in the
//   order its outline runs. A run of shore tiles is straight when all their centres lie within 0.5 tile of one line, at
//   any angle (the points fit a strip under one tile wide: a digital straight line, whose tiles step aside at most once
//   a row). The measure: the share of shore tiles in a straight run of 8 tiles or more; and the longest run; and the
//   share with the shore within 4 tiles of the map's edge left out (`straightInner`: the sea's lip, Kyler's round 6).
// - **Side by side.** On the water as it is seen (any depth: a stream's shallow fringe is its water), its channels'
//   centre lines (the channel water thinned to one tile, Zhang–Suen). A centre-line tile runs beside another channel when
//   a centre-line tile of it, heading the same way (within about 25°), is no nearer by the water than 8 tiles more than
//   straight across (dry land lies between them for a good way: a different channel or arm, or a far bend of the same
//   one, not the other bank of its own water nor a tributary at its confluence), and lies within 6 tiles of it water to
//   water (`beside6`, planning's reach: the dry ground between the two waters, read from the two centre lines less each
//   one's half width, its distance to its own dry bank); the measure is the length of such centre line in runs of 20
//   tiles or more. The same within 12 tiles centre to centre (`beside`) is reported beside it, round 1's reading.

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readTimber } from "../src/core/format/timber";
import * as portable from "../src/core/math/portable";
import { generate } from "../src/core/gen/generate";
import { START_CHECKS } from "../src/core/premise/gateMap";
import { makeSpec, THEMES, type ThemeId } from "../src/core/spec/mapspec";
import { wetOf } from "../src/core/validate/ruledLand";
import { groundOfFile } from "./lib/resources";
import { encodePng } from "./png";
import { resourceTopDown } from "./resources-sheet";

export const LEAK = "a river's water leaves its course";
/** Wide water: a disc of this radius, all water (radius² ≤ 20.25). */
export const WIDE_R2 = 20.25;
/** A straight shore run counts from this many tiles. */
export const STRAIGHT_RUN = 8;
/** Side by side: another channel's centre line within this many tiles (centre to centre), heading the same way, for
 *  a run of `BESIDE_RUN` tiles or more; and the brief's nearer reading, `BESIDE_NEAR`. */
export const BESIDE = 12;
export const BESIDE_NEAR = 6;
/** Headings this alike or more (|cos|) run alongside: within about 25°. */
export const PARALLEL = 0.9;
export const BESIDE_RUN = 20;
/** How much farther by the water than straight across another channel's tile must be for it to count as another. */
export const DETOUR = 8;
/** Shore this near the map's edge is the sea's lip (`straightInner` leaves it out). */
export const LIP = 4;

export interface RuledWater {
  shore: number;
  straightShore: number;
  /** The same, the shore within `LIP` tiles of the map's edge left out (the sea's lip there, Kyler's round 6: the sea
   *  going on past the map). */
  shoreInner: number;
  straightInner: number;
  /** Straight shore tiles / shore tiles. */
  straightShare: number;
  longestShore: number;
  centre: number;
  /** Centre line beside another channel within `BESIDE` tiles, and within `BESIDE_NEAR`. */
  beside: number;
  beside6: number;
  besideShare: number;
  /** Masks for a picture: 1 a straight shore tile, 2 a centre-line tile in a side-by-side run. */
  marks: Uint8Array;
}

const N8: readonly [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

/** The wide water: tiles in a disc of radius √WIDE_R2 that is all water. */
export function wideWater(wet: Uint8Array, W: number, H: number): Uint8Array {
  const N = W * H;
  const R = Math.floor(portable.sqrt(WIDE_R2));
  const disc: [number, number][] = [];
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= WIDE_R2) disc.push([dx, dy]);
  const isWet = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || wet[y * W + x] === 1;
  const core = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!wet[y * W + x]) continue;
      let all = true;
      for (const [dx, dy] of disc)
        if (!isWet(x + dx, y + dy)) {
          all = false;
          break;
        }
      if (all) core[y * W + x] = 1;
    }
  const wide = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!core[y * W + x]) continue;
      for (const [dx, dy] of disc) {
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && wet[yy * W + xx]) wide[yy * W + xx] = 1;
      }
    }
  return wide;
}

/** The outlines of a region, each the region's own tiles in the order its edge runs (the region on the left). */
export function outlines(region: Uint8Array, W: number, H: number): number[][] {
  // directed edges along each region tile's sides that face outside it, keyed by their start vertex
  // (vertex (x, y) is the tile's corner; an edge's direction 0 east, 1 north, 2 west, 3 south in tile coordinates)
  const inR = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && region[y * W + x] === 1;
  const V = (x: number, y: number) => y * (W + 1) + x;
  const out = new Map<number, { to: number; dir: number; tile: number }[]>();
  const add = (from: number, to: number, dir: number, tile: number) => {
    const l = out.get(from);
    if (l) l.push({ to, dir, tile });
    else out.set(from, [{ to, dir, tile }]);
  };
  let edges = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inR(x, y)) continue;
      const t = y * W + x;
      // the region on the left of each edge, walking counter-clockwise round the tile
      if (!inR(x, y - 1)) {
        add(V(x, y), V(x + 1, y), 0, t);
        edges++;
      }
      if (!inR(x + 1, y)) {
        add(V(x + 1, y), V(x + 1, y + 1), 1, t);
        edges++;
      }
      if (!inR(x, y + 1)) {
        add(V(x + 1, y + 1), V(x, y + 1), 2, t);
        edges++;
      }
      if (!inR(x - 1, y)) {
        add(V(x, y + 1), V(x, y), 3, t);
        edges++;
      }
    }
  const loops: number[][] = [];
  for (const [v0, l0] of out) {
    while (l0.length) {
      let e = l0.pop()!;
      const tiles: number[] = [];
      let guard = 0;
      for (;;) {
        if (tiles[tiles.length - 1] !== e.tile) tiles.push(e.tile);
        const next = out.get(e.to);
        if (!next || !next.length || guard++ > edges) break;
        // at a vertex with two ways on (a diagonal pinch), keep to the tile's own corner: turn left first
        let k = 0;
        if (next.length > 1) {
          const want = [(e.dir + 1) % 4, e.dir, (e.dir + 3) % 4];
          k = next.findIndex((n) => n.dir === want[0]);
          if (k < 0) k = next.findIndex((n) => n.dir === want[1]);
          if (k < 0) k = 0;
        }
        e = next.splice(k, 1)[0];
        if (e.to === v0 && !out.get(v0)?.length) {
          if (tiles[tiles.length - 1] !== e.tile) tiles.push(e.tile);
          break;
        }
      }
      if (tiles.length > 1 && tiles[0] === tiles[tiles.length - 1]) tiles.pop();
      if (tiles.length) loops.push(tiles);
    }
  }
  return loops;
}

/** The least width of a strip holding all the points (rotating calipers on their hull). */
export function stripWidth(pts: readonly [number, number][]): number {
  if (pts.length < 3) return 0;
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const hi: [number, number][] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const q = p[k];
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  if (hull.length < 3) return 0;
  let best = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length];
    const len = portable.hypot(b[0] - a[0], b[1] - a[1]);
    if (len === 0) continue;
    let far = 0;
    for (const q of hull) far = Math.max(far, Math.abs(cross(a, b, q)) / len);
    best = Math.min(best, far);
  }
  return best;
}

/** Zhang–Suen thinning of a mask to lines one tile wide. */
export function thin(mask: Uint8Array, W: number, H: number): Uint8Array {
  const m = mask.slice();
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? m[y * W + x] : 0);
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      const del: number[] = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!m[y * W + x]) continue;
          const P = [
            at(x, y - 1),
            at(x + 1, y - 1),
            at(x + 1, y),
            at(x + 1, y + 1),
            at(x, y + 1),
            at(x - 1, y + 1),
            at(x - 1, y),
            at(x - 1, y - 1),
          ];
          const B = P.reduce((s, v) => s + v, 0);
          if (B < 2 || B > 6) continue;
          let A = 0;
          for (let k = 0; k < 8; k++) if (!P[k] && P[(k + 1) % 8]) A++;
          if (A !== 1) continue;
          if (pass === 0 ? P[0] * P[2] * P[4] || P[2] * P[4] * P[6] : P[0] * P[2] * P[6] || P[0] * P[4] * P[6])
            continue;
          del.push(y * W + x);
        }
      for (const i of del) m[i] = 0;
      if (del.length) changed = true;
    }
  }
  return m;
}

/** The side-by-side measure on one water mask: the centre line within `BESIDE` of another (centre to centre), and
 *  within `BESIDE_NEAR` water to water (the dry ground between them). */
function sideBySide(wet: Uint8Array, wide: Uint8Array, W: number, H: number, marks: Uint8Array): { centre: number; beside: number; beside6: number } {
  const N = W * H;
  const channel = new Uint8Array(N);
  for (let i = 0; i < N; i++) channel[i] = wet[i] && !wide[i] ? 1 : 0;

  const line = thin(channel, W, H);
  // (each centre-line tile's half width: how far its nearest dry tile is, up to 6)
  const half = new Float64Array(N);
  for (let p = 0; p < N; p++) {
    if (!line[p]) continue;
    const px = p % W, py = (p - px) / W;
    let best = 36;
    for (let dy = -6; dy <= 6; dy++)
      for (let dx = -6; dx <= 6; dx++) {
        const xx = px + dx, yy = py + dy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= best || xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (!wet[yy * W + xx]) best = d2;
      }
    half[p] = portable.sqrt(best);
  }
  let centre = 0;
  for (let i = 0; i < N; i++) if (line[i]) centre++;
  const cost = new Float64Array(N).fill(Infinity);
  const touched: number[] = [];
  const SQ2 = Math.SQRT2;
  /** The water's way from p, out to `budget` tiles (re-pushed on improvement: the areas are small). */
  const flow = (p: number, budget: number) => {
    for (const t of touched) cost[t] = Infinity;
    touched.length = 0;
    cost[p] = 0;
    touched.push(p);
    const front: number[] = [p];
    for (let q = 0; q < front.length; q++) {
      const i = front[q];
      const x = i % W,
        y = (i - x) / W;
      for (const [dx, dy] of N8) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!wet[j]) continue;
        // (no cutting a dry corner)
        if (dx && dy && (!wet[y * W + xx] || !wet[yy * W + x])) continue;
        const c = cost[i] + (dx && dy ? SQ2 : 1);
        if (c > budget || c >= cost[j]) continue;
        if (cost[j] === Infinity) touched.push(j);
        cost[j] = c;
        front.push(j);
      }
    }
  };
  // each centre-line tile's heading: the main axis of the centre line within 4 tiles of it by the water
  const hx = new Float64Array(N),
    hy = new Float64Array(N);
  for (let p = 0; p < N; p++) {
    if (!line[p]) continue;
    flow(p, 4);
    let n = 0,
      mx = 0,
      my = 0;
    for (const t of touched)
      if (line[t]) {
        n++;
        mx += t % W;
        my += Math.floor(t / W);
      }
    mx /= n;
    my /= n;
    let sxx = 0,
      sxy = 0,
      syy = 0;
    for (const t of touched)
      if (line[t]) {
        const dx = (t % W) - mx,
          dy = Math.floor(t / W) - my;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
      }
    const a = 0.5 * portable.atan2(2 * sxy, sxx - syy);
    hx[p] = portable.cos(a);
    hy[p] = portable.sin(a);
  }
  const besideWithin = (reach: number, mark: boolean, banks: boolean): number => {
    // (banks: `reach` is the dry ground between the two waters, read from their centre lines and half widths)
    const R = banks ? reach + 12 : reach;
    const flagged = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      if (!line[p]) continue;
      const px = p % W,
        py = (p - px) / W;
      flow(p, R + DETOUR + 1);
      let other = false;
      for (let dy = -R; dy <= R && !other; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const d2 = dx * dx + dy * dy;
          if (d2 > R * R) continue;
          const xx = px + dx,
            yy = py + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const q = yy * W + xx;
          if (!line[q] || !(cost[q] > portable.sqrt(d2) + DETOUR)) continue;
          if (banks && portable.sqrt(d2) - half[p] - half[q] + 1 > reach) continue;
          // (running alongside: its heading within about 25° of this one's)
          if (Math.abs(hx[p] * hx[q] + hy[p] * hy[q]) < PARALLEL) continue;
          other = true;
          break;
        }
      if (other) flagged[p] = 1;
    }
    let total = 0;
    const seen = new Uint8Array(N);
    for (let s = 0; s < N; s++) {
      if (!flagged[s] || seen[s]) continue;
      const comp = [s];
      seen[s] = 1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k];
        const x = i % W,
          y = (i - x) / W;
        for (const [dx, dy] of N8) {
          const xx = x + dx,
            yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (flagged[j] && !seen[j]) {
            seen[j] = 1;
            comp.push(j);
          }
        }
      }
      if (comp.length >= BESIDE_RUN) {
        total += comp.length;
        if (mark) for (const i of comp) marks[i] = 2;
      }
    }
    return total;
  };
  return { centre, beside: besideWithin(BESIDE, false, false), beside6: besideWithin(BESIDE_NEAR, true, true) };
}

/** The two measures of one map's settled water (`depth`, 0.1 deep or more is water). */
export function ruledWater(depth: ArrayLike<number>, W: number, H: number): RuledWater {
  const N = W * H;
  const wet = wetOf(depth);
  const wide = wideWater(wet, W, H);
  const marks = new Uint8Array(N);
  // ---- straight shore
  const isShore = (t: number) => {
    const x = t % W,
      y = (t - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return false;
    return !wet[t - 1] || !wet[t + 1] || !wet[t - W] || !wet[t + W];
  };
  let shore = 0;
  let longestShore = 0;
  const shoreSeen = new Uint8Array(N);
  for (const loop of outlines(wide, W, H)) {
    const n = loop.length;
    const flags = loop.map(isShore);
    for (let k = 0; k < n; k++)
      if (flags[k] && !shoreSeen[loop[k]]) {
        shoreSeen[loop[k]] = 1;
        shore++;
      }
    if (n < STRAIGHT_RUN) continue;
    // runs of shore tiles round the loop (a loop all shore is cut where it starts)
    const start = flags.every(Boolean) ? 0 : flags.findIndex((f, k) => f && !flags[(k + n - 1) % n]);
    if (start < 0) continue;
    const seq: number[][] = [];
    let cur: number[] = [];
    for (let s = 0; s < n; s++) {
      const k = (start + s) % n;
      if (flags[k]) cur.push(loop[k]);
      else if (cur.length) {
        seq.push(cur);
        cur = [];
      }
    }
    if (cur.length) seq.push(cur);
    for (const run of seq) {
      if (run.length < STRAIGHT_RUN) continue;
      const pt = (t: number): [number, number] => [t % W, Math.floor(t / W)];
      for (let i = 0; i + STRAIGHT_RUN <= run.length; i++) {
        let j = i + 1;
        const pts: [number, number][] = [pt(run[i]), pt(run[i + 1])];
        while (j + 1 < run.length) {
          pts.push(pt(run[j + 1]));
          if (stripWidth(pts) >= 1 - 1e-9) {
            pts.pop();
            break;
          }
          j++;
        }
        // distinct tiles in the run (an outline may pass a tile twice at a pinch)
        const len = new Set(run.slice(i, j + 1)).size;
        if (len >= STRAIGHT_RUN) {
          for (let k = i; k <= j; k++) marks[run[k]] = 1;
          longestShore = Math.max(longestShore, len);
        }
      }
    }
  }
  let straightShore = 0;
  for (let i = 0; i < N; i++) if (marks[i] === 1 && shoreSeen[i]) straightShore++;
  let shoreInner = 0;
  let straightInner = 0;
  for (let i = 0; i < N; i++) {
    if (!shoreSeen[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (Math.min(x, y, W - 1 - x, H - 1 - y) <= LIP) continue;
    shoreInner++;
    if (marks[i] === 1) straightInner++;
  }
  // (the side by side on the water as it is seen, any depth: a stream's shallow fringe is its water)
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) seen[i] = depth[i] > 0 ? 1 : 0;
  const { centre, beside, beside6 } = sideBySide(seen, wideWater(seen, W, H), W, H, marks);
  return {
    shore,
    straightShore,
    shoreInner,
    straightInner,
    straightShare: shore ? straightShore / shore : 0,
    longestShore,
    centre,
    beside,
    beside6,
    besideShare: centre ? beside / centre : 0,
    marks,
  };
}

// ------------------------------------------------------------------------------------------- the command

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};
const parseSeeds = (s: string) =>
  s.split(",").flatMap((part) => {
    const m = /^(\d+)-(\d+)$/.exec(part);
    return m ? Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, k) => Number(m[1]) + k) : [Number(part)];
  });

export interface MapRecord {
  theme: ThemeId;
  seed: number;
  size: number;
  attempts: number;
  leaks: number;
  ms: number;
  sha: string;
  failed: string[];
  /** Why each failed attempt failed. */
  refusals: string[][];
  ruledLand: string;
  start: Record<string, { value: number; limit: number; ok: boolean }>;
  /** On the water tree, the pools' spacing along each level reach, in channel widths (D(water-tree) round 4). */
  poolGaps?: number[];
}

function genOne(theme: ThemeId, seed: number, size: number, out: string): void {
  const spec = makeSpec({ seed, size: { x: size, y: size }, theme });
  const t0 = performance.now();
  const r = generate(spec);
  const ms = Math.round(performance.now() - t0);
  const start: MapRecord["start"] = {};
  for (const id of START_CHECKS) {
    const c = r.report.checks.find((x) => x.id === id) as { value?: number; limit?: number; ok: boolean } | undefined;
    start[id] = { value: c?.value ?? NaN, limit: c?.limit ?? NaN, ok: !!c?.ok };
  }
  const ruled = r.report.checks.find((c) => c.id === "terrain.ruled_land");
  const rec: MapRecord = {
    theme,
    seed,
    size,
    attempts: r.attempts,
    ms,
    leaks: r.failures.filter((f) => f.failed.includes(LEAK)).length,
    sha: createHash("sha256").update(r.bytes).digest("hex"),
    failed: r.report.checks.filter((c) => !c.ok).map((c) => c.id),
    refusals: r.failures.map((f) => f.failed),
    ruledLand: ruled ? `${ruled.ok ? "pass" : "FAIL"} ${ruled.message}` : "",
    start,
    ...(r.info.hydro?.poolGaps ? { poolGaps: r.info.hydro.poolGaps } : {}),
  };
  writeFileSync(join(out, `${theme}-${seed}.timber`), r.bytes);
  writeFileSync(join(out, `${theme}-${seed}.json`), JSON.stringify(rec));
  console.log(`${theme} ${seed}: ${ms} ms, attempts ${r.attempts}, leaks ${rec.leaks}`);
}

const here = dirname(fileURLToPath(import.meta.url));

async function genAll(out: string): Promise<void> {
  mkdirSync(out, { recursive: true });
  const size = Number(opt("size") ?? 256);
  const seeds = opt("seeds") ?? "1-6";
  const themes = (opt("themes") ?? "all") === "all" ? [...THEMES] : (opt("themes")!.split(",") as ThemeId[]);
  const jobs = Number(opt("jobs") ?? 3);
  const queue = [...themes];
  const run = (theme: string) =>
    new Promise<void>((res) => {
      const p = spawn(
        process.execPath,
        [
          ...process.execArgv,
          join(here, "ruled-water.ts"),
          "--part",
          theme,
          "--seeds",
          seeds,
          "--size",
          String(size),
          "--out",
          out,
        ],
        { stdio: "inherit" },
      );
      p.on("exit", () => res());
    });
  await Promise.all(
    Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) await run(queue.shift()!);
    }),
  );
}

function measureFile(path: string): { rec: MapRecord | null; m: RuledWater } {
  const g = groundOfFile(readTimber(new Uint8Array(readFileSync(path))));
  const json = path.replace(/\.timber$/, ".json");
  return {
    rec: existsSync(json) ? (JSON.parse(readFileSync(json, "utf8")) as MapRecord) : null,
    m: ruledWater(g.depth, g.W, g.H),
  };
}

function report(paths: string[]): void {
  let shore = 0,
    straight = 0,
    shoreIn = 0,
    straightIn = 0,
    centre = 0,
    beside = 0,
    beside6 = 0,
    leaks = 0,
    attempts = 0;
  const rows: string[] = [];
  for (const f of paths) {
    const { rec, m } = measureFile(f);
    shore += m.shore;
    straight += m.straightShore;
    shoreIn += m.shoreInner;
    straightIn += m.straightInner;
    centre += m.centre;
    beside += m.beside;
    beside6 += m.beside6;
    leaks += rec?.leaks ?? 0;
    attempts += rec?.attempts ?? 0;
    rows.push(
      `${basename(f)
        .replace(/\.timber$/, "")
        .padEnd(
          16,
        )} shore ${String(m.shore).padStart(5)}  straight ${(100 * m.straightShare).toFixed(1).padStart(5)} %  longest ${String(m.longestShore).padStart(3)}  centre ${String(m.centre).padStart(5)}  beside ${String(m.beside).padStart(4)} (${(100 * m.besideShare).toFixed(1)} %) within 6 ${String(m.beside6).padStart(4)}  inner ${(100 * m.straightInner / Math.max(1, m.shoreInner)).toFixed(1).padStart(5)} %` +
        (rec ? `  attempts ${rec.attempts} leaks ${rec.leaks}` : ""),
    );
  }
  for (const r of rows) console.log(r);
  console.log(
    `ALL ${paths.length} maps: straight shore ${((100 * straight) / Math.max(1, shore)).toFixed(2)} % (${straight}/${shore}), inner ${((100 * straightIn) / Math.max(1, shoreIn)).toFixed(2)} % (${straightIn}/${shoreIn}); beside ${beside} tiles of ${centre} (${((100 * beside) / Math.max(1, centre)).toFixed(2)} %), within 6: ${beside6}; attempts ${attempts}, leaks ${leaks}`,
  );
}

/** A frame of the map, north up, `scale` pixels a tile, with the straight shore (orange) and the side-by-side centre
 *  lines (yellow) marked; and a JSON line of its numbers beside it, for `tools/ruled-water-sheet.py`. */
function frame(path: string, to: string, scale: number): void {
  const file = readTimber(new Uint8Array(readFileSync(path)));
  const g = groundOfFile(file);
  const m = ruledWater(g.depth, g.W, g.H);
  const pic = resourceTopDown(file, scale);
  for (let y = 0; y < g.H; y++)
    for (let x = 0; x < g.W; x++) {
      const k = m.marks[y * g.W + x];
      if (!k || process.argv.includes("--plain")) continue;
      const c = k === 1 ? [255, 110, 0] : [255, 255, 0];
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const o = (((g.H - 1 - y) * scale + dy) * pic.w + x * scale + dx) * 3;
          pic.rgb[o] = c[0];
          pic.rgb[o + 1] = c[1];
          pic.rgb[o + 2] = c[2];
        }
    }
  mkdirSync(to, { recursive: true });
  const name = basename(path).replace(/\.timber$/, "");
  writeFileSync(join(to, `${name}.png`), encodePng(pic.rgb, pic.w, pic.h));
  const json = path.replace(/\.timber$/, ".json");
  const rec = existsSync(json) ? (JSON.parse(readFileSync(json, "utf8")) as MapRecord) : null;
  const { marks: _marks, ...nums } = m;
  writeFileSync(join(to, `${name}.json`), JSON.stringify({ ...rec, ...nums }));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const part = opt("part");
  if (opt("frames")) {
    for (const f of args.filter((x) => x.endsWith(".timber"))) frame(f, opt("frames")!, Number(opt("scale") ?? 2));
  } else if (part) {
    const out = opt("out")!;
    for (const seed of parseSeeds(opt("seeds") ?? "1-6"))
      genOne(part as ThemeId, seed, Number(opt("size") ?? 256), out);
  } else if (opt("gen")) {
    await genAll(opt("gen")!);
  } else {
    const paths: string[] = [];
    for (const a of args.filter((x) => !x.startsWith("--"))) {
      if (statSync(a).isDirectory())
        for (const f of readdirSync(a).sort()) {
          if (f.endsWith(".timber")) paths.push(join(a, f));
        }
      else paths.push(a);
    }
    report(paths);
  }
}
