// Carve, a force of nature (PLAN §20 D194, D199): a deliberately exaggerated fluvial force, not the
// game's water, which never erodes. A head moves 1.35 tiles every two steps, favouring its
// momentum, the way down and the ground it can overcome (Aim steers toward its end point; Defy
// gravity lowers the way ahead to a floor that never rises). Behind it a brush reveals whole-level
// cuts, then the banks mature into steep walls or wide terraces; hard rock layers slow it and
// leave benches. Power sets its depth, its reach and how long it runs; Width (following Power, or
// set) concentrates or spreads that work. What it cuts is carried and laid down as a fan at its
// end. Each tile changes in one direction only, no step leaves a new one-tile pit or spike, and
// the start's ground is never touched.
//
// Bends vary (D199): measured over six stations, a bend's outer bank is cut wider and up to two
// levels deeper, its inner bank keeps shallow shelves, and the straights between bends narrow, so
// even at the highest Wander it is never a uniform tube. At high Wander and Power one narrow neck
// can be cut through: a route-only look-ahead reserves two sediment bars across the old bend's
// mouths before either is exposed, the crescent between them scours while the bars hold, and the
// sealed bend becomes an oxbow lake (oxbow.ts; its water, water.ts).
//
// Keep river leaves a real water source at the origin, its strength following the river's Width
// (D199); Dry canyon leaves none. The preview water flows on as the floor changes; the water the
// map keeps is always the game's settled result, worked out after the carve.
//
// Ported from investigation/carve/engine.ts (PR #47), kept to its structure so a later round of the
// prototype ports across as a diff. The result is stored literally (force.ts), so replay never
// runs this code.

import { toMapObject } from "../../features/build";
import { PLACED } from "../../features/edits";
import { waterSource, type EntitySpec } from "../../format/entities";
import { waterModel } from "../../sim/model";
import type { WarmState } from "../../sim/preview";
import { WaterSim, type WaterModel } from "../../sim/water";
import { entityTiles, protectedGround, type ForceHead, type ForceMap, type ForceRun, type Lane } from "../force";
import { RiverCharacter } from "./character";
import { angleDelta, Course, HEADING_LIMIT, segmentsCross } from "./course";
import { findNeck, mouthFloors, type Oxbow } from "./oxbow";
import { hardAt } from "../rock";

export interface CarveSettings {
  mode: "unleash" | "aim";
  /** 0 (a creek) to 100 (a catastrophe). */
  power: number;
  /** 0 (straight) to 100 (winding). */
  wander?: number;
  /** Nominal width in tiles, 2–24; null follows Power. */
  width?: number | null;
  /** The personality seed (Try another path takes the next one). */
  seed?: number;
  walls: "steep" | "wide";
  defyGravity: boolean;
  /** Dry canyon: no source is left at the origin. */
  dry: boolean;
  /** Rock layers (hard bands every few levels). */
  layers: boolean;
}

export interface CarveIntent {
  origin: number;
  end?: number;
}

export const DEFAULTS: CarveSettings = { mode: "unleash", power: 65, wander: 35, width: null, seed: 0, walls: "steep", defyGravity: false, dry: false, layers: true };

/** The strength of the source a carve keeps (D199): following its nominal Width, linked to Power
 *  when Width follows it; 0.5 to 8 water a second. */
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

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Terrain-derived, coherent horizontal beds (a hash of the heights: the same map, the same rock). */
export function mapSeed(m: Pick<ForceMap, "W" | "H" | "heights">): number {
  let s = 2166136261;
  for (const h of m.heights) s = Math.imul(s ^ h, 16777619);
  return (s ^ m.W ^ Math.imul(m.H, 97)) >>> 0;
}

export function hardness(level: number, layers: boolean, seed = 0): number {
  return layers && (level + (seed % 4)) % 4 === 0 ? 1 : 0;
}

/** The water model of a force's map. */
export const modelFor = (m: ForceMap) => waterModel(m.W, m.H, m.heights, m.entities.map(toMapObject));

/** A carve's own options, beyond its settings: the ground it may not touch (the layer cut, caves),
 *  and the id of the source it keeps. */
export interface CarveOptions {
  keep?: Uint8Array | null;
  sourceId?: string;
}

export class CarveRun implements ForceRun {
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
  readonly settings: CarveSettings;
  readonly metrics: Metrics = { cut: 0, deposited: 0, exported: 0, suspended: 0, bankCuts: 0, bendCuts: 0, steps: 0, stable: false, distance: 0, reason: "", splits: 0, waterfalls: 0, rapids: 0, oxbows: 0 };
  head: ForceHead;
  private sim: WaterSim;
  private model: WaterModel;
  private active = new Set<number>();
  private channel = new Uint8Array();
  private visited = new Uint16Array();
  private born = new Uint16Array();
  private heading = 0;
  private bed = 0;
  private energy = 0;
  private splitSeen = new Set<string>();
  private previewBed: Uint8Array;
  private previewCells = new Set<number>();
  private ended = false;
  private tail = 0;
  private quiet = 0;
  private depositQueue: number[] = [];
  private depositDone = false;

  /** `planning`: a route-only look-ahead (it moves the head and finds the cut-off, never the land). */
  constructor(input: ForceMap, settings: CarveSettings, intent: CarveIntent, options: CarveOptions = {}, private readonly planning = false) {
    settings = this.settings = { ...settings };
    settings.wander ??= 35;
    settings.width ??= null;
    settings.seed ??= 0;
    const N = input.W * input.H;
    this.sediment = new Uint8Array(N);
    this.barFloor = new Uint8Array(N);
    if (
      input.heights.length !== N ||
      !Number.isInteger(intent.origin) ||
      intent.origin < 0 ||
      intent.origin >= N ||
      !["unleash", "aim"].includes(settings.mode) ||
      !["steep", "wide"].includes(settings.walls) ||
      !Number.isFinite(settings.power) ||
      settings.power < 0 ||
      settings.power > 100
    )
      throw new Error("Invalid carve settings");
    if (
      !Number.isFinite(settings.wander) ||
      settings.wander < 0 ||
      settings.wander > 100 ||
      !Number.isInteger(settings.seed) ||
      settings.seed < 0 ||
      settings.seed > 0xffffffff ||
      (settings.width !== null && (!Number.isFinite(settings.width) || settings.width < 2 || settings.width > 24))
    )
      throw new Error("Invalid character settings");
    if (settings.mode === "aim" && (!Number.isInteger(intent.end) || intent.end! < 0 || intent.end! >= N || intent.end === intent.origin)) throw new Error("Choose a different end point");
    this.initialWater = input.water.depth.slice();
    this.intent = { ...intent };
    this.seed = mapSeed(input);
    this.character = new RiverCharacter(input, settings, this.seed, intent.origin, intent.end);
    this.previewBed = new Uint8Array(N).fill(255);
    let sourceId = options.sourceId ?? "carve-source-" + intent.origin + "-" + this.seed.toString(16);
    while (input.entities.some((e) => e.id === sourceId)) sourceId += "-next";
    this.sourceId = sourceId;
    this.original = input.heights.slice();
    this.keep = protectedGround(input, options.keep ?? null);
    this.course = new Course(input, settings, intent, this.character);
    if (this.keep[intent.origin] || (settings.mode === "aim" && this.keep[intent.end!])) throw new Error("Choose a point outside the start’s protected ground");
    this.map = { ...input, ...(input.lava ? { lava: input.lava.slice() } : {}), heights: input.heights.slice(), entities: input.entities.slice(), water: { depth: input.water.depth.slice(), contamination: input.water.contamination.slice() } };
    this.sim = new WaterSim((this.model = modelFor(input)), input.water);
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
    this.head = { x, y, z: input.heights[intent.origin], dx: Math.cos(this.heading), dy: Math.sin(this.heading), width: this.character.width(0), event: "surge", cut: 0 };
    if (settings.mode === "aim" && !settings.defyGravity && input.heights[intent.end!] > input.heights[intent.origin]) {
      throw new Error("The end point is uphill. Turn on Defy gravity to cut it down.");
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
      const e = waterSource({ id: this.sourceId, owner: PLACED, x, y, z: this.map.heights[intent.origin], strength: sourceStrength(settings.power, settings.width) });
      this.map.entities = [...this.map.entities.filter((g) => g.id !== this.sourceId), e];
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
  get added(): readonly string[] {
    return this.settings.dry ? [] : [this.sourceId];
  }
  /** The game's water on the ground as it stands, without the preview's muddy ribbon: the editor's
   *  water carries on from it when the carve is kept (not part of the prototype's run). */
  liveWater(): WarmState {
    const sim = this.sim;
    return { model: { ...this.model, floor: Float64Array.from(sim.F) }, water: { settled: false, ticks: sim.ticks, depth: sim.D.slice(), contamination: sim.C.slice(), sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } };
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
    const dx = Math.cos(this.heading);
    const dy = Math.sin(this.heading);
    // Curvature over a reach, not a single candidate turn: coherent cut banks and inner shelves
    // survive at maximum Wander without speckled tile noise.
    const prior = this.path[Math.max(0, this.path.length - 6)];
    const bend = prior ? clamp(angleDelta(this.heading, Math.atan2(prior.dy, prior.dx)) / 0.9, -1, 1) : 0;
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
          const d = Math.hypot(xx - lane.x, yy - lane.y);
          const slope = this.settings.walls === "wide" ? 1 : 4;
          const outside = ((xx - x) * dy - (yy - y) * dx) * Math.sign(bend);
          const innerShelf = Math.abs(bend) > 0.3 && outside < -reachWidth * 0.2 ? Math.min(2, Math.ceil((-outside / reachWidth - 0.2) * Math.abs(bend) * 2)) : 0;
          const scour = Math.min(2, Math.floor(Math.max(0, outside / reachWidth - 0.15) * Math.abs(bend) * 3));
          let t = Math.max(0, this.bed - scour) + innerShelf + Math.max(0, Math.ceil((d - lane.width) * slope));
          if (d > lane.width && this.hard(t, i) > 0.5) t++;
          const work = p * this.character.intensity;
          if (work < 0.45) t = Math.max(t, this.original[i] - Math.max(1, Math.round(1 + 6 * work)));
          if (t < this.target[i]) {
            this.target[i] = t;
            this.active.add(i);
            if (!this.born[i]) this.born[i] = this.metrics.steps + 1;
          }
          if (d <= lane.width * 0.72) this.channel[i] = 1;
          if (d <= lane.width * 0.65) {
            this.previewCells.add(i);
            this.previewBed[i] = Math.min(this.previewBed[i], this.bed);
          }
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
        const d = Math.hypot(xx - x, yy - y);
        const t = floor + Math.ceil(Math.max(0, d - radius) * 4);
        if (this.keep[i] || this.character.rock[i] || this.sign[i] > 0 || t >= this.target[i]) continue;
        this.target[i] = Math.max(0, t);
        this.active.add(i);
        if (!this.born[i]) this.born[i] = this.metrics.steps + 1;
        if (d < radius * 0.8) this.channel[i] = 1;
        if (d < radius * 0.65) {
          this.previewCells.add(i);
          this.previewBed[i] = Math.min(this.previewBed[i], floor);
        }
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
    if (this.path.slice(0, -1).some((c, k, list) => k + 1 < list.length && segmentsCross(a, b, c, list[k + 1]))) return true;
    return this.oxbows.some((o) =>
      o.neck.some((c, k, list) => k + 1 < list.length && Math.hypot(a.x - c.x, a.y - c.y) > 1e-6 && Math.hypot(a.x - list[k + 1].x, a.y - list[k + 1].y) > 1e-6 && segmentsCross(a, b, c, list[k + 1])),
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
    if (goal && Math.hypot(goal.x - x, goal.y - y) < 1.8) {
      if (this.crossesCourse({ x, y }, goal)) {
        this.end("power spent");
        return;
      }
      this.heading = Math.atan2(goal.y - y, goal.x - x);
      this.metrics.distance += Math.hypot(goal.x - x, goal.y - y);
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
      const dx = Math.cos(a);
      const dy = Math.sin(a);
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
      const score = 12 * Math.cos(angleDelta(a, nav.preferred)) + 3 * Math.cos(angleDelta(a, this.heading)) + (here - far) * 0.35 * (1 - p) - resistance - this.visited[i] * 2;
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
        const surface = this.original[this.at(x, y)] + Math.max(1, this.map.water.depth[this.at(x, y)]);
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
    const delta = new Int8Array(this.original.length);
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
        else delta[i] = -1;
      }
    }
    if (this.ended) {
      this.tail++;
      if (!this.depositDone) this.planDeposit();
      // At most 32 whole sediment blocks per step, growing neighbouring shelves.
      let n = 0;
      for (const i of this.depositQueue)
        if (this.sign[i] === 0 && this.metrics.suspended > n && n < 32) {
          delta[i] = 1;
          n++;
        }
    }
    this.rejectIsolated(delta);
    const changed: number[] = [];
    let frontCut = 0;
    for (let i = 0; i < delta.length; i++)
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
          if (Math.hypot((i % this.map.W) - this.head.x, Math.floor(i / this.map.W) - this.head.y) < this.head.width + 2) frontCut++;
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
    if (changed.length) {
      const hit = new Set(changed);
      const W = this.map.W;
      const H = this.map.H;
      this.map.entities = this.map.entities
        .filter((e) => e.template === "StartingLocation" || e.id === this.sourceId || !entityTiles(W, H, e).some((i) => hit.has(i)))
        .map((e) => (e.id === this.sourceId ? { ...e, z: this.map.heights[this.intent.origin] } : e));
    }
    for (const i of changed) this.sim.F[i] = this.map.heights[i];
    this.sim.run(2);
    this.map.water = { depth: this.sim.D.slice(), contamination: this.sim.C.slice() };
    this.previewWater();
    this.quiet = changed.length || infill.length ? 0 : this.quiet + 1;
    if (this.ended && (!this.active.size || this.quiet >= 24 || this.tail >= 220)) {
      this.metrics.stable = true;
      if (this.metrics.reason === "map edge") {
        this.metrics.exported = this.metrics.suspended;
        this.metrics.suspended = 0;
      }
    }
    return changed;
  }

  private previewWater() {
    // The force's muddy ribbon is a preview, not counterfeit game water. Keep it inside the
    // excavated channel; the map's water always comes from the canonical settle.
    for (const i of this.active) if (this.sign[i] < 0) this.map.water.depth[i] = 0;
    for (const i of this.previewCells) if (this.sign[i] < 0 && !this.sediment[i] && this.map.heights[i] <= this.previewBed[i] + 2) this.map.water.depth[i] = 0.45 + (0.5 * this.settings.power) / 100;
  }

  private rejectIsolated(d: Int8Array) {
    const h = this.map.heights;
    const { W, H } = this.map;
    const marked = new Set<number>();
    for (let i = 0; i < h.length; i++)
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
