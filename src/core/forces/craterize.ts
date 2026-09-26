// Craterize, a force of nature (PLAN §20 D202, D216): a giant impact. Strike (a click) or Aim (a
// glancing drag, for an oval crater thrown forward); Power; Size (following Power, or set); Steep or
// Terraced walls; a centre (Auto, Bowl, Peak, Ring or Flat); Debris (Light or Heavy) with or without
// Rays; Try another (the next personality). A coherent crater field quantized once to whole game
// levels: a morphology model, not a shock-physics solver. The newest bowl replaces the relief it
// lands on (overlapping impacts overprint older ones); only its outer lip rejoins the ground round
// it. Trees inside the bowl are gone; round it they are knocked down, lying away from the blow (dead
// trees, their pose the editor's); other objects whose ground changed go; water sources keep their
// ground and strength. It refuses to strike where the start sits and never adds water.
//
// Ported from investigation/forces-core `verbs/craterize/engine.ts` (PR #59, from #51 at 2f4963c),
// kept to its structure: the pinned parity tests compare it with the prototype byte for byte.

import { EMITTERS } from "../sim/model";
import { snapshotMap, type FullForceMap } from "./force";
import { footprint, START_REASON, startGround } from "./objects";
import { clamp, hash, smooth } from "./random";

export interface CraterSettings {
  mode: "strike" | "aim";
  /** 0–100. */
  power: number;
  /** The crater's diameter in tiles, 4–180, or null: it follows Power. */
  size: number | null;
  walls: "steep" | "terraced";
  centre: "auto" | "bowl" | "peak" | "ring" | "flat";
  debris: "light" | "heavy";
  rays: boolean;
  /** The personality (Try another takes the next). */
  seed: number;
}

export interface CraterIntent {
  /** The impact's tile. */
  origin: number;
  /** Aim: the tile the impactor travels toward (a glancing blow). */
  end?: number;
}

export const CRATER_DEFAULTS: CraterSettings = { mode: "strike", power: 55, size: null, walls: "terraced", centre: "auto", debris: "heavy", rays: false, seed: 0 };

/** The diameter Power gives. */
export const naturalSize = (power: number) => Math.round(6 + 112 * (power / 100) ** 1.4);
export const autoCentre = (diameter: number): CraterSettings["centre"] => (diameter < 28 ? "bowl" : diameter < 68 ? "peak" : "ring");

export function validateCrater(s: CraterSettings, m: { W: number; H: number }, i: CraterIntent): void {
  if (
    !["strike", "aim"].includes(s.mode) ||
    !["steep", "terraced"].includes(s.walls) ||
    !["auto", "bowl", "peak", "ring", "flat"].includes(s.centre) ||
    !["light", "heavy"].includes(s.debris) ||
    typeof s.rays !== "boolean" ||
    !Number.isFinite(s.power) ||
    s.power < 0 ||
    s.power > 100 ||
    !Number.isInteger(s.seed) ||
    s.seed < 0 ||
    s.seed > 0xffffffff ||
    (s.size !== null && (!Number.isFinite(s.size) || s.size < 4 || s.size > 180))
  )
    throw Error("Invalid impact settings");
  if (!Number.isInteger(i.origin) || i.origin < 0 || i.origin >= m.W * m.H) throw Error("Strike on the map");
  if (s.mode === "aim" && (!Number.isInteger(i.end) || i.end! < 0 || i.end! >= m.W * m.H)) throw Error("Drag across the map to aim");
}

export interface Ray {
  dx: number;
  dy: number;
  start: number;
  length: number;
  width: number;
  bend: number;
  phase: number;
  seed: number;
  pits: { x: number; y: number; r: number }[];
}

// Low-frequency bends keep the streak radial overall without drawing a straight fence.
function rayBend(ray: Ray, t: number): number {
  return ray.bend * (Math.sin(t * Math.PI * 1.6 + ray.phase) - Math.sin(ray.phase)) + ray.width * 0.3 * Math.sin(t * Math.PI * 4 + ray.phase) * Math.sin(t * Math.PI);
}

function rayWidth(ray: Ray, t: number): number {
  return ray.width * (0.65 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (1 - t) ** 0.65 * (0.8 + 0.2 * Math.sin(t * 19 + ray.phase));
}

/** The crater as planned: where, how big and deep, its shape and its rays. */
export interface CraterAnatomy {
  x: number;
  y: number;
  W: number;
  H: number;
  edgeInset: number;
  radius: number;
  /** The ellipse's half-axes, along and across the travel. */
  a: number;
  b: number;
  angle: number;
  /** 0 (straight down) to 1 (a grazing blow). */
  glance: number;
  diameter: number;
  depth: number;
  rim: number;
  /** The ground level round the rim. */
  datum: number;
  floor: number;
  centre: CraterSettings["centre"];
  rays: Ray[];
}

export function craterAnatomy(m: { W: number; H: number; heights: Uint8Array }, s: CraterSettings, intent: CraterIntent): CraterAnatomy {
  validateCrater(s, m, intent);
  const x = intent.origin % m.W;
  const y = Math.floor(intent.origin / m.W);
  const diameter = s.size ?? naturalSize(s.power);
  const radius = diameter / 2;
  const ex = s.mode === "aim" ? intent.end! % m.W : x;
  const ey = s.mode === "aim" ? Math.floor(intent.end! / m.W) : y;
  const angle = Math.atan2(ey - y, ex - x);
  const glance = clamp(Math.hypot(ex - x, ey - y) / Math.max(12, diameter), 0, 1);
  const a = radius * (1 + 0.65 * glance);
  const b = radius / (1 + 0.18 * glance);
  const depth = clamp((1 + (12 * s.power) / 100) * Math.sqrt(naturalSize(s.power) / diameter) * (1 - 0.28 * glance), 1, 20);
  const rim = clamp(1 + depth * 0.23, 1, 5);
  const samples: number[] = [];
  for (let k = 0; k < 48; k++) {
    const t = (k * Math.PI) / 24;
    const u = Math.cos(t) * a;
    const v = Math.sin(t) * b;
    const xx = Math.round(x + u * Math.cos(angle) - v * Math.sin(angle));
    const yy = Math.round(y + u * Math.sin(angle) + v * Math.cos(angle));
    if (xx >= 0 && yy >= 0 && xx < m.W && yy < m.H) samples.push(m.heights[yy * m.W + xx]);
  }
  samples.sort((p, q) => p - q);
  const datum = samples.length ? samples[Math.floor(samples.length / 2)] : m.heights[intent.origin];
  const floor = Math.max(0, datum - depth);
  const rays: Ray[] = [];
  const heavy = s.debris === "heavy";
  const edgeInset = diameter < Math.min(m.W, m.H) * 0.65 ? Math.max(8, Math.min(m.W, m.H) * 0.0625) : 0;
  if (s.rays)
    for (let k = 0; k < 10; k++) {
      const t = angle + (k / 10) * Math.PI * 2 + (hash(s.seed, k) - 0.5) * 0.18;
      const down = (1 + Math.cos(t - angle)) * 0.5;
      const dx = Math.cos(t);
      const dy = Math.sin(t);
      const baseWidth = 1.7 + radius * 0.11;
      const width = baseWidth * (heavy ? 1.65 : 1);
      const start = 1.12 / Math.hypot(Math.cos(t - angle) / a, Math.sin(t - angle) / b);
      let length = start + radius * (1.15 + hash(s.seed, k + 30) * 1.3) * (1 + glance * down * 0.5);
      // Leave breathing room at the map boundary, except for map-scale impacts.
      if (edgeInset) {
        const margin = heavy ? edgeInset : Math.max(8, Math.min(m.W, m.H) * 0.08) + width * 2;
        const edge = Math.min(dx > 0 ? (m.W - 1 - margin - x) / dx : dx < 0 ? (margin - x) / dx : Infinity, dy > 0 ? (m.H - 1 - margin - y) / dy : dy < 0 ? (margin - y) / dy : Infinity);
        length = Math.min(length, edge);
      }
      if (length < start + 4) continue;
      const ray: Ray = { dx, dy, start, length, width, bend: baseWidth * (0.5 + hash(s.seed, k + 60)) * (heavy ? 0.8 : 1), phase: hash(s.seed, k + 90) * Math.PI * 2, seed: s.seed + k * 101, pits: [] };
      for (let d = start + 3, j = 0; d < length * 0.94; j++) {
        const f = (d - start) / (length - start);
        const offset = rayBend(ray, f) + (hash(ray.seed, j + 200) - 0.5) * rayWidth(ray, f) * 1.6;
        ray.pits.push({ x: x + dx * d - dy * offset, y: y + dy * d + dx * offset, r: (0.8 + hash(ray.seed, j + 300) * 1.1) * (heavy ? 1.55 : 1) * (1 - f * 0.45) });
        d += Math.max(4, radius * (heavy ? 0.12 : 0.15)) * (1 + hash(ray.seed, j + 400));
      }
      rays.push(ray);
    }
  return { x, y, W: m.W, H: m.H, edgeInset, radius, a, b, angle, glance, diameter, depth, rim, datum, floor, centre: s.centre === "auto" ? autoCentre(diameter) : s.centre, rays };
}

export interface CraterField {
  /** Distance from the centre in rims (1 at the rim). */
  r: number;
  theta: number;
  /** 1 downrange of a glancing blow, 0 behind it. */
  down: number;
  ray: boolean;
  rayHeight: number;
  secondary: number;
}

export function craterField(a: CraterAnatomy, s: CraterSettings, x: number, y: number): CraterField {
  const dx = x - a.x;
  const dy = y - a.y;
  const c = Math.cos(a.angle);
  const sn = Math.sin(a.angle);
  const u = (dx * c + dy * sn) / a.a;
  const v = (-dx * sn + dy * c) / a.b;
  const theta = Math.atan2(v, u);
  const phase = hash(s.seed, 71) * Math.PI * 2;
  const edge = 1 + 0.035 * Math.sin(theta * 3 + phase) + 0.022 * Math.sin(theta * 5 - phase * 0.6);
  const r = Math.hypot(u, v) / edge;
  const down = (1 + Math.cos(theta)) * 0.5;
  const heavy = s.debris === "heavy";
  const edgeFade = heavy && a.edgeInset ? smooth((Math.min(x, y, a.W - 1 - x, a.H - 1 - y) - a.edgeInset) / 12) : 1;
  let rayHeight = 0;
  let secondary = 0;
  if (s.rays && r > 1.15)
    for (const rayInfo of a.rays) {
      const along = dx * rayInfo.dx + dy * rayInfo.dy;
      const cross = -dx * rayInfo.dy + dy * rayInfo.dx;
      if (along < rayInfo.start || along >= rayInfo.length || Math.abs(cross) > rayInfo.width * 4) continue;
      const t = (along - rayInfo.start) / (rayInfo.length - rayInfo.start);
      const offset = cross - rayBend(rayInfo, t);
      const width = rayWidth(rayInfo, t);
      if (Math.abs(offset) < width) {
        // Uneven lobes, soft ragged edges and dwindling coverage survive integer-height quantization.
        const feather = smooth(1 - Math.abs(offset) / width);
        const grain = hash(rayInfo.seed, x + Math.imul(y, 65537));
        if (heavy) {
          // A coherent raised body remains readable at map scale; gaps and feathered margins stay irregular.
          const wave = Math.sin(t * 13 + rayInfo.phase);
          const lobes = smooth((wave + 0.8) / 1.25);
          const gaps = smooth((wave + 0.96) / 0.28);
          const fade = 1 - smooth((t - 0.45) / 0.55);
          const height = (1.2 + (1.25 * s.power) / 100) * feather * (0.7 + 0.3 * lobes) * gaps * fade * edgeFade;
          rayHeight = Math.max(rayHeight, Math.floor(height + 0.3 + grain * 0.4));
        } else {
          const lobes = smooth((Math.sin(t * 25 + rayInfo.phase) + 0.65) / 1.25);
          const density = feather * (0.12 + 0.88 * lobes) * (1 - smooth((t - 0.2) / 0.8));
          if (density > 0.18 + grain * 0.66) rayHeight = 1;
        }
      }
      for (const pit of rayInfo.pits) {
        const dist = (x - pit.x) ** 2 + (y - pit.y) ** 2;
        if (edgeFade > 0.5 && dist < pit.r ** 2) secondary = Math.max(secondary, dist < pit.r ** 2 * 0.35 ? 2 : 1);
      }
    }
  return { r, theta, down, ray: rayHeight > 0, rayHeight, secondary };
}

/** A crater planned a few rows at a time (`advance`), on its own copy of the map. `keep` adds ground
 *  it leaves alone (the land above the layer showing, an imported map's caves). */
export class ImpactPlan {
  readonly map: FullForceMap;
  readonly anatomy: CraterAnatomy;
  readonly keep: Uint8Array;
  readonly settings: CraterSettings;
  readonly intent: CraterIntent;
  readonly stats = { cut: 0, raised: 0, changed: 0, erased: 0, flattened: 0 };
  private row = 0;
  private done = false;

  constructor(
    readonly before: FullForceMap,
    settings: CraterSettings,
    intent: CraterIntent,
    extraKeep: Uint8Array | null = null,
  ) {
    this.settings = { ...settings };
    this.intent = { ...intent };
    this.anatomy = craterAnatomy(before, settings, intent);
    this.keep = startGround(before);
    if (this.keep[intent.origin]) throw Error(START_REASON);
    if (extraKeep) for (let i = 0; i < extraKeep.length; i++) if (extraKeep[i]) this.keep[i] = 1;
    // Existing emitter footprints retain their ground and exact source settings.
    for (const e of before.entities) if (EMITTERS[e.template]) for (const i of footprint(before, e)) this.keep[i] = 1;
    this.map = snapshotMap(before);
  }

  /** Plan `rows` more rows; true once the whole crater is planned. */
  advance(rows = 8): boolean {
    if (this.done) return true;
    const { W, H } = this.map;
    const s = this.settings;
    const a = this.anatomy;
    const phase = hash(s.seed, 80) * Math.PI * 2;
    const end = Math.min(H, this.row + Math.max(1, Math.floor(rows)));
    for (let y = this.row; y < end; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (this.keep[i]) continue;
        const f = craterField(a, s, x, y);
        const { r, theta, down } = f;
        const h = this.before.heights[i];
        let target = h;
        if (r < 1) {
          let wall = 0;
          if (s.walls === "steep") wall = smooth((r - 0.89) / 0.055);
          else {
            // Four short scarps separate three broad, level benches, even on mid-size craters.
            const shift = (hash(s.seed, 7) - 0.5) * 0.025;
            for (let step = 0; step < 4; step++) wall += smooth((r - (0.48 + step * 0.16 + shift)) / 0.025) / 4;
          }
          const curve = s.walls === "steep" ? 0.23 : 0.16;
          const t = a.centre === "bowl" ? curve * clamp(r / (s.walls === "steep" ? 0.89 : 0.48), 0, 1) ** 2 + (1 - curve) * wall : wall;
          let inside = a.floor + (a.datum - a.floor + a.rim) * t;
          if (a.centre === "peak") inside += a.depth * 0.69 * Math.max(0, 1 - r / 0.31) ** 1.25;
          if (a.centre === "ring") inside += a.depth * 0.55 * Math.exp(-(((r - 0.38) / 0.1) ** 2)) * (1 + 0.18 * Math.sin(theta * 7 + phase));
          // The newest bowl replaces prior relief; only the outermost lip rejoins its local ground.
          target = inside + (h - a.datum) * smooth((r - 0.84) / 0.16);
          if (s.walls === "terraced" && r > 0.54 && r < 0.93 && this.before.rockLayers[clamp(Math.round(target), 0, 22)] > 0.5) target = Math.ceil(target);
        } else {
          const rim = a.rim * Math.max(0, 1 - (r - 1) / 0.23);
          const heavy = s.debris === "heavy";
          const reach = heavy ? 2.65 : 1.48;
          const directional = 1 + a.glance * (down * 1.65 - 0.65);
          const hummock = 0.8 + 0.18 * Math.sin(theta * 5 + phase + (r - 1) * 3) + 0.13 * Math.sin(theta * 3 - phase);
          const skirt = (heavy ? 2.1 + a.depth * 0.36 : 0.9) * Math.exp(-(r - 1) * (heavy ? 2.15 : 7)) * smooth((reach - r) / 0.4) * directional * hummock;
          target = h + Math.max(rim, skirt);
          if (f.ray) target = Math.max(h + f.rayHeight, Math.round(target) + f.rayHeight);
          if (f.secondary) target = h - f.secondary;
        }
        // Fixed-point boundary keeps rounding independent of harmless floating-point tails.
        target = clamp(Math.round(Math.round(target * 4096) / 4096), 0, Math.min(22, this.map.maxHeight));
        this.map.heights[i] = target;
        if (target !== h) {
          this.stats.changed++;
          this.stats.cut += Math.max(0, h - target);
          this.stats.raised += Math.max(0, target - h);
        }
      }
    this.row = end;
    if (end < H) return false;
    this.finishObjects();
    this.done = true;
    return true;
  }

  get planned(): boolean {
    return this.done;
  }

  private finishObjects(): void {
    const a = this.anatomy;
    const s = this.settings;
    this.map.fallen = this.before.fallen.filter((e) => craterField(a, s, e.x, e.y).r > 1).map((e) => ({ ...e, z: this.map.heights[Math.floor(e.y) * this.map.W + Math.floor(e.x)] }));
    this.map.entities = this.map.entities.filter((e) => {
      const tile = e.y * this.map.W + e.x;
      if (this.keep[tile]) return true;
      const f = craterField(a, s, e.x, e.y);
      const plant = /^(Pine|Oak|Birch|Succulent|BlueberryBush)$/.test(e.template);
      if (plant && f.r < 0.93) {
        this.stats.erased++;
        return false;
      }
      if (plant && (f.r < (s.debris === "heavy" ? 1.85 : 1.4) || f.ray)) {
        if (e.template !== "BlueberryBush") {
          const d = Math.hypot(e.x - a.x, e.y - a.y) || 1;
          this.map.fallen = this.map.fallen.filter((g) => g.id !== e.id);
          this.map.fallen.push({ id: e.id, x: e.x + 0.5, y: e.y + 0.5, z: this.map.heights[tile], dx: (e.x - a.x) / d, dy: (e.y - a.y) / d, length: e.template === "Oak" ? 2.6 : 2 });
          e.components = { ...e.components, LivingNaturalResource: { IsDead: true } };
          delete e.raw;
          e.z = this.map.heights[tile];
          this.stats.flattened++;
          return true;
        }
        return false;
      }
      if (footprint(this.map, e).some((i) => this.map.heights[i] !== this.before.heights[i])) return false;
      return true;
    });
    const keptIds = new Set(this.map.entities.map((e) => e.id));
    this.map.fallen = this.map.fallen.filter((g) => keptIds.has(g.id));
  }
}

/** A whole impact at once (tests, Claude's step). */
export function impact(m: FullForceMap, s: CraterSettings, intent: CraterIntent, keep: Uint8Array | null = null): ImpactPlan {
  const p = new ImpactPlan(m, s, intent, keep);
  while (!p.advance(16)) {
    // planned a slice at a time
  }
  return p;
}
