// Intentions (D138): zero, one or two outcomes a map is steered toward, never built. Each one is
// written as what a player finds, never as how to make it (Kyler's first principle). Steering is
// only a nudge to the genome's prior and a preference in the settler; the processes decide whether
// the outcome appears. A check on the finished map confirms it; when it fails the intention is
// dropped and recorded, never forced (the second principle). The no-clone and no-archetype measures
// run within each intention (the third principle; M9b's measures).
//
// Kyler's own intentions, in his words: "I love when the start sits under a cliff with water
// below" (`under-cliff`); "I want a snaking river going down a hill" (`snaking-river`); "I want a
// large crater where multiple rivers converge" (`crater-rivers`); "I want a cliffside with a
// waterfall that goes into a large circular lake" (`cliff-falls-lake`).
//
// "The only safe water is uphill" (`safe-water-uphill`) left the set: in design version 2's first
// run it emerged on 4 of 86 draws. Its check stays for the record; it is never drawn.
//
// Ported from the design version 2 prototype (investigation/generative/v2/intentions.ts). "Any"
// weighs each intention by its mean over the six themes (D209). The set and its rates are
// decisions-pending #61's default (D209).

import type { Rng } from "../math/rng";
import type { ThemeId } from "../spec/mapspec";
import type { Genome } from "./genome";
import { unit } from "./num";

export const INTENTIONS = [
  "under-cliff",
  "landmark",
  "farmland-past-gorge",
  "safe-water-uphill",
  "falls-shield",
  "hidden-valley",
  "high-lake",
  "meeting-waters",
  "long-view",
  "snaking-river",
  "crater-rivers",
  "cliff-falls-lake",
] as const;
export type IntentionId = (typeof INTENTIONS)[number];
/** The intentions a map may draw (the set). */
export const ACTIVE: readonly IntentionId[] = INTENTIONS.filter((id) => id !== "safe-water-uphill");
/** Kyler's own, in his words. */
export const KYLERS = new Set<IntentionId>(["under-cliff", "snaking-river", "crater-rivers", "cliff-falls-lake"]);
/** Intentions the settler steers: the start's place decides them, so they are re-steered once. */
export const START_SIDE = new Set<IntentionId>(["under-cliff", "long-view", "meeting-waters", "falls-shield", "safe-water-uphill"]);

/** The outcome in a player's words. */
export const INTENTION_TEXT: Record<IntentionId, string> = {
  "under-cliff": "The start sits under a cliff, with water below.",
  landmark: "A signature landmark stands out: a spire, a mesa, a peak or a tall waterfall.",
  "farmland-past-gorge": "The best farmland lies past the gorge.",
  "safe-water-uphill": "The only safe water is uphill: a high lake keeps its water when the river runs low.",
  "falls-shield": "A waterfall shields the start: its cliff stands between the start and the nearest threat.",
  "hidden-valley": "A hidden valley up the cliffs, reached only by stairs, holds riches.",
  "high-lake": "A lake high on the heights spills over a fall.",
  "meeting-waters": "Two rivers meet by the start.",
  "long-view": "The start looks out from high ground over the land below.",
  "snaking-river": "A snaking river winds down a hill, dropping a level at its bends.",
  "crater-rivers": "A large crater gathers two or more rivers into its lake, which leaves through a gap in the rim.",
  "cliff-falls-lake": "A waterfall plunges off a cliff into a large, roughly round lake.",
};

type ThemeWeights = Record<Exclude<ThemeId, "any">, number>;

/** How often each intention is drawn, by theme; Verticality weights the vertical ones up. */
const WEIGHT6: Record<IntentionId, ThemeWeights> = {
  "under-cliff": { riverValley: 1, canyon: 1.5, highlands: 1.5, lakeBasin: 0.8, delta: 0.5, islands: 0.8 },
  landmark: { riverValley: 1, canyon: 1, highlands: 1, lakeBasin: 1, delta: 0.8, islands: 1.2 },
  "farmland-past-gorge": { riverValley: 1, canyon: 1.2, highlands: 0.8, lakeBasin: 0.5, delta: 1, islands: 0.3 },
  "safe-water-uphill": { riverValley: 0.8, canyon: 0.6, highlands: 1, lakeBasin: 0.8, delta: 0.4, islands: 0.5 },
  "falls-shield": { riverValley: 0.8, canyon: 1, highlands: 1, lakeBasin: 0.5, delta: 0.3, islands: 0.4 },
  "hidden-valley": { riverValley: 0.6, canyon: 1, highlands: 1, lakeBasin: 0.4, delta: 0.3, islands: 0.4 },
  "high-lake": { riverValley: 0.5, canyon: 0.8, highlands: 1.2, lakeBasin: 0.8, delta: 0.3, islands: 0.5 },
  "meeting-waters": { riverValley: 1, canyon: 0.6, highlands: 0.8, lakeBasin: 0.8, delta: 1.2, islands: 0.4 },
  "long-view": { riverValley: 0.8, canyon: 1, highlands: 1.2, lakeBasin: 0.6, delta: 0.4, islands: 0.8 },
  "snaking-river": { riverValley: 1.2, canyon: 0.8, highlands: 1.2, lakeBasin: 0.8, delta: 0.6, islands: 0.5 },
  "crater-rivers": { riverValley: 0.8, canyon: 0.6, highlands: 0.9, lakeBasin: 1.3, delta: 0.6, islands: 0.6 },
  "cliff-falls-lake": { riverValley: 0.8, canyon: 1.2, highlands: 1.2, lakeBasin: 1, delta: 0.4, islands: 0.7 },
};

/** "Any" weighs each intention by its mean over the six themes. */
function weightOf(id: IntentionId, theme: ThemeId): number {
  const w = WEIGHT6[id];
  if (theme !== "any") return w[theme];
  const vs = Object.values(w);
  return vs.reduce((a, b) => a + b, 0) / vs.length;
}

const VERTICAL = new Set<IntentionId>(["under-cliff", "falls-shield", "hidden-valley", "high-lake", "long-view", "snaking-river", "cliff-falls-lake"]);
/** Pairs that pull the start two ways. */
const CLASH: [IntentionId, IntentionId][] = [
  ["safe-water-uphill", "long-view"],
  ["under-cliff", "long-view"],
];

export function drawIntentions(theme: ThemeId, vt: number, rng: Rng): IntentionId[] {
  // some maps have none, most one, some two (the mix is never a template)
  const r = rng.float();
  const n = r < 0.25 ? 0 : r < 0.75 ? 1 : 2;
  const out: IntentionId[] = [];
  for (let k = 0; k < n; k++) {
    const w = ACTIVE.map((id) => {
      if (out.includes(id) || out.some((o) => CLASH.some(([a, b]) => (a === o && b === id) || (b === o && a === id)))) return 0;
      return weightOf(id, theme) * (VERTICAL.has(id) ? 1 + vt / 100 : 1);
    });
    if (w.every((x) => x === 0)) break;
    out.push(ACTIVE[rng.weighted(w)]);
  }
  return out;
}

/** Whether two intentions pull the start two ways. */
export function clashes(a: IntentionId, b: IntentionId): boolean {
  return CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Nudges to the prior: more of what tends to make the outcome, never the outcome itself. */
export function nudgeFor(id: IntentionId): (g: Genome, rng: Rng, W: number, H: number) => void {
  const tall = (g: Genome) => 1 + (0.6 * g.vt) / 100;
  const part = (g: Genome, rng: Rng, kind: "cone" | "mesa" | "escarpment" | "plateau" | "caldera", mul = 1) => {
    const at: [number, number] = [0.2 + 0.6 * rng.float(), 0.2 + 0.6 * rng.float()];
    const h = (kind === "cone" ? 5 + 2.5 * rng.float() : kind === "mesa" ? 4 + 3 * rng.float() : 3 + 2 * rng.float()) * tall(g) * mul;
    const size = kind === "escarpment" ? 40 + 50 * rng.float() : kind === "cone" ? 10 + 7 * rng.float() : 12 + 10 * rng.float();
    g.parts.push({ kind, at, size, height: h, turn: rng.float(), extra: kind === "escarpment" ? 4 + 6 * rng.float() : kind === "caldera" ? 3 + 3 * rng.float() : 0.3 + 0.4 * rng.float(), soft: kind === "cone" ? 0 : (0.7 + rng.float()) / tall(g) });
  };
  switch (id) {
    case "under-cliff":
      return (g, rng) => {
        g.terrace.share = Math.min(1, g.terrace.share + 0.15);
        if (g.terrace.step < 2 && rng.float() < 0.6) g.terrace.step = 2;
        if (rng.float() < 0.5) part(g, rng, "escarpment");
      };
    case "landmark":
      return (g, rng) => {
        if (rng.float() < 0.75) part(g, rng, (["cone", "mesa", "caldera", "escarpment"] as const)[rng.int(0, 4)], 1.3);
        g.cap.share = Math.min(0.75, g.cap.share + 0.1);
      };
    case "farmland-past-gorge":
      return (g) => {
        g.hydro.incise += 1.5;
        g.hydro.floor += 2;
      };
    case "safe-water-uphill":
      return (g, rng) => {
        g.hydro.springs += 1;
        if (g.hazards.badwater === "none" && rng.float() < 0.7) g.hazards.badwater = "pit";
        if (rng.float() < 0.5) part(g, rng, rng.float() < 0.5 ? "mesa" : "plateau");
      };
    case "falls-shield":
      return (g, rng) => {
        g.hydro.incise += 0.5;
        g.terrace.share = Math.min(1, g.terrace.share + 0.1);
        if (g.hazards.badwater === "none" && rng.float() < 0.7) g.hazards.badwater = "pit";
      };
    case "hidden-valley":
      return (g, rng) => {
        g.ramps = Math.max(0.1, g.ramps - 0.3);
        part(g, rng, "plateau", 1.3);
        g.resources.ruins = Math.min(300, g.resources.ruins + 40);
      };
    case "high-lake":
      return (g, rng) => {
        g.hydro.springs += 1;
        if (rng.float() < 0.8) part(g, rng, "mesa", 1.2);
        g.weathering = Math.min(1, g.weathering + 0.2);
      };
    case "meeting-waters":
      return (g) => {
        g.hydro.springs += 1;
        if (g.hydro.inflows === 0) g.hydro.inflows = 1;
      };
    case "long-view":
      return (g, rng) => {
        if (rng.float() < 0.5) part(g, rng, rng.float() < 0.5 ? "plateau" : "escarpment");
      };
    case "snaking-river":
      // the water's way wanders more where the slope is gentle, and the drops stay spread along
      // the course (no gathering into one fall)
      return (g, rng) => {
        g.wander = 2 + 1.6 * rng.float();
        g.wanderCell = 9 + 7 * rng.float();
        g.knick = 0;
        g.hydro.springs += rng.float() < 0.5 ? 1 : 0;
      };
    case "crater-rivers":
      // a large caldera somewhere inland, more heads upstream of it, and room for its lake
      return (g, rng, W, H) => {
        const side = Math.min(W, H);
        const size = side * (0.12 + 0.08 * rng.float());
        g.parts.push({ kind: "caldera", at: [0.3 + 0.4 * rng.float(), 0.3 + 0.4 * rng.float()], size, height: (1.5 + 2.5 * rng.float()) * tall(g), turn: rng.float(), extra: rng.float() < 0.35 ? 2 + 3 * rng.float() : 0, soft: 0.8 + 0.8 * rng.float() });
        g.hydro.springs += 1 + (rng.float() < 0.5 ? 1 : 0);
        if (g.hydro.inflows === 0) g.hydro.inflows = 1;
        g.hydro.lakeBudget = Math.max(g.hydro.lakeBudget, (3.3 * size * size) / (W * H));
      };
    case "cliff-falls-lake":
      // cliffs and gathered drops (knickpoints), more hard rock, a scarp and a hollow, room for lakes
      return (g, rng, W, H) => {
        g.knick = Math.max(g.knick, 8 + 8 * rng.float());
        g.cap.share = Math.min(0.75, g.cap.share + 0.15);
        g.hanging = Math.max(g.hanging, 1.5 + 1.5 * rng.float());
        part(g, rng, "escarpment", 1.3);
        // a hollow somewhere, or (more often) near the scarp's foot, where a river coming off it
        // may fall into the lake the hollow holds
        const scarp = g.parts[g.parts.length - 1];
        const size = 11 + 8 * rng.float();
        let at: [number, number] = [0.2 + 0.6 * rng.float(), 0.2 + 0.6 * rng.float()];
        if (rng.float() < 0.6) {
          const [ux, uy] = unit(scarp.turn);
          const off = size + 3 + 6 * rng.float();
          const along = (rng.float() * 2 - 1) * 0.3 * scarp.size;
          at = [Math.min(0.85, Math.max(0.15, scarp.at[0] + (-ux * off - uy * along) / W)), Math.min(0.85, Math.max(0.15, scarp.at[1] + (-uy * off + ux * along) / H))];
        }
        g.parts.push({ kind: "basin", at, size, height: -(3 + 2 * rng.float()) * tall(g), turn: rng.float(), extra: 1 + 2 * rng.float(), soft: 0, shape: "round" });
        g.lakeSprings = 1;
        g.hydro.lakeBudget = Math.min(0.45, g.hydro.lakeBudget + 0.04);
      };
  }
}


// ------------------------------------------------------------------------------------ steering

/** What the settler knows when it scores a place: the land and the settled water. */
export interface SettlerView {
  W: number;
  H: number;
  h: Uint8Array;
  /** Distance to a planned confluence, and to a fall of the settled water (1.5+ levels). */
  dJoin: Float64Array;
  dFall: Float64Array;
  /** Clean water bodies (60+ tiles) with their surface and the share they keep through a 9-day
   *  drought. */
  lakes: { tiles: number[]; surface: number; keep9: number }[];
  /** Farmland patches (moist, dry, level within a step; 400+ tiles) and the gorges (wet tiles with
   *  banks 2+ above the water on two sides). */
  farms: { size: number; cx: number; cy: number }[];
  gorge: Uint8Array;
  p75: number;
}

/** A straight line from (x, y) to (px, py) crosses a gorge tile. */
export function crossesGorge(gorge: Uint8Array, W: number, x: number, y: number, px: number, py: number): boolean {
  const d = Math.max(Math.abs(px - x), Math.abs(py - y));
  for (let t = 1; t < d; t++) {
    const xx = Math.round(x + ((px - x) * t) / d);
    const yy = Math.round(y + ((py - y) * t) / d);
    if (gorge[yy * W + xx]) return true;
  }
  return false;
}

/** A preference in 0–1 for a start at (x, y) on level L, `walk` tiles from its water. It reads
 *  the same land and water the check reads, so steering and checking agree. */
export function startPreference(id: IntentionId, s: SettlerView, x: number, y: number, L: number, walk: number): number {
  const { W, H, h } = s;
  const box = (r: number, f: (i: number) => void) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) f(yy * W + xx);
      }
  };
  const near = (tiles: number[], r: number) => tiles.some((i) => Math.max(Math.abs((i % W) - x), Math.abs(Math.floor(i / W) - y)) <= r);
  switch (id) {
    case "under-cliff": {
      if (!(walk <= 12)) return 0;
      let hi = 0;
      let cliff = false;
      box(7, (i) => {
        if (h[i] >= L + 2) hi++;
        const xx = i % W;
        const yy = (i - xx) / W;
        if (h[i] >= L && h[i] <= L + 1)
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const X = xx + dx;
            const Y = yy + dy;
            if (X >= 0 && Y >= 0 && X < W && Y < H && h[Y * W + X] - h[i] >= 2 && h[Y * W + X] >= L + 2) cliff = true;
          }
      });
      return cliff ? Math.min(1, hi / 16) : 0;
    }
    case "long-view": {
      let lo = 99;
      box(15, (i) => {
        if (h[i] < lo) lo = h[i];
      });
      return L >= s.p75 && L - lo >= 4 ? 1 : 0;
    }
    case "meeting-waters":
      return s.dJoin[y * W + x] <= 18 ? 1 : 0;
    case "falls-shield":
      return s.dFall[y * W + x] <= 18 ? 1 : 0;
    case "safe-water-uphill":
      return s.lakes.some((lk) => lk.surface >= L + 1 && lk.keep9 >= 0.5 && near(lk.tiles, 40)) ? 1 : 0;
    case "farmland-past-gorge":
      return s.farms.some((f) => {
        const d = Math.sqrt((f.cx - x) * (f.cx - x) + (f.cy - y) * (f.cy - y));
        return d <= 70 && crossesGorge(s.gorge, W, x, y, Math.round(f.cx), Math.round(f.cy));
      })
        ? 1
        : 0;
    default:
      return 0;
  }
}

// --------------------------------------------------------------------------------------- checks

/** The finished map, as the checks read it. */
export interface FinalCtx {
  W: number;
  H: number;
  h: Uint8Array;
  D: ArrayLike<number>;
  C: ArrayLike<number>;
  moist: ArrayLike<number>;
  start: { x: number; y: number; z: number };
  /** Walking distance from the start with the map's slopes (Infinity: not on foot). */
  walk: Float64Array;
  /** Water left after the Normal difficulty's longest drought (9 days, analytic). */
  kept9: Float64Array;
  objects: { template: string; x: number; y: number }[];
  /** Tiles where the water falls 2 levels or more to a wet neighbour, with the drop. */
  falls: { i: number; drop: number }[];
  /** Planned confluences (river ends that join another river). */
  joins: number[];
  /** The rivers' courses (the planned paths the build carved), head to mouth, in tile units. */
  rivers: [number, number][][];
}

const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Wet bodies (4-connected water ≥ 0.1 deep): labels and each body's tiles. */
function bodies(c: FinalCtx): { lab: Int32Array; tiles: number[][] } {
  const { W, H, D } = c;
  const N = W * H;
  const lab = new Int32Array(N).fill(-1);
  const tiles: number[][] = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0 || !(D[s] >= 0.1)) continue;
    const id = tiles.length;
    const q = [s];
    lab[s] = id;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (lab[j] >= 0 || !(D[j] >= 0.1)) continue;
        lab[j] = id;
        q.push(j);
      }
    }
    tiles.push(q);
  }
  return { lab, tiles };
}

export interface CheckResult {
  ok: boolean;
  note: string;
}

/** A course resampled every tile of arc, inside the map. */
function resample(path: [number, number][], W: number, H: number): [number, number][] {
  const out: [number, number][] = [];
  let carry = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const vx = path[k + 1][0] - ax;
    const vy = path[k + 1][1] - ay;
    const len = Math.sqrt(vx * vx + vy * vy);
    let t = carry;
    while (t < len) {
      const x = ax + (vx * t) / len;
      const y = ay + (vy * t) / len;
      if (x >= 0 && y >= 0 && x <= W - 1 && y <= H - 1) out.push([x, y]);
      t += 1;
    }
    carry = t - len;
  }
  return out;
}

/** Douglas-Peucker: the indices of the points that keep the course within `eps` tiles. */
function simplify(pts: [number, number][], eps: number): number[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const vx = pts[b][0] - ax;
    const vy = pts[b][1] - ay;
    const len = Math.sqrt(vx * vx + vy * vy);
    let far = -1;
    let fd = eps;
    for (let m = a + 1; m < b; m++) {
      const wx = pts[m][0] - ax;
      const wy = pts[m][1] - ay;
      const d = len > 0 ? Math.abs(vx * wy - vy * wx) / len : Math.sqrt(wx * wx + wy * wy);
      if (d > fd) {
        fd = d;
        far = m;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  const out: number[] = [];
  for (let m = 0; m < pts.length; m++) if (keep[m]) out.push(m);
  return out;
}

interface LevelLake {
  tiles: number[];
  inLake: Uint8Array;
  surf: number;
  cx: number;
  cy: number;
}

/** Lakes: level water (the surface within a quarter level of the body's deepest tile), 4-connected,
 *  of `min` tiles or more. */
function levelLakes(c: FinalCtx, min: number): LevelLake[] {
  const { W, H, h, D } = c;
  const b = bodies(c);
  const out: LevelLake[] = [];
  for (const t of b.tiles) {
    if (t.length < min) continue;
    let deep = t[0];
    for (const i of t) if (D[i] > D[deep] || (D[i] === D[deep] && i < deep)) deep = i;
    const surf = h[deep] + D[deep];
    const inLake = new Uint8Array(W * H);
    const q = [deep];
    inLake[deep] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (inLake[j] || !(D[j] >= 0.1) || Math.abs(h[j] + D[j] - surf) > 0.25) continue;
        inLake[j] = 1;
        q.push(j);
      }
    }
    if (q.length < min) continue;
    let cx = 0;
    let cy = 0;
    for (const i of q) {
      cx += i % W;
      cy += Math.floor(i / W);
    }
    out.push({ tiles: q, inLake, surf, cx: cx / q.length, cy: cy / q.length });
  }
  return out;
}

/** A lake's open water without its thin arms (a morphological opening by two tiles): the tiles
 *  within two tiles of a tile whose 5x5 square is all lake, in the largest such part. */
function openWater(L: LevelLake, W: number, H: number): number[] {
  const core = new Uint8Array(W * H);
  for (const i of L.tiles) {
    const x = i % W;
    const y = (i - x) / W;
    let all = x >= 2 && y >= 2 && x < W - 2 && y < H - 2;
    for (let dy = -2; dy <= 2 && all; dy++) for (let dx = -2; dx <= 2 && all; dx++) if (!L.inLake[(y + dy) * W + x + dx]) all = false;
    if (all) core[i] = 1;
  }
  // the largest core part
  const lab = new Int32Array(W * H).fill(-1);
  let best: number[] = [];
  for (const s0 of L.tiles) {
    if (!core[s0] || lab[s0] >= 0) continue;
    const q = [s0];
    lab[s0] = s0;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy] of D4) {
        const j = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || lab[j] >= 0 || !core[j]) continue;
        lab[j] = s0;
        q.push(j);
      }
    }
    if (q.length > best.length) best = q;
  }
  const out = new Uint8Array(W * H);
  for (const i of best) {
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) out[(y + dy) * W + x + dx] = 1;
  }
  return L.tiles.filter((i) => out[i]);
}

/** Sixteen directions round a point (unit vectors, no trigonometry). */
const RAYS: [number, number][] = (() => {
  const a = [1, 0.924, 0.707, 0.383, 0, -0.383, -0.707, -0.924, -1, -0.924, -0.707, -0.383, 0, 0.383, 0.707, 0.924];
  const b = [0, 0.383, 0.707, 0.924, 1, 0.924, 0.707, 0.383, 0, -0.383, -0.707, -0.924, -1, -0.924, -0.707, -0.383];
  return a.map((v, k) => [v, b[k]] as [number, number]);
})();

export function checkIntention(id: IntentionId, c: FinalCtx): CheckResult {
  const { W, H, h, D, C, start } = c;
  const N = W * H;
  const sx = start.x;
  const sy = start.y;
  const z = start.z;
  const cheb = (i: number) => Math.max(Math.abs((i % W) - sx), Math.abs(Math.floor(i / W) - sy));
  const eu = (i: number) => {
    const dx = (i % W) - sx;
    const dy = Math.floor(i / W) - sy;
    return Math.sqrt(dx * dx + dy * dy);
  };
  switch (id) {
    case "under-cliff": {
      // a cliff (a step of 2+ levels) rising from the start's ground within 7 tiles, its top 2+
      // levels above the start, over 8 tiles or more
      let high = 0;
      let cliff = false;
      for (let i = 0; i < N; i++) {
        if (cheb(i) > 7 || cheb(i) <= 1) continue;
        if (h[i] >= z + 2) high++;
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of D4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (h[i] >= z && h[i] <= z + 1 && h[j] - h[i] >= 2 && h[j] >= z + 2) cliff = true;
        }
      }
      // water below: the start's pumpable water within 12 tiles' walk, below the start
      let water = Infinity;
      for (let i = 0; i < N; i++) {
        if (!(D[i] >= 0.3) || !(C[i] < 0.05)) continue;
        const s = h[i] + D[i];
        if (s > z - 0.05 || s < z - 2) continue;
        const x = i % W;
        const y = (i - x) / W;
        for (const [dx, dy] of D4) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (h[j] === z && c.walk[j] < water) water = c.walk[j];
        }
      }
      const ok = high >= 8 && cliff && water <= 12;
      return { ok, note: `${high} tiles 2+ levels above within 7, cliff ${cliff ? "yes" : "no"}, water ${Number.isFinite(water) ? Math.round(water) : "none"} tiles' walk` };
    }
    case "landmark": {
      // a stack, butte, mesa or peak standing 5+ levels above the ground 6–8 tiles round it, on
      // at most 600 tiles; or a waterfall of 5+ levels
      let best = 0;
      const ring: [number, number][] = [];
      for (let k = 0; k < 16; k++) {
        const a = [1, 0.92, 0.71, 0.38, 0, -0.38, -0.71, -0.92, -1, -0.92, -0.71, -0.38, 0, 0.38, 0.71, 0.92][k];
        const b = [0, 0.38, 0.71, 0.92, 1, 0.92, 0.71, 0.38, 0, -0.38, -0.71, -0.92, -1, -0.92, -0.71, -0.38][k];
        ring.push([Math.round(7 * a), Math.round(7 * b)]);
      }
      const top = new Uint8Array(N);
      for (let y = 7; y < H - 7; y++)
        for (let x = 7; x < W - 7; x++) {
          const i = y * W + x;
          let lo = 99;
          for (const [dx, dy] of ring) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
          const p = h[i] - lo;
          if (p >= 5) top[i] = 1;
          if (p > best) best = p;
        }
      // the standing forms: connected high tiles on at most 300 tiles; the landmark is the most
      // prominent one, and it must stand 8+ levels over its ring (or a fall of 6+ levels)
      let forms = 0;
      let standout = 0;
      const seen = new Uint8Array(N);
      for (let s = 0; s < N; s++) {
        if (!top[s] || seen[s]) continue;
        const q = [s];
        seen[s] = 1;
        for (let k = 0; k < q.length; k++) {
          const i = q[k];
          const x = i % W;
          const y = (i - x) / W;
          for (const [dx, dy] of D4) {
            const j = (y + dy) * W + x + dx;
            if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H || seen[j] || !top[j]) continue;
            seen[j] = 1;
            q.push(j);
          }
        }
        if (q.length <= 300) {
          forms++;
          for (const i of q) {
            const x = i % W;
            const y = (i - x) / W;
            let lo = 99;
            for (const [dx, dy] of ring) lo = Math.min(lo, h[(y + dy) * W + x + dx]);
            standout = Math.max(standout, h[i] - lo);
          }
        }
      }
      const fall = c.falls.reduce((m, f) => Math.max(m, f.drop), 0);
      const ok = standout >= 8 || fall >= 6;
      void best;
      return { ok, note: `${forms} standing form${forms === 1 ? "" : "s"} of 300 tiles or fewer (the most prominent ${standout} levels over its ring), tallest fall ${Math.round(fall * 10) / 10}` };
    }
    case "farmland-past-gorge": {
      // farmland: moist, dry, level land; the start's own within 20 tiles' walk, and the largest
      // other patch within 70 tiles that is past a gorge (water with banks 2+ above it on both sides)
      const farm = new Uint8Array(N);
      for (let i = 0; i < N; i++) farm[i] = c.moist[i] > 0 && !(D[i] > 0.05) && C[i] < 0.05 ? 1 : 0;
      let own = 0;
      for (let i = 0; i < N; i++) if (farm[i] && c.walk[i] <= 20) own++;
      const lab = new Int32Array(N).fill(-1);
      const sizes: number[] = [];
      const cent: [number, number][] = [];
      for (let s = 0; s < N; s++) {
        if (!farm[s] || lab[s] >= 0) continue;
        const id = sizes.length;
        const q = [s];
        lab[s] = id;
        let cx = 0;
        let cy = 0;
        for (let k = 0; k < q.length; k++) {
          const i = q[k];
          const x = i % W;
          const y = (i - x) / W;
          cx += x;
          cy += y;
          for (const [dx, dy] of D4) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (lab[j] >= 0 || !farm[j] || Math.abs(h[j] - h[i]) > 1) continue;
            lab[j] = id;
            q.push(j);
          }
        }
        sizes.push(q.length);
        cent.push([cx / q.length, cy / q.length]);
      }
      const ownLab = new Set<number>();
      for (let i = 0; i < N; i++) if (farm[i] && c.walk[i] <= 20) ownLab.add(lab[i]);
      let best = -1;
      for (let k = 0; k < sizes.length; k++) {
        if (ownLab.has(k) || sizes[k] < 400) continue;
        const [px, py] = cent[k];
        const d = Math.sqrt((px - sx) * (px - sx) + (py - sy) * (py - sy));
        if (d > 70) continue;
        // a gorge on the way: a wet tile on the line whose banks within 3 tiles stand 2+ above it
        let gorge = false;
        const steps = Math.ceil(d);
        for (let t = 1; t < steps && !gorge; t++) {
          const x = Math.round(sx + ((px - sx) * t) / steps);
          const y = Math.round(sy + ((py - sy) * t) / steps);
          const i = y * W + x;
          if (!(D[i] >= 0.1)) continue;
          const s = h[i] + D[i];
          let sides = 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            for (let r = 1; r <= 3; r++) {
              const xx = x + dx * r;
              const yy = y + dy * r;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) break;
              if (h[yy * W + xx] >= s + 2) {
                sides++;
                break;
              }
            }
          }
          if (sides >= 2) gorge = true;
        }
        if (gorge && sizes[k] >= 1.5 * Math.max(200, own) && (best < 0 || sizes[k] > sizes[best])) best = k;
      }
      return { ok: best >= 0, note: best >= 0 ? `${sizes[best]} tiles of farmland past a gorge, against ${own} by the start` : `no larger farmland past a gorge (${own} by the start)` };
    }
    case "safe-water-uphill": {
      const b = bodies(c);
      let startBody = -1;
      let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        if (b.lab[i] < 0 || !(C[i] < 0.05)) continue;
        const s = h[i] + D[i];
        if (s > z - 0.05 || s < z - 2) continue;
        const d = eu(i);
        if (d < bestD) {
          bestD = d;
          startBody = b.lab[i];
        }
      }
      const keep = (id: number) => {
        let v = 0;
        let k = 0;
        for (const i of b.tiles[id]) {
          v += D[i];
          k += c.kept9[i];
        }
        return v > 0 ? k / v : 0;
      };
      const startKeep = startBody >= 0 ? keep(startBody) : 0;
      let high = -1;
      for (let id = 0; id < b.tiles.length; id++) {
        if (id === startBody || b.tiles[id].length < 60) continue;
        const t = b.tiles[id];
        let surf = 0;
        let near = false;
        let bad = false;
        for (const i of t) {
          surf = Math.max(surf, h[i] + D[i]);
          if (eu(i) <= 40) near = true;
          if (C[i] >= 0.05) bad = true;
        }
        if (!near || bad || surf < z + 1) continue;
        if (keep(id) >= 0.5) high = id;
      }
      const ok = high >= 0 && startKeep < 0.35;
      return { ok, note: `start's water keeps ${Math.round(startKeep * 100)}% through a 9-day drought; ${high >= 0 ? `a lake uphill keeps ${Math.round(keep(high) * 100)}%` : "no lake uphill keeps half"}` };
    }
    case "falls-shield": {
      const near = c.falls.filter((f) => eu(f.i) <= 20 && f.drop >= 1.5);
      // the nearest threat: badwater or thorns
      let t = -1;
      let td = Infinity;
      for (let i = 0; i < N; i++) if (D[i] > 0.05 && C[i] >= 0.3 && eu(i) < td) {
        td = eu(i);
        t = i;
      }
      for (const o of c.objects) if (o.template === "Thorns") {
        const i = o.y * W + o.x;
        if (eu(i) < td) {
          td = eu(i);
          t = i;
        }
      }
      if (!near.length || t < 0) return { ok: false, note: `${near.length} falls within 20 tiles; ${t < 0 ? "no threat on the map" : "a threat"}` };
      // the walk to the threat's shore or tile: the land between must make it long
      let w = Infinity;
      const tx = t % W;
      const ty = Math.floor(t / W);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const xx = tx + dx;
        const yy = ty + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        w = Math.min(w, c.walk[yy * W + xx]);
      }
      const ok = !(w <= 2 * td);
      return { ok, note: `a fall ${Math.round(Math.min(...near.map((f) => eu(f.i))))} tiles away; the threat ${Math.round(td)} tiles off is ${Number.isFinite(w) ? `${Math.round(w)} tiles' walk` : "out of reach on foot"}` };
    }
    case "hidden-valley": {
      // stairs-only dry land within 60 tiles of the start, in regions of 400+ tiles holding ruins,
      // relics or trees
      // cut off by cliffs: not joined to the start's ground by one-level steps, and 2+ levels up
      const own = new Uint8Array(N);
      {
        const q0 = [start.y * W + start.x];
        own[q0[0]] = 1;
        for (let k = 0; k < q0.length; k++) {
          const i = q0[k];
          const x = i % W;
          const y = (i - x) / W;
          for (const [dx, dy] of D4) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (own[j] || D[j] > 0.05 || Math.abs(h[j] - h[i]) > 1) continue;
            own[j] = 1;
            q0.push(j);
          }
        }
      }
      const off = new Uint8Array(N);
      for (let i = 0; i < N; i++) off[i] = !(D[i] > 0.05) && !own[i] && !Number.isFinite(c.walk[i]) && h[i] >= z + 2 && eu(i) <= 60 ? 1 : 0;
      const riches = new Uint8Array(N);
      for (const o of c.objects) if (/Ruin|Relic|Pine|Birch|Oak|Blueberry|UndergroundRuins|Geothermal/.test(o.template)) riches[o.y * W + o.x] = 1;
      const seen = new Uint8Array(N);
      let found = 0;
      let bestSize = 0;
      for (let s = 0; s < N; s++) {
        if (!off[s] || seen[s]) continue;
        const q = [s];
        seen[s] = 1;
        let rich = 0;
        for (let k = 0; k < q.length; k++) {
          const i = q[k];
          if (riches[i]) rich++;
          const x = i % W;
          const y = (i - x) / W;
          for (const [dx, dy] of D4) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (seen[j] || !off[j] || Math.abs(h[j] - h[i]) > 1) continue;
            seen[j] = 1;
            q.push(j);
          }
        }
        if (q.length >= 400 && rich >= 10) {
          found++;
          bestSize = Math.max(bestSize, q.length);
        }
      }
      return { ok: found > 0, note: found ? `${found} upland${found > 1 ? "s" : ""} cut off by cliffs, reached only by stairs, with riches (largest ${bestSize} tiles)` : "no upland cut off by cliffs with riches within 60 tiles" };
    }
    case "high-lake": {
      const b = bodies(c);
      const sorted = Array.from(h).sort((p, q) => p - q);
      const med = sorted[N >> 1];
      let found = "";
      for (let id = 0; id < b.tiles.length && !found; id++) {
        const t = b.tiles[id];
        if (t.length < 60) continue;
        let surf = 0;
        let deep = 0;
        for (const i of t) {
          surf = Math.max(surf, h[i] + D[i]);
          if (D[i] >= 1) deep++;
        }
        if (surf < med + 5 || deep < 10) continue;
        const inBody = new Set(t);
        const spill = c.falls.some((f) => {
          const fx = f.i % W;
          const fy = Math.floor(f.i / W);
          for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (inBody.has((fy + dy) * W + fx + dx)) return true;
          return false;
        });
        if (spill) found = `a ${t.length}-tile lake ${Math.round(surf - med)} levels above the map's middle spills over a fall`;
      }
      return { ok: !!found, note: found || "no lake on the heights with a fall" };
    }
    case "meeting-waters": {
      const j = c.joins.filter((i) => eu(i) <= 18 && D[i] >= 0.1);
      return { ok: j.length > 0, note: j.length ? `a confluence ${Math.round(Math.min(...j.map(eu)))} tiles from the start` : "no confluence within 18 tiles" };
    }
    case "snaking-river": {
      // a river whose course turns three times or more, back and forth, while its bed descends 3+
      // levels, with a level dropped at two bends or more; the stretch holds water
      let best = "no river winds down a slope";
      let ok = false;
      let bestTurns = 0;
      for (const path of c.rivers) {
        const pts = resample(path, W, H);
        if (pts.length < 20) continue;
        const n = pts.length;
        const lev: number[] = [];
        const wet: number[] = [];
        let run = Infinity;
        for (const [x, y] of pts) {
          const i = Math.round(y) * W + Math.round(x);
          run = Math.min(run, h[i]);
          lev.push(run);
          wet.push(D[i] >= 0.1 ? 1 : 0);
        }
        const keep = simplify(pts, 1.5);
        const bends: { k: number; sign: number }[] = [];
        for (let m = 1; m + 1 < keep.length; m++) {
          const [ax, ay] = pts[keep[m - 1]];
          const [bx, by] = pts[keep[m]];
          const [qx, qy] = pts[keep[m + 1]];
          const ux = bx - ax;
          const uy = by - ay;
          const vx = qx - bx;
          const vy = qy - by;
          const lu = Math.sqrt(ux * ux + uy * uy);
          const lv = Math.sqrt(vx * vx + vy * vy);
          if (lu < 3 || lv < 3) continue;
          // turning 30 degrees or more: the cosine at most 0.866
          if ((ux * vx + uy * vy) / (lu * lv) <= 0.866) bends.push({ k: keep[m], sign: ux * vy - uy * vx > 0 ? 1 : -1 });
        }
        for (let i0 = 0; i0 + 2 < bends.length && !ok; i0++)
          for (let i1 = i0 + 2; i1 < bends.length && !ok; i1++) {
            const from = Math.max(0, bends[i0].k - 4);
            const to = Math.min(n - 1, bends[i1].k + 4);
            const drop = lev[from] - lev[to];
            let alt = false;
            for (let m = i0 + 1; m <= i1; m++) if (bends[m].sign !== bends[m - 1].sign) alt = true;
            let steps = 0;
            for (let m = i0; m <= i1; m++) {
              const k = bends[m].k;
              if (lev[Math.max(0, k - 4)] - lev[Math.min(n - 1, k + 4)] >= 1) steps++;
            }
            let w = 0;
            for (let k = from; k <= to; k++) w += wet[k];
            const turns = i1 - i0 + 1;
            if (alt && drop >= 3 && steps >= 2 && w >= 0.7 * (to - from + 1)) {
              ok = true;
              best = `a river turns ${turns} times, back and forth, over ${to - from} tiles while its bed drops ${drop} levels (a level dropped at ${steps} bends)`;
            } else if (turns > bestTurns && alt) {
              bestTurns = turns;
              best = `the most winding stretch turns ${turns} times but drops ${drop} levels (${steps} at bends)`;
            }
          }
        if (ok) break;
      }
      return { ok, note: best };
    }
    case "crater-rivers": {
      // a large lake in a closed rim (the ground 2+ levels over the lake on 12 of 16 rays, and
      // falling again outside the crest on 8 or more), two or more rivers flowing in, one way out
      const lakes = levelLakes(c, (250 * N) / 16384);
      let note = "no large lake";
      let ok = false;
      for (const L of lakes) {
        const R = Math.sqrt(L.tiles.length / 3.14159);
        let high = 0;
        let ring = 0;
        for (const [ux, uy] of RAYS) {
          let shore = -1;
          let top = -1;
          let after = 99;
          for (let t = 1; t < 2 * R + 30; t++) {
            const x = Math.round(L.cx + ux * t);
            const y = Math.round(L.cy + uy * t);
            if (x < 0 || y < 0 || x >= W || y >= H) break;
            const i = y * W + x;
            if (L.inLake[i]) {
              shore = -1;
              top = -1;
              after = 99;
              continue;
            }
            if (shore < 0) shore = t;
            if (t - shore <= 14) {
              // the crest: the highest ground within 14 tiles of the shore
              if (h[i] > top) {
                top = h[i];
                after = 99;
              } else after = Math.min(after, h[i]);
            } else if (t - shore <= 26) after = Math.min(after, h[i]);
            else break;
          }
          if (top >= L.surf + 2) {
            high++;
            if (after <= top - 1) ring++;
          }
        }
        // rivers in and out: a course entering from 5+ tiles outside, and the ways out
        let inflows = 0;
        const exits: [number, number][] = [];
        for (const path of c.rivers) {
          const pts = resample(path, W, H);
          const inside = pts.map(([x, y]) => L.inLake[Math.round(y) * W + Math.round(x)]);
          let entered = false;
          let out = 0;
          for (let m = 0; m < pts.length; m++) {
            if (!inside[m]) {
              out++;
              continue;
            }
            if (m > 0 && !inside[m - 1] && out >= 5) entered = true;
            out = 0;
          }
          if (entered) inflows++;
          for (let m = 1; m < pts.length; m++) {
            if (!(inside[m - 1] && !inside[m])) continue;
            let o = 0;
            while (m + o < pts.length && !inside[m + o]) o++;
            if (o >= 5 && !exits.some(([ex, ey]) => Math.abs(ex - pts[m][0]) + Math.abs(ey - pts[m][1]) <= 6)) exits.push(pts[m]);
          }
        }
        const closed = high >= 12 && ring >= 8;
        const here = closed && inflows >= 2 && exits.length === 1;
        if (here || !ok) note = `a ${L.tiles.length}-tile lake: rim on ${high} of 16 rays (falling again outside on ${ring}), ${inflows} river${inflows === 1 ? "" : "s"} in, ${exits.length} way${exits.length === 1 ? "" : "s"} out`;
        if (here) {
          ok = true;
          break;
        }
      }
      return { ok, note };
    }
    case "cliff-falls-lake": {
      // a fall of 3+ levels plunging into a lake whose open water (the lake without its thin arms)
      // covers 200+ tiles and is broadly round: its second moments' axes within 0.55 of each other,
      // and filling 40% of its widest circle
      const lakes = levelLakes(c, (200 * N) / 16384);
      let note = "no large lake";
      let ok = false;
      let bestFall = -1;
      for (const L of lakes) {
        const open = openWater(L, W, H);
        if (open.length < (200 * N) / 16384) continue;
        let cx = 0;
        let cy = 0;
        for (const i of open) {
          cx += i % W;
          cy += Math.floor(i / W);
        }
        cx /= open.length;
        cy /= open.length;
        let sxx = 0;
        let syy = 0;
        let sxy = 0;
        let rmax = 0;
        for (const i of open) {
          const dx = (i % W) - cx;
          const dy = Math.floor(i / W) - cy;
          sxx += dx * dx;
          syy += dy * dy;
          sxy += dx * dy;
          rmax = Math.max(rmax, Math.sqrt(dx * dx + dy * dy));
        }
        const a = sxx / open.length;
        const d = syy / open.length;
        const b = sxy / open.length;
        const tr = (a + d) / 2;
        const disc = Math.sqrt(((a - d) * (a - d)) / 4 + b * b);
        const axes = tr + disc > 0 ? Math.sqrt(Math.max(0, tr - disc) / (tr + disc)) : 0;
        const fill = open.length / (3.14159 * (rmax + 0.5) * (rmax + 0.5));
        let fall = 0;
        for (const f of c.falls) {
          if (L.inLake[f.i]) continue;
          const x = f.i % W;
          const y = (f.i - x) / W;
          for (const [dx, dy] of D4) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (L.inLake[yy * W + xx]) fall = Math.max(fall, h[f.i] + D[f.i] - L.surf);
          }
        }
        const round = axes >= 0.55 && fill >= 0.4;
        const here = round && fall >= 3;
        if (here || fall > bestFall) {
          bestFall = fall;
          note = `a lake of ${open.length} tiles of open water (axes ${Math.round(axes * 100) / 100}, fill ${Math.round(fill * 100) / 100}) with a fall of ${Math.round(fall * 10) / 10} levels into it`;
        }
        if (here) {
          ok = true;
          break;
        }
      }
      return { ok, note };
    }
    case "long-view": {
      const sorted = Array.from(h).sort((p, q) => p - q);
      const p75 = sorted[Math.floor(0.75 * (N - 1))];
      let lo = 99;
      for (let i = 0; i < N; i++) if (cheb(i) <= 15) lo = Math.min(lo, h[i]);
      const ok = z >= p75 && z - lo >= 4;
      return { ok, note: `start at level ${z} (map's 75th percentile ${p75}), ${z - lo} levels above the lowest ground within 15 tiles` };
    }
  }
}
