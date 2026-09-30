// Demo algorithm. All product imports are read-only; the shared core owns the rules.
import { fullMap, snapshotMap, type ForceMap, type FullForceMap } from '../../src/core/forces/force';
import { forceFloor, floorProblem, holdAtFloor } from '../../src/core/forces/floor';
import { footprint, startProblem, isPlant } from '../../src/core/forces/objects';
import { resamplePath, pathLength, type PathPoint } from '../../src/core/forces/path';
import { hash, smooth, clamp } from '../../src/core/forces/random';
import { trimRock } from '../../src/core/forces/rock';
import { modelOf } from '../../src/core/forces/runs';
import { MinHeap } from '../../src/core/math/grid';
import { findNeck, type Oxbow } from '../../src/core/forces/carve/oxbow';
import type { Station } from '../../src/core/forces/carve/run';
import { WaterSim, SettleRun, sealedTiles, type RetainedWater } from '../../src/core/sim/water';
import { spillLevels } from '../../src/core/sim/prefill';
export interface Settings {
  power: number;
  size: number | null;
  bends: 'auto' | 'tight' | 'broad';
  floor: number;
  seed: number;
}
export interface Intent {
  click?: PathPoint;
  path?: PathPoint[];
}
export const DEFAULTS: Settings = { power: 65, size: null, bends: 'auto', floor: 1, seed: 1 };
export const widthOf = (s: Settings) => s.size ?? Math.round(16 + s.power * .48);
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const at = (m: ForceMap, p: PathPoint) => clamp(Math.round(p.y), 0, m.H - 1) * m.W + clamp(Math.round(p.x), 0, m.W - 1);
/** Trace only an existing wet source-to-outlet river. Weighted medial walk avoids bank-hugging. */
export function river(m: ForceMap): {
  path: PathPoint[];
  width: number;
} {
  const N = m.W * m.H, wet = Uint8Array.from(m.water.depth, (d, i) => d > .015 && m.water.contamination[i] < .4 ? 1 : 0);
  const edgeDistance = new Float64Array(N).fill(Infinity), queue: number[] = [];
  for (let i = 0; i < N; i++)
    if (!wet[i]) {
      edgeDistance[i] = 0;
      queue.push(i);
    }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h], x = i % m.W, y = Math.floor(i / m.W);
    for (const [dx, dy] of D4) {
      const xx = x + dx, yy = y + dy, j = yy * m.W + xx;
      if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || edgeDistance[j] <= edgeDistance[i] + 1)
        continue;
      edgeDistance[j] = edgeDistance[i] + 1;
      queue.push(j);
    }
  }
  const model = modelOf(fullMap(m)), sources = model.emitters.filter(e => e.strength > 0 && e.contamination === 0).sort((a, b) => b.strength - a.strength);
  let best: PathPoint[] = [];
  for (const source of sources) {
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap = new MinHeap();
    for (const i of source.cells)
      if (wet[i]) {
        dist[i] = 0;
        heap.push(0, i);
      }
    let end = -1;
    while (heap.size) {
      const i = heap.pop(), cost = heap.lastKey;
      if (cost > dist[i])
        continue;
      const x = i % m.W, y = Math.floor(i / m.W);
      const origin = source.cells[0];
      if ((x === 0 || y === 0 || x === m.W - 1 || y === m.H - 1) && Math.hypot(x - origin % m.W, y - Math.floor(origin / m.W)) > 40) {
        end = i;
        break;
      }
      for (const [dx, dy] of D4) {
        const xx = x + dx, yy = y + dy, j = yy * m.W + xx;
        if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || !wet[j])
          continue;
        const c = cost + 1 + 8 / (edgeDistance[j] ** 2 + .5);
        if (c < dist[j]) {
          dist[j] = c;
          prev[j] = i;
          heap.push(c, j);
        }
      }
    }
    if (end < 0)
      continue;
    const path: PathPoint[] = [];
    for (let i = end; i >= 0; i = prev[i])
      path.push({ x: i % m.W, y: Math.floor(i / m.W) });
    path.reverse();
    if (path.length > best.length)
      best = path;
  }
  if (best.length < 12)
    throw Error('No flowing river here');
  const path = resamplePath(best, 2, 180);
  // Remove the grid walk's one-tile sawtooth, keeping both existing ends.
  for (let pass = 0; pass < 3; pass++) {
    const copy = path.map(p => ({ ...p }));
    for (let k = 1; k < path.length - 1; k++) {
      path[k] = { x: (copy[k - 1].x + 2 * copy[k].x + copy[k + 1].x) / 4, y: (copy[k - 1].y + 2 * copy[k].y + copy[k + 1].y) / 4 };
    }
  }
  const widths = path.slice(3, -3).map(p => edgeDistance[at(m, p)] * 2 - 1).sort((a, b) => a - b);
  return { path, width: clamp(widths[Math.floor(widths.length * .4)] || 3, 2.5, 7) };
}
function nearest(path: readonly PathPoint[], p: PathPoint): {
  d: number;
  k: number;
} {
  let d = Infinity, k = 0;
  for (let j = 0; j < path.length; j++) {
    const v = path[j], n = (v.x - p.x) ** 2 + (v.y - p.y) ** 2;
    if (n < d) {
      d = n;
      k = j;
    }
  }
  return { d: Math.sqrt(d), k };
}
export function selected(m: ForceMap, s: Settings, i: Intent, r = river(m)): [
  number,
  number
] {
  const ps = i.path ?? (i.click ? [i.click] : []);
  if (!ps.length || ps.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x >= m.W || p.y >= m.H))
    throw Error('Draw on the river');
  // Every sampled part of the gesture must touch water. Never make a channel off-river.
  const touches = (p: PathPoint) => { for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (m.water.depth[at(m, { x: p.x + dx, y: p.y + dy })] > .015)
        return true; return false; };
  if (resamplePath(ps, 2, 512).some(p => !touches(p) || nearest(r.path, p).d > r.width * 1.7))
    throw Error('Not on a river · click or drag along flowing water');
  const indices = ps.map(p => nearest(r.path, p).k);
  let a = Math.min(...indices), b = Math.max(...indices);
  if (!i.path || pathLength(ps) < 3) {
    const reach = widthOf(s) / 2;
    a -= Math.round(reach / 2);
    b += Math.round(reach / 2);
  }
  return [clamp(a, 2, r.path.length - 4), clamp(b, 3, r.path.length - 3)];
}
export function validate(m: ForceMap, s: Settings, i: Intent): void {
  if (!Number.isFinite(s.power) || s.power < 0 || s.power > 100 || (s.size !== null && (!Number.isFinite(s.size) || s.size < 4 || s.size > 64)) || !['auto', 'tight', 'broad'].includes(s.bends) || floorProblem(s.floor, m.maxHeight) || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff)
    throw Error('Invalid Meander settings');
  if ((i.path?.length ?? 0) > 512)
    throw Error('River gesture is too long');
}
export function neckCandidates(m: ForceMap, course: PathPoint[], width: number): Oxbow[] {
  const ps = resamplePath(course, 1.35, 400);
  const stations: Station[] = ps.map((p, k) => { const a = ps[Math.max(0, k - 1)], b = ps[Math.min(ps.length - 1, k + 1)], l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { ...p, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l, width: width * .5, bed: m.heights[at(m, p)], bend: 0, lanes: [] }; });
  const candidates: Oxbow[] = [];
  for (let k = 26; k < stations.length - 4; k++) {
    const n = findNeck(stations.slice(0, k + 1), k);
    if (!n)
      continue;
    const levels = n.pool.map(p => m.heights[at(m, p)]);
    if (Math.max(...levels) - Math.min(...levels) <= 2 && Math.abs(m.heights[at(m, n.neck[0])] - m.heights[at(m, n.neck.at(-1)!)]) <= 1)
      candidates.push(n);
  }
  candidates.sort((a, b) => a.pool.length - b.pool.length);
  const unique: Oxbow[] = [];
  for (const cut of candidates) {
    const p = cut.pool[Math.floor(cut.pool.length / 2)];
    if (unique.every(v => nearest(v.pool, p).d > width * 1.3))
      unique.push(cut);
  }
  return unique;
}
export function neckOf(m: ForceMap, course: PathPoint[], width: number): Oxbow | null { return neckCandidates(m, course, width)[0] ?? null; }
export interface Stage {
  map: FullForceMap;
  course: PathPoint[];
  arrival: Float32Array;
}
export interface Operation {
  version: 1;
  verb: 'meander';
  settings: Settings;
  intent: Intent;
  tiles: number[];
  heights: number[];
  lava: number[];
  entities: FullForceMap['entities'];
  water: {
    depth: number[];
    contamination: number[];
  };
  retained: RetainedWater[];
}
export interface Plan {
  before: FullForceMap;
  map: FullForceMap;
  settings: Settings;
  stages: Stage[];
  arrival: Float32Array;
  course: PathPoint[];
  retained: RetainedWater[];
  operation: Operation;
  stats: {
    changed: number;
    eroded: number;
    deposited: number;
    balance: number;
    oxbows: number;
    held: number;
    startCarried: boolean;
    bends: string;
    riverWidth: number;
    bluffLimited: number;
  };
}
export function carryStart(m: FullForceMap, before: FullForceMap): boolean {
  const start = m.entities.find(e => e.template === 'StartingLocation');
  if (!start || !startProblem(m))
    return false;
  const old = before.entities.find(e => e.id === start.id)!;
  const candidates = Array.from({ length: m.W * m.H }, (_, i) => i).sort((a, b) => ((a % m.W - old.x) ** 2 + (Math.floor(a / m.W) - old.y) ** 2) - ((b % m.W - old.x) ** 2 + (Math.floor(b / m.W) - old.y) ** 2) || a - b);
  const occupied = new Set(m.entities.filter(e => e.id !== start.id && !isPlant(e)).flatMap(e => footprint(m, e)));
  for (const i of candidates) {
    const e = { ...start, x: i % m.W, y: Math.floor(i / m.W), z: m.heights[i] }, tiles = footprint(m, e, 1);
    if (tiles.length < 25 || tiles.some(j => m.heights[j] !== e.z || m.water.depth[j] > .05 || occupied.has(j)))
      continue;
    Object.assign(start, e);
    delete start.raw;
    return true;
  }
  throw Error('No level ground remains for the start');
}
/** Curvature-driven lateral migration with a downstream lag; existing relief bounds each step. */
export function* planMeander(input: ForceMap, settings: Settings, intent: Intent): Generator<void, Plan> {
  validate(input, settings, intent);
  const before = fullMap(input), s = { ...settings }, r = river(before), [lo, hi] = selected(before, s, intent, r);
  const floor = forceFloor(s, before.maxHeight), width = r.width, N = before.heights.length;
  const original = r.path.map(p => ({ ...p }));
  let course = original.map(p => ({ ...p }));
  const bends = s.bends === 'auto' ? (hash(s.seed, 91) > .45 ? 'broad' : 'tight') : s.bends;
  if (s.power === 0 || floor >= Math.max(...before.heights)) {
    const map = snapshotMap(before), arrival = new Float32Array(before.heights.length).fill(2), retained: RetainedWater[] = [];
    const stats = { changed: 0, eroded: 0, deposited: 0, balance: 0, oxbows: 0, held: 0, startCarried: false, bends, riverWidth: width, bluffLimited: 0 };
    const operation: Operation = { version: 1, verb: 'meander', settings: s, intent: structuredClone(intent), tiles: [], heights: [], lava: [], entities: structuredClone(map.entities), water: { depth: [...map.water.depth], contamination: [...map.water.contamination] }, retained };
    return { before, map, settings: s, stages: [{ map, course, arrival }], arrival, course, retained, operation, stats };
  }
  const scale = bends === 'broad' ? 9 : 6, bed = original.map(p => before.heights[at(before, p)]);
  const stages: Stage[] = [], arrival = new Float32Array(N).fill(2);
  let bluffLimited = 0;
  // Preserve a continuous thalweg. A migrated centreline can cross a cap's nearest-station
  // boundary, or outrun a limited sediment budget. Never leave a dry gap in that route.
  const keepCourse = (m: FullForceMap, path: PathPoint[], avoid: PathPoint[] = []) => {
    const channel = new Uint8Array(N), desired = m.heights.slice();
    let last = -1;
    const stamp = (i: number, z: number) => { channel[i] = 1; desired[i] = Math.min(desired[i], Math.max(Math.min(before.heights[i], floor), z)); };
    for (const p of resamplePath(path, .5, 1000)) {
      const k = nearest(original, p).k, z = bed[k], i = at(m, p);
      if (k < lo || k > hi) {
        last = i;
        continue;
      }
      if (last >= 0 && last % m.W !== i % m.W && Math.floor(last / m.W) !== Math.floor(i / m.W)) {
        const a = Math.floor(last / m.W) * m.W + i % m.W, b = Math.floor(i / m.W) * m.W + last % m.W;
        stamp(m.heights[a] <= m.heights[b] ? a : b, z);
      }
      stamp(i, z);
      last = i;
    }
    const cuts: number[] = [], deposits: {
      i: number;
      top: number;
    }[] = [];
    let amount = 0;
    for (let i = 0; i < N; i++)
      if (desired[i] < m.heights[i]) {
        cuts.push(i);
        amount += m.heights[i] - desired[i];
      }
    if (!amount)
      return;
    for (let i = 0; i < N; i++) {
      if (channel[i] || i % m.W < 3 || i % m.W > m.W - 4 || i < m.W * 3 || i >= N - m.W * 3)
        continue;
      if (avoid.length && nearest(avoid, { x: i % m.W, y: Math.floor(i / m.W) }).d < width + 3)
        continue;
      const n = nearest(original, { x: i % m.W, y: Math.floor(i / m.W) });
      if (n.k < lo || n.k > hi || n.d > 15)
        continue;
      const top = Math.min(m.maxHeight, bed[n.k] + Math.max(1, Math.ceil(before.water.depth[at(before, original[n.k])])) + 1);
      if (m.heights[i] < top)
        deposits.push({ i, top });
    }
    deposits.sort((a, b) => m.heights[a.i] - m.heights[b.i] || a.i - b.i);
    const capacity = deposits.reduce((n, v) => n + v.top - m.heights[v.i], 0);
    if (capacity < amount)
      throw Error(`Not enough movable sediment for a continuous river (${amount}/${capacity})`);
    for (const i of cuts)
      m.heights[i] = desired[i];
    for (let pass = 0; amount; pass++)
      for (const v of deposits)
        if (amount && m.heights[v.i] < v.top) {
          m.heights[v.i]++;
          amount--;
        }
  };
  const rounds = Math.round(s.power * .8), stepRounds = Math.max(1, Math.ceil(rounds / 8));
  const makeStage = (path: PathPoint[], previous: FullForceMap): Stage => {
    const m = snapshotMap(before), target = m.heights.slice(), active = resamplePath(path, .65, 600);
    const d = new Float32Array(N).fill(Infinity), index = new Int32Array(N);
    const oldD = new Float32Array(N).fill(Infinity), oldIndex = new Int32Array(N);
    const activeK = active.map(p => nearest(path, p).k);
    const stamp = (points: PathPoint[], out: Float32Array, idx: Int32Array) => points.forEach((p, k) => {
      const rad = 16;
      for (let y = Math.max(0, Math.floor(p.y - rad)); y <= Math.min(m.H - 1, Math.ceil(p.y + rad)); y++)
        for (let x = Math.max(0, Math.floor(p.x - rad)); x <= Math.min(m.W - 1, Math.ceil(p.x + rad)); x++) {
          const i = y * m.W + x, n = Math.hypot(x - p.x, y - p.y);
          if (n < out[i]) {
            out[i] = n;
            idx[i] = k;
          }
        }
    });
    stamp(active, d, index);
    stamp(original, oldD, oldIndex);
    const wantedRaise: number[] = [], cut: number[] = [], eligible: number[] = [];
    for (let i = 0; i < N; i++) {
      const k = oldIndex[i], t = (k - lo) / Math.max(1, hi - lo), fade = smooth(t * 5) * smooth((1 - t) * 5);
      if (k < lo || k > hi || oldD[i] > 16 || fade <= 0)
        continue;
      const h = before.heights[i], z = bed[k], flood = z + Math.max(1, Math.ceil(before.water.depth[at(before, original[k])]));
      // A bluff is not a bank. Leave its high ground in place and taper at its feet.
      if (h > flood + 4)
        continue;
      const radius = width * .5 * (1 + .12 * Math.sin(index[i] * .071));
      const channel = d[i] <= radius;
      if (channel)
        target[i] = Math.min(h, Math.max(Math.min(h, floor), bed[activeK[index[i]]]));
      else if (oldD[i] < radius + 1.2)
        target[i] = Math.max(h, Math.min(m.maxHeight, flood));
      else if (s.power > 30 && oldD[i] < Math.min(15, width + 4 + s.power * .07) && h > flood && hash(s.seed, i) < fade * s.power / 100)
        target[i] = Math.max(Math.min(h, floor), flood);
      if (target[i] < h)
        cut.push(i);
      // Inside bars first, then low floodplain tiles; never fill the active channel.
      if (!channel && h < flood && oldD[i] < 15) {
        eligible.push(i);
        if (target[i] > h)
          wantedRaise.push(i);
      }
    }
    holdAtFloor(before.heights, target, floor);
    // Sediment is a finite pool of whole blocks. Match deposits before committing erosion.
    wantedRaise.sort((a, b) => oldD[a] - oldD[b] || a - b);
    eligible.sort((a, b) => target[a] - target[b] || hash(s.seed, a) - hash(s.seed, b) || a - b);
    let erosion = cut.reduce((n, i) => n + before.heights[i] - target[i], 0), remaining = erosion;
    for (const i of wantedRaise) {
      const z = Math.min(target[i], before.heights[i] + remaining);
      m.heights[i] = z;
      remaining -= z - before.heights[i];
    }
    for (let pass = 0; pass < 4 && remaining > 0; pass++)
      for (const i of eligible) {
        const z = bed[oldIndex[i]] + Math.max(1, Math.ceil(before.water.depth[at(before, original[oldIndex[i]])]));
        if (m.heights[i] >= z || remaining <= 0)
          continue;
        m.heights[i]++;
        remaining--;
      }
    let usable = erosion - remaining;
    cut.sort((a, b) => d[a] - d[b] || a - b);
    for (const i of cut) {
      const amount = Math.min(before.heights[i] - target[i], usable);
      m.heights[i] = before.heights[i] - amount;
      usable -= amount;
    }
    keepCourse(m, path);
    trimRock(m);
    m.entities = m.entities.filter(e => {
      const tiles = footprint(m, e), i = e.y * m.W + e.x;
      if (!/Source|Seep/.test(e.template) && e.template !== 'StartingLocation' && tiles.some(j => m.heights[j] < before.heights[j]))
        return false;
      const dz = m.heights[i] - before.heights[i];
      if (dz) {
        e.z += dz;
        delete e.raw;
      }
      return true;
    });
    carryStart(m, before);
    const reached = new Float32Array(N).fill(2);
    // One coherent age increment: every cut and its paired deposits arrive together.
    // This keeps every shown map's whole-block balance exactly zero too.
    for (let i = 0; i < N; i++)
      if (m.heights[i] !== previous.heights[i])
        reached[i] = .08;
    return { map: m, course: path.map(p => ({ ...p })), arrival: reached };
  };
  const migrateWater = (m: FullForceMap, path: PathPoint[]) => {
    const depth = before.water.depth.slice(), mass = Float64Array.from(depth, (d, i) => d * before.water.contamination[i]);
    const moves: {
      i: number;
      j: number;
      d: number;
      c: number;
    }[] = [];
    for (let i = 0; i < N; i++)
      if (depth[i] > .015) {
        const p = { x: i % m.W, y: Math.floor(i / m.W) }, n = nearest(original, p);
        if (n.k < lo || n.k > hi || n.d > width * 1.4)
          continue;
        const q = path[n.k], o = original[n.k], j = at(m, { x: p.x + q.x - o.x, y: p.y + q.y - o.y });
        moves.push({ i, j, d: depth[i], c: mass[i] });
      }
    for (const v of moves) {
      depth[v.i] -= v.d;
      mass[v.i] -= v.c;
    }
    for (const v of moves) {
      depth[v.j] += v.d;
      mass[v.j] += v.c;
    }
    m.water = { depth, contamination: Float64Array.from(depth, (d, i) => d > 0 ? clamp(mass[i] / d, 0, 1) : 0) };
  };
  for (let round = 0; round < rounds; round++) {
    const next = course.map(p => ({ ...p }));
    for (let k = lo; k <= hi; k++) {
      if (bed[k] < floor)
        continue;
      const p = course[k], a = course[Math.max(0, k - scale)], b = course[Math.min(course.length - 1, k + scale)], prev = course[Math.max(0, k - 2)];
      const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1, nx = -ty / len, ny = tx / len;
      const fade = smooth((k - lo) / 5) * smooth((hi - k) / 5);
      const curvature = (p.x - (a.x + b.x) / 2) * nx + (p.y - (a.y + b.y) / 2) * ny;
      const phase = k / (scale * 1.5) + hash(s.seed, 31) * 6;
      const initiation = Math.sin(phase + .33 * Math.sin(phase * .47)) * .13 * (1 - round / Math.max(1, rounds));
      const motion = clamp(curvature * .18 + initiation, -.75, .75) * fade;
      const q = { x: p.x + nx * motion + (p.x - prev.x) * .028 * fade, y: p.y + ny * motion + (p.y - prev.y) * .028 * fade };
      const origin = original[k], maxSwing = 3 + s.power * .2;
      if (q.x < 2 || q.y < 2 || q.x > magnitude(input.W) || q.y > magnitude(input.H) || Math.hypot(q.x - origin.x, q.y - origin.y) > maxSwing || before.heights[at(before, q)] > bed[k] + 5) {
        bluffLimited++;
        continue;
      }
      next[k] = q;
    }
    course = next;
    if (round % stepRounds === stepRounds - 1 || round === rounds - 1) {
      const stage = makeStage(course, stages.at(-1)?.map ?? before);
      migrateWater(stage.map, course);
      stages.push(stage);
      yield;
    }
  }
  if (!stages.length)
    stages.push(makeStage(course, before));
  const retained: RetainedWater[] = [];
  // Reuse Carve's real-neck detector and two mouth bars. This seals an existing evolved bend,
  // rather than placing a decorative lake. All earth remains in the same sediment ledger.
  if (s.power >= 85) {
    const previous = stages.at(-1)!;
    for (const cut of neckCandidates(previous.map, course, width).slice(0, 8)) {
      const m = snapshotMap(previous.map), target = m.heights.slice(), a = nearest(course, cut.neck[0]).k, b = nearest(course, cut.neck.at(-1)!).k;
      const next = [...course.slice(0, a), ...cut.neck, ...course.slice(b + 1)];
      const head = m.heights[at(m, cut.neck[0])], tail = m.heights[at(m, cut.neck.at(-1)!)];
      const poolFloor = Math.max(floor, Math.min(...cut.pool.map(p => m.heights[at(m, p)])));
      const poolRim = Math.min(m.maxHeight, poolFloor + 2);
      for (let i = 0; i < N; i++) {
        const p = { x: i % m.W, y: Math.floor(i / m.W) }, n = nearest(cut.neck, p);
        const lake = nearest(cut.pool, p);
        // The abandoned river's own bed remains; its inside bars close low side connections.
        if (lake.d < width * .55 && target[i] < poolRim)
          target[i] = Math.min(target[i], poolFloor);
        else if (lake.d < width * .55 + 2.2 && n.d > width * .5 + 2)
          target[i] = Math.max(target[i], poolRim);
        if (n.d < width * .5 + .4) {
          const z = Math.round(head + (Math.min(head, tail) - head) * n.k / Math.max(1, cut.neck.length - 1));
          target[i] = Math.min(target[i], Math.max(floor, z));
        }
        for (const bar of cut.bars) {
          const dx = p.x - bar.x, dy = p.y - bar.y, along = dx * bar.dx + dy * bar.dy, side = -dx * bar.dy + dy * bar.dx;
          const level = Math.ceil(previous.map.heights[at(m, bar)] + previous.map.water.depth[at(m, bar)] + .8);
          if (Math.abs(along) < 2.2 && Math.abs(side) < bar.width + 2 && n.d > width * .5 + 1)
            target[i] = Math.max(target[i], Math.min(m.maxHeight, level));
        }
        const old = nearest(original, p);
        if (old.k < lo || old.k > hi)
          target[i] = previous.map.heights[i];
      }
      holdAtFloor(previous.map.heights, target, floor);
      let need = 0, available = 0;
      for (let i = 0; i < N; i++) {
        const delta = target[i] - m.heights[i];
        delta > 0 ? need += delta : available -= delta;
      }
      // Cut banks next to this bend supply any bar deficit; a limit reduces the plugs, never adds earth.
      const banks = Array.from({ length: N }, (_, i) => i).filter(i => {
        const p = { x: i % m.W, y: Math.floor(i / m.W) }, n = nearest(cut.pool, p);
        const old = nearest(original, p);
        return old.k >= lo && old.k <= hi && n.d > width * .7 && n.d < width + 6 && nearest(next, p).d > width * .6 && target[i] > floor + 1 && target[i] < tail + 6;
      }).sort((a, b) => hash(s.seed, a) - hash(s.seed, b) || a - b);
      for (let pass = 0; pass < 4 && available < need; pass++)
        for (const i of banks)
          if (available < need && target[i] > Math.max(floor, tail + 1)) {
            target[i]--;
            available++;
          }
      if (available >= need) {
        let excess = available - need;
        const deposits = Array.from({ length: N }, (_, i) => i).filter(i => {
          const p = { x: i % m.W, y: Math.floor(i / m.W) };
          const old = nearest(original, p);
          return old.k >= lo && old.k <= hi && nearest(next, p).d > width && nearest(cut.pool, p).d > width && nearest(cut.pool, p).d < 15 && target[i] < Math.min(m.maxHeight, tail + 4);
        }).sort((a, b) => target[a] - target[b] || a - b);
        for (let pass = 0; pass < 8 && excess; pass++)
          for (const i of deposits)
            if (excess && target[i] < Math.min(m.maxHeight, tail + 4)) {
              target[i]++;
              excess--;
            }
        if (!excess) {
          m.heights = target;
          keepCourse(m, next, cut.pool);
          trimRock(m);
          const model = modelOf(m), spill = spillLevels(model), pool: number[] = [];
          // Verify the component below the new sill cannot reach the active river or a source.
          const basin: number[] = [], seen = new Set<number>(), root = at(m, cut.pool[Math.floor(cut.pool.length / 2)]);
          if (m.heights[root] < poolRim) {
            basin.push(root);
            seen.add(root);
          }
          for (let k = 0; k < basin.length; k++) {
            const i = basin[k], x = i % m.W, y = Math.floor(i / m.W);
            for (const [dx, dy] of D4) {
              const xx = x + dx, yy = y + dy, j = yy * m.W + xx;
              if (xx < 0 || yy < 0 || xx >= m.W || yy >= m.H || seen.has(j) || m.heights[j] >= poolRim)
                continue;
              seen.add(j);
              basin.push(j);
            }
          }
          const sourceTiles = model.emitters.filter(e => e.strength > 0).flatMap(e => e.cells);
          const isClosed = !cut.neck.some(p => seen.has(at(m, p))) && !sourceTiles.some(i => seen.has(i)) && !basin.some(i => i % m.W === 0 || i % m.W === m.W - 1 || i < m.W || i >= N - m.W);
          if (isClosed)
            for (const i of basin)
              if (spill[i] > m.heights[i] && previous.map.water.depth[i] > 0)
                pool.push(i);
          if (pool.length > 3) {
            retained.push({ tiles: pool, floor: pool.map(i => m.heights[i]), depth: pool.map(i => previous.map.water.depth[i]), contamination: pool.map(i => previous.map.water.contamination[i]) });
            m.entities = m.entities.filter(e => e.template === 'StartingLocation' || /Source|Seep/.test(e.template) || !footprint(m, e).some(i => m.heights[i] < previous.map.heights[i]));
            for (const e of m.entities) {
              const i = e.y * m.W + e.x, dz = m.heights[i] - previous.map.heights[i];
              if (dz) {
                e.z += dz;
                delete e.raw;
              }
            }
            carryStart(m, before);
            const reached = new Float32Array(N).fill(2);
            for (let i = 0; i < N; i++)
              if (m.heights[i] !== previous.map.heights[i])
                reached[i] = .12;
            stages.push({ map: m, course: next, arrival: reached });
            course = next;
            yield;
            break;
          }
        }
      }
    }
  }
  const map = stages.at(-1)!.map;
  if (stages.every(st => st.map.heights.every((h, i) => h === before.heights[i])))
    map.water = structuredClone(before.water);
  let eroded = 0, deposited = 0;
  const tiles: number[] = [], heights: number[] = [];
  for (let i = 0; i < N; i++) {
    const delta = map.heights[i] - before.heights[i];
    if (delta) {
      tiles.push(i);
      heights.push(map.heights[i]);
      delta > 0 ? deposited += delta : eroded -= delta;
    }
    const k = stages.findIndex(st => st.arrival[i] < 1);
    if (k >= 0)
      arrival[i] = (k + .08) / stages.length;
  }
  const stats = { changed: tiles.length, eroded, deposited, balance: deposited - eroded, oxbows: retained.length, held: 0, startCarried: !!map.entities.find(e => e.template === 'StartingLocation' && before.entities.some(o => o.id === e.id && (o.x !== e.x || o.y !== e.y))), bends, riverWidth: width, bluffLimited };
  const operation: Operation = { version: 1, verb: 'meander', settings: s, intent: structuredClone(intent), tiles, heights, lava: tiles.map(i => map.lava[i]), entities: structuredClone(map.entities), water: { depth: [...map.water.depth], contamination: [...map.water.contamination] }, retained };
  return { before, map, settings: s, stages, arrival, course, retained, operation, stats };
}
const magnitude = (n: number) => n - 3;
export function plan(m: ForceMap, s: Settings, i: Intent): Plan { const g = planMeander(m, s, i); for (;;) {
  const r = g.next();
  if (r.done)
    return r.value;
} }
export function replay(before: ForceMap, op: Operation): FullForceMap { const m = fullMap(before); op.tiles.forEach((i, k) => { m.heights[i] = op.heights[k]; m.lava[i] = op.lava[k]; }); m.entities = structuredClone(op.entities); m.water = { depth: Float64Array.from(op.water.depth), contamination: Float64Array.from(op.water.contamination) }; return m; }
export function reveal(p: Plan, progress: number): FullForceMap {
  if (progress >= 1)
    return snapshotMap(p.map);
  const n = progress * p.stages.length, k = Math.min(p.stages.length - 1, Math.floor(n)), f = n - k;
  const prev = k ? p.stages[k - 1].map : p.before, stage = p.stages[k], out = snapshotMap(prev);
  for (let i = 0; i < out.heights.length; i++)
    if (stage.arrival[i] <= f) {
      out.heights[i] = stage.map.heights[i];
      out.lava[i] = stage.map.lava[i];
    }
  const final = new Map(stage.map.entities.map(e => [e.id, e]));
  out.entities = prev.entities.flatMap(e => footprint(prev, e).some(i => stage.arrival[i] <= f) ? (final.has(e.id) ? [structuredClone(final.get(e.id)!)] : []) : [e]);
  out.water = structuredClone(p.before.water);
  return out;
}
export function waterSim(m: FullForceMap): WaterSim { return new WaterSim(modelOf(m), m.water); }
export function waterJob(m: FullForceMap, retained: RetainedWater[] = []): {
  sim: WaterSim;
  run: SettleRun;
} { const model = { ...modelOf(m), retained }, sim = new WaterSim(model, m.water); return { sim, run: new SettleRun(sim, { checkEvery: 64, maxDays: 4, movedShare: .0005, tol: .05, sealed: sealedTiles(model), untilSteady: true }) }; }
export function settle(m: FullForceMap, retained: RetainedWater[] = []): {
  ticks: number;
  settled: boolean;
  steadyTicks?: number;
} { const previous = snapshotMap(m), j = waterJob(m, retained); let result; do {
  result = j.run.advance(64);
} while (!result); m.water = { depth: j.sim.D.slice(), contamination: j.sim.C.slice() }; carryStart(m, previous); return result; }
