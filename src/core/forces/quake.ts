// Quake, a force of nature (PLAN §20 D203, D219): it splits the land along a painted fault. Lift
// raises the chosen side (the other drops a little, with a natural tilt and small secondary faults);
// Slide carries the chosen side 3–20 tiles along the stroke's heading while the other bank stays, and
// a river that crossed the fault is joined again along it. Power sets the throw and the shaking's
// reach; Sheer or Stepped scarp; Try another (another personality: the tilt, the crack's roughness).
// Objects ride with the land (a rigid one on flat ground of its own), trees on the fault fall, it
// refuses a fault through the start, and it never adds water: the water there moves with the land.
//
// Ported from investigation/forces-core `verbs/quake/engine.ts` and `brush.ts` (PR #59, from #52 at
// a293e41), kept to its structure: the pinned parity tests compare it with the prototype byte for
// byte.

import type { EntitySpec } from "../format/entities";
import { FOOTPRINTS } from "../format/footprints";
import { objectTile } from "../sim/model";
import type { WaterState } from "../sim/water";
import { snapshotMap, type FullForceMap } from "./force";
import { footprint, startGround } from "./objects";
import { clamp, hash, smooth } from "./random";

export interface Point {
  x: number;
  y: number;
}

export interface QuakeIntent {
  /** The painted fault, in tiles (sub-tile points). */
  path: Point[];
  /** Which side moves: 1 the left of the stroke, -1 the right (X flips it). */
  side: 1 | -1;
}

export interface QuakeSettings {
  mode: "lift" | "slide";
  /** 0–100. */
  power: number;
  scarp: "sheer" | "stepped";
  seed: number;
}

export const QUAKE_DEFAULTS: QuakeSettings = { mode: "lift", power: 60, scarp: "sheer", seed: 1 };

/** Whole-tile travel of the selected block; short strokes retain full Power. */
export const slideTiles = (power: number) => 3 + Math.round(power * 0.17);

export function validateQuake(s: QuakeSettings, m: { W: number; H: number }, i: QuakeIntent): void {
  if (!["lift", "slide"].includes(s.mode) || !["sheer", "stepped"].includes(s.scarp) || !Number.isFinite(s.power) || s.power < 0 || s.power > 100 || !Number.isInteger(s.seed) || s.seed < 0 || s.seed > 0xffffffff)
    throw Error("Invalid quake settings");
  if (!i || ![1, -1].includes(i.side) || !Array.isArray(i.path) || i.path.length < 2 || i.path.length > 512 || i.path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > m.W - 1 || p.y > m.H - 1))
    throw Error("Draw a fault on the land");
}

export interface FaultSegment {
  a: Point;
  b: Point;
  dx: number;
  dy: number;
  length: number;
  along: number;
}

/** The fault as it cracks: the stroke resampled with seeded roughness, and how each tile moves. */
export class Fault {
  readonly points: Point[] = [];
  readonly segments: FaultSegment[] = [];
  length = 0;
  /** How far the shaking reaches from the fault (tiles), the lift and the slide. */
  readonly reach: number;
  readonly lift: number;
  readonly slide: number;
  /** The block's one heading (the stroke's first point to its last). */
  readonly heading: Point;

  constructor(
    readonly settings: QuakeSettings,
    readonly intent: QuakeIntent,
  ) {
    this.reach = 14 + settings.power * 0.5;
    this.lift = 1 + Math.round(settings.power * 0.075);
    this.slide = slideTiles(settings.power);
    // Resample by arc length. Coherent seed noise has a wavelength, never per-tile static.
    const raw: FaultSegment[] = [];
    let length = 0;
    for (let k = 1; k < intent.path.length; k++) {
      const a = intent.path[k - 1];
      const b = intent.path[k];
      const l = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      if (l < 0.01) continue;
      raw.push({ a, b, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l, length: l, along: length });
      length += l;
    }
    // A tap or sub-tile stroke is a small tear too.
    if (length < 0.001) {
      const a = intent.path[0];
      const b = { x: a.x + (a.x > 0.25 ? -0.25 : 0.25), y: a.y };
      raw.push({ a, b, dx: b.x > a.x ? 1 : -1, dy: 0, length: 0.25, along: 0 });
      length = 0.25;
    }
    // One block has one heading. Seeded crack roughness must not shear a ridge into unrelated tile
    // motions. A closed stroke uses its longest chord.
    const first = raw[0].a;
    let end = raw.at(-1)!.b;
    if (Math.hypot(end.x - first.x, end.y - first.y) < 0.1) end = raw.reduce((best, s) => (Math.hypot(s.b.x - first.x, s.b.y - first.y) > Math.hypot(best.x - first.x, best.y - first.y) ? s.b : best), end);
    const span = Math.hypot(end.x - first.x, end.y - first.y) || 1;
    this.heading = { x: (end.x - first.x) / span, y: (end.y - first.y) / span };
    const wavelength = 7 + hash(settings.seed, 9) * 14;
    const rough = 0.35 + hash(settings.seed, 11) * 1.3;
    for (let d = 0; d < length + 4; d += 4) {
      const t = Math.min(d, length);
      const r = raw.find((s) => t <= s.along + s.length) ?? raw[raw.length - 1];
      const f = t - r.along;
      const n = t / wavelength;
      const k = Math.floor(n);
      const a = hash(settings.seed, k + 100) * 2 - 1;
      const b = hash(settings.seed, k + 101) * 2 - 1;
      const offset = (a + (b - a) * smooth(n - k)) * rough * smooth(t / 5) * smooth((length - t) / 5);
      this.points.push({ x: r.a.x + r.dx * f - r.dy * offset, y: r.a.y + r.dy * f + r.dx * offset });
      if (t === length) break;
    }
    for (let k = 1; k < this.points.length; k++) {
      const a = this.points[k - 1];
      const b = this.points[k];
      const l = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      this.segments.push({ a, b, dx: (b.x - a.x) / l, dy: (b.y - a.y) / l, length: l, along: this.length });
      this.length += l;
    }
  }

  /** Where (x, y) lies against the fault: its signed distance (the moving side positive), how far
   *  along, the heading there, and how far past an end. */
  at(x: number, y: number) {
    let best = Infinity;
    let result = { d: 0, along: 0, dx: 1, dy: 0, end: 0 };
    for (const s of this.segments) {
      const rx = x - s.a.x;
      const ry = y - s.a.y;
      const t = rx * s.dx + ry * s.dy;
      const u = clamp(t, 0, s.length);
      const ex = rx - s.dx * u;
      const ey = ry - s.dy * u;
      const d2 = ex * ex + ey * ey;
      if (d2 < best) {
        best = d2;
        result = { d: (s.dx * ry - s.dy * rx) * this.intent.side, along: s.along + u, dx: s.dx, dy: s.dy, end: Math.abs(t - u) };
      }
    }
    return result;
  }

  /** How the tile at (x, y) moves: `dz` levels (Lift), or `dx`, `dy` tiles (Slide). */
  movement(x: number, y: number) {
    const f = this.at(x, y);
    const s = this.settings;
    const side = f.d >= 0 ? 1 : -1;
    const dist = Math.abs(f.d);
    if (s.mode === "slide") {
      // A short stroke still grabs a block, including room behind its ends for the entire
      // translation. Fade only the outside of that block, never its advertised travel. The opposite
      // bank stays on its original course.
      const reach = Math.max(this.reach, this.length * 1.3, this.slide + 12);
      const envelope = (1 - smooth((dist - reach) / 12)) * (1 - smooth((f.end - this.slide - 8) / 12));
      // Stepped splits the perimeter into benches; even a bank narrower than three tiles gets the
      // full offset at the fault itself.
      const weight = s.scarp === "stepped" ? Math.ceil(envelope * 3) / 3 : envelope;
      const amount = (f.d >= -0.01 ? this.slide : 0) * weight;
      const direction = this.heading;
      let dx = Math.round(direction.x * amount);
      let dy = Math.round(direction.y * amount);
      // Rounding a diagonal must not silently subtract a tile from Power.
      if (amount === this.slide && Math.hypot(dx, dy) < this.slide) {
        if (Math.abs(direction.x) >= Math.abs(direction.y)) dx += Math.sign(direction.x);
        else dy += Math.sign(direction.y);
      }
      return { ...f, dz: 0, dx, dy };
    }
    // The block continues to the map edge for a map-spanning stroke. Fading a long lifted block back
    // down nearby makes an artificial upstream dam, not a scarp.
    const blockReach = Math.max(this.reach, this.length * 1.3);
    const envelope = (1 - smooth((dist - blockReach * 0.8) / (blockReach * 0.2))) * (1 - smooth(f.end / Math.max(8, this.reach * 0.6)));
    const step = s.scarp === "stepped" ? Math.min(1, (Math.floor(dist / 3) + 1) / 3) : 1;
    const tilt = (hash(s.seed, 6) * 2 - 1) * (f.along / this.length - 0.5) * 2.4 + (hash(s.seed, 7) * 2 - 1) * clamp(dist / this.reach, 0, 1) * 1.4;
    let dz = Math.round((side > 0 ? this.lift + tilt : -this.lift * 0.55) * envelope * step);
    // Short secondary faults and sag pockets share the main fault's smooth, seeded stations.
    const branch = Math.floor(f.along / 22);
    const u = f.along / 22 - branch;
    if (dist < 2.2 && u > 0.3 && u < 0.62 && hash(s.seed, branch + 200) > 0.48) dz -= 1;
    if (side < 0 && dist > 3 && dist < 8 && u > 0.38 && u < 0.58 && hash(s.seed, branch + 230) > 0.65) dz -= 1;
    return { ...f, dz, dx: 0, dy: 0 };
  }
}

/** A fault within 3.5 tiles of the protected ground (the start's) is refused, with room for its
 *  seeded bends. */
export function faultStrokeReason(points: readonly Point[], keep: Uint8Array, W: number): string | null {
  for (let i = 0; i < keep.length; i++)
    if (keep[i]) {
      const x = i % W;
      const y = Math.floor(i / W);
      for (let k = 0; k < Math.max(1, points.length - 1); k++) {
        const a = points[k];
        const b = points[k + 1] ?? a;
        if (!a) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        if ((x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2 < 3.5 ** 2) return "Start here";
      }
    }
  return null;
}

export function faultReason(m: { W: number; H: number; entities: readonly EntitySpec[] }, intent: QuakeIntent): string | null {
  return faultStrokeReason(intent.path, startGround(m), m.W);
}

/** A quake planned a few rows at a time (`advance`), on its own copy of the map. */
export class QuakePlan {
  readonly map: FullForceMap;
  readonly fault: Fault;
  /** When each tile moves, 0–0.94 of the rupture (the front races along the fault). */
  readonly arrival: Float32Array;
  readonly dx: Int16Array;
  readonly dy: Int16Array;
  /** Destination -> actual original ground tile, shared by transport and view. */
  readonly source: Uint32Array;
  readonly stats = { changed: 0, raised: 0, dropped: 0, moved: 0, toppled: 0, channel: 0, transported: 0, fullOffset: 0 };
  private row = 0;
  private done = false;

  constructor(
    readonly before: FullForceMap,
    readonly settings: QuakeSettings,
    readonly intent: QuakeIntent,
  ) {
    validateQuake(settings, before, intent);
    this.fault = new Fault(settings, intent);
    const reason = faultReason(before, intent);
    if (reason) throw Error(reason);
    this.map = snapshotMap(before);
    this.arrival = new Float32Array(before.W * before.H);
    this.dx = new Int16Array(this.arrival.length);
    this.dy = new Int16Array(this.arrival.length);
    this.source = Uint32Array.from(this.arrival, (_, i) => i);
  }

  get planned(): boolean {
    return this.done;
  }

  /** Plan `rows` more rows; true once the whole quake is planned. */
  advance(rows = 4): boolean {
    if (this.done) return true;
    const { W, H } = this.map;
    const end = Math.min(H, this.row + rows);
    for (let y = this.row; y < end; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const f = this.fault.movement(x, y);
        this.arrival[i] = clamp((f.along / this.fault.length) * 0.82 + (Math.abs(f.d) / this.fault.reach) * 0.12, 0, 0.94);
        this.dx[i] = f.dx;
        this.dy[i] = f.dy;
        // Continuation fills any opening. Exact forward transport below owns the moving block; an
        // iterative inverse can oscillate across its boundary.
        const src = clamp(y - f.dy, 0, H - 1) * W + clamp(x - f.dx, 0, W - 1);
        this.source[i] = src;
        this.map.heights[i] = clamp(this.before.heights[src] + f.dz, 0, Math.min(22, this.map.maxHeight));
      }
    this.row = end;
    if (end < H) return false;
    if (this.settings.mode === "slide") {
      this.transport();
      this.connectRivers();
    } else this.ensureTear();
    this.moveObjects();
    if (this.settings.mode === "slide")
      for (let j = 0; j < W * H; j++) {
        const i = this.source[j];
        const distance = Math.hypot((j % W) - (i % W), Math.floor(j / W) - Math.floor(i / W));
        if (distance > 0 && this.map.heights[j] === this.before.heights[i]) this.stats.transported++;
        if (distance >= this.fault.slide && this.map.heights[j] === this.before.heights[i]) this.stats.fullOffset++;
      }
    this.map.heights.forEach((h, i) => {
      const d = h - this.before.heights[i];
      if (d) this.stats.changed++;
      this.stats.raised += Math.max(0, d);
      this.stats.dropped += Math.max(0, -d);
    });
    this.done = true;
    return true;
  }

  private transport(): void {
    const { W, H } = this.map;
    const priority = new Float32Array(W * H).fill(-1);
    // Deterministic scatter: the most displaced ground owns overlaps at a bend. Core cells beat
    // stationary ground and the feathered perimeter.
    for (let i = 0; i < W * H; i++) {
      const x = (i % W) + this.dx[i];
      const y = Math.floor(i / W) + this.dy[i];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      const travel = Math.hypot(this.dx[i], this.dy[i]);
      if (travel < priority[j]) continue;
      priority[j] = travel;
      this.source[j] = i;
      this.map.heights[j] = this.before.heights[i];
      this.arrival[j] = this.arrival[i];
    }
  }

  private connectRivers(): void {
    const { W, H } = this.map;
    const band = this.settings.scarp === "stepped" ? 10 : 2.5;
    // Find wet crossings in the ORIGINAL river. Join its two transported mouths with a dog-leg along
    // the fault; merely advecting water leaves a bank dam. Sweep the whole wet cross-section,
    // preserving its bed and source strength.
    for (let i = 0; i < W * H; i++)
      if (this.before.water.depth[i] > 0.04) {
        const x = i % W;
        const y = Math.floor(i / W);
        const f = this.fault.at(x, y);
        if (Math.abs(f.d) > 1.25 || f.end > 1) continue;
        const nx = -f.dy;
        const ny = f.dx;
        const d = f.d * this.intent.side;
        const c = { x: x - nx * d, y: y - ny * d };
        const a = { x: c.x + nx * band, y: c.y + ny * band };
        const b = { x: c.x - nx * band, y: c.y - ny * band };
        const da = this.fault.movement(a.x, a.y);
        const db = this.fault.movement(b.x, b.y);
        const path = [
          { x: a.x + da.dx, y: a.y + da.dy },
          { x: c.x + da.dx, y: c.y + da.dy },
          { x: c.x + db.dx, y: c.y + db.dy },
          { x: b.x + db.dx, y: b.y + db.dy },
        ];
        const bed = this.before.heights[i];
        for (let k = 1; k < path.length; k++) {
          const p0 = path[k - 1];
          const p1 = path[k];
          const n = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y) * 2));
          for (let t = 0; t <= n; t++) {
            const px = p0.x + ((p1.x - p0.x) * t) / n;
            const py = p0.y + ((p1.y - p0.y) * t) / n;
            for (let yy = Math.floor(py - 1); yy <= Math.ceil(py + 1); yy++)
              for (let xx = Math.floor(px - 1); xx <= Math.ceil(px + 1); xx++) {
                if (xx < 0 || yy < 0 || xx >= W || yy >= H || (xx - px) ** 2 + (yy - py) ** 2 > 1.4) continue;
                const j = yy * W + xx;
                if (this.map.heights[j] > bed) {
                  this.map.heights[j] = bed;
                  this.stats.channel++;
                }
                // The connector opens with its crossing, not a later dry front.
                this.arrival[j] = Math.min(this.arrival[j], this.arrival[i]);
              }
          }
        }
      }
  }

  private ensureTear(): void {
    if (this.map.heights.some((h, i) => h !== this.before.heights[i])) return;
    // Sliding a featureless plain (or lifting already capped ground) must still leave a visible
    // tear. This small whole-level scarp never changes a start.
    const keep = startGround(this.before);
    const cap = Math.min(22, this.map.maxHeight);
    for (const p of this.fault.points)
      for (let yy = -2; yy <= 2; yy++)
        for (let xx = -2; xx <= 2; xx++) {
          const x = clamp(Math.round(p.x) + xx, 0, this.map.W - 1);
          const y = clamp(Math.round(p.y) + yy, 0, this.map.H - 1);
          const i = y * this.map.W + x;
          if (keep[i]) continue;
          const f = this.fault.at(x, y);
          const h = this.before.heights[i];
          this.map.heights[i] = h === 0 ? 1 : h === cap ? h - 1 : clamp(h + (f.d >= 0 ? 1 : -1), 0, cap);
        }
  }

  private moveObjects(): void {
    const { W, H } = this.map;
    const occupied = new Uint8Array(W * H);
    const staysInside = (e: EntitySpec) => {
      const f = this.fault.movement(e.x, e.y);
      const moved = { ...e, x: e.x + f.dx, y: e.y + f.dy };
      const fp = FOOTPRINTS[e.template]?.size ?? [1, 1, 1];
      return footprint(this.map, moved).length === fp[0] * fp[1];
    };
    const inside = this.settings.mode === "slide" ? new Map(this.map.entities.map((e) => [e.id, Number(staysInside(e))])) : new Map<string, number>();
    // Place intact interior blocks before the edge continuation. Clamped edge trees must not dislodge
    // a ruin that has room for its full translation.
    const all = [...this.map.entities].sort((a, b) => Number(b.template === "StartingLocation") - Number(a.template === "StartingLocation") || (inside.get(b.id) ?? 0) - (inside.get(a.id) ?? 0));
    const fallen = new Map(this.map.fallen.map((f) => [f.id, f]));
    for (const e of all) {
      const old = { ...e };
      const f = this.fault.movement(e.x, e.y);
      const fp = FOOTPRINTS[e.template]?.size ?? [1, 1, 1];
      const corners = [objectTile(e, 0, 0), objectTile(e, fp[0] - 1, 0), objectTile(e, 0, fp[1] - 1), objectTile(e, fp[0] - 1, fp[1] - 1)];
      const xs = corners.map((p) => p[0] - e.x);
      const ys = corners.map((p) => p[1] - e.y);
      const margin = e.template === "StartingLocation" ? 1 : 0;
      const px = clamp(e.x + f.dx, margin - Math.min(...xs), W - 1 - margin - Math.max(...xs));
      const py = clamp(e.y + f.dy, margin - Math.min(...ys), H - 1 - margin - Math.max(...ys));
      e.x = px;
      e.y = py;
      if (f.dx || f.dy || (this.settings.mode === "slide" && footprint(this.map, e, margin).some((i) => occupied[i]))) {
        let found = false;
        for (let radius = 0; radius <= Math.max(W, H) && !found; radius++)
          for (let yy = -radius; yy <= radius && !found; yy++)
            for (let xx = -radius; xx <= radius && !found; xx++) {
              if (radius && Math.abs(xx) !== radius && Math.abs(yy) !== radius) continue;
              e.x = px + xx;
              e.y = py + yy;
              const tiles = footprint(this.map, e, margin);
              if (tiles.length === (fp[0] + margin * 2) * (fp[1] + margin * 2) && tiles.every((i) => !occupied[i])) found = true;
            }
        if (!found) throw Error("No room for objects to move");
      }
      const changed = e.x !== old.x || e.y !== old.y || this.map.heights[e.y * W + e.x] !== this.before.heights[old.y * W + old.x];
      if (changed) {
        e.z = clamp(old.z + this.map.heights[e.y * W + e.x] - this.before.heights[old.y * W + old.x], 0, 22);
        delete e.raw;
        this.stats.moved++;
      }
      const support = footprint(this.map, e, margin);
      for (const i of support) occupied[i] = 1;
      // Rigid footprints ride whole, including the start's entrance and a one-tile apron.
      if (fp[0] * fp[1] > 1 && (changed || support.some((i) => this.map.heights[i] !== e.z))) {
        const arrival = this.arrival[old.y * W + old.x];
        for (const i of footprint(this.map, old, margin)) this.arrival[i] = arrival;
        for (const i of support) {
          this.map.heights[i] = e.z;
          this.arrival[i] = arrival;
        }
      }
      if (/^(Pine|Birch|Oak|Succulent)$/.test(e.template) && Math.abs(f.d) < 1.9 && f.end < 2) {
        e.components = { ...e.components, LivingNaturalResource: { IsDead: true } };
        delete e.raw;
        fallen.set(e.id, { id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: e.z, dx: -f.dy || 0.7, dy: f.dx || 0.7, length: e.template === "Oak" ? 2.6 : 2 });
        this.stats.toppled++;
      } else if (fallen.has(e.id)) {
        const t = fallen.get(e.id)!;
        fallen.set(e.id, { ...t, x: e.x + 0.5, y: e.y + 0.5, z: e.z });
      }
    }
    this.map.fallen = [...fallen.values()];
  }
}

/** A whole quake at once (tests, Claude's step). */
export function quake(m: FullForceMap, s: QuakeSettings, i: QuakeIntent): QuakePlan {
  const p = new QuakePlan(m, s, i);
  while (!p.advance(8)) {
    // planned a slice at a time
  }
  return p;
}

/** Move the warm water between successive painted plans without duplicating a volume, including when
 *  X reverses the chosen side. */
export function paintWater(old: FullForceMap, p: QuakePlan, offset: QuakePlan | null): WaterState {
  const { W, H } = old;
  const D = new Float64Array(W * H);
  const C = new Float64Array(D.length);
  for (let i = 0; i < D.length; i++) {
    const origin = offset && p.settings.mode === "slide" ? offset.source[i] : i;
    const bx = origin % W;
    const by = Math.floor(origin / W);
    const b = clamp(Math.round(by), 0, H - 1) * W + clamp(Math.round(bx), 0, W - 1);
    const j = p.settings.mode === "slide" ? clamp(Math.round(by) + p.dy[b], 0, H - 1) * W + clamp(Math.round(bx) + p.dx[b], 0, W - 1) : i;
    D[j] += old.water.depth[i];
    C[j] += old.water.depth[i] * old.water.contamination[i];
  }
  return { depth: D, contamination: Float64Array.from(C, (v, i) => (D[i] ? v / D[i] : 0)) };
}

/** Eight deterministic fronts: the map at `step` of `steps` (timing and frame rate never enter it). */
export function revealQuake(plan: QuakePlan, previous: FullForceMap, step: number, steps = 8): FullForceMap {
  const out = snapshotMap(previous);
  const progress = step / steps;
  const { W, H } = out;
  for (let i = 0; i < out.heights.length; i++) if (plan.arrival[i] <= progress) out.heights[i] = plan.map.heights[i];
  out.entities = plan.before.entities.map((e, k) => {
    const t = e.y * W + e.x;
    return structuredClone(plan.arrival[t] <= progress ? plan.map.entities[k] : e);
  });
  out.fallen = plan.map.fallen.filter((f) =>
    out.entities.some((e) => {
      if (e.id !== f.id) return false;
      const o = plan.before.entities.find((b) => b.id === e.id)!;
      return plan.arrival[o.y * W + o.x] <= progress;
    }),
  );
  if (plan.settings.mode === "slide") {
    // Forward transport water on newly moving cells; sum collisions, conserve volume and mixture.
    const next = new Float64Array(W * H);
    const bad = new Float64Array(W * H);
    for (let i = 0; i < next.length; i++) {
      const newly = plan.arrival[i] <= progress && plan.arrival[i] > (step - 1) / steps;
      const x = i % W;
      const y = Math.floor(i / W);
      const j = newly ? clamp(y + plan.dy[i], 0, H - 1) * W + clamp(x + plan.dx[i], 0, W - 1) : i;
      next[j] += previous.water.depth[i];
      bad[j] += previous.water.depth[i] * previous.water.contamination[i];
    }
    out.water = { depth: next, contamination: Float64Array.from(bad, (v, i) => (next[i] ? v / next[i] : 0)) };
  }
  return out;
}

// --------------------------------------------------------------------------------- the fault brush

/** The painted stroke (continuous, sub-tile pen input): the page consumes it at display rate, the
 *  worker takes replaceable copies at its own pace. */
export class FaultBrush {
  readonly points: Point[] = [];
  private smoothed: Point;
  private target: Point;

  constructor(
    p: Point,
    readonly W: number,
    readonly H: number,
    public side: 1 | -1 = 1,
  ) {
    this.smoothed = { ...p };
    this.target = { ...p };
    this.points.push({ ...p });
  }

  aim(p: Point): void {
    this.target = { x: clamp(p.x, 0, this.W - 1), y: clamp(p.y, 0, this.H - 1) };
  }

  advance(dt: number, finish = false): void {
    const a = finish ? 1 : 1 - Math.exp(-Math.max(0, dt) / 0.018);
    this.smoothed = { x: this.smoothed.x + (this.target.x - this.smoothed.x) * a, y: this.smoothed.y + (this.target.y - this.smoothed.y) * a };
    const last = this.points.at(-1)!;
    if (Math.hypot(this.smoothed.x - last.x, this.smoothed.y - last.y) > 0.45) this.points.push({ ...this.smoothed });
    // Bound both the worker and line buffers, retaining the beginning and end.
    if (this.points.length > 480) this.points.splice(1, this.points.length - 2, ...this.points.slice(1, -1).filter((_, i) => i % 2 === 0));
  }

  intent(): QuakeIntent {
    return { side: this.side, path: [...this.points.map((p) => ({ ...p })), { ...this.smoothed }] };
  }
}
