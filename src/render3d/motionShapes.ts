// The shapes of the moving water (investigation/flow-arrows round 4, D353), made in the bake worker
// from the water's real current (current.ts), never on the page's thread: the current's lanes (traces
// down the wet surface, kept apart, a few strong ones rather than a carpet), the bank wakes (where a
// bank opens or narrows across fast water) and the seams (where two currents join), as the ready-made
// arrays of two meshes: the always-on foam ribbons and the Flow view's streaks. Plain arrays, no
// three.js: motion.ts makes the meshes. Only drawn: nothing here reaches the water, a map or an
// operation, so native maths is fine.

import type { SurfaceWater } from "./model";

/** Points a lane has at most (the streaks' path texture is this wide). */
export const STEPS = 256;
/** Seconds of current between a lane's points. */
export const DT = 0.18;
/** Below this depth a tile carries no lane. */
const SHALLOW = 0.06;

interface Sample {
  x: number;
  y: number;
  h: number;
  bad: number;
  vx: number;
  vy: number;
  speed: number;
}

/** The foam ribbons (one mesh): per vertex its position, the direction it widens in, its details
 *  (distance along, side, badwater share, kind: 0 a lane's foam thread, 1 a wake, 2 a seam) and its
 *  energy (strength, end fade, phase, width in tiles). */
export interface CueArrays {
  position: Float32Array;
  direction: Float32Array;
  detail: Float32Array;
  energy: Float32Array;
}

/** The Flow view's streaks (one draw): each lane's points (x, height, −y, badwater share: STEPS a
 *  row), and each streak's lane, life and start (with its first point, for the bounds). */
export interface StreakArrays {
  paths: Float32Array;
  rows: number;
  track: Float32Array;
  position: Float32Array;
}

export interface MotionShapes {
  cues: CueArrays;
  streaks: StreakArrays;
  stats: { lanes: number; wakes: number; seams: number; streaks: number; triangles: number };
}

/** The wet surface's current, sampled anywhere (bilinear through water on the same surface). */
class Field {
  constructor(
    readonly W: number,
    readonly H: number,
    readonly sw: SurfaceWater,
    readonly current: Float32Array,
  ) {}

  sample(x: number, y: number): Sample | null {
    const { W, H, sw, current: v } = this;
    const xx = Math.floor(x);
    const yy = Math.floor(y);
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) return null;
    const i = yy * W + xx;
    if (!(sw.depth[i] >= SHALLOW)) return null;
    let vx = 0;
    let vy = 0;
    let w = 0;
    const bx = Math.floor(x - 0.5);
    const by = Math.floor(y - 0.5);
    const fx = x - 0.5 - bx;
    const fy = y - 0.5 - by;
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const ax = bx + dx;
        const ay = by + dy;
        if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
        const j = ay * W + ax;
        if (!(sw.depth[j] >= SHALLOW) || Math.abs(sw.surface[j] - sw.surface[i]) > 0.65) continue;
        const q = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
        vx += v[j * 2] * q;
        vy += v[j * 2 + 1] * q;
        w += q;
      }
    vx /= Math.max(w, 0.0001);
    vy /= Math.max(w, 0.0001);
    return { x, y, h: sw.surface[i] + 0.035, bad: sw.contamination[i], vx, vy, speed: Math.hypot(vx, vy) };
  }

  private step(p: Sample, dt: number): Sample | null {
    const count = Math.max(1, Math.ceil((p.speed * Math.abs(dt)) / 0.24));
    let at = p;
    for (let j = 0; j < count; j++) {
      const d = dt / count;
      const mid = this.sample(at.x + (at.vx * d) / 2, at.y + (at.vy * d) / 2);
      if (!mid) return null;
      const next = this.sample(at.x + mid.vx * d, at.y + mid.vy * d);
      if (!next || Math.abs(next.h - at.h) > 0.45 || next.speed < 0.045) return null;
      at = next;
    }
    return at;
  }

  /** Down (sign 1) or up (−1) the current from p, at most `count` points. */
  trace(p: Sample, sign: number, count: number, blocked?: (p: Sample) => boolean): Sample[] {
    const points: Sample[] = [];
    let at = p;
    for (let k = 0; k < count; k++) {
      const next = this.step(at, DT * sign);
      if (!next || blocked?.(next)) break;
      points.push(next);
      at = next;
    }
    return points;
  }
}

/** The lanes, wakes and seams of the water's current. */
function trace(f: Field): { lanes: { points: Sample[]; length: number }[]; wakes: Sample[]; seams: Sample[][] } {
  const { W, H } = f;
  const lanes: { points: Sample[]; length: number }[] = [];
  const wakes: Sample[] = [];
  const seams: Sample[][] = [];
  const covered = new Uint8Array(W * H);
  const candidates: Sample[] = [];
  const hash = (i: number) => ((Math.imul(i + 417, 1664525) ^ Math.imul(i + 93, 1013904223)) >>> 0) / 4294967296;
  for (let i = 0; i < W * H; i++) {
    if (!(f.sw.depth[i] >= SHALLOW)) continue;
    const p = f.sample((i % W) + 0.5, Math.floor(i / W) + 0.5);
    if (p && p.speed > 0.1) candidates.push(p);
  }
  // seeds in a fixed scattered order; each claims its whole path, not single points
  const key = (p: Sample) => hash(Math.floor(p.y) * W + Math.floor(p.x));
  candidates.sort((a, b) => key(a) - key(b));
  const occupied = (p: Sample) => covered[Math.floor(p.y) * W + Math.floor(p.x)] !== 0;
  const claim = (p: Sample, r: number) => {
    for (let y = Math.max(0, Math.floor(p.y - r)); y < Math.min(H, p.y + r + 1); y++)
      for (let x = Math.max(0, Math.floor(p.x - r)); x < Math.min(W, p.x + r + 1); x++) if (Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < r) covered[y * W + x] = 1;
  };
  // (as many lanes as a bigger map's rivers need, the same density as at 256²)
  const most = Math.max(60, Math.round((180 * W * H) / (256 * 256)));
  for (const p of candidates) {
    if (occupied(p)) continue;
    const back = f.trace(p, -1, 100, occupied).reverse();
    const forward = f.trace(p, 1, STEPS - 1 - back.length, occupied);
    const points = [...back, p, ...forward];
    let length = 0;
    for (let k = 1; k < points.length; k++) length += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
    if (points.length < 18 || length < 5) continue;
    lanes.push({ points, length });
    for (const q of points) claim(q, 3.2);
    if (lanes.length >= most) break;
  }
  const spaced = (a: Sample[], p: Sample, r: number) => a.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > r);
  for (const p of candidates) {
    if (p.speed < 0.4) continue;
    const dx = p.vx / p.speed;
    const dy = p.vy / p.speed;
    const nx = -dy;
    const ny = dx;
    const wet = (along: number, across: number) => f.sample(p.x + dx * along + nx * across, p.y + dy * along + ny * across);
    // a bank's shoulder behind a wet opening, or a narrowing ahead: never along a straight unbroken
    // bank or in open water
    const behindL = wet(-1.8, 1.3);
    const behindR = wet(-1.8, -1.3);
    const aheadL = wet(1.8, 1.3);
    const aheadR = wet(1.8, -1.3);
    const opening = !behindL !== !behindR && !!aheadL && !!aheadR;
    const narrowing = !!behindL && !!behindR && !aheadL !== !aheadR;
    if ((opening || narrowing) && wet(2, 0) && spaced(wakes, p, 9)) wakes.push(p);
    // currents turning inward from both sides: two waters joining
    const left = wet(0, 2);
    const right = wet(0, -2);
    if (
      left &&
      right &&
      left.vx * nx + left.vy * ny < -0.16 &&
      right.vx * nx + right.vy * ny > 0.16 &&
      left.vx * dx + left.vy * dy > 0.2 &&
      right.vx * dx + right.vy * dy > 0.2 &&
      spaced(
        seams.map((l) => l[0]),
        p,
        10,
      )
    ) {
      const points = [p, ...f.trace(p, 1, 50)];
      if (points.length > 14) seams.push(points);
    }
  }
  return { lanes, wakes, seams };
}

/** The moving water's shapes from the surface water and its current (two a tile, tiles a second). */
export function motionShapes(W: number, H: number, sw: SurfaceWater, current: Float32Array): MotionShapes {
  const f = new Field(W, H, sw, current);
  const { lanes, wakes, seams } = trace(f);
  // the foam ribbons
  const pos: number[] = [];
  const dir: number[] = [];
  const detail: number[] = [];
  const energy: number[] = [];
  const ribbon = (points: Sample[], kind: number, seed: number, strength = 1) => {
    if (points.length < 3) return;
    const vertex = (k: number, side: number) => {
      const p = points[k];
      const a = points[Math.max(0, k - 1)];
      const b = points[Math.min(points.length - 1, k + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.max(0.0001, Math.hypot(dx, dy));
      const rush = Math.max(0, Math.min(1, (p.speed - 0.14) / 1.9));
      pos.push(p.x, p.h + 0.014, -p.y);
      dir.push(-dy / length, 0, -dx / length);
      detail.push(k * DT, side, p.bad, kind);
      const end = Math.min(1, k / 3, (points.length - 1 - k) / 3);
      energy.push((kind === 1 ? 0.52 : kind === 2 ? 0.26 : 0.43) * Math.sqrt(rush) * strength, end, seed, 0.075 + Math.min(0.12, p.speed * 0.025));
    };
    for (let k = 0; k < points.length - 1; k++)
      for (const [i, side] of [
        [k, -1],
        [k, 1],
        [k + 1, -1],
        [k, 1],
        [k + 1, 1],
        [k + 1, -1],
      ])
        vertex(i, side);
  };
  lanes.forEach((lane, i) => ribbon(lane.points, 0, (i * 0.6180339) % 1));
  seams.forEach((points, i) => ribbon(points, 2, (i * 0.381966) % 1));
  let wakeCount = 0;
  for (const p of wakes) {
    const dx = p.vx / p.speed;
    const dy = p.vy / p.speed;
    const nx = -dy;
    const ny = dx;
    let complete = false;
    for (let echo = 0; echo < 2; echo++)
      for (const wing of [-1, 1]) {
        const points: Sample[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          const along = -0.65 + 2.7 * t + echo * 0.8;
          const across = wing * 1.55 * (1 - t) * (1 - 0.58 * t);
          const q = f.sample(p.x + dx * along + nx * across, p.y + dy * along + ny * across);
          if (!q || Math.abs(q.h - p.h) > 0.4) {
            if (points.length > 3) ribbon(points, 1, 0.1 + echo * 0.2, 1 - echo * 0.35);
            points.length = 0;
            continue;
          }
          points.push(q);
        }
        if (points.length > 5) {
          ribbon(points, 1, 0.1 + echo * 0.2, 1 - echo * 0.35);
          complete = true;
        }
      }
    if (complete) wakeCount++;
  }
  // the Flow view's streaks: a few on each lane, its whole path in a texture row
  const rows = Math.max(1, lanes.length);
  const paths = new Float32Array(STEPS * 4 * rows);
  const track: number[] = [];
  const first: number[] = [];
  lanes.forEach(({ points, length }, row) => {
    const life = (points.length - 1) * DT;
    for (let k = 0; k < STEPS; k++) {
      const p = points[Math.min(k, points.length - 1)];
      paths.set([p.x, p.h, -p.y, p.bad], (row * STEPS + k) * 4);
    }
    // the same lane carries a few, far apart
    const count = Math.min(4, Math.max(1, Math.ceil(length / 16)));
    for (let n = 0; n < count; n++) {
      track.push(row, life, (life * (n + ((row * 0.61803398875) % 1))) / count);
      first.push(points[0].x, points[0].h, -points[0].y);
    }
  });
  return {
    cues: { position: Float32Array.from(pos), direction: Float32Array.from(dir), detail: Float32Array.from(detail), energy: Float32Array.from(energy) },
    streaks: { paths, rows, track: Float32Array.from(track), position: Float32Array.from(first) },
    stats: { lanes: lanes.length, wakes: wakeCount, seams: seams.length, streaks: track.length / 3, triangles: pos.length / 9 },
  };
}

/** The arrays to hand over with the shapes (transferred, not copied). */
export function shapeBuffers(s: MotionShapes): ArrayBuffer[] {
  return [s.cues.position, s.cues.direction, s.cues.detail, s.cues.energy, s.streaks.paths, s.streaks.track, s.streaks.position].map((a) => a.buffer as ArrayBuffer);
}
