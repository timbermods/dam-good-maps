// Erode: a connected shelter worn from the cliff's foot. The opening shares one floor,
// follows the gesture, and leaves broad remnants only where the roof needs support.
// GAME_RULES.md §5 records five air levels for StartingLocation; §2 limits support to three
// sideways tiles. The original 24 buckets and effects contract remain; the land finishes fast.
import { clamp, hash, noise3 } from "./random";
import { support } from "./support";
import { LAYERS, Terrain } from "./terrain";
import { planWash, type WashDetails, type WashTrace } from "./wash";

export interface ErodeSettings {
  /** How deep the rock wears, 0–100. */
  power: number;
  /** How big the openings are, 0–100; null follows Power (Auto, D226). */
  size: number | null;
  /** The personality (Try another). */
  seed: number;
  /** null/missing details are nature's pick; numeric values are pinned (D309). */
  details?: Partial<{ [K in keyof WashDetails]: number | null }>;
}

export const DEFAULTS: ErodeSettings = { power: 55, size: null, seed: 1 };

/** The size Auto gives at a power. */
export const autoSize = (power: number) => Math.round(clamp(25 + 0.6 * power, 0, 100));

/** A click (one point) or a painted sweep, in tile coordinates, with the level of the rock each
 *  point touched (the wear gathers round the height the player touched the land at). */
export interface Gesture {
  points: { x: number; y: number; z?: number }[];
}

export interface ErodeInput {
  terrain: Terrain;
  /** Hardness of each level (1 hard, 0 soft). */
  rock: number[];
  /** Tiles never worn (a water source's own ground). */
  keep?: Uint8Array;
  water?: Float32Array;
}

export interface ErodePlan {
  /** The land after the wear. */
  final: Terrain;
  /** Worn voxels (z·N + tile), in the order they go. */
  removed: Int32Array;
  /** The bucket each goes in. */
  bucket: Uint8Array;
  buckets: number;
  /** Seconds the wear plays over. */
  duration: number;
  /** Voxels worn, voxels kept to hold a roof (pillars and corbels), voxels that fell because nothing
   *  could hold them. */
  worn: number;
  held: number;
  fell: number;
  /** Where it acted (after finding the rock), and the tiles it touched. */
  focus: { x: number; y: number; z: number } | null;
  box: { x0: number; y0: number; x1: number; y1: number };
  /** Milliseconds to the final land. */
  ms: number;
  /** Set when it did nothing, and why (a word by the pointer). */
  reason?: string;
  details?: WashDetails;
  wash?: WashTrace;
}

export const BUCKETS = 24;
export const HEADROOM = 5;
const STEPS = 48;

export function params(set: ErodeSettings, click: boolean) {
  const P = clamp(set.power, 0, 100) / 100;
  const s = clamp(set.size ?? autoSize(set.power), 0, 100) / 100;
  return { P, s, radius: (click ? 2.5 : 1.5) + 5 * s, depth: 1.2 + 8.8 * P };
}

type Pt = { x: number; y: number; z?: number };

/** Distance from a point to a polyline. */
function toStroke(pts: Pt[], x: number, y: number): number {
  return nearest(pts, x, y).d;
}

/** The nearest point of a polyline: its distance, and the level touched there (interpolated). */
function nearest(pts: Pt[], x: number, y: number): { d: number; z: number | undefined } {
  if (pts.length === 1) return { d: Math.hypot(x - pts[0].x, y - pts[0].y), z: pts[0].z };
  let best = Infinity, bz: number | undefined;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L ? clamp(((x - a.x) * dx + (y - a.y) * dy) / L, 0, 1) : 0;
    const d = Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
    if (d < best) {
      best = d;
      bz = a.z === undefined || b.z === undefined ? (a.z ?? b.z) : a.z + (b.z - a.z) * t;
    }
  }
  return { d: best, z: bz };
}

/** Plan the cavity as a continuous volume, then retain only the rock that holds its roof. */
export function planErode(input: ErodeInput, gesture: Gesture, set: ErodeSettings): ErodePlan {
  const t0 = performance.now();
  const { terrain: before, keep, rock } = input;
  const t = before.clone();
  const { W, H, N } = t;
  const pts = gesture.points.map(q => ({ x: clamp(q.x, 0, W - 0.01), y: clamp(q.y, 0, H - 0.01), z: q.z }));
  const p = params(set, pts.length === 1);
  const none = (): ErodePlan => ({ final: t, removed: new Int32Array(), bucket: new Uint8Array(),
    buckets: BUCKETS, duration: 0, worn: 0, held: 0, fell: 0, focus: null,
    box: { x0: 0, y0: 0, x1: -1, y1: -1 }, ms: performance.now() - t0, reason: "No rock to wear here" });
  if (!pts.length) return none();
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const allowed = (i: number) => {
    const x = i % W, y = Math.floor(i / W);
    return x >= 2 && y >= 2 && x < W - 2 && y < H - 2 && !keep?.[i];
  };
  const reach = 12 + p.radius + p.depth;
  const bx0 = Math.max(0, Math.floor(Math.min(...pts.map(q => q.x)) - reach));
  const bx1 = Math.min(W - 1, Math.ceil(Math.max(...pts.map(q => q.x)) + reach));
  const by0 = Math.max(0, Math.floor(Math.min(...pts.map(q => q.y)) - reach));
  const by1 = Math.min(H - 1, Math.ceil(Math.max(...pts.map(q => q.y)) + reach));
  const regionTiles: number[] = [];
  for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) regionTiles.push(y * W + x);

  // Resolve a real outside walking level, not the height on the face that the pointer hit.
  // Existing cave mouths are included. One gesture has one floor; no interior ledges or steps.
  type Face = { i: number; x: number; y: number; nx: number; ny: number; floor: number; score: number };
  const faces: Face[] = [];
  for (const i of regionTiles) {
    if (!allowed(i)) continue;
    const x = i % W, y = Math.floor(i / W), top = before.surface(i);
    const nr = nearest(pts, x + 0.5, y + 0.5);
    if (nr.d > Math.max(12, p.radius)) continue;
    for (const [dx, dy] of dirs) {
      const j = (y + dy) * W + x + dx;
      for (let floor = 1; floor < top; floor++) {
        if (!before.at(j, floor - 1) || before.at(j, floor) || !before.at(i, floor)) continue;
        const drop = top - floor;
        faces.push({ i, x: x + 0.5, y: y + 0.5, nx: -dx, ny: -dy, floor,
          score: nr.d + 0.12 * Math.abs((nr.z ?? floor) - floor) - 0.3 * Math.min(8, drop) });
      }
    }
  }
  faces.sort((a, b) => a.score - b.score);
  const face = faces[0];
  // A flat stroke wears a wash instead of searching far away for a cliff to hollow.
  if (!face || (toStroke(pts, face.x, face.y) > 2.5 && pts.every(q => {
    const i = Math.floor(q.y) * W + Math.floor(q.x);
    return q.z === undefined || q.z >= before.surface(i) - 1;
  }))) return planWash(input, gesture, set);
  const floor = face.floor;
  // In a thin fin, supports belong at the ends of the opening. Reserve an actual building
  // footprint when the original ground can carry it; never raise the floor or invent a roof.
  const room = new Set<number>();
  const thin = before.surface(face.i) >= floor + HEADROOM + 2 && [1, 2, 3, 4].some(d =>
    !before.solid(Math.floor(face.x) + face.nx * d, Math.floor(face.y) + face.ny * d, floor + HEADROOM));
  if (thin && p.P >= 0.45 && p.s >= 0.25) {
    let best: { tiles: number[]; score: number } | undefined;
    for (const i of regionTiles) {
      const x = i % W, y = Math.floor(i / W), distance = toStroke(pts, x + 1.5, y + 1.5);
      if (x + 2 >= W || y + 2 >= H || distance > p.radius) continue;
      const tiles = Array.from({ length: 9 }, (_, k) => i + k % 3 + Math.floor(k / 3) * W);
      if (tiles.some(j => !allowed(j) || before.run0Top(j) < floor)) continue;
      const roofed = tiles.filter(j => before.surface(j) >= floor + HEADROOM + 2).length;
      if (roofed < 3 || !tiles.some(j => before.surface(j) === floor)) continue;
      const score = roofed - distance * 2;
      if (!best || score > best.score) best = { tiles, score };
    }
    if (best) for (const i of best.tiles) room.add(i);
  }
  const focus = { x: face.x, y: face.y, z: floor };
  const samples: Pt[] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
    for (let j = 1; j <= n; j++) samples.push({ x: a.x + (b.x - a.x) * j / n, y: a.y + (b.y - a.y) * j / n });
  }
  const sameFloor = faces.filter(f => f.floor === floor);
  const mouths = samples.map(q => sameFloor.reduce((a, b) =>
    Math.hypot(b.x - q.x, b.y - q.y) < Math.hypot(a.x - q.x, a.y - q.y) ? b : a, face));
  const strength = new Float32Array(N);
  const depth = new Float32Array(N).fill(Infinity);
  const ceiling = new Uint8Array(N);
  const step = new Map<number, number>();
  const remove = (i: number, z: number, d: number) => {
    if (!t.at(i, z)) return;
    t.set(i, z, false);
    step.set(z * N + i, clamp(Math.floor(d / (p.depth + 1) * (STEPS - 1)), 0, STEPS - 1));
  };
  // Overlapping, oriented lobes join into one sweeping curve. Low-frequency grain varies the
  // whole wall, never each voxel separately; Power changes depth even with a fixed Size.
  for (const i of regionTiles) {
    if (!allowed(i) || before.run0Top(i) < floor) continue;
    const x = i % W + 0.5, y = Math.floor(i / W) + 0.5;
    const grain = 0.93 + 0.14 * noise3(set.seed, x, y, floor, 7);
    for (const m of mouths) {
      const dx = x - m.x, dy = y - m.y;
      const inward = dx * m.nx + dy * m.ny;
      const along = dx * m.ny - dy * m.nx;
      if (inward < -1.5) continue;
      const shape = (Math.max(0, inward) / (p.depth * grain)) ** 2 + (along / p.radius) ** 2;
      if (shape >= 1) continue;
      strength[i] = Math.max(strength[i], Math.sqrt(1 - shape));
      depth[i] = Math.min(depth[i], Math.max(0, inward));
    }
    if (!strength[i]) continue;
    const top = before.surface(i);
    // Keep a cap when there is building clearance; a low lip wears down to the outside floor.
    // Taller openings curve up toward their middle. Hard beds choose the nearby ceiling only,
    // and can no longer leave stripes of rock across the opening.
    let roof = floor + HEADROOM + Math.round(2 * p.s * strength[i]);
    if (rock[roof + 1] > 0.5 && strength[i] > 0.55) roof++;
    roof = Math.min(roof, top - 2);
    ceiling[i] = top >= floor + 5 ? roof : top;
  }
  // Flood from walk-in entrances, so an ellipse cannot excavate a disconnected pocket.
  const connected = new Uint8Array(N), queue: number[] = [];
  for (const i of regionTiles) {
    if (!strength[i]) continue;
    const x = i % W, y = Math.floor(i / W);
    if (dirs.some(([dx, dy]) => {
      const j = (y + dy) * W + x + dx;
      return before.at(j, floor - 1) && !before.at(j, floor);
    })) { connected[i] = 1; queue.push(i); }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k], x = i % W, y = Math.floor(i / W);
    for (const [dx, dy] of dirs) {
      const j = (y + dy) * W + x + dx;
      if (strength[j] && !connected[j]) { connected[j] = 1; queue.push(j); }
    }
    for (let z = floor; z < ceiling[i]; z++) remove(i, z, depth[i]);
  }
  if (!step.size) return none();
  for (const i of room) {
    if (!connected[i]) { connected[i] = 1; queue.push(i); }
    ceiling[i] = Math.max(ceiling[i], floor + HEADROOM);
    for (let z = floor; z < floor + HEADROOM; z++) remove(i, z, depth[i]);
  }

  // Keep broad, irregular remnants of the original rock only when a roof actually needs them.
  // Choose one at a time by the roof it holds and the coherent rock grain; no spacing grid,
  // single-voxel pins, or hanging corbels. A three-tile cantilever needs no columns at all.
  const nonPlain = () => regionTiles.filter(i => !t.plain(i));
  const columns: number[][] = [];
  let fell = 0;
  for (let round = 0; round < regionTiles.length; round++) {
    const sup = support(t, nonPlain());
    if (!sup.unsupported.length) break;
    const zs = Math.min(...sup.unsupported.map(v => Math.floor(v / N)));
    const loose = new Set(sup.unsupported.filter(v => Math.floor(v / N) === zs).map(v => v % N));
    let best: { tiles: number[]; score: number } | undefined;
    for (const i of regionTiles) {
      if (!connected[i] || (depth[i] < 1 && !room.size) || !t.at(i, zs) || t.at(i, zs - 1)) continue;
      const x = i % W, y = Math.floor(i / W);
      const grain = noise3(set.seed ^ 0x77, x, y, floor, 3.7);
      const sx = hash(set.seed, i) < 0.5 ? -1 : 1, sy = hash(set.seed + 1, i) < 0.5 ? -1 : 1;
      const fits = (j: number) => allowed(j) && !room.has(j) && before.run0Top(j) > zs;
      const tiles = [[sx, sy], [-sx, sy], [sx, -sy], [-sx, -sy]].map(([a, b]) =>
        [i, i + a, i + b * W, i + a + b * W]).find(c => c.every(fits));
      if (!tiles) continue;
      if (grain > 0.45) for (const j of [i - sx, i - sy * W]) if (fits(j) && !tiles.includes(j)) tiles.push(j);
      const seen = new Map<number, number>(), q: number[] = [];
      for (const j of tiles) { seen.set(j, 0); q.push(j); }
      let gain = 0;
      for (let h = 0; h < q.length; h++) {
        const j = q[h], d = seen.get(j)!;
        if (loose.has(j)) gain++;
        if (d === 3) continue;
        const jx = j % W, jy = Math.floor(j / W);
        for (const [dx, dy] of dirs) {
          const n = (jy + dy) * W + jx + dx;
          if (!seen.has(n) && t.solid(jx + dx, jy + dy, zs)) { seen.set(n, d + 1); q.push(n); }
        }
      }
      if (!gain) continue;
      // Stagger remnants across the depth of the shelter as well as along its length.
      const aligned = columns.some(c => Math.abs(depth[c[0]] - depth[i]) < 1.5);
      const score = gain / (2 + tiles.length) * (0.7 + grain) * (aligned ? 0.65 : 1);
      if (!best || score > best.score) best = { tiles, score };
    }
    if (!best) {
      // A thin low lip may have no room for a broad leg. Trim only that layer, then solve
      // the roof above it afresh; dropping the whole unsupported stack would erase arches.
      for (const i of loose) { remove(i, zs, p.depth); fell++; }
      continue;
    }
    columns.push(best.tiles);
    for (const i of best.tiles) for (let z = floor; z <= zs; z++) {
      if (before.at(i, z)) { t.set(i, z, true); step.delete(z * N + i); }
    }
  }
  // If an existing cave leaves no original rock for a broad column, trim its unsupported edge.
  for (;;) {
    const sup = support(t, nonPlain());
    if (!sup.unsupported.length) break;
    for (const v of sup.unsupported) {
      const z = Math.floor(v / N), i = v % N;
      remove(i, z, p.depth);
      fell++;
    }
  }
  // Remove redundant columns as whole clusters, never individual blocks from their feet.
  for (let k = columns.length - 1; k >= 0; k--) {
    const saved = columns[k].map(i => [i, t.cols[i]]);
    for (const [i] of saved) for (let z = floor; z < ceiling[i]; z++) t.set(i, z, false);
    if (support(t, nonPlain()).unsupported.length) {
      for (const [i, mask] of saved) t.cols[i] = mask;
    } else {
      for (const [i, mask] of saved) for (let z = floor; z < ceiling[i]; z++)
        if ((mask >>> z) & 1) step.set(z * N + i, STEPS - 1);
    }
  }
  // The surviving remnants broaden into the floor and roof along their harder grain, instead
  // of reading as identical square posts. Every shoulder is beside a full-height held core.
  for (const column of columns) {
    if (!column.some(i => t.at(i, floor + 1))) continue;
    const core = new Set(column);
    for (const i of column) {
      if (!t.at(i, floor + 1)) continue;
      const x = i % W, y = Math.floor(i / W);
      for (const [dx, dy] of dirs) {
        const j = (y + dy) * W + x + dx;
        if (core.has(j) || !connected[j] || !allowed(j)) continue;
        const grain = noise3(set.seed ^ 0xc0, x + dx, y + dy, 0, 1.9);
        const levels = grain > 0.48 ? [floor, ceiling[j] - 1] : [ceiling[j] - 1];
        for (const z of levels) if (z >= floor && !(room.has(j) && z < floor + HEADROOM) && before.at(j, z) && t.at(i, z)) {
          t.set(j, z, true); step.delete(z * N + j);
        }
      }
    }
  }
  // Sweep away small free-standing remnants on the new floor and at the mouth. Flood above
  // the floor so a ground connection cannot disguise a stub; walls and roof legs join much
  // larger components. Check support before removing a remnant from an existing cave.
  const touched = new Set(queue.flatMap(i => [i, i - 1, i + 1, i - W, i + W]));
  const seen = new Set<number>();
  for (const i of touched) for (let z = floor; z < Math.min(LAYERS, floor + HEADROOM); z++) {
    const start = z * N + i;
    if (i < 0 || i >= N || !allowed(i) || !t.at(i, z) || seen.has(start)) continue;
    const q = [start];
    const component = new Set(q);
    seen.add(start);
    let attached = false;
    for (let k = 0; k < q.length && q.length <= 12; k++) {
      const v = q[k], vz = Math.floor(v / N), j = v % N, x = j % W, y = Math.floor(j / W);
      if (vz >= floor + HEADROOM || !allowed(j)) { attached = true; break; }
      const ns = [x > 0 ? v - 1 : -1, x < W - 1 ? v + 1 : -1,
        y > 0 ? v - W : -1, y < H - 1 ? v + W : -1, vz > floor ? v - N : -1, v + N];
      for (const n of ns) {
        if (n < 0 || n >= N * LAYERS || !t.at(n % N, Math.floor(n / N))) continue;
        if (seen.has(n)) { if (!component.has(n)) attached = true; continue; }
        seen.add(n); component.add(n); q.push(n);
      }
    }
    if (attached || q.length > 12) continue;
    for (const v of q) t.set(v % N, Math.floor(v / N), false);
    if (support(t).unsupported.length) {
      for (const v of q) t.set(v % N, Math.floor(v / N), true);
    } else for (const v of q) step.set(v, STEPS - 1);
  }
  let held = 0;
  for (const i of queue) for (let z = floor; z < ceiling[i]; z++) if (t.at(i, z)) held++;

  // 5. the order it's shown in: by the step each voxel wore, in buckets; a voxel that would hang
  // loose at the end of a bucket goes in that bucket
  const order = [...step.keys()].sort((a, b) => (step.get(a) as number) - (step.get(b) as number) || hash(set.seed ^ 0x3c, a) - hash(set.seed ^ 0x3c, b));
  // an even pace: the rock goes at a steady rate in the order it wore (the face first, then deeper)
  const bucketOf = new Map<number, number>();
  order.forEach((v, k) => bucketOf.set(v, Math.min(BUCKETS - 1, Math.floor(((k + 0.5) / order.length) * BUCKETS))));
  const show = before.clone();
  const pending = new Set(order);
  for (let b = 0; b < BUCKETS; b++) {
    for (const v of order) {
      if (bucketOf.get(v) !== b) continue;
      const z = Math.floor(v / N);
      show.set(v - z * N, z, false);
      pending.delete(v);
    }
    for (;;) {
      const sup = support(show, regionTiles.filter((i) => !show.plain(i)));
      if (!sup.unsupported.length) break;
      for (const v of sup.unsupported) {
        if (!pending.has(v)) throw new Error("a voxel of the final land hangs loose while it is shown");
        bucketOf.set(v, b);
        pending.delete(v);
        const z = Math.floor(v / N);
        show.set(v - z * N, z, false);
      }
    }
  }
  order.sort((a, b) => (bucketOf.get(a) as number) - (bucketOf.get(b) as number));
  const removed = Int32Array.from(order);
  const bucket = Uint8Array.from(order, (v) => bucketOf.get(v) as number);
  return {
    final: t,
    removed,
    bucket,
    buckets: BUCKETS,
    duration: 0.65,
    worn: removed.length,
    held,
    fell,
    focus,
    box: { x0: bx0, y0: by0, x1: bx1, y1: by1 },
    ms: performance.now() - t0,
  };
}

/** The land at the end of bucket `b` (all buckets up to and including it gone). */
export function landAt(before: Terrain, plan: ErodePlan, b: number): Terrain {
  const out = before.clone();
  const N = before.N;
  for (let k = 0; k < plan.removed.length && plan.bucket[k] <= b; k++) {
    const v = plan.removed[k];
    const z = Math.floor(v / N);
    out.set(v - z * N, z, false);
  }
  return out;
}
