// Carve, a force of nature (PLAN §20 D194, D199): a deliberately exaggerated fluvial force, not the
// game's water, which never erodes. A head moves 1.35 tiles every two steps, favouring its
// momentum, the way down and the ground it can overcome (Aim steers toward its end point; Defy
// gravity lowers the way ahead to a floor that never rises). Behind it a brush reveals whole-level
// cuts, then the banks mature into steep walls or wide terraces; hard rock layers slow it and
// leave benches. Power sets its depth, its reach and how long it runs; Width (following Power, or
// set) concentrates or spreads that work. What it cuts is carried and laid down as a fan at its
// end. Each tile changes in one direction only, no step leaves a new one-tile pit or spike, and
// the start's ground is nature's to carve too (the editor carries the start to level ground, D257).
//
// Bends vary (D199): a bend's outer bank is cut wider and deeper, its inner bank keeps shallow shelves,
// and the straights between bends narrow, so even at the highest Wander it is never a uniform tube. At
// high Wander and Power one narrow neck can be cut through, and the sealed bend becomes an oxbow lake
// that keeps the water the game settled on it before its mouths closed. Keep river leaves a real water
// source group at the origin, its strength following the river's Width (D199, D314); Dry canyon leaves
// none. The water stays as it was while the river cuts (D321, item 30); the map's water flows on from it
// once the land is final.
//
// Planned in Rust (rust/forces, PLAN §20 D381; ../rust/bridge.ts), from investigation/carve (PR #47); the
// TypeScript planner it replaced is tag `ts-forces-final`. The result is stored literally (force.ts), so
// replay never runs it.

import type { SourcesRule } from "../clear";
import { modelOf } from "../../features/build";
import type { EntitySpec } from "../../format/entities";
import { warmState, type WarmState } from "../../sim/preview";
import { WaterSim, type RetainedWater, type WaterModel } from "../../sim/water";
import { protectedGround, type ForceHead, type ForceMap, type FullForceMap, type Lane } from "../force";
import type { CarveRecords } from "../rust/bridge";
import { planInRust } from "../rust/bridge";
import { BANKS_MAX, DEPTH_MAX, DEPTH_MIN, forceSettingsProblem } from "../settings";
import type { Oxbow } from "./oxbow";

export interface CarveSettings {
  mode: "unleash" | "aim";
  /** Sources (D474): they ride the ground, or the force clears them (clear.ts); absent, they ride. */
  sources?: SourcesRule;
  /** 0 (a creek) to 100 (a catastrophe). */
  power: number;
  /** 0 (straight) to 100 (winding). */
  wander?: number;
  /** Nominal width in tiles, 2–24; null follows Power. */
  width?: number | null;
  /** How deep it cuts at most, in levels below the land it runs through, 1–12 (D226): a wide,
   *  shallow river at high Power; null (or absent) follows Power. */
  depth?: number | null;
  /** The personality seed (Try another path takes the next one). */
  seed?: number;
  walls: "steep" | "wide";
  defyGravity: boolean;
  /** Dry canyon: no source is left at the origin. */
  dry: boolean;
  /** Rock layers (hard bands every few levels). */
  layers: boolean;
  /** The Floor (D321, item 40, floor.ts): it never cuts below this level; absent, 1. */
  floor?: number;
  /** River depth (D321, item 17, river.ts): its water never deeper than this many levels over the
   *  ground it cut, 1 up to the ceiling; null or absent, Off (as deep as it cuts). The editor's row
   *  gives 2 unless set. */
  riverDepth?: number | null;
  /** Banks (item 18, river.ts): about how many tiles of flat land at the waterline on each side before
   *  the walls, 0 (none) to 10; absent, none. */
  banks?: number | null;
}

/** The most tiles of banks a carve leaves (item 18; settings.ts). */
export { BANKS_MAX };

export interface CarveIntent {
  origin: number;
  end?: number;
  /** Its drawn path (D321, item 41; D312's Shift+click points before it): tiles between the origin and the end,
   *  in order; the carve steers along a smooth curve through them (course.ts), with its own wander and
   *  physics. */
  via?: number[];
}

/** The most points of a drawn path a carve takes between its ends (D321, item 41; 32 before). */
export const MAX_PATH_POINTS = 128;

export const DEFAULTS: CarveSettings = { mode: "unleash", power: 65, wander: 35, width: null, seed: 0, walls: "steep", defyGravity: false, dry: false, layers: true };

/** The strength of the source a carve keeps (D199): following its nominal Width, linked to Power
 *  when Width follows it; 0.5 to 8 water a second. */
/** Carve's Depth, in levels below the land (D226; settings.ts). */
export { DEPTH_MAX, DEPTH_MIN };

export const sourceStrength = (power: number, width?: number | null) =>
  Math.round((0.5 + 7.5 * (width == null ? power / 100 : Math.max(0, Math.min(1, (width - 2.8) / 10)))) * 1e6) / 1e6;

export interface Metrics {
  cut: number;
  deposited: number;
  exported: number;
  suspended: number;
  bankCuts: number;
  bendCuts: number;
  steps: number;
  stable: boolean;
  distance: number;
  reason: string;
  splits: number;
  waterfalls: number;
  rapids: number;
  oxbows: number;
}

export interface Station {
  x: number;
  y: number;
  bed: number;
  width: number;
  dx: number;
  dy: number;
  /** Curvature over the last six stations, -1 to 1 (positive turns left). */
  bend: number;
  lanes: Lane[];
}


/** Terrain-derived, coherent horizontal beds (a hash of the heights: the same map, the same rock). */
export function mapSeed(m: Pick<ForceMap, "W" | "H" | "heights">): number {
  let s = 2166136261;
  for (const h of m.heights) s = Math.imul(s ^ h, 16777619);
  return (s ^ m.W ^ Math.imul(m.H, 97)) >>> 0;
}

export function hardness(level: number, layers: boolean, seed = 0): number {
  return layers && (level + (seed % 4)) % 4 === 0 ? 1 : 0;
}


/** A carve's own options, beyond its settings: the ground it may not touch (the layer cut, caves),
 *  and the id of the source it keeps. */
export interface CarveOptions {
  keep?: Uint8Array | null;
  sourceId?: string;
  /** Unleash (D239): the placed source whose own water becomes the river. It stays where it is (a
   *  dry carve adds no other), riding its ground if the cut reaches it. */
  unleashed?: string;
  /** Its water is badwater: the preview's ribbon is too. */
  bad?: boolean;
}

/** A carve: planned whole when it starts (in Rust, every step of it recorded), then run a step at a time
 *  from that record, so the editor, its playback (play.ts) and Claude's step see it cut as before. Throws
 *  why it can't start (its settings and points, or nature's own refusal: uphill without Defy gravity, the
 *  map's floor). */
export class CarveRun {
  readonly map: ForceMap;
  readonly original: Uint8Array;
  readonly initialWater: Float64Array;
  readonly keep: Uint8Array;
  /** The map just before a cut-off bend's mouths silted shut (its sediment taken out), once the carve
   *  has run to its end: the oxbow lake keeps the water the game settles on it. */
  /** The working area (D254): how many levels each tile may change, the area's depth there, or null
   *  for none. Set by `planForce` (start.ts); its showing eases each tile by it, as its keep does. */
  ease: Uint8Array | null = null;
  closure: ForceMap | null = null;
  /** The lake its sealed oxbow keeps (null: none), once it has run to its end: the water the game
   *  settled on the map just before the mouths closed, on the basin's tiles, with their floors now. */
  retained: RetainedWater | null = null;
  /** The oxbows cut off so far. */
  oxbows: Oxbow[] = [];
  /** Its course so far, a station each 1.35 tiles. */
  path: Station[] = [];
  readonly seed: number;
  readonly intent: CarveIntent;
  readonly sourceId: string;
  /** The placed source it unleashes (D239), or null. */
  readonly unleashedId: string | null;
  /** Its water is badwater (an unleashed badwater source). */
  readonly badwater: boolean;
  readonly settings: CarveSettings;
  readonly metrics: Metrics;
  head: ForceHead;
  /** The step each object the cut took went at (the editor's playback shows it go then, D321). */
  readonly removedAt = new Map<string, number>();
  /** Wider than its Power's own river: the deepest it cuts anywhere, its banks included (D361 (3)). */
  readonly strengthDepth: number | null;
  /** Keep river's source group (D314): the anchor at the origin first, its tile, its share. */
  readonly group: { id: string; tile: number; strength: number }[];
  /** The whole carve as Rust planned it (play.ts shows it from this). */
  readonly records: CarveRecords;
  private readonly model: WaterModel;
  private readonly initialContamination: Float64Array;
  /** Steps run so far. */
  private at = 0;

  constructor(input: ForceMap, settings: CarveSettings, intent: CarveIntent, options: CarveOptions = {}) {
    settings = this.settings = { ...settings };
    settings.wander ??= 35;
    settings.width ??= null;
    settings.seed ??= 0;
    const N = input.W * input.H;
    if (input.heights.length !== N || !Number.isInteger(intent.origin) || intent.origin < 0 || intent.origin >= N) throw new Error("the carve's origin is off the map");
    // (its settings as its row could set them, settings.ts)
    const why = forceSettingsProblem("carve", settings as unknown as Record<string, unknown>);
    if (why) throw new Error(why);
    if (settings.mode === "aim" && (!Number.isInteger(intent.end) || intent.end! < 0 || intent.end! >= N || intent.end === intent.origin)) throw new Error("Choose a different end point");
    if (intent.via && (settings.mode !== "aim" || intent.via.length > MAX_PATH_POINTS || !intent.via.every((v) => Number.isInteger(v) && v >= 0 && v < N))) throw new Error("A drawn path needs an aimed carve, on the map");
    this.keep = protectedGround(input, options.keep ?? null);
    if (this.keep[intent.origin] || (settings.mode === "aim" && this.keep[intent.end!]) || intent.via?.some((v) => this.keep[v])) throw new Error("Choose a point on the land showing");
    this.intent = { ...intent };
    this.seed = mapSeed(input);
    let sourceId = options.sourceId ?? "carve-source-" + intent.origin + "-" + this.seed.toString(16);
    while (input.entities.some((e) => e.id === sourceId)) sourceId += "-next";
    this.sourceId = sourceId;
    this.unleashedId = options.unleashed ?? null;
    this.badwater = !!options.bad;
    const map: FullForceMap = { ...input, rockLayers: input.rockLayers ?? [], lava: input.lava ?? new Uint32Array(N), fallen: input.fallen ?? [] };
    const r = planInRust({ verb: "carve", map, settings, intent: this.intent, keep: this.keep, options: { sourceId: options.sourceId, unleashed: this.unleashedId, bad: this.badwater } });
    this.records = r;
    this.initialWater = input.water.depth.slice();
    this.initialContamination = input.water.contamination.slice();
    this.original = input.heights.slice();
    this.model = modelOf(input);
    this.map = { ...input, ...(input.lava ? { lava: input.lava.slice() } : {}), heights: input.heights.slice(), entities: r.initialEntities, water: { depth: input.water.depth.slice(), contamination: input.water.contamination.slice() } };
    this.metrics = { ...r.stepMetrics[0] };
    this.head = { ...r.heads[0] };
    this.strengthDepth = r.strengthDepth;
    this.group = r.group;
  }

  get done(): boolean {
    return this.metrics.stable;
  }
  get reason(): string {
    return this.metrics.reason;
  }
  get steps(): number {
    return this.metrics.steps;
  }

  /** The water as it was, on the ground as it stands: the editor's water carries on from it when the
   *  carve is kept (D321, item 30: it updates once the land is final, as for any edit). */
  liveWater(): WarmState {
    const model = { ...this.model, floor: Float64Array.from(this.map.heights) };
    const sim = new WaterSim(model, { depth: this.initialWater, contamination: this.initialContamination });
    const state = warmState(model, sim);
    // (its arrays are copied: the Rust simulation is done)
    sim.dispose();
    return state;
  }

  /** The source it keeps, as it stands now (null for a dry canyon). */
  get source(): EntitySpec | null {
    return this.map.entities.find((e) => e.id === this.sourceId) ?? null;
  }

  /** One step: the tiles it changed (their new levels are on the map), the objects it took gone, its own
   *  sources and an unleashed one riding the ground cut under them. */
  step(): number[] {
    const r = this.records;
    if (this.at >= r.total) return [];
    const k = ++this.at;
    const m = this.map;
    const c = r.rawChanges[k];
    const changed: number[] = [];
    for (let t = 0; t < c.length; t += 2) {
      const i = c[t];
      m.heights[i] = c[t + 1];
      if (m.lava) m.lava[i] &= (1 << m.heights[i]) - 1;
      changed.push(i);
    }
    let gone = false;
    for (const [id, s] of r.removedAt)
      if (s === k) {
        this.removedAt.set(id, s);
        gone = true;
      }
    const moves = r.stepObjectChanges.filter((o) => o.step === k);
    if (gone || moves.length)
      m.entities = m.entities
        .filter((e) => this.removedAt.get(e.id) !== k)
        .map((e) => {
          const o = moves.find((q) => q.id === e.id);
          return o ? { ...e, x: o.x, y: o.y, z: o.z } : e;
        });
    Object.assign(this.metrics, r.stepMetrics[k]);
    this.head = { ...r.heads[k], ...(r.heads[k].lanes ? { lanes: r.heads[k].lanes!.map((l) => ({ ...l })) } : {}) };
    this.path = r.path.slice(0, r.lengths[k]);
    this.oxbows = r.oxbows.filter((o) => o.step <= k);
    if (k === r.total) {
      // its end: the map as planned (the same land), its oxbow's closure and lake
      m.heights.set(r.map.heights);
      if (m.lava) m.lava.set(r.map.lava);
      m.entities = r.map.entities;
      Object.assign(this.metrics, r.metrics);
      this.closure = r.closure;
      this.retained = r.retained;
      this.oxbows = r.oxbows;
    }
    return changed;
  }

  /** Runs it to its end. */
  finish(): this {
    while (!this.done && this.at < this.records.total) this.step();
    return this;
  }
}
