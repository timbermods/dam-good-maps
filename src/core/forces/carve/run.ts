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
// Bends vary (D199): measured over six stations, a bend's outer bank is cut wider and up to two
// levels deeper, its inner bank keeps shallow shelves, and the straights between bends narrow, so
// even at the highest Wander it is never a uniform tube. At high Wander and Power one narrow neck
// can be cut through: a route-only look-ahead reserves two sediment bars across the old bend's
// mouths before either is exposed, the crescent between them scours while the bars hold, and the
// sealed bend becomes an oxbow lake (oxbow.ts; its water, water.ts).
//
// Keep river leaves a real water source at the origin, its strength following the river's Width
// (D199); Dry canyon leaves none. The water stays as it was while the river cuts (D321, item 30:
// nothing changes before the force reaches it; the head's muddy surge is the effects'): the map's
// water flows on from it once the land is final, and what the map keeps is always the game's
// settled result, worked out after the carve.
//
// Ported from investigation/carve/engine.ts (PR #47), kept to its structure so a later round of the
// prototype ports across as a diff. The result is stored literally (force.ts), so replay never
// runs this code.

import * as portable from "../../math/portable";
import { modelOf } from "../../features/build";
import { PLACED } from "../../features/edits";
import { waterSource, type EntitySpec } from "../../format/entities";
import { guidFrom, hash32 } from "../../math/hash";
import { placeSourceGroup } from "../../water/sourceGroups";
import { warmState, type WarmState } from "../../sim/preview";
import { WaterSim, type WaterModel } from "../../sim/water";
import { entityTiles, protectedGround, type ForceHead, type ForceMap, type Lane } from "../force";
import { naturalWidth, RiverCharacter } from "./character";
import { strength } from "../strength";
import { angleDelta, Course, HEADING_LIMIT, segmentsCross } from "./course";
import { findNeck, mouthFloors, type Oxbow } from "./oxbow";
import { hardAt } from "../rock";
import { forceFloor } from "../floor";
import { BANKS_MAX, DEPTH_MAX, DEPTH_MIN, forceSettingsProblem } from "../settings";
import { shapeRiver } from "./river";
import { clamp } from "../random";

export interface CarveSettings {
  mode: "unleash" | "aim";
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

export class CarveRun {
  readonly map: ForceMap;
  readonly original: Uint8Array;
  readonly initialWater: Float64Array;
  readonly keep: Uint8Array;
  /** The map just before a cut-off bend's mouths silted shut (its sediment taken out): the oxbow
   *  lake keeps the water the game settles on it (water.ts). */
  closure: ForceMap | null = null;
  /** Whole levels of sediment laid in each tile (an oxbow's two mouth bars). */
  readonly sediment: Uint8Array;
  private barFloor: Uint8Array;
  private planned: Oxbow | null = null;
  readonly sign: Int8Array;
  readonly target: Uint8Array;
  readonly wear: Float64Array;
  readonly character: RiverCharacter;
  readonly course: Course;
  readonly oxbows: Oxbow[] = [];
  readonly path: Station[] = [];
  readonly seed: number;
  readonly intent: CarveIntent;
  readonly sourceId: string;
  /** The placed source it unleashes (D239), or null. */
  private readonly unleashed: string | null;
  get unleashedId(): string | null {
    return this.unleashed;
  }
  /** Its water is badwater (an unleashed badwater source). */
  get badwater(): boolean {
    return this.bad;
  }
  private readonly bad: boolean;
  readonly settings: CarveSettings;
  readonly metrics: Metrics = { cut: 0, deposited: 0, exported: 0, suspended: 0, bankCuts: 0, bendCuts: 0, steps: 0, stable: false, distance: 0, reason: "", splits: 0, waterfalls: 0, rapids: 0, oxbows: 0 };
  head: ForceHead;
  private readonly model: WaterModel;
  private readonly initialContamination: Float64Array;
  /** The step each object the cut took went at (the editor's playback shows it go then, D321). */
  readonly removedAt = new Map<string, number>();
  /** The objects on each tile (their ids), for the ones a cut takes. */
  private occupants: Map<number, string[]> | null = null;
  /** The course's segments by 8-tile cell, for the crossing test (segments whose end is at least
   *  two stations back). */
  private cells = new Map<number, number[]>();
  private cellsUpTo = 0;
  private active = new Set<number>();
  private channel = new Uint8Array();
  private visited = new Uint16Array();
  private born = new Uint16Array();
  private heading = 0;
  /** Wider than its Power's own river: the deepest it cuts anywhere, its banks included (D361 (3)). */
  strengthDepth: number | null = null;
  private bed = 0;
  private energy = 0;
  private splitSeen = new Set<string>();
  private ended = false;
  private tail = 0;
  private quiet = 0;
  private depositQueue: number[] = [];
  private depositDone = false;
  /** A step's changes (cleared after each). */
  private delta: Int8Array | null = null;

  /** Depth set by hand (levels below the land), or null: it follows Power. */
  private readonly depth: number | null;
  /** The Floor: it never cuts below it, running shallower there instead (floor.ts). */
  private readonly floor: number;

  /** `planning`: a route-only look-ahead (it moves the head and finds the cut-off, never the land). */
  constructor(input: ForceMap, settings: CarveSettings, intent: CarveIntent, options: CarveOptions = {}, private readonly planning = false) {
    settings = this.settings = { ...settings };
    settings.wander ??= 35;
    settings.width ??= null;
    settings.seed ??= 0;
    const N = input.W * input.H;
    this.sediment = new Uint8Array(N);
    this.barFloor = new Uint8Array(N);
    if (input.heights.length !== N || !Number.isInteger(intent.origin) || intent.origin < 0 || intent.origin >= N) throw new Error("the carve's origin is off the map");
    // (its settings as its row could set them, settings.ts)
    const why = forceSettingsProblem("carve", settings as unknown as Record<string, unknown>);
    if (why) throw new Error(why);
    if (settings.mode === "aim" && (!Number.isInteger(intent.end) || intent.end! < 0 || intent.end! >= N || intent.end === intent.origin)) throw new Error("Choose a different end point");
    if (intent.via && (settings.mode !== "aim" || intent.via.length > MAX_PATH_POINTS || !intent.via.every((v) => Number.isInteger(v) && v >= 0 && v < N))) throw new Error("A drawn path needs an aimed carve, on the map");
    // Size and Power (D361 (3)): wider than Power's own river, it cuts in proportion: no deeper than
    // its strength's share of the deepest a carve goes (12 levels), at least 2
    const k = strength(settings.power, settings.width, naturalWidth(settings.power));
    const cap = k < 1 ? Math.max(2, Math.round(12 * k)) : null;
    this.depth = cap === null ? (settings.depth ?? null) : Math.min(cap, settings.depth ?? cap);
    this.strengthDepth = cap;
    this.floor = forceFloor(settings);
    this.initialWater = input.water.depth.slice();
    this.initialContamination = input.water.contamination.slice();
    this.intent = { ...intent };
    this.seed = mapSeed(input);
    this.character = new RiverCharacter(input, settings, this.seed, intent.origin, intent.end);
    let sourceId = options.sourceId ?? "carve-source-" + intent.origin + "-" + this.seed.toString(16);
    while (input.entities.some((e) => e.id === sourceId)) sourceId += "-next";
    this.sourceId = sourceId;
    this.unleashed = options.unleashed ?? null;
    this.bad = !!options.bad;
    this.original = input.heights.slice();
    this.keep = protectedGround(input, options.keep ?? null);
    this.course = new Course(input, settings, intent, this.character);
    if (this.keep[intent.origin] || (settings.mode === "aim" && this.keep[intent.end!]) || intent.via?.some((v) => this.keep[v])) throw new Error("Choose a point on the land showing");
    this.map = { ...input, ...(input.lava ? { lava: input.lava.slice() } : {}), heights: input.heights.slice(), entities: input.entities.slice(), water: { depth: input.water.depth.slice(), contamination: input.water.contamination.slice() } };
    this.model = modelOf(input);
    this.target = input.heights.slice();
    this.sign = new Int8Array(N);
    this.wear = new Float64Array(N);
    this.channel = new Uint8Array(N);
    this.visited = new Uint16Array(N);
    this.born = new Uint16Array(N);
    const x = intent.origin % input.W;
    const y = Math.floor(intent.origin / input.W);
    const p = settings.power / 100;
    this.bed = Math.max(Math.min(2, input.heights[intent.origin]), input.heights[intent.origin] - Math.round(Math.min(12, 1 + 6 * p * this.character.intensity)));
    this.energy = Math.max(input.W, input.H) * (1.2 + 4 * p) * (1 + 0.6 * this.character.wander);
    this.heading = this.course.guide(x, y);
    this.head = { x, y, z: input.heights[intent.origin], dx: portable.cos(this.heading), dy: portable.sin(this.heading), width: this.character.width(0), event: "surge", cut: 0 };
    if (settings.mode === "aim" && !settings.defyGravity && input.heights[intent.end!] > input.heights[intent.origin]) {
      throw new Error("The end point is uphill of the start");
    }
    this.stamp(x, y);
    if (!planning && this.character.wander >= 0.85 && (settings.power / 100) * this.character.intensity >= 0.6) {
      // Route-only look-ahead reserves the two depositional mouths before either is exposed. Actual
      // work still advances locally, in acknowledged steps.
      const plan = new CarveRun(input, settings, intent, { keep: options.keep ?? null, sourceId: this.sourceId }, true);
      while (!plan.ended && !plan.oxbows.length) {
        plan.metrics.steps += 2;
        plan.advanceHead();
      }
      this.planned = plan.oxbows[0] ?? null;
      if (this.planned) this.barFloor = mouthFloors(this.planned, input.W, input.H, this.original);
    }
    if (!settings.dry) {
      // Keep river's source (D314): a group, a row across the flow (fewer where cramped), the strength
      // shared; the anchor at the origin keeps the carve's source id, the others' ids derive from it
      const strength = sourceStrength(settings.power, settings.width);
      const W = input.W;
      const occupied = new Uint8Array(N);
      for (const e of input.entities) for (const i of entityTiles(W, input.H, e)) occupied[i] = 1;
      const g = placeSourceGroup({ kind: "water", x, y, strength, seed: hash32(this.seed, intent.origin), flow: [this.head.dx, this.head.dy] }, { W, H: input.H, heights: input.heights, occupied });
      const anchor = g.sources.find((s) => s.x === x && s.y === y);
      const row = anchor && !g.refused ? g.sources : [{ x, y, z: input.heights[intent.origin], strength, tiles: [intent.origin] }];
      this.group = row
        .map((s) => ({ id: s.x === x && s.y === y ? this.sourceId : guidFrom(this.sourceId, "carve-source", s.y * W + s.x), tile: s.y * W + s.x, strength: s.strength }))
        .sort((a, b) => (a.id === this.sourceId ? -1 : b.id === this.sourceId ? 1 : 0));
      const ids = new Set(this.group.map((s) => s.id));
      const placed = this.group.map((s) => waterSource({ id: s.id, owner: PLACED, x: s.tile % W, y: Math.floor(s.tile / W), z: this.map.heights[s.tile], strength: s.strength }));
      this.map.entities = [...this.map.entities.filter((e) => !ids.has(e.id)), ...placed];
    }
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
  /** Keep river's source group (D314): the anchor at the origin first, its tile, its share. */
  group: { id: string; tile: number; strength: number }[] = [];
  /** The water as it was, on the ground as it stands: the editor's water carries on from it when the
   *  carve is kept (D321, item 30: it updates once the land is final, as for any edit). */
  liveWater(): WarmState {
    const model = { ...this.model, floor: Float64Array.from(this.map.heights) };
    const sim = new WaterSim(model, { depth: this.initialWater, contamination: this.initialContamination });
    return warmState(model, sim);
  }

  /** The source it keeps, as it stands now (null for a dry canyon). */
  get source(): EntitySpec | null {
    return this.map.entities.find((e) => e.id === this.sourceId) ?? null;
  }

  /** A level's hardness: a hard bed of the map's rock, or fresh volcanic rock on `tile` (Erupt's,
   *  rock.ts: hard for Carve, D206). */
  private hard(level: number, tile?: number): number {
    if (this.settings.layers && tile !== undefined && hardAt(this.map, tile, level)) return 1;
    return this.settings.layers ? (this.map.rockLayers?.[level] ?? hardness(level, true, this.seed)) : 0;
  }

  private at(x: number, y: number): number {
    return clamp(Math.round(y), 0, this.map.H - 1) * this.map.W + clamp(Math.round(x), 0, this.map.W - 1);
  }

  private stamp(x: number, y: number) {
    const { W, H } = this.map;
    const p = this.settings.power / 100;
    const raw = this.original[this.at(x, y)];
    const incision = Math.round(Math.min(12, 1 + 6 * p * this.character.intensity));
    const sourceBed = Math.max(Math.min(2, this.original[this.intent.origin]), this.original[this.intent.origin] - incision);
    const drop = this.character.grade(this.metrics.distance, this.settings.power);
    const oldBed = this.bed;
    const grade = Math.max(0, sourceBed - drop);
    this.bed = Math.min(this.bed, grade, Math.max(0, Math.max(Math.min(2, raw), raw - incision) - drop));
    const reachWidth = this.character.width(this.metrics.distance);
    const dx = portable.cos(this.heading);
    const dy = portable.sin(this.heading);
    // Curvature over a reach, not a single candidate turn: coherent cut banks and inner shelves
    // survive at maximum Wander without speckled tile noise.
    const prior = this.path[Math.max(0, this.path.length - 6)];
    const bend = prior ? clamp(angleDelta(this.heading, portable.atan2(prior.dy, prior.dx)) / 0.9, -1, 1) : 0;
    const width = reachWidth * (1 - 0.22 * this.character.wander + 0.5 * Math.abs(bend));
    const { lanes, knob } = this.character.lanes(x, y, dx, dy, width);
    let event: ForceHead["event"] = "surge";
    if (oldBed - this.bed >= 2) {
      this.metrics.waterfalls++;
      event = "waterfall";
    } else if (this.bed < oldBed || width < this.character.radius * 0.8) {
      this.metrics.rapids++;
      event = "rapids";
    }
    if (knob) {
      const key = knob.x + "," + knob.y;
      if (!this.splitSeen.has(key)) {
        this.splitSeen.add(key);
        this.metrics.splits++;
      }
      event = "split";
    }

    // Positive curvature turns left; its faster outer bank lies to the right.
    for (const lane of lanes) {
      lane.x += dy * reachWidth * bend * 0.35;
      lane.y -= dx * reachWidth * bend * 0.35;
    }
    this.path.push({ x, y, bed: this.bed, width, dx, dy, bend, lanes });
    // (a look-ahead only moves the head: it never works the land)
    for (const lane of this.planning ? [] : lanes) {
      const depth = Math.max(1, raw - this.bed);
      const shoulder = this.settings.walls === "wide" ? depth * 0.9 : Math.min(2, depth * 0.15);
      const radius = lane.width + shoulder + 1;
      for (let yy = Math.max(0, Math.floor(lane.y - radius)); yy <= Math.min(H - 1, Math.ceil(lane.y + radius)); yy++)
        for (let xx = Math.max(0, Math.floor(lane.x - radius)); xx <= Math.min(W - 1, Math.ceil(lane.x + radius)); xx++) {
          const i = yy * W + xx;
          if (this.keep[i] || this.character.rock[i] || this.sign[i] > 0) continue;
          const d = portable.hypot(xx - lane.x, yy - lane.y);
          const slope = this.settings.walls === "wide" ? 1 : 4;
          const outside = ((xx - x) * dy - (yy - y) * dx) * Math.sign(bend);
          const innerShelf = Math.abs(bend) > 0.3 && outside < -reachWidth * 0.2 ? Math.min(2, Math.ceil((-outside / reachWidth - 0.2) * Math.abs(bend) * 2)) : 0;
          const scour = Math.min(2, Math.floor(Math.max(0, outside / reachWidth - 0.15) * Math.abs(bend) * 3));
          let t = Math.max(0, this.bed - scour) + innerShelf + Math.max(0, Math.ceil((d - lane.width) * slope));
          if (d > lane.width && this.hard(t, i) > 0.5) t++;
          const work = p * this.character.intensity;
          if (work < 0.45) t = Math.max(t, this.original[i] - Math.max(1, Math.round(1 + 6 * work)));
          // Depth set by hand: never deeper than that below the land it runs through (D226)
          if (this.depth !== null) t = Math.max(t, this.original[i] - this.depth);
          // the Floor (D321, item 40): shallower there, never lower
          t = Math.max(t, this.floor);
          if (t < this.target[i]) {
            this.target[i] = t;
            this.active.add(i);
            if (!this.born[i]) this.born[i] = this.metrics.steps + 1;
          }
          if (d <= lane.width * 0.72) this.channel[i] = 1;
        }
    }
    const i = this.at(x, y);
    this.visited[i]++;
    this.head = { x, y, z: this.map.heights[i] + 0.4, dx, dy, width, event, cut: 0, lanes };
  }

  private cutAt(x: number, y: number, floor: number, radius: number) {
    const { W, H } = this.map;
    for (let yy = Math.max(0, Math.floor(y - radius - 1)); yy <= Math.min(H - 1, Math.ceil(y + radius + 1)); yy++)
      for (let xx = Math.max(0, Math.floor(x - radius - 1)); xx <= Math.min(W - 1, Math.ceil(x + radius + 1)); xx++) {
        const i = yy * W + xx;
        const d = portable.hypot(xx - x, yy - y);
        let t = floor + Math.ceil(Math.max(0, d - radius) * 4);
        if (this.depth !== null) t = Math.max(t, this.original[i] - this.depth);
        t = Math.max(t, this.floor);
        if (this.keep[i] || this.character.rock[i] || this.sign[i] > 0 || t >= this.target[i]) continue;
        this.target[i] = Math.max(0, t);
        this.active.add(i);
        if (!this.born[i]) this.born[i] = this.metrics.steps + 1;
        if (d < radius * 0.8) this.channel[i] = 1;
      }
  }

  private tryCutoff() {
    if (this.character.wander < 0.85 || this.oxbows.length || (this.settings.power / 100) * this.character.intensity < 0.6) return;
    const cut = this.planning ? findNeck(this.path, this.metrics.steps) : this.planned?.end === this.path.length - 1 ? this.planned : null;
    if (!cut) return;
    const width = Math.min(this.path[cut.start].width, this.head.width);
    for (const p of cut.neck) {
      if (p.x < width + 2 || p.y < width + 2 || p.x > this.map.W - width - 3 || p.y > this.map.H - width - 3) return;
      for (let dy = -Math.ceil(width); dy <= Math.ceil(width); dy++)
        for (let dx = -Math.ceil(width); dx <= Math.ceil(width); dx++) if (this.keep[this.at(p.x + dx, p.y + dy)] || this.character.rock[this.at(p.x + dx, p.y + dy)]) return;
    }
    if (!this.planning) {
      // The river existed before its mouths silted shut. Keep a deterministic pre-closure bed for
      // the game's water settle, not the preview's depths.
      const heights = this.map.heights.map((h, i) => h - this.sediment[i]);
      this.closure = { ...this.map, heights, entities: this.map.entities.slice() };
      for (const p of cut.neck) this.cutAt(p.x, p.y, cut.floor, width * 0.75);
      // Scour the crescent below both sediment sills; the reserved bar surface holds while its
      // substrate is exchanged for carried material.
      for (const p of cut.pool) this.cutAt(p.x, p.y, Math.max(0, cut.floor - 1), Math.max(1.2, width * 0.72));
      for (const b of cut.bars) this.cutAt(b.x, b.y, cut.floor, 1.5);
    }
    this.bed = Math.min(this.bed, cut.floor);
    this.oxbows.push(cut);
    this.metrics.oxbows++;
    this.head.event = "oxbow";
  }

  private crossesCourse(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    // (the course's segments but its last, found by the cells round a → b: the same answer as trying
    // every one, without the cost growing with the course)
    const path = this.path;
    for (; this.cellsUpTo + 2 < path.length; this.cellsUpTo++) {
      const c = path[this.cellsUpTo];
      const d = path[this.cellsUpTo + 1];
      for (let cy = Math.floor(Math.min(c.y, d.y) / 8); cy <= Math.floor(Math.max(c.y, d.y) / 8); cy++)
        for (let cx = Math.floor(Math.min(c.x, d.x) / 8); cx <= Math.floor(Math.max(c.x, d.x) / 8); cx++) {
          const key = cy * 4096 + cx;
          const list = this.cells.get(key);
          if (list) list.push(this.cellsUpTo);
          else this.cells.set(key, [this.cellsUpTo]);
        }
    }
    const seen = new Set<number>();
    for (let cy = Math.floor(Math.min(a.y, b.y) / 8); cy <= Math.floor(Math.max(a.y, b.y) / 8); cy++)
      for (let cx = Math.floor(Math.min(a.x, b.x) / 8); cx <= Math.floor(Math.max(a.x, b.x) / 8); cx++)
        for (const k of this.cells.get(cy * 4096 + cx) ?? []) {
          if (seen.has(k)) continue;
          seen.add(k);
          if (segmentsCross(a, b, path[k], path[k + 1])) return true;
        }
    return this.oxbows.some((o) =>
      o.neck.some((c, k, list) => k + 1 < list.length && portable.hypot(a.x - c.x, a.y - c.y) > 1e-6 && portable.hypot(a.x - list[k + 1].x, a.y - list[k + 1].y) > 1e-6 && segmentsCross(a, b, c, list[k + 1])),
    );
  }

  private advanceHead() {
    const { W, H } = this.map;
    const { x, y } = this.head;
    const p = this.settings.power / 100;
    if (this.settings.mode === "unleash" && this.metrics.distance > 5 && this.initialWater[this.at(x, y)] > 1.1) {
      this.end("lake");
      return;
    }
    const goal = this.settings.mode === "aim" ? { x: this.intent.end! % W, y: Math.floor(this.intent.end! / W) } : null;
    if (goal && portable.hypot(goal.x - x, goal.y - y) < 1.8 && this.course.nearEnd()) {
      if (this.crossesCourse({ x, y }, goal)) {
        this.end("power spent");
        return;
      }
      this.heading = portable.atan2(goal.y - y, goal.x - x);
      this.metrics.distance += portable.hypot(goal.x - x, goal.y - y);
      this.course.accept(goal.x, goal.y, this.heading, this.heading, false);
      this.stamp(goal.x, goal.y);
      this.end("destination");
      return;
    }
    const nav = this.course.plan(x, y);
    let best = -Infinity;
    let bestA = nav.bearing;
    let bestX = x;
    let bestY = y;
    const angles = [nav.bearing, nav.preferred];
    for (let k = -11; k <= 11; k++) angles.push(nav.bearing + k * 0.165);
    for (const a of angles) {
      if (Math.abs(angleDelta(a, nav.bearing)) > HEADING_LIMIT) continue;
      const dx = portable.cos(a);
      const dy = portable.sin(a);
      const nx = x + dx * 1.35;
      const ny = y + dy * 1.35;
      if (nx < 0 || ny < 0 || nx > W - 1 || ny > H - 1) {
        if (!goal && Math.abs(angleDelta(a, nav.bearing)) < 0.01) {
          this.end("map edge");
          return;
        }
        continue;
      }
      const i = this.at(nx, ny);
      const cost = this.course.cost(nx, ny);
      if (this.keep[i] || cost >= nav.deadline || (nav.straightening && cost >= nav.cost - 0.005)) continue;
      if (this.crossesCourse({ x, y }, { x: nx, y: ny })) continue;
      const far = this.original[this.at(nx + dx * 5, ny + dy * 5)];
      const here = this.original[this.at(x, y)];
      const farTile = this.at(nx + dx * 5, ny + dy * 5);
      const resistance = Math.max(0, far - here) * (1 + this.hard(far, farTile) * 2) * (1 - p) + (this.settings.layers && hardAt(this.map, farTile, far) ? 12 * (1 - p) : 0);
      const score = 12 * portable.cos(angleDelta(a, nav.preferred)) + 3 * portable.cos(angleDelta(a, this.heading)) + (here - far) * 0.35 * (1 - p) - resistance - this.visited[i] * 2;
      if (score > best) {
        best = score;
        bestA = a;
        bestX = nx;
        bestY = ny;
      }
    }
    if (best === -Infinity) {
      this.end("power spent");
      return;
    }
    const ahead = this.at(bestX, bestY);
    const climb = Math.max(0, this.original[ahead] - this.original[this.at(x, y)]);
    this.energy -= 1 + climb * (1 - p) * 8;
    if (this.energy <= 0 || this.metrics.distance > 3 * (W + H)) {
      this.end("power spent");
      return;
    }
    if (p < 0.28 && this.original[ahead] - this.bed > 4 && this.hard(this.original[ahead], ahead) > 0.5) {
      this.end("power spent");
      return;
    }
    const fall = this.original[this.at(x, y)] - this.original[ahead];
    const lake = this.initialWater[ahead] > 1.1;
    const turn = Math.abs(angleDelta(bestA, this.heading));
    if (turn > 0.15) this.metrics.bendCuts++;
    this.heading = bestA;
    this.metrics.distance += 1.35;
    this.course.accept(bestX, bestY, bestA, nav.bearing, nav.straightening);
    this.stamp(bestX, bestY);
    this.tryCutoff();
    if (this.head.event === "surge") this.head.event = fall > 1 ? "waterfall" : climb > 0 ? "breakthrough" : "surge";
    if (this.settings.mode === "unleash" && lake) this.end("lake");
  }

  private end(reason: string) {
    this.ended = true;
    this.metrics.reason = reason;
  }

  private planDeposit() {
    this.depositDone = true;
    const { x, y, dx, dy, width } = this.head;
    const { W, H } = this.map;
    // A coherent expanding fan, on untouched receiving terrain. The centre stays open for water;
    // volume is limited by the material actually cut.
    for (let d = 2; d <= width * 3 + 6; d++)
      for (let s = -Math.ceil(d * 0.7); s <= Math.ceil(d * 0.7); s++) {
        if (Math.abs(s) < width * 0.65) continue;
        const xx = Math.round(x + dx * d - dy * s);
        const yy = Math.round(y + dy * d + dx * s);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        if (this.keep[i] || this.character.rock[i] || this.sign[i] < 0 || this.channel[i] || this.target[i] < this.original[i] || this.map.heights[i] >= this.map.maxHeight) continue;
        const surface = this.original[this.at(x, y)] + Math.max(1, this.initialWater[this.at(x, y)]);
        if (this.map.heights[i] < surface && Math.abs(s) > width * 0.65) this.depositQueue.push(i);
      }
    this.depositQueue = [...new Set(this.depositQueue)];
  }

  step(): number[] {
    if (this.metrics.stable) return [];
    this.metrics.steps++;
    const p = this.settings.power / 100;
    // Reveal a forceful, paced head while unfinished cuts deepen behind it.
    if (!this.ended && this.metrics.steps % 2 === 0) this.advanceHead();
    const delta = (this.delta ??= new Int8Array(this.original.length));
    // (the tiles given a change this step: only they are visited, in the order of the map)
    const touched: number[] = [];
    const infill: number[] = [];
    for (const i of this.active) {
      const h = this.map.heights[i] - this.sediment[i];
      if (h <= this.target[i]) {
        this.active.delete(i);
        continue;
      }
      const age = this.metrics.steps - this.born[i];
      const bank = !this.channel[i];
      // Wide terraces retreat after the head, not simultaneously across the map.
      if (bank && age < 4) continue;
      const hard = this.hard(h, i);
      const coefficient = bank ? 1 - 0.8 * hard : 1 - 0.85 * hard;
      this.wear[i] += (0.75 + 2.4 * p) * Math.min(2, this.character.intensity) * coefficient * (bank ? 0.65 : 1);
      if (this.wear[i] >= 1) {
        if (this.barFloor[i] && this.map.heights[i] <= this.barFloor[i]) infill.push(i);
        else {
          delta[i] = -1;
          touched.push(i);
        }
      }
    }
    if (this.ended) {
      this.tail++;
      if (!this.depositDone) this.planDeposit();
      // At most 32 whole sediment blocks per step, growing neighbouring shelves.
      let n = 0;
      for (const i of this.depositQueue)
        if (this.sign[i] === 0 && this.metrics.suspended > n && n < 32) {
          if (!delta[i]) touched.push(i);
          delta[i] = 1;
          n++;
        }
    }
    touched.sort((a, b) => a - b);
    this.rejectIsolated(delta, touched);
    const changed: number[] = [];
    let frontCut = 0;
    for (const i of touched)
      if (delta[i]) {
        const d = delta[i];
        this.map.heights[i] += d;
        if (this.map.lava) this.map.lava[i] &= (1 << this.map.heights[i]) - 1;
        this.sign[i] = d;
        changed.push(i);
        if (d < 0) {
          this.metrics.cut++;
          this.metrics.suspended++;
          this.wear[i] = Math.max(0, this.wear[i] - 1);
          if (!this.channel[i]) this.metrics.bankCuts++;
          if (portable.hypot((i % this.map.W) - this.head.x, Math.floor(i / this.map.W) - this.head.y) < this.head.width + 2) frontCut++;
        } else {
          this.metrics.deposited++;
          this.metrics.suspended--;
        }
      }
    // Sub-grid scour and fill are applied together: gross sediment volume is accounted, but no
    // exposed terrain cell ever reverses its direction.
    for (const i of infill) {
      this.sediment[i]++;
      this.metrics.cut++;
      this.metrics.deposited++;
      this.wear[i] = Math.max(0, this.wear[i] - 1);
    }
    this.head.cut = frontCut;
    this.head.z = Math.min(...(this.head.lanes ?? [this.head]).map((l) => this.map.heights[this.at(l.x, l.y)])) + 0.7;
    if (frontCut > 60 && this.head.event === "surge") this.head.event = "breakthrough";
    else if (!frontCut && this.active.size) this.head.event = "rock";
    for (const i of touched) delta[i] = 0;
    if (changed.length) this.dropObjects(changed);
    this.quiet = changed.length || infill.length ? 0 : this.quiet + 1;
    if (this.ended && (!this.active.size || this.quiet >= 24 || this.tail >= 220)) {
      this.metrics.stable = true;
      // the river's own shape once its canyon is cut: its depth and its banks (items 17, 18)
      const shaped = this.planning ? [] : shapeRiver(this);
      if (shaped.length) {
        if (this.map.lava) for (const i of shaped) this.map.lava[i] &= (1 << this.map.heights[i]) - 1;
        this.dropObjects(shaped);
        changed.push(...shaped);
      }
      if (this.metrics.reason === "map edge") {
        this.metrics.exported = this.metrics.suspended;
        this.metrics.suspended = 0;
      }
    }
    return changed;
  }

  /** The objects on ground that changed go (the start, its own sources and an unleashed one ride it). */
  private dropObjects(changed: readonly number[]): void {
    {
      const W = this.map.W;
      const H = this.map.H;
      if (!this.occupants) {
        this.occupants = new Map();
        for (const e of this.map.entities)
          for (const i of entityTiles(W, H, e)) {
            const list = this.occupants.get(i);
            if (list) list.push(e.id);
            else this.occupants.set(i, [e.id]);
          }
      }
      const hit = new Set<string>();
      for (const i of changed) for (const id of this.occupants.get(i) ?? []) hit.add(id);
      const moved = (e: EntitySpec) => this.group.some((s) => s.id === e.id) || e.id === this.unleashed;
      // (the start, its sources and an unleashed one are among them: they stay, riding the ground)
      if ([...hit].some((id) => !this.removedAt.has(id)))
        this.map.entities = this.map.entities
          .filter((e) => {
            if (e.template === "StartingLocation" || moved(e) || !hit.has(e.id)) return true;
            this.removedAt.set(e.id, this.metrics.steps);
            return false;
          })
          .map((e) => {
            // (its sources follow the ground cut under them, D314)
            const own = this.group.find((s) => s.id === e.id);
            return own ? { ...e, z: this.map.heights[own.tile] } : e.id === this.unleashed ? { ...e, z: this.map.heights[e.y * W + e.x] } : e;
          });
    }
  }

  private rejectIsolated(d: Int8Array, touched: readonly number[]) {
    const h = this.map.heights;
    const { W, H } = this.map;
    const marked = new Set<number>();
    for (const i of touched)
      if (d[i]) {
        marked.add(i);
        for (const j of [i - W, i - 1, i + 1, i + W]) if (j >= 0 && j < h.length) marked.add(j);
      }
    let again = true;
    while (again) {
      again = false;
      for (const i of marked) {
        if (i % W === 0 || i % W === W - 1 || i < W || i >= W * (H - 1)) continue;
        const ns = [i - W, i - 1, i + 1, i + W];
        const v = h[i] + d[i];
        const lo = Math.min(...ns.map((j) => h[j] + d[j]));
        const hi = Math.max(...ns.map((j) => h[j] + d[j]));
        if ((v < lo && h[i] >= Math.min(...ns.map((j) => h[j]))) || (v > hi && h[i] <= Math.max(...ns.map((j) => h[j])))) {
          if (d[i]) {
            d[i] = 0;
            again = true;
          } else
            for (const j of ns)
              if (d[j]) {
                d[j] = 0;
                again = true;
              }
        }
      }
    }
  }
}
