// Erupt, a force of nature (PLAN §20 D206, D216): it raises a volcano. Vent (a click) or Fissure (a
// painted line of vents); Power; Steep or Broad; a summit (Auto, Peak, Crater or Caldera); Flows
// (Light or Heavy) with or without Ridges; Try another. Low-frequency lobes, terraces, collapse and
// winding lava flows, never per-tile noise. Every level it raises is fresh volcanic rock (rock.ts),
// hard for Carve; flows can dam rivers; objects ride the rising ground (a rigid one on a terrace of
// its own), trees near a vent are knocked down, and what stands in the vent itself is gone;
// overlapping eruptions build volcanic fields. It refuses to erupt where the start sits and never
// adds water. The swell is shown in stages (`stageMap`).
//
// Ported from investigation/forces-core `verbs/erupt/engine.ts` and `flows.ts` (PR #59, from #50 at
// 89c6842), kept to its structure: the pinned parity tests compare it with the prototype byte for
// byte.

import { EMITTERS } from "../sim/model";
import { snapshotMap, type FullForceMap } from "./force";
import { footprint, START_REASON, startGround } from "./objects";
import { clamp, hash, smooth } from "./random";

export interface Point {
  x: number;
  y: number;
}

export interface EruptIntent {
  /** The vent's tile (a fissure's first point). */
  origin: number;
  /** Fissure: the painted line, in tiles (sub-tile points). */
  path?: Point[];
}

export interface EruptSettings {
  mode: "vent" | "fissure";
  /** 0–100. */
  power: number;
  shape: "steep" | "broad";
  summit: "auto" | "peak" | "crater" | "caldera";
  flows: "light" | "heavy";
  ridges: boolean;
  seed: number;
}

export const ERUPT_DEFAULTS: EruptSettings = { mode: "vent", power: 62, shape: "steep", summit: "auto", flows: "heavy", ridges: true, seed: 1 };

export function validateErupt(s: EruptSettings, m: { W: number; H: number }, i: EruptIntent): void {
  if (
    !["vent", "fissure"].includes(s.mode) ||
    !["steep", "broad"].includes(s.shape) ||
    !["auto", "peak", "crater", "caldera"].includes(s.summit) ||
    !["light", "heavy"].includes(s.flows) ||
    typeof s.ridges !== "boolean" ||
    !Number.isFinite(s.power) ||
    s.power < 0 ||
    s.power > 100 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 0xffffffff
  )
    throw Error("Invalid eruption settings");
  if (!Number.isInteger(i.origin) || i.origin < 0 || i.origin >= m.W * m.H) throw Error("Choose land on the map");
  if (s.mode === "fissure" && (!Array.isArray(i.path) || i.path.length < 2 || i.path.length > 512 || i.path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > m.W - 1 || p.y > m.H - 1)))
    throw Error("Draw a fissure on the land");
}

export const naturalSize = (p: number) => 2 * (7 + 36 * (p / 100) ** 1.15);
export const autoSummit = (p: number): EruptSettings["summit"] => (p < 32 ? "peak" : p < 80 ? "crater" : "caldera");

export interface Segment {
  a: Point;
  b: Point;
  length: number;
  along: number;
}

// ------------------------------------------------------------------------------------ lava flows

/** A point of a lava lobe, and its width there. */
export interface LobePoint extends Point {
  width: number;
}

/** A seeded downhill path, rasterized as overlapping rounded deposits, not an angular spoke. */
export interface LavaLobe {
  points: LobePoint[];
  length: number;
  strength: number;
}

const unit = (s: number, k: number) => {
  let x = Math.imul(s ^ Math.imul(k + 1, 0x9e3779b9), 0x85ebca6b);
  x ^= x >>> 13;
  return (Math.imul(x, 0xc2b2ae35) >>> 0) / 4294967296;
};

export function lavaLobes(W: number, H: number, heights: Uint8Array, a: { x: number; y: number; radius: number; height: number; datum: number; summit: string }, seed: number, heavy: boolean): LavaLobe[] {
  const out: LavaLobe[] = [];
  const count = (heavy ? 4 : 3) + Math.floor(unit(seed, 720) * (heavy ? 7 : 4));
  const angles: number[] = [];
  const ground = (x: number, y: number) => heights[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))];
  for (let k = 0; k < count; k++) {
    let angle = unit(seed, 730 + k) * Math.PI * 2;
    // Random gaps and occasional neighboring lobes; never a regular angular fan.
    for (let attempt = 0; attempt < 20 && angles.some((t) => Math.abs(Math.atan2(Math.sin(t - angle), Math.cos(t - angle))) < 0.29); attempt++) angle = unit(seed, 900 + k * 23 + attempt) * Math.PI * 2;
    angles.push(angle);
    const start = a.summit === "caldera" ? 0.64 : a.summit === "crater" ? 0.19 : 0.12;
    const reach = (heavy ? 0.86 : 0.72) + unit(seed, 800 + k) ** 1.4 * (heavy ? 1.5 : 0.7);
    const length = a.radius * (reach - start);
    const steps = Math.max(12, Math.ceil(length / 0.65));
    const width = (0.85 + unit(seed, 820 + k) * 1.35) * Math.max(0.7, a.radius / 22);
    const phase = unit(seed, 840 + k) * Math.PI * 2;
    const points: LobePoint[] = [];
    let x = a.x + Math.cos(angle) * a.radius * start;
    let y = a.y + Math.sin(angle) * a.radius * start;
    for (let j = 0; j <= steps; j++) {
      const u = j / steps;
      const r = a.radius * (start + (reach - start) * u);
      const theta = angle + 0.32 * Math.sin(u * 5.8 + phase) + 0.19 * Math.sin(u * 10.2 - phase);
      if (j) {
        const desired = Math.atan2(a.y + Math.sin(theta) * r - y, a.x + Math.cos(theta) * r - x);
        const step = length / steps;
        let best = Infinity;
        let bx = x;
        let by = y;
        for (const turn of [0, -0.25, 0.25, -0.5, 0.5]) {
          const nx = x + Math.cos(desired + turn) * step;
          const ny = y + Math.sin(desired + turn) * step;
          const nr = Math.hypot(nx - a.x, ny - a.y);
          if (nr < Math.hypot(x - a.x, y - a.y)) continue;
          const score = ground(nx, ny) * 0.7 + Math.abs(turn) * 0.65;
          if (score < best) {
            best = score;
            bx = nx;
            by = ny;
          }
        }
        // Once beyond the cone, a lobe pools at uphill obstacles instead of climbing them.
        if (Math.hypot(x - a.x, y - a.y) > a.radius && ground(bx, by) > ground(x, y)) break;
        x = bx;
        y = by;
      }
      const tongue = 1 + 1.2 * Math.exp(-(((u - 0.89) / 0.18) ** 2));
      points.push({ x, y, width: width * (0.38 + 0.62 * u) * tongue });
    }
    if (points.length > 1) out.push({ points, length, strength: 1.1 + unit(seed, 860 + k) * 1.4 });
  }
  return out;
}

/** The lobes' field (0 off them): compact, with round caps; also the heat's mask for the view. */
export function lobeField(W: number, H: number, lobes: readonly LavaLobe[]): Float32Array {
  const field = new Float32Array(W * H);
  for (const lobe of lobes)
    for (let k = 1; k < lobe.points.length; k++) {
      const a = lobe.points[k - 1];
      const b = lobe.points[k];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      const w = Math.max(a.width, b.width);
      for (let y = Math.max(0, Math.floor(Math.min(a.y, b.y) - w)); y <= Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + w)); y++)
        for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) - w)); x <= Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + w)); x++) {
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (l2 || 1)));
          const width = a.width + (b.width - a.width) * t;
          const d = Math.hypot(x - a.x - dx * t, y - a.y - dy * t) / width;
          if (d < 1) {
            const v = (1 - d * d) ** 0.65 * lobe.strength;
            const i = y * W + x;
            field[i] = Math.max(field[i], v);
          }
        }
    }
  return field;
}

// ------------------------------------------------------------------------------------- the volcano

export interface EruptAnatomy {
  x: number;
  y: number;
  datum: number;
  radius: number;
  height: number;
  summit: EruptSettings["summit"];
  phase: number;
  segments: Segment[];
  vents: Point[];
  length: number;
  lobes: LavaLobe[];
}

export function ventRadius(s: EruptSettings): number {
  const summit = s.summit === "auto" ? autoSummit(s.power) : s.summit;
  return naturalSize(s.power) * 0.5 * (s.shape === "broad" ? 1.6 : s.mode === "vent" && summit !== "caldera" ? 0.74 : 1) * (s.mode === "fissure" ? 0.47 : 1);
}

export function eruptAnatomy(m: { W: number; H: number; heights: Uint8Array }, s: EruptSettings, intent: EruptIntent): EruptAnatomy {
  validateErupt(s, m, intent);
  const x = intent.origin % m.W;
  const y = Math.floor(intent.origin / m.W);
  const p = s.power / 100;
  const summit = s.summit === "auto" ? autoSummit(s.power) : s.summit;
  const radius = ventRadius(s);
  const legacy = s.mode === "fissure" || summit === "caldera";
  const height = (2 + 18 * p) * (legacy ? (s.shape === "broad" ? 0.7 : 1) * (s.mode === "fissure" ? 0.75 : 1) : s.shape === "broad" ? 0.55 : 1.42);
  const segments: Segment[] = [];
  const vents: Point[] = [];
  let length = 0;
  if (s.mode === "fissure") {
    for (let k = 1; k < intent.path!.length; k++) {
      const a = intent.path![k - 1];
      const b = intent.path![k];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      if (l > 0.01) {
        segments.push({ a, b, length: l, along: length });
        length += l;
      }
    }
    if (length < 3) throw Error("Draw a longer fissure");
    const spacing = Math.max(7, radius * 0.72);
    const count = Math.max(2, Math.ceil(length / spacing));
    for (let k = 0; k <= count; k++) {
      const d = (length * k) / count;
      const seg = segments.find((v) => d <= v.along + v.length) ?? segments.at(-1)!;
      const t = (d - seg.along) / seg.length;
      vents.push({ x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t });
    }
  } else vents.push({ x, y });
  const a: EruptAnatomy = { x, y, radius, height, datum: m.heights[intent.origin], summit, phase: hash(s.seed, 71) * Math.PI * 2, segments, vents, length, lobes: [] };
  if (s.mode === "vent") a.lobes = lavaLobes(m.W, m.H, m.heights, a, s.seed, s.flows === "heavy");
  return a;
}

export function eruptField(a: EruptAnatomy, s: EruptSettings, x: number, y: number) {
  let cx = a.x;
  let cy = a.y;
  let along = 0;
  let distance = Infinity;
  for (const seg of a.segments) {
    const dx = seg.b.x - seg.a.x;
    const dy = seg.b.y - seg.a.y;
    const t = clamp(((x - seg.a.x) * dx + (y - seg.a.y) * dy) / (seg.length * seg.length), 0, 1);
    const xx = seg.a.x + dx * t;
    const yy = seg.a.y + dy * t;
    const d = Math.hypot(x - xx, y - yy);
    if (d < distance) {
      distance = d;
      cx = xx;
      cy = yy;
      along = seg.along + t * seg.length;
    }
  }
  const theta = Math.atan2(y - cy, x - cx);
  const edge = 1 + 0.07 * Math.sin(theta * 3 + a.phase) + 0.045 * Math.sin(theta * 5 - a.phase);
  const r = Math.hypot(x - cx, y - cy) / (a.radius * edge);
  const wave = s.mode === "vent" ? theta * (6 + Math.floor(hash(s.seed, 20) * 4)) + a.phase + r * 0.9 : along / (3 + hash(s.seed, 20) * 2) + a.phase + r * 0.8;
  const ridge = Math.max(0, Math.cos(wave)) ** 8;
  let nearest = Infinity;
  let vent = a.vents[0];
  for (const v of a.vents) {
    const d = Math.hypot(x - v.x, y - v.y);
    if (d < nearest) {
      nearest = d;
      vent = v;
    }
  }
  return { r, theta, ridge, cx, cy, along, vent, ventDistance: nearest };
}

/** Why it would not erupt there (null: it will): a vent on the start's ground, or a fissure within
 *  two tiles of it. */
export function eruptionReason(m: { W: number; H: number; heights: Uint8Array; entities: FullForceMap["entities"] }, s: EruptSettings, i: EruptIntent): string | null {
  const keep = startGround(m);
  if (keep[i.origin]) return START_REASON;
  if (s.mode === "fissure") {
    const a = eruptAnatomy(m, s, i);
    for (let k = 0; k < keep.length; k++) if (keep[k] && eruptField(a, s, k % m.W, Math.floor(k / m.W)).r * a.radius < 2) return START_REASON;
  }
  return null;
}

/** An eruption planned a few rows at a time (`advance`), on its own copy of the map. `keep` adds
 *  ground it leaves alone (the land above the layer showing, an imported map's caves). */
export class EruptPlan {
  readonly map: FullForceMap;
  readonly anatomy: EruptAnatomy;
  readonly keep: Uint8Array;
  readonly flows: Float32Array;
  readonly stats = { raised: 0, changed: 0, flattened: 0, erased: 0, hard: 0 };
  private row = 0;
  private done = false;

  constructor(
    readonly before: FullForceMap,
    readonly settings: EruptSettings,
    readonly intent: EruptIntent,
    extraKeep: Uint8Array | null = null,
  ) {
    this.anatomy = eruptAnatomy(before, settings, intent);
    const reason = eruptionReason(before, settings, intent);
    if (reason) throw Error(reason);
    this.keep = startGround(before);
    if (extraKeep) for (let i = 0; i < extraKeep.length; i++) if (extraKeep[i]) this.keep[i] = 1;
    this.map = snapshotMap(before);
    this.flows = lobeField(before.W, before.H, this.anatomy.lobes);
  }

  get planned(): boolean {
    return this.done;
  }

  /** Plan `rows` more rows; true once the whole volcano is planned. */
  advance(rows = 4): boolean {
    if (this.done) return true;
    const { W, H } = this.map;
    const a = this.anatomy;
    const s = this.settings;
    const end = Math.min(H, this.row + Math.max(1, Math.floor(rows)));
    for (let y = this.row; y < end; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const h = this.before.heights[i];
        if (this.keep[i]) continue;
        const f = eruptField(a, s, x, y);
        const r = f.r;
        if (r > 2.6) continue;
        const local = this.before.heights[Math.round(f.cy) * W + Math.round(f.cx)];
        const datum = s.mode === "vent" ? a.datum : local;
        let profile = Math.max(0, 1 - r) ** (s.shape === "steep" ? (s.mode === "fissure" ? 0.83 : 1.7) : 1.65);
        if (s.mode === "vent" && a.summit === "crater" && r < 0.16) profile = 0.64 + (Math.pow(0.84, s.shape === "steep" ? 1.7 : 1.65) - 0.64) * smooth(r / 0.16);
        if (s.mode === "vent" && a.summit === "caldera") profile = r < 0.43 ? 0.34 : r < 0.6 ? 0.34 + 0.48 * smooth((r - 0.43) / 0.17) : 0.82 * Math.max(0, 1 - (r - 0.6) / 0.65);
        if (s.mode === "fissure") {
          const bowl = 1 - smooth(f.ventDistance / Math.max(2.4, a.radius * 0.19));
          profile = Math.max(0, profile - bowl * (a.summit === "caldera" ? 0.4 : a.summit === "peak" ? 0.12 : 0.27));
        }
        const shoulder = smooth((r - 0.48) / 0.7);
        const cone = datum + a.height * profile + (h - datum) * shoulder;
        const reach = s.flows === "heavy" ? 2.55 : 1.25;
        const apron = (s.flows === "heavy" ? 2.6 + s.power * 0.018 : 0.8) * Math.max(0, 1 - r / reach) ** 1.4 * (0.86 + 0.14 * Math.sin(f.theta * 4 + a.phase + r));
        const ridge = s.ridges
          ? s.mode === "fissure"
            ? f.ridge * (1 - smooth((r - 1.05) / 0.85)) * smooth((r - 0.34) / 0.32) * (0.8 + s.power * 0.022)
            : this.flows[i] * (0.7 + s.power * 0.013) * smooth((r - (a.summit === "caldera" ? 0.6 : 0.16)) / 0.2)
          : 0;
        let target = Math.max(h, cone, h + apron) + ridge;
        // Keep broad summit basins open; flow ridges begin below the rim.
        if (s.mode === "vent" && r < (a.summit === "caldera" ? 0.6 : a.summit === "crater" ? 0.16 : 0)) target = Math.max(h, cone);
        target = clamp(Math.round(Math.round(target * 4096) / 4096), 0, Math.min(22, this.map.maxHeight));
        this.map.heights[i] = target;
        if (target !== h) {
          this.stats.changed++;
          this.stats.raised += target - h;
          for (let z = h; z < target; z++) this.map.lava[i] |= 1 << z;
          this.stats.hard++;
        }
      }
    this.row = end;
    if (end < H) return false;
    this.finishObjects();
    this.done = true;
    return true;
  }

  private finishObjects(): void {
    const a = this.anatomy;
    const s = this.settings;
    const m = this.map;
    m.fallen = m.fallen.map((f) => ({ ...f, z: m.heights[clamp(Math.floor(f.y), 0, m.H - 1) * m.W + clamp(Math.floor(f.x), 0, m.W - 1)] }));
    m.entities = m.entities.filter((e) => {
      const tile = e.y * m.W + e.x;
      if (this.keep[tile]) return true;
      const f = eruptField(a, s, e.x, e.y);
      const plant = /^(Pine|Oak|Birch|Succulent|BlueberryBush)$/.test(e.template);
      if (!EMITTERS[e.template] && f.ventDistance < Math.max(1.5, a.radius * 0.065)) {
        this.stats.erased++;
        m.fallen = m.fallen.filter((v) => v.id !== e.id);
        return false;
      }
      if (plant && f.ventDistance < a.radius * 0.72) {
        if (e.template === "BlueberryBush" || e.template === "Succulent") {
          this.stats.erased++;
          return false;
        }
        const d = Math.hypot(e.x - f.vent.x, e.y - f.vent.y) || 1;
        m.fallen = m.fallen.filter((v) => v.id !== e.id);
        m.fallen.push({ id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: m.heights[tile], dx: (e.x - f.vent.x) / d, dy: (e.y - f.vent.y) / d, length: e.template === "Oak" ? 2.6 : 2 });
        e.components = { ...e.components, LivingNaturalResource: { IsDead: true } };
        delete e.raw;
        this.stats.flattened++;
      }
      // Rigid footprints ride a supporting terrace, instead of leaving one corner hanging.
      const tiles = footprint(m, e);
      const height = Math.max(...tiles.map((i) => m.heights[i]));
      if (tiles.some((i) => this.keep[i] && m.heights[i] !== height)) return true;
      if (!plant)
        for (const i of tiles) {
          const prior = m.heights[i];
          m.heights[i] = height;
          for (let z = prior; z < height; z++) m.lava[i] |= 1 << z;
        }
      const z = plant ? m.heights[tile] : height;
      if (e.z !== z) delete e.raw;
      e.z = z;
      return true;
    });
  }
}

/** A whole eruption at once (tests, Claude's step). */
export function erupt(m: FullForceMap, s: EruptSettings, intent: EruptIntent, keep: Uint8Array | null = null): EruptPlan {
  const p = new EruptPlan(m, s, intent, keep);
  while (!p.advance(8)) {
    // planned a slice at a time
  }
  return p;
}

/** The eruption at `t` (0–1) of its swell: every raised tile a share of the way up (whole levels),
 *  objects on their ground then. */
export function stageMap(before: FullForceMap, after: FullForceMap, t: number): FullForceMap {
  const m = snapshotMap(after);
  for (let i = 0; i < m.heights.length; i++) m.heights[i] = Math.round(before.heights[i] + (after.heights[i] - before.heights[i]) * smooth(t));
  m.entities = m.entities.map((e) => ({ ...e, z: m.heights[e.y * m.W + e.x] }));
  m.fallen = m.fallen.map((f) => ({ ...f, z: m.heights[Math.floor(f.y) * m.W + Math.floor(f.x)] }));
  return m;
}
