// Islands' land above 128² (planning's design, 2026-11-21, generator 0.10.62): the start's ground first. A mainland
// frames the sea on every side, and the start stands on a headland of it reaching into the sea, water on two or three
// sides and islands in view; the islands are the view and the place to expand to, never the place to live. Rounds 9–11
// drew an island big enough to live on and never converged (docs/design/uplands.md).
//
// The land is drawn in levels, not a field: the sea's bed one level under its spill level (planning's sea bed: the
// feed holds about a metre, and a sea drawn deeper drains each Hard drought to a sheet below the shore), its shore
// bending in bays and headlands by 15–25 % of the basin's half-width, the mainland and every island rising from the
// water in one-level steps with benches 3–6 tiles deep and relief on their tops, never a mesa. The sea leaves by one
// strait to the map's edge, away from the start, over a lip at its spill level.

import * as portable from "../math/portable";
import { stream } from "../math/rng";
import { fbm } from "../math/noise";
import { cosDet, TWO_PI } from "../math/detmath";
import { distanceFromInTs } from "../math/grid";
import { mapShape } from "./shape";

/** The sea's spill level (its exit's lip) and its bed, one level under it. */
export const ISLE_SEA = {
  spill: 6,
  /** The basin's half-width, a share of the map's side. */
  half: 0.37,
  /** The shore's bays and headlands, a share of the half-width: 15–25 %. */
  bays: [0.15, 0.25] as const,
  /** Islands of 100 tiles and more at 256², scaled by area elsewhere. */
  isles: [8, 12] as const,
  /** An island's area, tiles (before its coast's wobble). */
  isleArea: [130, 1500] as const,
  /** The strait kept between an island and any other land, tiles. */
  strait: 6,
  /** Benches, tiles deep. */
  bench: [3, 6] as const,
  /** The headland's shore bench, tiles deep: the start's food grows there (only ground a level over the sea's spill
   *  stays moist through a drought), so it is deeper than the benches elsewhere. */
  headBench: [8, 10] as const,
  /** The spurs and valleys crossing the mainland's steps: levels (each about 6 tiles of the shore's distance), and the
   *  tiles along the shore between them. */
  spur: 2,
  spurWave: 34,
  /** The warp the mainland's steps are read through: its reach and wavelength, tiles. */
  warp: 14,
  warpWave: 44,
  /** The mainland's benches past its shore bench, tiles deep: from steps crowding into a face to broad shelves. */
  mainBench: [2.5, 8] as const,
} as const;

/** An island's kind: low and all of it a level over the sea (green to its middle); a top over benches; bare rock
 *  standing steeply from a foot a level over the sea. */
export type IsleKind = "low" | "bench" | "rock";

/** Whether a map takes this land: Islands on a map whose narrower side is over 128 and that is not long (a long map
 *  keeps its chain, D357). */
export function takesIsleSea(theme: string, W: number, H: number): boolean {
  return theme === "islands" && Math.min(W, H) > 128 && !mapShape(W, H).long;
}

export interface IsleSeaLand {
  /** Levels per tile. */
  h: Uint8Array;
  /** A field for the hydrology: the levels with a little relief of their own between them. */
  E: Float64Array;
  spill: number;
  /** The start's headland: its tip's middle, the way it reaches (unit, into the sea) and its bench's middle. */
  headland: { x: number; y: number; ux: number; uy: number; bx: number; by: number; r: number };
  /** The islands as drawn: middle, radius along their long axis, aspect, axis. */
  isles: { x: number; y: number; r: number; aspect: number; ux: number; uy: number; kind: IsleKind }[];
  /** The exit's tiles on the map's edge. */
  exit: number[];
  /** Ground no spring rises on: within `SPRING_OFF` of the exit (a clean inflow's mouth beside the exit sends its water
   *  straight out over it before the sea fills, the sea-bed measure's seeds 2 and 4), and the start's headland. */
  dry: Uint8Array;
}

/** The frame's lip: the map's outer `LIP` rows stand a level over the land inside them where the mainland is `LIP_WATER`
 *  tiles or more from the water (`relaxEdges` keeps a rise to the edge). */
const LIP = 3;
const LIP_WATER = 8;
/** The highest level the land stands at (a map without Tall stands no ground above 16). */
const TOP = 16;
/** The headland's top keeps this much of its half-width over the shore bench, tiles: the start's room. */
const HEAD_TOP = 6;
/** How far the field rises toward the headland's root over the mainland round it, levels (`E`): rivers keep off it. */
const HEAD_RISE = 8;

/** The nearest a spring rises to the sea's exit, tiles (the sea-bed measure: seed 6's sources 107 tiles off refilled
 *  its sea by the wet season's fifth day; seed 4's, at the exit, lost 2,400 blocks a day over it). */
export const SPRING_OFF = 100;

/** The land (see the file comment). Its own streams, so nothing else's draws move. */
export function isleSeaLand(seed: number, variation: number, W: number, H: number, attempt: number): IsleSeaLand {
  const N = W * H;
  const rng = stream(seed, "isle-sea", variation, attempt);
  const ns = (k: string) => stream(seed, "isle-sea-noise", k, variation, attempt).int(0, 0x7fffffff);
  const S = ISLE_SEA.spill;
  const side = Math.min(W, H);
  const areaK = (W * H) / (256 * 256);
  const cx = (0.5 + 0.06 * (rng.float() - 0.5)) * (W - 1);
  const cy = (0.5 + 0.06 * (rng.float() - 0.5)) * (H - 1);
  const ax = ISLE_SEA.half * (W - 1) * (0.95 + 0.1 * rng.float());
  const ay = ISLE_SEA.half * (H - 1) * (0.95 + 0.1 * rng.float());
  // (the shore's bays and headlands: a few long waves round the basin, scaled so their deepest reach is 15–25 % of the
  // half-width, and a finer wobble so no stretch of it runs straight)
  const waves = [2, 3, 4, 5, 7].map((k) => ({ k, w: 0.3 + rng.float(), p: rng.float() }));
  const wave = (t: number) => waves.reduce((a, q) => a + q.w * cosDet(TWO_PI * (q.k * t + q.p)), 0);
  let most = 0;
  for (let k = 0; k < 360; k++) most = Math.max(most, Math.abs(wave(k / 360)));
  const bayA = (ISLE_SEA.bays[0] + (ISLE_SEA.bays[1] - ISLE_SEA.bays[0]) * rng.float()) / Math.max(1e-6, most);
  const sWarp = ns("warp");
  const sFine = ns("fine");
  const P = 2.6;
  // (the basin's measure at a point: under 1 inside)
  const turnOf = (u: number, v: number) => (portable.atan2(v, u) / TWO_PI + 1) % 1;
  const basinAt = (x: number, y: number) => {
    const wx = x + 7 * fbm(sWarp, x, y, 46, 3);
    const wy = y + 7 * fbm(sWarp + 1, x, y, 46, 3);
    const u = (wx - cx) / ax;
    const v = (wy - cy) / ay;
    const rho = portable.pow(portable.pow(Math.abs(u), P) + portable.pow(Math.abs(v), P), 1 / P);
    const t = turnOf(u, v);
    const R = 1 + bayA * wave(t) + 0.05 * fbm(sFine, x, y, 16, 2);
    return rho / R;
  };
  const sea = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (basinAt(x, y) < 1) sea[y * W + x] = 1;
  // the start's headland: from the shore at a turn of its own, reaching toward the basin's middle a third of the way,
  // broad at its root, its tip rounded, its sides bending
  const ts = rng.float();
  const [dx0, dy0] = [cosDet(TWO_PI * ts), cosDet(TWO_PI * (ts - 0.25))];
  // (the shore along that turn: walk out from the middle until the sea ends)
  let rim = 0;
  while (rim < side && sea[Math.round(cy + dy0 * rim) * W + Math.round(cx + dx0 * rim)]) rim++;
  const reach = rim * (0.34 + 0.08 * rng.float());
  // (4 tiles broader than the benches' half-width needs since generator 0.10.62: its shore bench is deep, `headBench`, and its top
  // keeps the start's room)
  const hw = 19 + 4 * rng.float();
  const rx0 = cx + dx0 * rim;
  const ry0 = cy + dy0 * rim;
  const sHead = ns("head");
  const headland = new Uint8Array(N);
  // (the headland's half-width at each of its tiles, so its shore bench leaves its top room, `HEAD_TOP`)
  const headW = new Float64Array(N);
  {
    const x0 = Math.max(0, Math.floor(Math.min(rx0, rx0 - dx0 * reach) - hw - 12));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(rx0, rx0 - dx0 * reach) + hw + 12));
    const y0 = Math.max(0, Math.floor(Math.min(ry0, ry0 - dy0 * reach) - hw - 12));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ry0, ry0 - dy0 * reach) + hw + 12));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const px = x - rx0;
        const py = y - ry0;
        // (along: into the sea; across)
        const a = -(px * dx0 + py * dy0);
        const b = -px * dy0 + py * dx0;
        const t = Math.min(1, Math.max(0, a / reach));
        const w = hw * (1.15 - 0.35 * t) * (1 + 0.18 * fbm(sHead, x, y, 18, 2));
        const bend = 0.22 * hw * fbm(sHead + 7, a, 0, 30, 2);
        const tip = a > reach ? portable.hypot(a - reach, (b - bend) * 0.9) : 0;
        if (a > -12 && Math.abs(b - bend) < w && tip < w * 0.85) {
          headland[y * W + x] = 1;
          headW[y * W + x] = a > reach ? w * 0.85 : w;
        }
      }
  }
  for (let i = 0; i < N; i++) if (headland[i]) sea[i] = 0;
  const hx = rx0 - dx0 * reach;
  const hy = ry0 - dy0 * reach;
  // (the bench: the headland's middle, a little short of its tip)
  const bx = rx0 - dx0 * reach * 0.55;
  const by = ry0 - dy0 * reach * 0.55;
  // the exit: a strait from the basin to the map's edge, across the map from the start, 9–13 tiles wide
  const te = (ts + 0.5 + 0.2 * (rng.float() - 0.5)) % 1;
  const [ex, ey] = [cosDet(TWO_PI * te), cosDet(TWO_PI * (te - 0.25))];
  const exitW = 4.5 + 2 * rng.float();
  const sExit = ns("exit");
  for (let k = 0; k < 2 * side; k++) {
    const x = cx + ex * k * 0.5;
    const y = cy + ey * k * 0.5;
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) break;
    const sway = 6 * fbm(sExit, k, 0, 40, 2);
    const qx = x - ey * sway;
    const qy = y + ex * sway;
    const r = Math.ceil(exitW);
    for (let yy = Math.floor(qy) - r; yy <= Math.ceil(qy) + r; yy++)
      for (let xx = Math.floor(qx) - r; xx <= Math.ceil(qx) + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (portable.hypot(xx - qx, yy - qy) <= exitW && !headland[yy * W + xx]) sea[yy * W + xx] = 1;
      }
  }
  // the islands: of unlike sizes, none in the basin's middle, each a strait from all other land; one off the headland's
  // tip, in the start's view
  const isles: IsleSeaLand["isles"] = [];
  const count = Math.max(4, Math.round((ISLE_SEA.isles[0] + (ISLE_SEA.isles[1] - ISLE_SEA.isles[0] + 1) * rng.float() - 0.5) * Math.min(1.6, areaK)));
  const land = new Uint8Array(N);
  for (let i = 0; i < N; i++) land[i] = sea[i] ? 0 : 1;
  const toLand = distanceFromInTs(land, W, H);
  const [A0, A1] = ISLE_SEA.isleArea;
  const sizes: number[] = [];
  for (let k = 0; k < count; k++) sizes.push(A0 * portable.pow(A1 / A0, (k + 0.3 + 0.4 * rng.float()) / count));
  sizes.sort((a, b) => b - a);
  const clearOf = (x: number, y: number, r: number) => isles.every((q) => portable.hypot(q.x - x, q.y - y) >= 0.9 * (q.r + r) + ISLE_SEA.strait);
  const place = (r: number, near: ((x: number, y: number) => number) | null): [number, number] | null => {
    let best: [number, number] | null = null;
    let bestScore = -Infinity;
    for (let draw = 0; draw < 200; draw++) {
      const x = cx + (rng.float() - 0.5) * 2 * ax;
      const y = cy + (rng.float() - 0.5) * 2 * ay;
      if (x < 2 || y < 2 || x > W - 3 || y > H - 3) continue;
      const i = Math.round(y) * W + Math.round(x);
      if (!sea[i] || toLand[i] < r + ISLE_SEA.strait) continue;
      if (portable.hypot((x - cx) / ax, (y - cy) / ay) < 0.4) continue;
      if (!clearOf(x, y, r)) continue;
      if (!near) return [x, y];
      const s = near(x, y);
      if (s > bestScore) {
        bestScore = s;
        best = [x, y];
      }
    }
    return best;
  };
  // (the one in the start's view first: off the tip toward the basin's middle, 8–14 tiles of water between)
  const inView = sizes.length > 3 ? sizes.splice(2 + Math.floor(rng.float() * (sizes.length - 3)), 1)[0] : sizes.pop()!;
  for (const [k, A] of [inView, ...sizes].entries()) {
    const aspect = 1 + 0.8 * rng.float();
    const r = portable.sqrt(A / Math.PI) * portable.sqrt(aspect) * 1.1;
    const at = k === 0 ? place(r, (x, y) => -Math.abs(portable.hypot(x - hx, y - hy) - (r + 11))) : place(r, null);
    if (!at) continue;
    const t = rng.float();
    isles.push({ x: at[0], y: at[1], r, aspect, ux: cosDet(TWO_PI * t), uy: cosDet(TWO_PI * (t - 0.25)), kind: "bench" });
  }
  // the kinds, mixed on every map, none over a third and a bit: the smallest low and narrow, so their middles stay green
  // (no tile over 9 tiles from the water); the middle sizes bare rock, a cone of crags too small to read as a mesa; the
  // largest topped over benches
  {
    const bySize = isles.map((q, k) => [q.r / portable.sqrt(q.aspect), k] as const).sort((p, q) => p[0] - q[0]);
    const n = isles.length;
    const lows = Math.round(n / 3);
    const rocks = Math.round((n - lows) / 2);
    for (const [j, [, k]] of bySize.entries()) {
      const q = isles[k];
      if (j < lows) {
        q.kind = "low";
        q.aspect = Math.max(q.aspect, q.r / 9);
      } else if (j < lows + rocks) q.kind = "rock";
    }
  }
  // levels: the bed one under the spill; the land from a level over it, a level a bench of 3–6 tiles, the benches' depth
  // wandering, the tops rolling with relief of their own
  const h = new Uint8Array(N);
  const isleOf = new Int16Array(N).fill(-1);
  const isleT = new Float64Array(N);
  const sIsle = ns("isle");
  for (const [k, q] of isles.entries()) {
    const R = q.r * 1.35;
    for (let y = Math.max(0, Math.floor(q.y - R)); y <= Math.min(H - 1, Math.ceil(q.y + R)); y++)
      for (let x = Math.max(0, Math.floor(q.x - R)); x <= Math.min(W - 1, Math.ceil(q.x + R)); x++) {
        const px = x - q.x;
        const py = y - q.y;
        const a = (px * q.ux + py * q.uy) / q.r;
        const b = ((-px * q.uy + py * q.ux) * q.aspect) / q.r;
        const d = portable.sqrt(a * a + b * b) / (1 + 0.3 * fbm(sIsle + k, x, y, Math.max(7, 0.45 * q.r), 2));
        if (d < 1) {
          isleOf[y * W + x] = k;
          isleT[y * W + x] = d;
        }
      }
  }
  const dry = new Uint8Array(N);
  for (let i = 0; i < N; i++) dry[i] = !sea[i] || isleOf[i] >= 0 ? 1 : 0;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = dry[i] ? 0 : 1;
  // (the land's distance from the water, and from the water or the headland for the mainland, so it steps up from the
  // headland's bench as from the shore)
  const fromWater = distanceFromInTs(wet, W, H);
  const wetOrHead = new Uint8Array(N);
  for (let i = 0; i < N; i++) wetOrHead[i] = wet[i] || headland[i] ? 1 : 0;
  const fromHead = distanceFromInTs(wetOrHead, W, H);
  const sBench = ns("bench");
  const sTop = ns("top");
  // (hills: the land's own rise, broad and uneven, added to the benches' count past the first few, so the levels' lines
  // run round the hills and never ring the sea in even bands)
  const sHill = ns("hill");
  const hill = (x: number, y: number, d: number, amp: number) => amp * Math.max(0, fbm(sHill, x, y, 64, 3) + 0.25) * Math.min(1, d / 14);
  const [b0, b1] = ISLE_SEA.bench;
  // (the mainland's steps drawn on the shore's distance read through a warp, so they bend into spurs and valleys and
  // never ring the sea in a band; its pull under a tile per tile, so no step closes into a hollow)
  const sWarpM = ns("main-warp");
  const warpedFrom = (x: number, y: number, d: number) => {
    const k = Math.min(1, Math.max(0, d - 5) / 16) * ISLE_SEA.warp;
    if (!k) return d;
    const qx = Math.min(W - 1, Math.max(0, x + k * fbm(sWarpM, x, y, ISLE_SEA.warpWave, 2)));
    const qy = Math.min(H - 1, Math.max(0, y + k * fbm(sWarpM + 1, x, y, ISLE_SEA.warpWave, 2)));
    const x0 = Math.floor(qx), y0 = Math.floor(qy), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
    const fx = qx - x0, fy = qy - y0;
    const v = (1 - fy) * ((1 - fx) * fromWater[y0 * W + x0] + fx * fromWater[y0 * W + x1]) + fy * ((1 - fx) * fromWater[y1 * W + x0] + fx * fromWater[y1 * W + x1]);
    return Math.max(Math.min(d, 6), v);
  };
  // (spurs and valleys: a rise and a fall along the shore, every `spurWave` tiles or so, growing in from the shore bench,
  // so the mainland's steps bend round them, merge and split, and never ring the sea in a band)
  const sSpur = ns("spur");
  const SPUR_R = 110;
  const spur = (x: number, y: number, d: number) => {
    const t = turnOf(x - cx, y - cy);
    const sx = SPUR_R * cosDet(TWO_PI * t);
    const sy = SPUR_R * cosDet(TWO_PI * (t - 0.25));
    return ISLE_SEA.spur * 2 * fbm(sSpur, sx, sy, ISLE_SEA.spurWave, 2) * Math.min(1, Math.max(0, d - 6) / 20);
  };
  const [hb0, hb1] = ISLE_SEA.headBench;
  const sHB = ns("head-bench");
  const mainSteps = 6 + Math.floor(3 * rng.float());
  const isleSteps = isles.map((q) => Math.max(1, Math.min(5, Math.round(q.r / 7))) + (rng.float() < 0.4 ? 1 : 0));
  const rockSteps = isles.map((q) => Math.max(3, Math.min(TOP - S - 2, Math.round(q.r / 2.5))));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (wet[i]) {
        h[i] = S - 1;
        continue;
      }
      const bench = b0 + (b1 - b0) * (0.5 + 0.5 * fbm(sBench, x, y, 34, 2));
      const top = 0.6 * fbm(sTop, x, y, 22, 3);
      let lv: number;
      // (the headland a level over its shore bench, so it stands as a ridge into the sea and no water runs over it)
      // (its shore bench broad, the start's food's ground, `headBench`, its top kept `HEAD_TOP` of its half-width)
      if (headland[i]) lv = fromWater[i] <= Math.min(hb0 + (hb1 - hb0) * (0.5 + 0.5 * fbm(sHB, x, y, 24, 2)), headW[i] - HEAD_TOP) ? 0 : 1;
      else if (isleOf[i] >= 0) {
        const k = isleOf[i];
        const kind = isles[k].kind;
        if (kind === "low") lv = 0;
        else if (kind === "rock") {
          // (a foot of 2–3 tiles a level over the sea, then the rock rising to its peak at the middle, up to two levels a
          // tile, crags breaking it)
          const foot = 2 + fbm(sBench + 5, x, y, 10, 2);
          const q = isles[k];
          const toMid = Math.max(1, 0.6 * (q.r / q.aspect) - foot);
          lv = fromWater[i] <= foot ? 0 : Math.max(1, Math.min(rockSteps[k], Math.floor(1 + rockSteps[k] * Math.min(1, (fromWater[i] - foot) / toMid) + 1.6 * fbm(sTop + 9, x, y, 5, 2))));
        } else {
          const steps = isleSteps[k];
          lv = Math.min(steps, Math.floor(fromWater[i] / bench + hill(x, y, fromWater[i], 1.5) + 0.35 * fbm(sBench + 3, x, y, 12, 2)));
          if (lv >= steps && top > 0.18) lv = steps + 1;
        }
      } else {
        const d = fromWater[i];
        const dm = warpedFrom(x, y, d);
        const mb = ISLE_SEA.mainBench[0] + (ISLE_SEA.mainBench[1] - ISLE_SEA.mainBench[0]) * (0.5 + 0.5 * fbm(sBench + 11, x, y, 26, 2));
        lv = Math.min(mainSteps, Math.floor(0.7 * (dm / (d < 8 ? bench : mb)) + hill(x, y, d, 5) + spur(x, y, d) + 0.35 * fbm(sBench + 3, x, y, 12, 2)));
        // (round the headland's root the mainland stands at its level at least, so no hollow runs down to it)
        if (fromHead[i] < 14 && fromWater[i] > fromHead[i] + 1) lv = Math.max(lv, 1);
        if (lv >= mainSteps && top > 0.1) lv = mainSteps + 1;
        // (the frame's lip: the map's three outer rows a level over the land inside them, so no river on the mainland's
        // top runs off the map's edge, which is a sink (D350): the sea's only way out is its exit; Islands 256² seed 9's
        // river ran along a flat top to two edges and its sea never refilled in a Hard wet season. A level, never two, so
        // no edge wall, D151; under the game's height a map stands to without Tall, `TOP`)
        lv = Math.min(lv, TOP - S - 2);
        if (d >= LIP_WATER && Math.min(x, y, W - 1 - x, H - 1 - y) < LIP) lv++;
      }
      h[i] = S + 1 + Math.max(0, lv);
    }
  // (no two neighbours more than a level apart on the land: the benches' wander and the tops' relief kept to steps)
  for (let pass = 0; pass < 64; pass++) {
    let moved = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (wet[i]) continue;
        let lo = 255;
        for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && !wet[j]) lo = Math.min(lo, h[j]);
        const up = isleOf[i] >= 0 && isles[isleOf[i]].kind === "rock" ? 2 : 1;
        if (lo < 255 && h[i] > lo + up) {
          h[i] = lo + up;
          moved++;
        }
      }
    if (!moved) break;
  }
  // the exit's lip: the strait's three outer rows at the spill level (the two the map's edge keeps, `relaxEdges`, and the
  // one inside them they are held by)
  const exit: number[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (wet[i] && e <= 2) {
      h[i] = S;
      if (e === 0) exit.push(i);
    }
  }
  const E = new Float64Array(N);
  const sE = ns("field");
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    // (the headland stands over the land's highest level in the field, and the mainland round its root rises toward it,
    // so no river from the mainland runs down its spine or along its shore and takes the start's ground or its food's
    // bench: two levels over its own let the mainland behind its root, up to 8 levels higher, send seed 11's main river
    // down it, generator 0.10.62)
    const toHead = portable.hypot(x - bx, y - by) / (2.2 * hw + 0.6 * reach);
    E[i] = (headland[i] ? TOP + 1 : h[i] + HEAD_RISE * Math.max(0, 1 - toHead)) + 0.3 * fbm(sE, x, y, 16, 2);
  }
  const dryM = new Uint8Array(N);
  let mx = 0, my = 0;
  for (const i of exit) {
    mx += i % W;
    my += Math.floor(i / W);
  }
  mx /= Math.max(1, exit.length);
  my /= Math.max(1, exit.length);
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if ((exit.length && portable.hypot(x - mx, y - my) < SPRING_OFF) || portable.hypot(x - bx, y - by) < 2.2 * hw + 0.6 * reach) dryM[i] = 1;
  }
  return { h, E, spill: S, headland: { x: hx, y: hy, ux: -dx0, uy: -dy0, bx, by, r: hw }, isles, exit, dry: dryM };
}

/** How far apart the headland's steps down to its shore bench stand, tiles (Chebyshev). */
const HEAD_RAMP_APART = 7;

/** Steps from the start's headland down to its shore bench (a level over the sea's spill), `HEAD_RAMP_APART` apart: each
 *  (low tile, high tile), the high one a level up and the tile behind the low one level with it, as a natural ramp's. The
 *  build lays a slope on each that still stands, so the start's walk reaches the bench its food grows on. */
export function headRamps(h: ArrayLike<number>, W: number, H: number, head: { bx: number; by: number; r: number }): [number, number][] {
  const S = ISLE_SEA.spill;
  const R = 3.2 * head.r;
  const out: [number, number][] = [];
  const x0 = Math.max(1, Math.floor(head.bx - R)), x1 = Math.min(W - 2, Math.ceil(head.bx + R));
  const y0 = Math.max(1, Math.floor(head.by - R)), y1 = Math.min(H - 2, Math.ceil(head.by + R));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const lo = y * W + x;
      if (h[lo] !== S + 1 || portable.hypot(x - head.bx, y - head.by) > R) continue;
      if (out.some(([q]) => Math.max(Math.abs((q % W) - x), Math.abs(Math.floor(q / W) - y)) < HEAD_RAMP_APART)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const hx = x + dx, hy = y + dy, bx = x - dx, by = y - dy;
        if (hx < 0 || hy < 0 || hx >= W || hy >= H || bx < 0 || by < 0 || bx >= W || by >= H) continue;
        if (h[hy * W + hx] === S + 2 && h[by * W + bx] === S + 1) {
          out.push([lo, hy * W + hx]);
          break;
        }
      }
    }
  return out;
}
