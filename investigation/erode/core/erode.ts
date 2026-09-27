// Erode: wind and water wearing rock (Kyler's brief, 2026-09-27). The player sweeps it along a cliff
// or across a ridge, or clicks; the land decides what forms:
// - at the foot of a cliff, sand-laden wind and splash wear hardest near the ground, so a cave or an
//   alcove hollows into the rock;
// - where a hard bed caps softer ones (the forces core's rock beds, every fourth level hard), the
//   soft rock just under the hard bed wears back fastest (seepage along the contact), and the hard
//   bed is left as a roof: an overhang, a lip;
// - where a fin or ridge is thin, it wears from both sides at once and opens right through: an arch.
// Nobody picks the form. The same rules run everywhere; the land's shape and its rock choose.
//
// How it works, as a planner (nothing depends on frames or wall time):
// 1. Wear. Every solid voxel with open air beside it gathers wear each step from each open side:
//    more near the foot of the face the air lies on (its "foot"), more just under a hard bed, less
//    the deeper the air lies inside the rock (its "shelter"), and only where the player's gesture
//    reached the face. Hard rock wears at a tenth of the rate. A voxel whose wear passes its own
//    resistance (the rock's grain, 3D noise from the seed) is worn away, which opens the rock behind
//    it. Only rock with a roof over it wears (two voxels, or one hard one): the land's surface, its
//    water and its objects stay where they are; Erode hollows, it never flattens.
// 2. Hold. The game deletes any voxel more than 3 tiles sideways from support when a map loads
//    (GAME_RULES.md §2). Where a roof would be left too far from support, the planner keeps the
//    rock that wore least under it: a stub under a roof's edge (a corbel), or a pillar down to the
//    floor. Big overhangs come out as roofs held by pillars or anchored along their length.
// 3. Show. The worn voxels are shown going in the order they wore, in buckets over 2 to 4 seconds.
//    Every bucket's land is checked with the rule too: a voxel that would hang with nothing holding
//    it goes in that bucket (it falls as rubble), so nothing the game would drop is ever shown, not
//    even for a frame.

import { clamp, hash, hash3, noise3, smooth } from "./random";
import { support } from "./support";
import { LAYERS, Terrain } from "./terrain";

export interface ErodeSettings {
  /** How deep the rock wears, 0–100. */
  power: number;
  /** How big the openings are, 0–100; null follows Power (Auto, D226). */
  size: number | null;
  /** The personality (Try another). */
  seed: number;
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
}

export const BUCKETS = 24;
const STEPS = 48;
/** Wear on any soft face, near the foot of a face, and just under a hard bed. */
const W_FACE = 0.16;
const W_FOOT = 1.0;
const W_CONTACT = 0.85;
/** Hard rock wears at this share of the rate. */
const HARD = 0.09;

interface Params {
  P: number;
  s: number;
  radius: number;
  footH: number;
  shelter: number;
  budget: number;
  /** Levels above and below the touched height the wear reaches. */
  band: number;
}

export function params(set: ErodeSettings, click: boolean): Params {
  const P = clamp(set.power, 0, 100) / 100;
  const s = clamp(set.size ?? autoSize(set.power), 0, 100) / 100;
  return {
    P,
    s,
    radius: click ? 2.2 + 6 * s : 1.4 + 3.6 * s,
    footH: 0.9 + 2.6 * s,
    shelter: 1.3 + 3.6 * P,
    budget: 3 + 24 * P,
    band: 2.2 + 3.5 * s,
  };
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

/** Can the voxel at (tile i, level z) wear: solid, above the floor, off the map's border and kept
 *  ground, and under a roof that holds: three or more blocks of rock over it, or a hard bed just over
 *  it. A column's top two blocks always stay, so Erode never lowers the surface (the water and the
 *  objects on it stay as they are), and no hollow is left under a thin soft crust. */
function erodible(t: Terrain, rock: number[], keep: Uint8Array | undefined, i: number, z: number): boolean {
  if (z < 1 || !t.at(i, z) || (keep && keep[i])) return false;
  const x = i % t.W, y = (i - x) / t.W;
  if (x < 2 || y < 2 || x >= t.W - 2 || y >= t.H - 2) return false;
  const c = t.surface(i);
  if (z > c - 3) return false;
  const above = t.cols[i] >>> (z + 1);
  let n = 0;
  for (let v = above; v; v &= v - 1) n++;
  if (n >= 3) return true;
  return (rock[z + 1] > 0.5 && t.at(i, z + 1)) || (rock[z + 2] > 0.5 && t.at(i, z + 1) && t.at(i, z + 2));
}

/** Open sideways faces of rock that can wear, within `r` of the gesture. */
function exposedNear(t: Terrain, rock: number[], keep: Uint8Array | undefined, pts: { x: number; y: number }[], r: number): { count: number; best: { x: number; y: number; z: number } | null } {
  const { W, H } = t;
  let count = 0;
  let best: { x: number; y: number; z: number } | null = null;
  let bestD = Infinity;
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + r));
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - r)), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys) + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = toStroke(pts, x + 0.5, y + 0.5);
      if (d > r) continue;
      const i = y * W + x;
      const top = t.surface(i);
      for (let z = 1; z < top; z++) {
        if (!erodible(t, rock, keep, i, z)) continue;
        if (!t.solid(x - 1, y, z) || !t.solid(x + 1, y, z) || !t.solid(x, y - 1, z) || !t.solid(x, y + 1, z)) {
          count++;
          if (d < bestD) (bestD = d), (best = { x, y, z });
        }
      }
    }
  return { count, best };
}

/** Plan an erode: the final land and the order the rock goes in. */
export function planErode(input: ErodeInput, gesture: Gesture, set: ErodeSettings): ErodePlan {
  const t0 = performance.now();
  const { rock, keep } = input;
  const before = input.terrain;
  const t = before.clone();
  const { W, H, N } = t;
  let pts: Pt[] = gesture.points.map((p) => ({ x: clamp(p.x, 0, W - 0.01), y: clamp(p.y, 0, H - 0.01), z: p.z }));
  const click = pts.length === 1;
  const p = params(set, click);
  const none = (reason: string): ErodePlan => ({
    final: t,
    removed: new Int32Array(0),
    bucket: new Uint8Array(0),
    buckets: BUCKETS,
    duration: 0,
    worn: 0,
    held: 0,
    fell: 0,
    focus: null,
    box: { x0: 0, y0: 0, x1: -1, y1: -1 },
    ms: performance.now() - t0,
    reason,
  });

  // 1. find the rock: a click that lands away from any face looks for the nearest one close by
  let near = exposedNear(t, rock, keep, pts, p.radius);
  if (near.count < 3) {
    if (!click) {
      if (!near.count) return none("No rock to wear here");
    } else {
      const far = exposedNear(t, rock, keep, pts, 12);
      if (!far.best) return none("No rock to wear here");
      pts = [{ x: far.best.x + 0.5, y: far.best.y + 0.5, z: pts[0].z }];
      near = exposedNear(t, rock, keep, pts, p.radius);
    }
  }
  const focus = near.best;

  // 2. the region the wear can reach
  const reach = p.radius + p.shelter * 3 + 4;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const bx0 = Math.max(0, Math.floor(Math.min(...xs) - reach)), bx1 = Math.min(W - 1, Math.ceil(Math.max(...xs) + reach));
  const by0 = Math.max(0, Math.floor(Math.min(...ys) - reach)), by1 = Math.min(H - 1, Math.ceil(Math.max(...ys) + reach));
  const RW = bx1 - bx0 + 1, RH = by1 - by0 + 1, RN = RW * RH;
  const L = LAYERS - 1;
  const cell = (lx: number, ly: number, z: number) => z * RN + ly * RW + lx;
  const tileOf = (lx: number, ly: number) => (by0 + ly) * W + bx0 + lx;

  // the gesture's reach on the land, per tile: full near the stroke, fading at its edge, with a
  // ragged edge so no opening is stamped
  const G = new Float32Array(RN);
  const Z = new Float32Array(RN).fill(-1);
  for (let ly = 0; ly < RH; ly++)
    for (let lx = 0; lx < RW; lx++) {
      const x = bx0 + lx + 0.5, y = by0 + ly + 0.5;
      const nr = nearest(pts, x, y);
      const ragged = p.radius * (0.8 + 0.4 * noise3(set.seed ^ 0x51ed, x, y, 0, 3.1));
      G[ly * RW + lx] = smooth(1 - (nr.d - ragged * 0.45) / (ragged * 0.55));
      if (nr.z !== undefined) Z[ly * RW + lx] = nr.z;
    }
  // and round the height it touched: full within a few levels of it, fading beyond
  const reachAt = (g: number, zc: number, z: number) => {
    if (zc < 0) return g;
    const off = Math.abs(z + 0.5 - zc);
    return g * smooth(1 - (off - p.band * 0.5) / (p.band * 0.35));
  };

  // air: its foot (the ground the open air stands on), its shelter (steps in from open air) and
  // the gesture's reach where it came from
  const foot = new Float32Array(RN * L).fill(-1);
  const depth = new Float32Array(RN * L).fill(99);
  const gAir = new Float32Array(RN * L);
  for (let ly = 0; ly < RH; ly++)
    for (let lx = 0; lx < RW; lx++) {
      const i = tileOf(lx, ly);
      const top = t.surface(i);
      let floor = 0;
      for (let z = 0; z < L; z++) {
        if (t.at(i, z)) {
          floor = z + 1;
          continue;
        }
        const c = cell(lx, ly, z);
        foot[c] = floor;
        depth[c] = z >= top ? 0 : 3; // existing caves count as sheltered
        gAir[c] = reachAt(G[ly * RW + lx], Z[ly * RW + lx], z);
      }
    }

  // the rock's resistance: its grain (3D noise) and its bed
  const resist = new Float32Array(RN * L);
  const wear = new Float32Array(RN * L);
  for (let z = 1; z < L; z++)
    for (let ly = 0; ly < RH; ly++)
      for (let lx = 0; lx < RW; lx++) {
        const x = bx0 + lx, y = by0 + ly;
        const grain = 0.55 + 0.9 * noise3(set.seed, x, y, z * 1.6, 2.4) + 0.25 * (hash3(set.seed ^ 0x9e37, x, y, z) - 0.5);
        resist[cell(lx, ly, z)] = Math.max(0.25, grain);
      }
  const contact = rock.map((_, z) => (rock[z] > 0.5 ? 0 : rock[z + 1] > 0.5 ? 1 : rock[z + 2] > 0.5 ? 0.75 : rock[z + 3] > 0.5 ? 0.5 : 0));

  // 3. wear, a step at a time
  const dt = p.budget / STEPS;
  const step = new Map<number, number>(); // voxel (z·N + tile) → the step it wore away
  const over = new Map<number, number>(); // → how far past its resistance (how worn)
  const inBox = (x: number, y: number) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // the rock that can wear and has open air beside it (checked again as it goes: a roof can thin)
  const open = new Set<number>();
  const expose = (lx: number, ly: number, z: number) => {
    if (lx < 0 || ly < 0 || lx >= RW || ly >= RH) return;
    if (erodible(t, rock, keep, tileOf(lx, ly), z)) open.add(cell(lx, ly, z));
  };
  for (let z = 1; z < L; z++)
    for (let ly = 0; ly < RH; ly++)
      for (let lx = 0; lx < RW; lx++) {
        const x = bx0 + lx, y = by0 + ly;
        if (t.solid(x, y, z) && (!t.solid(x - 1, y, z) || !t.solid(x + 1, y, z) || !t.solid(x, y - 1, z) || !t.solid(x, y + 1, z))) expose(lx, ly, z);
      }
  for (let s = 0; s < STEPS; s++) {
    const going: number[] = [];
    let active = false;
    for (const oc of open) {
      const z = Math.floor(oc / RN);
      const rr = oc - z * RN;
      const ly = Math.floor(rr / RW), lx = rr - ly * RW;
      const x = bx0 + lx, y = by0 + ly;
      let rate = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!inBox(nx, ny) || t.solid(nx, ny, z)) continue;
        const c = cell(nx - bx0, ny - by0, z);
        const g = gAir[c];
        if (g <= 0) continue;
        const h = Math.max(0, z - foot[c]);
        const a = W_FACE + W_FOOT * Math.exp(-h / p.footH) + W_CONTACT * contact[z];
        rate += a * Math.exp(-depth[c] / p.shelter) * g;
      }
      if (rate <= 0) continue;
      if (!erodible(t, rock, keep, tileOf(lx, ly), z)) {
        open.delete(oc);
        continue;
      }
      active = true;
      if (rock[z] > 0.5) rate *= HARD;
      wear[oc] += rate * dt;
      if (wear[oc] >= resist[oc]) going.push(oc);
    }
    if (!active) break;
    // a varied order within a step, so no two runs share their seams
    going.sort((a, b) => hash(set.seed + s, a) - hash(set.seed + s, b));
    for (const c of going) {
      const z = Math.floor(c / RN);
      const r = c - z * RN;
      const ly = Math.floor(r / RW), lx = r - ly * RW;
      const i = tileOf(lx, ly);
      if (!erodible(t, rock, keep, i, z)) continue; // its roof thinned this step
      t.set(i, z, false);
      open.delete(c);
      step.set(z * N + i, s);
      over.set(z * N + i, (wear[c] - resist[c]) / resist[c]);
      // the new air: sheltered one step more than the air it opened from
      const x = bx0 + lx, y = by0 + ly;
      let bd = 99, bf = z, bg = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!inBox(nx, ny) || t.solid(nx, ny, z)) continue;
        const n = cell(nx - bx0, ny - by0, z);
        if (depth[n] < bd || (depth[n] === bd && gAir[n] > bg)) (bd = depth[n]), (bf = foot[n]), (bg = gAir[n]);
      }
      depth[c] = bd + 1;
      foot[c] = bf;
      gAir[c] = bg;
      // air it opens onto becomes less sheltered too (a hollow reached from two sides)
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!inBox(nx, ny) || t.solid(nx, ny, z)) continue;
        const n = cell(nx - bx0, ny - by0, z);
        if (depth[n] > depth[c] + 1) (depth[n] = depth[c] + 1), (gAir[n] = Math.max(gAir[n], gAir[c]));
      }
      // the rock behind it is open now
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (inBox(nx, ny) && t.solid(nx, ny, z)) expose(nx - bx0, ny - by0, z);
      }
    }
  }

  if (!step.size) return none("The rock here holds");

  // 4. hold: keep the least-worn rock where a roof would be left too far from support
  const regionTiles: number[] = [];
  for (let ly = 0; ly < RH; ly++) for (let lx = 0; lx < RW; lx++) regionTiles.push(tileOf(lx, ly));
  const nonPlain = () => regionTiles.filter((i) => !t.plain(i));
  let held = 0;
  for (let round = 0; round < 600; round++) {
    const sup = support(t, nonPlain());
    if (!sup.unsupported.length) break;
    let zs = LAYERS;
    for (const v of sup.unsupported) zs = Math.min(zs, Math.floor(v / N));
    const U = new Set<number>();
    for (const v of sup.unsupported) if (Math.floor(v / N) === zs) U.add(v - zs * N);
    const unheld = new Set(sup.unsupported);
    // the options: under each loose voxel, restore worn rock downward until it stands on held rock
    // (a pillar) or reaches held rock beside it (a corbel)
    const options: { i: number; cells: number[]; score: number }[] = [];
    for (const i of U) {
      const x = i % W, y = (i - x) / W;
      const cells: number[] = [];
      let cost = 0;
      let ok = false;
      for (let k = zs - 1; k >= 0; k--) {
        if (t.at(i, k)) {
          ok = !unheld.has(k * N + i);
          break;
        }
        const v = k * N + i;
        if (!step.has(v)) break; // air that was never rock: nothing to restore
        cells.push(v);
        cost += 1 + 1.5 * Math.min(3, over.get(v) as number);
        // held beside it, close enough to reach
        let side = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !t.solid(nx, ny, k)) continue;
          const j = ny * W + nx;
          if (unheld.has(k * N + j)) continue;
          const d = sup.distance.get(k * N + j) ?? 0;
          if (d <= 2) side = true;
        }
        if (side) {
          ok = true;
          break;
        }
      }
      if (!ok || !cells.length) continue;
      // what it would hold: loose voxels of this layer within 3 steps through rock
      const seen = new Map<number, number>([[i, 0]]);
      const q = [i];
      let gain = 0;
      for (let h = 0; h < q.length; h++) {
        const v = q[h];
        const d = seen.get(v) as number;
        if (U.has(v)) gain++;
        if (d >= 3) continue;
        const vx = v % W, vy = (v - vx) / W;
        for (const [dx, dy] of dirs) {
          const nx = vx + dx, ny = vy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || !t.solid(nx, ny, zs)) continue;
          const n = ny * W + nx;
          if (seen.has(n)) continue;
          seen.set(n, d + 1);
          q.push(n);
        }
      }
      // nature leaves the rock that wore least; and a lip reads best held from a little way back,
      // so a support about three tiles in from the open air costs least
      const lx = x - bx0, ly = y - by0;
      const inside = lx >= 0 && ly >= 0 && lx < RW && ly < RH ? depth[cell(lx, ly, zs - 1)] : 3;
      cost *= 1 + 0.3 * Math.abs(Math.min(inside, 8) - 3);
      options.push({ i, cells, score: gain / cost + 0.02 * hash(set.seed ^ 0x77, i) });
    }
    if (!options.length) break;
    options.sort((a, b) => b.score - a.score);
    const picked: number[] = [];
    for (const o of options) {
      const ox = o.i % W, oy = (o.i - ox) / W;
      if (picked.some((j) => Math.abs((j % W) - ox) + Math.abs(Math.floor(j / W) - oy) <= 6)) continue;
      picked.push(o.i);
      for (const v of o.cells) {
        const z = Math.floor(v / N);
        t.set(v - z * N, z, true);
        step.delete(v);
        held++;
      }
    }
  }

  // anything still loose falls (it goes with the wear, as rubble): the safety net
  let fell = 0;
  for (;;) {
    const sup = support(t, nonPlain());
    if (!sup.unsupported.length) break;
    for (const v of sup.unsupported) {
      const z = Math.floor(v / N);
      t.set(v - z * N, z, false);
      if (!step.has(v)) step.set(v, STEPS - 1);
      fell++;
    }
  }

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
    duration: 2 + 2 * p.P,
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
