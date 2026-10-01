// Glaciate's land (PLAN §20 D246, D291, D292; ported from investigation/glaciate `morphology.ts`,
// round 4, #69): the trough between steep walls, the level floor stepping down by bars, the main river
// on the lowest datum, the cirque's tarn, hanging side valleys with springs and falls, scree, the
// moraine and the outwash, the outgoing river to the old outlet; the objects in its path swept, the
// swept clean sources' water fed into its cirque head (badwater's discarded). Bound only by nature
// (D257): relief chooses depth, never permission; only the map's floor, its ceiling (the forces
// core's, `maxHeight`) and its edge stop it. The start is not its concern: the editor carries it.
//
// The planner is the investigation's, in its order, cut into slices (a generator that yields between
// its phases) so the editor's worker answers the page between them; slicing never changes the result.
// After round 4's land, `finishFloor` (floor.ts) leads the floor's extra wet passages into the main
// river so the floor reads as one river (Kyler, D292): literal land, the game's own water.

import * as portable from "../../math/portable";
import type { EntitySpec } from "../../format/entities";
import { waterSource } from "../../format/entities";
import { slopeHighSide } from "../../format/footprints";
import { guidFrom, hash32 } from "../../math/hash";
import { placeSourceGroup } from "../../water/sourceGroups";
import { forceFloor, holdAtFloor } from "../floor";
import { MinHeap, N8 } from "../../math/grid";
import { EMITTERS } from "../../sim/model";
import { prefill, spillLevels } from "../../sim/prefill";
import type { RetainedWater } from "../../sim/water";
import { entityTiles as tilesOf, plainEntities, snapshotMap, type FullForceMap } from "../force";
import { isPlant } from "../objects";
import { hardAt, trimRock } from "../rock";
import { modelOf } from "../runs";
import { floodAllowance, FLOOR_STYLES, floodsOf as floorFloods, floorDistance, riverCourse, type FloorStyle, type Visit } from "./floor";
import { clamp, glaciateProblem, noise, ROUND4_DETAILS, route, sinuosity, sizeOf, Valley, type Basin, type GlaciateDetails, type GlaciateIntent, type GlaciateSettings, type Hanging, type Point, type Station } from "./model";

/** The only refusal: the map's own floor. */
export const PHYSICAL = "At the map floor: no ground left to carve";

export interface GlaciateMetrics {
  cut: number;
  deposited: number;
  carriedAway: number;
  treesRemoved: number;
  objectsRemoved: number;
  cleanAbsorbed: number;
  badSwept: number;
  maxPoolJoin: number;
  length: number;
  valleyLength: number;
  centreline: number;
  valley: number;
  outwash: number;
  requestedWidth: number;
}

/** A planned glacier: the map it started from and the one it makes, its route and stations, when
 *  each tile takes its final level (0–1 along the way: the ice's advance), the trough (1 floor, 2
 *  benches and moraine), the floor datum, the channels (1 the main river, 2 pools and joins, 3
 *  hanging gullies), the outwash fan, its basins and their kept water, its hanging valleys. */
export interface GlaciatePlan {
  before: FullForceMap;
  map: FullForceMap;
  settings: GlaciateSettings;
  intent: GlaciateIntent;
  path: Station[];
  reference: Point[];
  streamPath: Point[];
  arrival: Float32Array;
  mask: Uint8Array;
  floor: Uint8Array;
  nearest: Int32Array;
  stream: Uint8Array;
  fan: Uint8Array;
  retained: RetainedWater;
  basins: Basin[];
  hanging: Hanging[];
  metrics: GlaciateMetrics;
  /** The floor's water as one river (D292): the falls' pools and inflows the river could visit, and
   *  the ones it reached. */
  finished: { style: string; visits: number; reached: number; floods?: number; floodTicks?: number };
  /** The channels led across the floor to the river: from a fall's pool, a lip's other face, an
   *  inflow; where from, and how long. */
  joins: { kind: "fall" | "spill" | "inflow"; from: number; length: number }[];
}

export const lengthOf = (p: Point[]) => p.reduce((s, q, k) => s + (k ? portable.hypot(q.x - p[k - 1].x, q.y - p[k - 1].y) : 0), 0);
const quantile = (a: number[], q: number) => (a.length ? a.sort((x, y) => x - y)[Math.floor((a.length - 1) * q)] : 0);
/** (The investigation's order of the four neighbours.) */
export const N4: readonly [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const texture = (seed: number, x: number, y: number, scale: number) => {
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  const tx = x / scale - gx;
  const ty = y / scale - gy;
  const u = tx * tx * (3 - 2 * tx);
  const v = ty * ty * (3 - 2 * ty);
  const at = (xx: number, yy: number) => noise(seed, Math.imul(xx, 73856093) ^ Math.imul(yy, 19349663)) * 2 - 1;
  return (at(gx, gy) * (1 - u) + at(gx + 1, gy) * u) * (1 - v) + (at(gx, gy + 1) * (1 - u) + at(gx + 1, gy + 1) * u) * v;
};

/** Plan a glacier, all at once (tests; the worker slices `planGlaciate`). */
export function makePlan(input: FullForceMap, settings: GlaciateSettings, intent: GlaciateIntent, valley?: Valley, finish = true): GlaciatePlan {
  const g = planGlaciate(input, settings, intent, valley, finish);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/** Plan a glacier a phase at a time (each `next()` a slice of it); its value, once done, is the plan.
 *  `finish`: lead the floor's extra water into the main river (D292; off only to compare with the
 *  investigation's round 4). Finished, the river's course is tried in turn (floor.ts `FLOOR_STYLES`:
 *  visiting the falls and inflows, bending toward them, round 4's meander) until the game's water,
 *  run a while on it, keeps off its dry floor; the one that keeps off it best is kept. */
export function* planGlaciate(input: FullForceMap, settings: GlaciateSettings, intent: GlaciateIntent, valley?: Valley, finish = true): Generator<void, GlaciatePlan, void> {
  const problem = glaciateProblem(input.W, input.H, settings, intent);
  if (problem) throw new Error(problem);
  if (!valley) {
    valley = new Valley(input);
    yield;
  }
  if (!finish) return yield* planOnce(input, settings, intent, valley, null);
  let best: GlaciatePlan | null = null;
  for (const style of FLOOR_STYLES) {
    const plan = yield* planOnce(input, settings, intent, valley, style);
    const { floods, ticks } = yield* floorFloods(plan);
    plan.finished.floods = floods;
    plan.finished.floodTicks = ticks;
    const f = best?.finished;
    if (!f || ticks > f.floodTicks! || (ticks === f.floodTicks && floods < f.floods!)) best = plan;
    if (floods <= floodAllowance(plan)) break;
  }
  return best!;
}

function* planOnce(input: FullForceMap, settings: GlaciateSettings, intent: GlaciateIntent, valley: Valley, style: FloorStyle | null): Generator<void, GlaciatePlan, void> {
  const finish = style !== null;
  const top = input.maxHeight;
  const cutFloor = forceFloor(settings, top);
  const before = snapshotMap(input);
  const m = snapshotMap(input);
  const s = { ...settings };
  const W = m.W;
  const H = m.H;
  const n = W * H;
  const p = s.power / 100;
  const r = sizeOf(s) / 2;
  const phase = noise(s.seed, 7) * Math.PI * 2;
  const detail: GlaciateDetails = { benches: s.benches ?? ROUND4_DETAILS.benches, steps: s.steps ?? ROUND4_DETAILS.steps, tarn: s.tarn ?? ROUND4_DETAILS.tarn, scree: s.scree ?? ROUND4_DETAILS.scree };
  // (the floor's steps: round 4's spacing, or longer or shorter reaches between them)
  const stepScale = detail.steps === "few" ? 1.8 : detail.steps === "many" ? 0.55 : 1;
  const entityTiles = (e: Pick<EntitySpec, "template" | "x" | "y" | "orientation" | "flipped">) => tilesOf(W, H, e);
  const tile = (q: Point) => clamp(Math.floor(q.y), 0, H - 1) * W + clamp(Math.floor(q.x), 0, W - 1);
  const sample = (x: number, y: number) => before.heights[tile({ x, y })];
  let reference = route(m, s, intent, valley);
  const head = reference[0];
  const regional: number[] = [];
  const radius = Math.max(16, Math.min(W * 0.2, r * 2));
  for (let y = Math.max(0, Math.floor(head.y - radius)); y < Math.min(H, head.y + radius); y += 2)
    for (let x = Math.max(0, Math.floor(head.x - radius)); x < Math.min(W, head.x + radius); x += 2) regional.push(sample(x, y));
  const base = quantile(Array.from(m.heights), 0.08);
  const relief = quantile(regional, 0.9) - Math.min(base, quantile(regional, 0.15));
  // relief chooses depth, never permission: even a plateau gets three levels of excavation where its
  // ground allows it; only the map's floor stops it
  const depth = Math.max(3, Math.round(relief * (0.28 + 0.48 * p)));
  const headFloor = Math.max(0, Math.min(sample(head.x, head.y) - 4, quantile(regional, 0.8) - depth - 1));
  let arc = 0;
  let bar = (8 + noise(s.seed, 80) * 15) * stepScale;
  let level = headFloor;
  let barIndex = 0;
  const preliminary: Station[] = reference.map((q, k) => {
    if (k) arc += portable.hypot(q.x - reference[k - 1].x, q.y - reference[k - 1].y);
    if (arc >= bar && level > 0) {
      level--;
      bar += (8 + noise(s.seed, 81 + barIndex++) * 17) * stepScale;
    }
    const a = reference[Math.max(0, k - 3)];
    const b = reference[Math.min(reference.length - 1, k + 3)];
    const len = portable.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const rim = Math.max(sample(q.x + nx * r * 1.15, q.y + ny * r * 1.15), sample(q.x - nx * r * 1.15, q.y - ny * r * 1.15));
    const hard = hardAt(m, tile(q), Math.round(rim)) ? 1 : (m.rockLayers[Math.round(rim)] ?? 0);
    const confluence = Math.min(0.1, portable.log2(1 + valley!.area[tile(q)]) * 0.011);
    const width = clamp(0.94 + 0.14 * portable.sin(arc * 0.11 + phase) + 0.1 * portable.sin(arc * 0.27 - phase) + confluence - hard * 0.1, 0.7, 1.3);
    const cirque = 1 + 0.72 * portable.exp(-(portable.pow((arc / (r * 0.95)), 2)));
    return { ...q, s: arc, r: Math.max(2, Math.min(r * width * cirque, Math.max(2, Math.min(q.x, q.y, W - q.x, H - q.y) - 1) * 0.9)), floor: level, outlet: rim };
  });
  let lowRun = 0;
  let end = preliminary.length;
  if (s.mode === "flow")
    for (let k = 0; k < preliminary.length; k++) {
      const q = preliminary[k];
      lowRun = q.outlet < base + 1 + relief * 0.35 ? lowRun + 1 : 0;
      if (q.s > Math.max(16, sizeOf(s) * 1.15) && (lowRun >= 7 || Math.min(q.x, q.y, W - q.x, H - q.y) < r * 0.5)) {
        end = Math.max(8, k - (lowRun >= 7 ? 5 : 0));
        break;
      }
    }
  const path = preliminary.slice(0, end);
  reference = reference.slice(0, end);
  const length = lengthOf(reference) || 1;
  for (const q of path) q.s /= length;
  // a new floor cannot dam an old river crossing below its proposed datum: lower the terrace sequence
  // together, keeping single-level bars, rather than cutting a separate deep drainage slot
  let riverClearance = 0;
  for (const q of path)
    for (let y = Math.max(0, Math.floor(q.y - q.r)); y < Math.min(H, q.y + q.r); y++)
      for (let x = Math.max(0, Math.floor(q.x - q.r)); x < Math.min(W, q.x + q.r); x++) {
        const i = y * W + x;
        if (before.water.depth[i] > 0.05 && portable.hypot(x + 0.5 - q.x, y + 0.5 - q.y) <= q.r) riverClearance = Math.max(riverClearance, q.floor - before.heights[i]);
      }
  // (the Floor, D321 item 40: its trough stays a level above it, so its river's channel and its tarn
  // still sink into the floor without going below the Floor; the plan is held at it below as well)
  for (const q of path) q.floor = Math.max(cutFloor + 1, q.floor - riverClearance);
  const nearest = new Int32Array(n).fill(-1);
  const closest = new Float64Array(n).fill(Infinity);
  const dist = new Float64Array(n).fill(Infinity);
  const mask = new Uint8Array(n);
  const arrival = new Float32Array(n).fill(1);
  const floor = new Uint8Array(n);
  const fan = new Uint8Array(n);
  const stream = new Uint8Array(n);
  // the rim's two textures belong to the tile, not the station: worked out once a tile (the same
  // numbers, added in the same order)
  const coarse = new Float64Array(n).fill(NaN);
  const fine = new Float64Array(n);
  let work = 0;
  for (let k = 0; k < path.length; k++) {
    const q = path[k];
    const rr = q.r + 7;
    for (let y = Math.max(0, Math.floor(q.y - rr)); y < Math.min(H, q.y + rr); y++)
      for (let x = Math.max(0, Math.floor(q.x - rr)); x < Math.min(W, q.x + rr); x++) {
        const i = y * W + x;
        if (coarse[i] !== coarse[i]) {
          coarse[i] = 0.1 * texture(s.seed, x, y, 9);
          fine[i] = 0.045 * texture(s.seed ^ 812, x, y, 3);
        }
        const angle = portable.atan2(y + 0.5 - q.y, x + 0.5 - q.x);
        const rim = 1 + 0.045 * portable.sin(angle * 3 + q.s * 11 + phase) + coarse[i] + fine[i];
        const physical = portable.hypot(x + 0.5 - q.x, y + 0.5 - q.y);
        const d = physical / (q.r * rim);
        if (d < dist[i]) dist[i] = d;
        if (physical < closest[i]) {
          closest[i] = physical;
          nearest[i] = k;
        }
      }
    work += portable.pow(2 * rr, 2);
    if (work > 60000) {
      work = 0;
      yield;
    }
  }
  // (D292: no bench is cut where water stands within two tiles: the water there would pond on it and
  // spill over the floor)
  const nearWater = (i: number) => {
    const x = i % W;
    const y = Math.floor(i / W);
    for (let yy = Math.max(0, y - 2); yy <= Math.min(H - 1, y + 2); yy++) for (let xx = Math.max(0, x - 2); xx <= Math.min(W - 1, x + 2); xx++) if (before.water.depth[yy * W + xx] > 0.01) return true;
    return false;
  };
  for (let i = 0; i < n; i++) {
    if (nearest[i] < 0) continue;
    const k = nearest[i];
    const q = path[k];
    const d = dist[i];
    const shift = Math.round(2.2 * portable.sin((i % W) * 0.22 + Math.floor(i / W) * 0.16 + phase));
    const f = path[clamp(k + shift, 0, path.length - 1)].floor;
    floor[i] = f;
    if (d <= 1) {
      m.heights[i] = Math.min(top, f + 1);
      mask[i] = 1;
      arrival[i] = q.s;
    } else if (d < 1 + 3 / q.r) {
      const M = before.heights[i];
      const hard = hardAt(m, i, M) ? 1 : (m.rockLayers[Math.max(f + 1, Math.floor((f + M) / 2))] ?? 0);
      if (M - f >= 5 && hard < 0.5 && portable.sin(q.s * 19 + phase) > (detail.benches === "many" ? -0.7 : 0.15) && detail.benches !== "none" && !(style?.byWater === "skip" && nearWater(i))) {
        m.heights[i] = Math.min(M, f + Math.round((M - f) * 0.58));
        mask[i] = 2;
        arrival[i] = q.s;
      }
    }
  }
  yield;
  // the original drainage's crossings give the hanging mouths and guide the river's bends
  const incoming: { lip: number; landing: number; k: number; area: number; oldWet: boolean }[] = [];
  for (let i = 0; i < n; i++)
    if (mask[i] !== 1 && nearest[i] >= 0) {
      const k = nearest[i];
      const q = path[k];
      if (q.s < 0.12 || q.s > 0.88) continue;
      const x = i % W;
      const y = Math.floor(i / W);
      const inside = N4.map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
        .filter((a) => a.x >= 0 && a.y >= 0 && a.x < W && a.y < H)
        .map((a) => a.y * W + a.x)
        .filter((j) => mask[j] === 1);
      if (!inside.length || before.heights[i] - q.floor < 4) continue;
      const parent = valley.parent[i];
      const oldWet = before.water.depth[i] > 0.03 && before.water.contamination[i] < 0.01;
      if (!oldWet && (parent < 0 || mask[parent] !== 1 || valley.area[i] < 10)) continue;
      incoming.push({ lip: i, landing: inside[0], k, area: valley.area[i], oldWet });
    }
  incoming.sort((a, b) => (b.oldWet ? 100000 : 0) + b.area - ((a.oldWet ? 100000 : 0) + a.area) || a.lip - b.lip);
  const mouths: typeof incoming = [];
  for (const c of incoming) if (!mouths.some((h) => portable.hypot((h.lip % W) - (c.lip % W), Math.floor(h.lip / W) - Math.floor(c.lip / W)) < 7)) mouths.push(c);
  // swept sources give their clean strength to the new head; badwater gives nothing; outside sources
  // and forests are never moved
  let cleanAbsorbed = 0;
  let badSwept = 0;
  const sweptSourceIds = new Set<string>();
  const absorb = () => {
    for (const e of before.entities) {
      if (!EMITTERS[e.template] || sweptSourceIds.has(e.id) || !entityTiles(e).some((i) => mask[i] === 1 || before.heights[i] !== m.heights[i] || stream[i])) continue;
      const emitters = modelOf({ ...before, entities: [e] }).emitters;
      if (!emitters.length) continue;
      sweptSourceIds.add(e.id);
      for (const emitter of emitters) if (emitter.contamination > 0) badSwept += emitter.strength;
        else cleanAbsorbed += emitter.strength;
    }
  };
  absorb();
  const survivingFeed = prefill(modelOf({ ...before, entities: before.entities.filter((e) => !sweptSourceIds.has(e.id)) }));
  const receiving = new Uint8Array(n);
  const wetQueue: number[] = [];
  for (let i = 0; i < n; i++)
    if (mask[i] === 1 && before.water.depth[i] > 0.01) {
      receiving[i] = 1;
      wetQueue.push(i);
    }
  for (let k = 0; k < wetQueue.length; k++) {
    const i = wetQueue[k];
    for (const [dx, dy] of N4) {
      const x = (i % W) + dx;
      const y = Math.floor(i / W) + dy;
      const j = y * W + x;
      if (x < 0 || y < 0 || x >= W || y >= H || receiving[j] || before.water.depth[j] <= 0.01) continue;
      receiving[j] = 1;
      wetQueue.push(j);
    }
  }
  const incomingFlow = modelOf(before).emitters.reduce((sum, e) => sum + (e.cells.some((i) => receiving[i]) ? e.strength : 0), 0);
  const riverRadius = clamp(0.95 + sizeOf(s) / 80 + Math.max(0, cleanAbsorbed - 2) * 0.16 + Math.max(0, incomingFlow - 8) * 0.12, 1.05, 2.75);
  yield;
  // a mouth's lip with high ground behind it gets a spring (Meltwater)
  const enough = (lip: number) =>
    N8.some(([dx, dy]) => {
      const x = (lip % W) + dx;
      const y = Math.floor(lip / W) + dy;
      const i = y * W + x;
      return x >= 0 && y >= 0 && x < W && y < H && mask[i] !== 1 && before.heights[i] >= before.heights[lip];
    });
  const bends: typeof incoming = [];
  // (D292: the river bends toward every fall that will run, the biggest first, a little closer
  // together, so their water has a short way to it)
  if (style && style.course === "bends") {
    for (const c of mouths) if (((s.meltwater && enough(c.lip)) || (c.oldWet && survivingFeed.depth[c.lip] > 0)) && !bends.some((b) => Math.abs(path[b.k].s - path[c.k].s) * length < style.spacing)) bends.push(c);
  } else for (const c of mouths) if ((c.oldWet || c.area >= 20) && !bends.some((b) => Math.abs(path[b.k].s - path[c.k].s) * length < Math.max(14, r * 1.2))) bends.push(c);
  const meanderPath = (): Point[] =>
    path.map((q, k) => {
    const a = path[Math.max(0, k - 3)];
    const b = path[Math.min(path.length - 1, k + 3)];
    const len = portable.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    let off = portable.sin(q.s * 8 + phase) * q.r * 0.35 * portable.sin(Math.PI * q.s);
    let weight = 0;
    for (const c of bends) {
      const d = (q.s - path[c.k].s) * length;
      const w = portable.exp(-(portable.pow((d / Math.max(10, r * 0.85)), 2)));
      const target = ((c.landing % W) + 0.5 - q.x) * nx + (Math.floor(c.landing / W) + 0.5 - q.y) * ny;
      off += clamp(target, -q.r * 0.82, q.r * 0.82) * w;
      weight += w;
    }
    off = clamp(off / (1 + weight * 0.18), -q.r * 0.84, q.r * 0.84);
    return { x: q.x + nx * off, y: q.y + ny * off };
  });
  // the outside rivers that enter the floor, each at its deepest wet entrance
  const inflows = (): { i: number; outside: number }[][] => {
    const wetGroup = new Int32Array(n).fill(-1);
    const entrances = new Map<number, { i: number; outside: number }[]>();
    let group = 0;
    for (let i = 0; i < n; i++)
      if (mask[i] !== 1 && before.water.depth[i] > 0.05 && survivingFeed.depth[i] > 0 && wetGroup[i] < 0) {
        const queue = [i];
        wetGroup[i] = group;
        for (let k = 0; k < queue.length; k++) {
          const j = queue[k];
          for (const [dx, dy] of N4) {
            const x = (j % W) + dx;
            const y = Math.floor(j / W) + dy;
            const a = y * W + x;
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            if (mask[a] === 1 && before.heights[j] >= floor[a]) {
              const list = entrances.get(group) ?? [];
              list.push({ i: a, outside: j });
              entrances.set(group, list);
            } else if (mask[a] !== 1 && before.water.depth[a] > 0.05 && survivingFeed.depth[a] > 0 && wetGroup[a] < 0) {
              wetGroup[a] = group;
              queue.push(a);
            }
          }
        }
        group++;
      }
    return [...entrances.values()];
  };
  const entryOf = (list: { i: number; outside: number }[]) => list.reduce((a, b) => (before.water.depth[a.outside] > before.water.depth[b.outside] ? a : b));
  let streamPath: Point[];
  let visits: Visit[] = [];
  let reached: Visit[] = [];
  if (finish) {
    // D292: the river swings over to the falls' pools and the inflows, the biggest first
    for (const list of inflows()) {
      const e = entryOf(list);
      visits.push({ k: nearest[e.i], x: (e.i % W) + 0.5, y: Math.floor(e.i / W) + 0.5, weight: 1e6 + before.water.depth[e.outside] });
    }
    for (const c of mouths)
      if ((s.meltwater && enough(c.lip)) || (c.oldWet && survivingFeed.depth[c.lip] > 0)) visits.push({ k: c.k, x: (c.landing % W) + 0.5, y: Math.floor(c.landing / W) + 0.5, weight: (c.oldWet ? 1e5 : 0) + c.area });
    if (style.course === "visits") ({ course: streamPath, reached } = riverCourse(path, visits, length, riverRadius, phase, { mask, W, H }, style));
    else streamPath = meanderPath();
  } else streamPath = meanderPath();
  const channel = (points: Point[], beds: number[], width: number, at: number, kind = 2, record?: number[], exact = false) => {
    for (let k = 0; k < points.length; k++) {
      const a = points[Math.max(0, k - 1)];
      const b = points[k];
      const steps = Math.max(1, Math.ceil(portable.hypot(b.x - a.x, b.y - a.y) * 3));
      const bed = Math.min(beds[Math.max(0, k - 1)], beds[k]);
      const paint = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = y * W + x;
        if ((kind <= 2 && at < 1 && mask[i] !== 1) || (kind === 3 && mask[i] === 1)) return;
        const main = stream[i] === 1 && kind === 2;
        m.heights[i] = main ? m.heights[i] : exact ? bed : Math.min(m.heights[i], bed);
        stream[i] = main ? 1 : kind;
        arrival[i] = at >= 0 ? at : path[Math.min(k, path.length - 1)].s;
        record?.push(i);
      };
      let previous = { x: Math.floor(a.x), y: Math.floor(a.y) };
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        // water moves over shared edges, not shared corners: a thin diagonal raster left corner-only
        // gaps that dammed its pool to bank height
        if (cx !== previous.x && cy !== previous.y) {
          const choices = [
            { x: cx, y: previous.y },
            { x: previous.x, y: cy },
          ];
          const off = (q: Point) => Math.abs((q.x + 0.5 - a.x) * (b.y - a.y) - (q.y + 0.5 - a.y) * (b.x - a.x));
          choices.sort((u, v) => off(u) - off(v));
          const bridge = choices.find((q) => kind > 2 || at >= 1 || mask[q.y * W + q.x] === 1) ?? choices[0];
          paint(bridge.x, bridge.y);
        }
        paint(cx, cy);
        previous = { x: cx, y: cy };
        for (let yy = Math.max(0, Math.floor(y - width)); yy < Math.min(H, y + width + 1); yy++)
          for (let xx = Math.max(0, Math.floor(x - width)); xx < Math.min(W, x + width + 1); xx++) if (portable.hypot(xx + 0.5 - x, yy + 0.5 - y) <= width) paint(xx, yy);
      }
    }
  };
  // the river takes the lowest floor datum, read where it actually crosses each bar, and its profile
  // never rises (an irregular bar crossing a bend twice used to raise a hidden sill behind the drop)
  let riverBed = path[0].floor;
  const riverBeds = streamPath.map((q) => (riverBed = Math.min(riverBed, floor[tile(q)])));
  channel(streamPath, riverBeds, riverRadius, -1, 1, undefined, true);
  const riverCells = Uint8Array.from(stream, (v) => (v === 1 ? 1 : 0));
  const riverHeights = m.heights.slice();
  for (let i = 0; i < n; i++)
    if (riverCells[i])
      for (const [dx, dy] of N4) {
        const x = (i % W) + dx;
        const y = Math.floor(i / W) + dy;
        const j = y * W + x;
        if (x >= 0 && y >= 0 && x < W && y < H && mask[j] === 1 && !riverCells[j]) m.heights[j] = Math.min(top, floor[j] + 1);
      }
  const tarn = streamPath[Math.min(3, path.length - 1)];
  const lakeSeeds: number[] = [];
  const tarnX = Math.min(3.5, 1.5 + length * 0.035);
  const tarnY = Math.min(2.6, 1.3 + length * 0.025);
  for (let y = Math.max(0, Math.floor(tarn.y - 3)); y < Math.min(H, tarn.y + 3); y++)
    for (let x = Math.max(0, Math.floor(tarn.x - 4)); x < Math.min(W, tarn.x + 4); x++) {
      const i = y * W + x;
      if (detail.tarn && portable.pow(((x + 0.5 - tarn.x) / tarnX), 2) + portable.pow(((y + 0.5 - tarn.y) / tarnY), 2) < 1 && mask[i] === 1) {
        m.heights[i] = Math.max(0, path[0].floor - 1);
        lakeSeeds.push(i);
        stream[i] = 2;
        arrival[i] = 0;
      }
    }
  const hanging: Hanging[] = [];
  const joins: GlaciatePlan["joins"] = [];
  const upstream: number[][] = Array.from({ length: n }, () => []);
  const draining = riverCells.slice();
  for (let i = 0; i < n; i++) if (valley.parent[i] >= 0) upstream[valley.parent[i]].push(i);
  const refreshDraining = () => {
    draining.fill(0);
    const queue: number[] = [];
    for (let i = 0; i < n; i++)
      if (stream[i] === 1) {
        draining[i] = 1;
        queue.push(i);
      }
    for (let k = 0; k < queue.length; k++) {
      const i = queue[k];
      for (const [dx, dy] of N4) {
        const x = (i % W) + dx;
        const y = Math.floor(i / W) + dy;
        const j = y * W + x;
        if (x >= 0 && y >= 0 && x < W && y < H && !draining[j] && stream[j] === 2 && m.heights[j] >= m.heights[i]) {
          draining[j] = 1;
          queue.push(j);
        }
      }
    }
  };
  const joinRiver = (from: Point, at: number, width = 0.5, record?: number[], anyWater = false) => {
    // a later pool can lower an older joining reach: recompute which reaches still descend through
    // shared edges before one receives a join
    refreshDraining();
    const origin = tile(from);
    const datum = floor[origin];
    const cost = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    cost[origin] = 0;
    heap.push(0, origin);
    let goal = origin;
    while (heap.size) {
      const i = heap.pop();
      const d = heap.lastKey;
      if (d !== cost[i]) continue;
      // (D292: every join goes to the main river itself, the nearest way across the floor at or below
      // its datum, never to another join along the wall's foot; a lip's other face to its own pool)
      if ((finish ? stream[i] === 1 || (anyWater && i !== origin && stream[i] === 2 && draining[i]) : draining[i] || stream[i] === 1) && m.heights[i] <= datum) {
        goal = i;
        break;
      }
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        const j = yy * W + xx;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || mask[j] !== 1) continue;
        if (dx && dy && mask[y * W + xx] !== 1 && mask[yy * W + x] !== 1) continue;
        const next = d + portable.hypot(dx, dy) * (finish ? 1 : 1 + Math.max(0, floor[j] - datum) * 0.25);
        if (next < cost[j]) {
          cost[j] = next;
          parent[j] = i;
          heap.push(next, j);
        }
      }
    }
    const indices: number[] = [];
    for (let i = goal; i >= 0; i = parent[i]) {
      indices.push(i);
      if (i === origin) break;
    }
    indices.reverse();
    let join = indices.map((i) => ({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 }));
    // (D292: a straight stream across the floor where the floor lets it, a tile a point)
    if (finish && goal !== origin) {
      const a = { x: (origin % W) + 0.5, y: Math.floor(origin / W) + 0.5 };
      const b = join.at(-1)!;
      const count = Math.max(1, Math.ceil(portable.hypot(b.x - a.x, b.y - a.y)));
      const line = Array.from({ length: count + 1 }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / count, y: a.y + ((b.y - a.y) * k) / count }));
      if (line.every((q) => mask[tile(q)] === 1)) join = line;
    }
    const near = join.at(-1)!;
    // a short join may cross a bar obliquely: cut its sill down to the entering pool, never raise the
    // pool toward an upstream terrace; every step along the joining bed goes down to its receiver
    const receivingBed = m.heights[tile(near)];
    let bed = Math.max(receivingBed, datum);
    const beds = join.map((q) => (bed = Math.max(receivingBed, Math.min(bed, floor[tile(q)]))));
    beds[beds.length - 1] = receivingBed;
    const cells: number[] = [];
    const prior = m.heights.slice();
    const main = Uint8Array.from(stream, (v) => (v === 1 ? 1 : 0));
    channel(join, beds, width, at, 2, cells, true);
    for (const i of cells) {
      if (riverCells[i] || main[i]) {
        stream[i] = 1;
        m.heights[i] = Math.min(prior[i], riverCells[i] ? riverHeights[i] : prior[i]);
      } else if (draining[i]) m.heights[i] = Math.min(m.heights[i], prior[i]);
      draining[i] = 1;
    }
    record?.push(...cells);
    return lengthOf(join);
  };
  // (D292: how far across the floor each tile is from the river, for the falls it passes close by)
  const riverDist = finish ? floorDistance(mask, stream, W, H) : new Float64Array(0);
  const reachedAt = new Set(reached.map((v) => Math.floor(v.y) * W + Math.floor(v.x)));
  yield;
  for (const c of mouths) {
    const chain = [c.lip];
    let at = c.lip;
    for (let k = 0; k < Math.max(18, r * 2.5); k++) {
      const options = upstream[at].filter((j) => mask[j] !== 1);
      if (!options.length) break;
      at = options.reduce((a, b) => (valley!.area[a] > valley!.area[b] ? a : b));
      chain.push(at);
      if (k > 8 && before.heights[at] >= before.heights[c.lip] + 2) break;
    }
    const gully = chain.slice(0, 5);
    const lipAt = c.lip;
    const from = { x: (c.landing % W) + 0.5, y: Math.floor(c.landing / W) + 0.5 };
    // (D292: a fall the river doesn't reach, nor passes close by, stays a dry hanging valley)
    const feed = s.meltwater && enough(c.lip) && (!finish || reachedAt.has(c.landing) || riverDist[c.landing] <= style!.reach);
    const oldWet = c.oldWet && survivingFeed.depth[c.lip] > 0;
    const cells: number[] = [];
    if (feed || oldWet) {
      let bed = Math.max(0, before.heights[c.lip] - 1);
      const beds = gully.map((i) => (bed = Math.max(bed, before.heights[i] - 1)));
      channel(
        gully
          .slice()
          .reverse()
          .map((i) => ({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 })),
        beds.reverse(),
        0.76,
        path[c.k].s,
        3,
        cells,
        true,
      );
    }
    m.heights[c.lip] = before.heights[c.lip] - (feed || oldWet ? 1 : 0);
    arrival[c.lip] = path[c.k].s;
    // a small pool and the direct joining reach follow the same stepped datum
    let joinLength = 0;
    if (feed || oldWet) {
      channel([from], [floor[c.landing]], 1.25, path[c.k].s, 2, cells, true);
      joinLength = joinRiver(from, path[c.k].s, 0.5, cells);
      joins.push({ kind: "fall", from: c.landing, length: joinLength });
    }
    hanging.push({ mouth: c.lip, lip: c.lip, landing: c.landing, source: feed ? lipAt : null, catchment: c.area, drop: m.heights[c.lip] - m.heights[c.landing], s: path[c.k].s, wet: false, channel: [...new Set(cells)], joinLength });
    yield;
  }
  // a rasterized lip can spill over two faces: both get the same small receiving pool, so the second
  // face doesn't wet unchannelled land
  const landings: number[] = [];
  for (let i = 0; i < n; i++)
    if (stream[i] === 3)
      for (const [dx, dy] of N4) {
        const x = (i % W) + dx;
        const y = Math.floor(i / W) + dy;
        const j = y * W + x;
        if (x >= 0 && y >= 0 && x < W && y < H && mask[j] === 1 && !stream[j]) landings.push(j);
      }
  for (const i of landings) {
    const from = { x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 };
    // (D292: the lip's other face runs into its own fall's pool, beside it)
    if (finish) {
      if (stream[i]) continue;
      joins.push({ kind: "spill", from: i, length: joinRiver(from, path[nearest[i]].s, 0.5, undefined, true) });
      continue;
    }
    channel([from], [floor[i]], 1.2, path[nearest[i]].s, 2, undefined, true);
    joins.push({ kind: "spill", from: i, length: joinRiver(from, path[nearest[i]].s) });
  }
  yield;
  const scree = hanging.filter((h) => h.source !== null || before.water.depth[h.mouth] > 0.03).map((h) => h.landing);
  for (let k = 6; k < path.length; k += 7)
    if (detail.scree && noise(s.seed, k + 550) > 0.68) {
      const q = path[k];
      const a = path[k - 2];
      const b = path[Math.min(k + 2, path.length - 1)];
      const len = portable.hypot(b.x - a.x, b.y - a.y) || 1;
      const side = noise(s.seed, k + 900) > 0.5 ? 1 : -1;
      scree.push(tile({ x: q.x - ((b.y - a.y) / len) * q.r * 0.87 * side, y: q.y + ((b.x - a.x) / len) * q.r * 0.87 * side }));
    }
  for (const centre of scree) {
    const cx = (centre % W) + 0.5;
    const cy = Math.floor(centre / W) + 0.5;
    const rad = 2.5 + noise(s.seed, centre) * 2;
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(H, cy + rad); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(W, cx + rad); x++) {
        const i = y * W + x;
        const d = portable.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (mask[i] !== 1 || stream[i] || d > rad) continue;
        m.heights[i] = Math.max(floor[i], Math.min(before.heights[i], floor[i] + Math.floor((1 - d / rad) * 3)));
      }
  }
  const snout = path.at(-1)!;
  const prior = path[Math.max(0, path.length - 7)];
  const dl = portable.hypot(snout.x - prior.x, snout.y - prior.y) || 1;
  const sdx = (snout.x - prior.x) / dl;
  const sdy = (snout.y - prior.y) / dl;
  for (let i = 0; i < n; i++) {
    const ex = (i % W) + 0.5 - snout.x;
    const ey = Math.floor(i / W) + 0.5 - snout.y;
    const along = ex * sdx + ey * sdy;
    const rad = portable.hypot(ex, ey);
    const angle = portable.atan2(ey, ex);
    if (along > 0 && Math.abs(rad - snout.r * 0.92 * (1 + 0.1 * portable.sin(angle * 3 + phase))) < 1.6 && !stream[i]) {
      m.heights[i] = Math.max(m.heights[i], Math.min(top, snout.floor + 1 + (noise(s.seed, i) > 0.73 ? 1 : 0)));
      mask[i] = 2;
      arrival[i] = 1;
    }
    const across = -ex * sdy + ey * sdx;
    const width = r * (0.75 + along / (r * 3));
    if (along > snout.r && along < snout.r + r * 2.8 && Math.abs(across) < width * (1 + 0.1 * portable.sin(along * 0.2 + phase)) && before.heights[i] < snout.floor && !stream[i]) {
      const target = Math.max(0, snout.floor - Math.floor((along - snout.r) / (10 + noise(s.seed, 19) * 7)));
      if (target > before.heights[i]) {
        m.heights[i] = target;
        fan[i] = 1;
        arrival[i] = 1;
      }
    }
  }
  // one open downstream river, on to the original drainage outlet: a broad extension at its floor
  // level, not several fan braids
  let tail = valley.path(tile(snout), n);
  let tailIndex = tile(tail.at(-1)!);
  while (valley.parent[tailIndex] >= 0) {
    tailIndex = valley.parent[tailIndex];
    tail.push({ x: (tailIndex % W) + 0.5, y: Math.floor(tailIndex / W) + 0.5 });
  }
  const exit = tail.findIndex((q) => mask[tile(q)] !== 1);
  if (exit > 0) tail = tail.slice(exit);
  // Aim can cut across the old drainage, whose outlet path then ran back through the new trough as a
  // second, parallel river: keep the same receiving edge, but route outside the finished floor
  if (tail.some((q) => mask[tile(q)] === 1)) {
    const origin = tile(snout);
    const goal = tile(tail.at(-1)!);
    const cost = new Float64Array(n).fill(Infinity);
    const parent = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    cost[origin] = 0;
    heap.push(0, origin);
    const allowed = (i: number) => mask[i] !== 1 || nearest[i] >= path.length - 7;
    while (heap.size) {
      const i = heap.pop();
      const d = heap.lastKey;
      if (d !== cost[i]) continue;
      if (i === goal) break;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [xx, yy] of N8) {
        const nx = x + xx;
        const ny = y + yy;
        const j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !allowed(j)) continue;
        if (xx && yy && !allowed(y * W + nx) && !allowed(ny * W + x)) continue;
        const next = d + portable.hypot(xx, yy) * (1 + Math.max(0, before.heights[j] - snout.floor) * 0.35);
        if (next < cost[j]) {
          cost[j] = next;
          parent[j] = i;
          heap.push(next, j);
        }
      }
    }
    if (Number.isFinite(cost[goal])) {
      const indices: number[] = [];
      for (let i = goal; i >= 0; i = parent[i]) {
        indices.push(i);
        if (i === origin) break;
      }
      tail = indices.reverse().map((i) => ({ x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 }));
    }
  }
  {
    // (D292: the outgoing river starts no higher than the river reaches it, so the river never backs
    // up over its floor behind a sill at the snout)
    const outlet = finish ? Math.min(snout.floor, riverBeds.at(-1)!) : snout.floor;
    let bed = outlet;
    let tailArc = 14;
    const beds = tail.map((q, k) => {
      if (k) tailArc += portable.hypot(q.x - tail[k - 1].x, q.y - tail[k - 1].y);
      return (bed = Math.max(0, Math.min(bed, before.heights[tile(q)], outlet - Math.floor(tailArc / 14))));
    });
    channel([streamPath.at(-1)!, ...tail], [outlet, ...beds], riverRadius, 1, 1);
  }
  yield;
  // seal only the banks (the tarn's and the plunge pools' too): a bank at the higher datum beside it
  // keeps a bar's one-level drop from opening a second river across the dry floor. Every wet entrance
  // already there, terraces outside the hanging mouths included, goes straight to the nearest main
  // river, never over a floor
  for (const list of inflows()) {
    // a wide or oblique outside river has one receiving notch, not a fan of cuts from every wet
    // boundary tile; the rest of its old bank stays at the rim
    const entry = entryOf(list);
    const centre = { x: (entry.i % W) + 0.5, y: Math.floor(entry.i / W) + 0.5 };
    const far = (i: number) => !stream[i] && portable.hypot((i % W) - (entry.i % W), Math.floor(i / W) - Math.floor(entry.i / W)) > 2;
    for (const { i, outside } of list) if (far(i)) m.heights[i] = Math.max(m.heights[i], Math.min(top, Math.ceil(before.heights[outside] + before.water.depth[outside])));
    // (D292: its shore too, two tiles out from its water: an outside river backed up by its new
    // outlet spreads over its shore, and at the floor's level it would run over the floor as a sheet)
    if (finish) {
      const wet = new Set(list.map((e) => e.outside));
      const shore = new Set<number>();
      for (const o of wet)
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const x = (o % W) + dx;
            const y = Math.floor(o / W) + dy;
            const j = y * W + x;
            if (x >= 0 && y >= 0 && x < W && y < H && mask[j] !== 1) shore.add(j);
          }
      for (const o of shore)
        for (const [dx, dy] of N4) {
          const x = (o % W) + dx;
          const y = Math.floor(o / W) + dy;
          const i = y * W + x;
          if (x >= 0 && y >= 0 && x < W && y < H && mask[i] === 1 && far(i) && m.heights[i] <= m.heights[o]) m.heights[i] = Math.min(top, m.heights[o] + 1);
        }
    }
    joins.push({ kind: "inflow", from: entry.i, length: joinRiver(centre, path[nearest[entry.i]].s, finish ? riverRadius : Math.min(riverRadius, 0.99)) });
    yield;
  }
  // the upstream bank continues round a bar until the river itself drops (closing the lateral
  // spillways the old per-tile floor + 1 left open)
  const freeboard = incomingFlow + cleanAbsorbed + 0.65 + (s.meltwater ? riverRadius * 0.7 : 0) > 3 ? 2 : 1;
  for (let pass = 0; pass < 2; pass++) {
    const receivingSpill = spillLevels(modelOf({ ...m, entities: m.entities.filter((e) => !entityTiles(e).some((i) => mask[i] === 1 || stream[i] || before.heights[i] !== m.heights[i])) }));
    for (let i = 0; i < n; i++)
      if (mask[i] === 1 && !stream[i]) {
        let bank = floor[i] + 1;
        for (const [dx, dy] of N4) {
          const x = (i % W) + dx;
          const y = Math.floor(i / W) + dy;
          const j = y * W + x;
          if (x >= 0 && y >= 0 && x < W && y < H && (stream[j] === 1 || stream[j] === 2)) bank = Math.max(bank, m.heights[j] + freeboard, receivingSpill[j] + (finish ? freeboard : 1));
        }
        m.heights[i] = Math.max(m.heights[i], Math.min(top, bank));
      }
    yield;
  }
  absorb();
  let treesRemoved = 0;
  let objectsRemoved = 0;
  // (the start is the editor's: it carries it off broken ground, D257)
  m.entities = m.entities.filter((e) => {
    if (e.template === "StartingLocation") return true;
    const cells = entityTiles(e);
    if (cells.some((i) => mask[i] === 1 || stream[i] || before.heights[i] !== m.heights[i])) {
      if (isPlant(e)) treesRemoved++;
      else objectsRemoved++;
      return false;
    }
    return true;
  });
  m.fallen = m.fallen.filter((f) => m.entities.some((e) => e.id === f.id));
  trimRock(m);
  let serial = 0;
  const newId = () => {
    let id = guidFrom("glaciate", s.seed, intent.origin, serial++);
    while (m.entities.some((e) => e.id === id)) id = guidFrom("glaciate", s.seed, intent.origin, serial++);
    return id;
  };
  const addSource = (i: number, strength: number, id = newId()) => {
    m.entities.push(waterSource({ id, owner: "glaciate", x: i % W, y: Math.floor(i / W), z: m.heights[i], strength }));
  };
  // D314: the finished glacier's springs come in groups, as the game's own maps have them (a row
  // across the flow, fewer where cramped, the strength shared; core/water/sourceGroups.ts); round 4's
  // (the investigation's, `finish` off) stay one a site
  const taken = new Uint8Array(n);
  if (finish) for (const e of m.entities) for (const i of entityTiles(e)) taken[i] = 1;
  const addGroup = (i: number, strength: number, flow: readonly [number, number]) => {
    const g = placeSourceGroup({ kind: "water", x: i % W, y: Math.floor(i / W), strength, seed: hash32(s.seed, intent.origin, i), flow }, { W, H, heights: m.heights, occupied: taken });
    if (g.refused || !g.sources.length) return addSource(i, strength);
    const anchor = newId();
    for (const q of g.sources) {
      const at = q.y * W + q.x;
      addSource(at, q.strength, at === i ? anchor : guidFrom(anchor, q.x, q.y));
      taken[at] = 1;
    }
  };
  if (s.meltwater) {
    let strength = 0.65 + cleanAbsorbed;
    if (finish) {
      // the cirque head: one group at the tarn, across the glacier's way down
      const a = path[0];
      const b = path[Math.min(6, path.length - 1)];
      addGroup(tile(tarn), strength, [b.x - a.x, b.y - a.y]);
    } else {
      const sites = [tile(tarn), ...lakeSeeds.filter((i) => i !== tile(tarn))];
      let index = 0;
      while (strength > 0) {
        const amount = Math.min(8, strength);
        addSource(sites[index++ % sites.length], amount);
        strength -= amount;
      }
    }
    const fed = hanging.filter((h) => h.source !== null);
    const weights = fed.map((h) => (0.12 + Math.min(0.32, h.catchment / 650)) * (0.65 + noise(s.seed, h.mouth) * 0.7));
    const budget = Math.max(0.25, riverRadius * 0.7);
    const scale = Math.min(1, budget / (weights.reduce((a, b) => a + b, 0) || 1));
    for (let k = 0; k < fed.length; k++) {
      const h = fed[k];
      // (a hanging valley's spring: a group at its lip, across its fall into the trough)
      if (finish) addGroup(h.source!, weights[k] * scale, [(h.landing % W) - (h.mouth % W), Math.floor(h.landing / W) - Math.floor(h.mouth / W)]);
      else addSource(h.source!, weights[k] * scale);
    }
  }
  m.entities = plainEntities(m.entities);
  yield;
  // a rim bank beside incoming terraces: the potential-flow prefill also catches the dry parts of an
  // outside terrace a redirected river can wet later; only the receiving notches and the fall pools
  // open through it (no water is removed or hidden from the game's own)
  const potential = prefill(modelOf(m));
  for (let i = 0; i < n; i++)
    if (mask[i] === 1 && !stream[i])
      for (const [dx, dy] of N4) {
        const x = (i % W) + dx;
        const y = Math.floor(i / W) + dy;
        const j = y * W + x;
        if (x < 0 || y < 0 || x >= W || y >= H || mask[j] === 1 || potential.depth[j] <= 0 || m.heights[j] < floor[i]) continue;
        const bank = Math.min(top, m.heights[j] + Math.max(freeboard, Math.ceil(potential.depth[j] + 0.05)));
        if (bank > m.heights[i]) m.heights[i] = bank;
      }
  yield;
  const bankSpill = spillLevels(modelOf(m));
  for (let i = 0; i < n; i++) if (mask[i] === 1 && !stream[i] && bankSpill[i] > m.heights[i] && bankSpill[i] <= floor[i] + 2) m.heights[i] = bankSpill[i];
  yield;
  const plan: GlaciatePlan = {
    before,
    map: m,
    settings: s,
    intent: { ...intent },
    path,
    reference,
    streamPath,
    arrival,
    mask,
    floor,
    nearest,
    stream,
    fan,
    retained: { tiles: [], floor: [], depth: [], contamination: [] },
    basins: [],
    hanging,
    metrics: {
      cut: 0,
      deposited: 0,
      carriedAway: 0,
      treesRemoved,
      objectsRemoved,
      cleanAbsorbed,
      badSwept,
      maxPoolJoin: Math.max(0, ...hanging.map((h) => h.joinLength)),
      length,
      valleyLength: lengthOf(reference),
      centreline: sinuosity(path),
      valley: sinuosity(reference),
      outwash: 0,
      requestedWidth: sizeOf(s),
    },
    finished: { style: style ? `${style.course}${style.byWater === "cut" ? ", benches by water" : ""}` : "round 4", visits: visits.length, reached: reached.length },
    joins,
  };
  let removed = true;
  while (removed) {
    removed = false;
    const slopes = new Map(m.entities.filter((e) => e.template === "Slope").map((e) => [e.y * W + e.x, e]));
    m.entities = m.entities.filter((e) => {
      if (e.template !== "Slope") return true;
      const [dx, dy] = slopeHighSide(e.orientation);
      const hx = e.x + dx;
      const hy = e.y + dy;
      const lx = e.x - dx;
      const ly = e.y - dy;
      if (hx >= 0 && hy >= 0 && hx < W && hy < H && lx >= 0 && ly >= 0 && lx < W && ly < H && m.heights[hy * W + hx] === e.z + 1 && (m.heights[ly * W + lx] === e.z || slopes.get(ly * W + lx)?.z === e.z - 1)) return true;
      removed = true;
      plan.metrics.objectsRemoved++;
      return false;
    });
  }
  // the Floor (D321, item 40): where the trough, its channels or its tarn would go below it, they run
  // shallower, held at it (its water and tarn are worked out on the held ground, below)
  holdAtFloor(before.heights, m.heights, cutFloor);
  trimRock(m);
  const model = modelOf(m);
  const spill = spillLevels(model);
  const feed = prefill(model);
  const seen = new Uint8Array(n);
  const basins: Basin[] = [];
  const retained = { tiles: [] as number[], floor: [] as number[], depth: [] as number[], contamination: [] as number[] };
  for (const i of lakeSeeds) {
    if (seen[i] || spill[i] <= m.heights[i]) continue;
    const lv = spill[i];
    const queue = [i];
    seen[i] = 1;
    for (let k = 0; k < queue.length; k++) {
      const j = queue[k];
      const x = j % W;
      const y = Math.floor(j / W);
      for (const [dx, dy] of N4) {
        const xx = x + dx;
        const yy = y + dy;
        const a = yy * W + xx;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || seen[a] || spill[a] !== lv || m.heights[a] >= lv) continue;
        seen[a] = 1;
        queue.push(a);
      }
    }
    if (queue.length < 3) continue;
    const bottom = Math.min(...queue.map((j) => m.heights[j]));
    basins.push({ tiles: queue.sort((a, b) => a - b), floor: bottom, outlet: lv, depth: lv - bottom, fed: queue.some((j) => feed.depth[j] > 0.01) });
  }
  for (const i of [...new Set(basins.flatMap((b) => b.tiles))].sort((a, b) => a - b)) {
    retained.tiles.push(i);
    retained.floor.push(m.heights[i]);
    retained.depth.push(s.meltwater ? Math.max(0, spill[i] - m.heights[i] - 0.04) : 0);
    retained.contamination.push(0);
  }
  m.water = prefill({ ...model, retained: [retained] });
  plan.basins = basins;
  plan.retained = retained;
  let cut = 0;
  let deposited = 0;
  let outwash = 0;
  for (let i = 0; i < n; i++) {
    cut += Math.max(0, before.heights[i] - m.heights[i]);
    deposited += Math.max(0, m.heights[i] - before.heights[i]);
    if (fan[i]) outwash += Math.max(0, m.heights[i] - before.heights[i]);
  }
  if (!cut && !deposited && m.entities.length === before.entities.length) throw new Error(PHYSICAL);
  Object.assign(plan.metrics, { cut, deposited, carriedAway: cut - deposited, outwash });
  return plan;
}
