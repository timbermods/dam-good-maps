// Craterize, Erupt and Quake at work (PLAN §20 D202, D203, D206, D220): each is planned on its own copy
// of the map, a few rows a step (so the worker never holds the page's other calls for long), then shown
// in stages: an impact's bowl at once and its debris flying out, a volcano swelling, a fault's front
// racing along it, a slide carrying its block along tile by tile. What is kept is always the plan's
// final map (the stages are only its presentation), so the result never depends on the pace, the
// machine or the effects. The water shown moves with the land (the game's own rules, a few ticks a
// stage, from the water there was: a force never adds any); the map's settled water follows once it
// is kept. Carve (carve/run.ts) runs through the same worker calls.
//
// Each step also says what the effects and the sounds need (its cue): the phase, where, how big.

import { toMapObject } from "../features/build";
import type { WarmState } from "../sim/preview";
import { waterModel } from "../sim/model";
import { WaterSim, type WaterModel, type WaterState } from "../sim/water";
import { ImpactPlan, naturalSize as craterSize, type CraterIntent, type CraterSettings } from "./craterize";
import { EruptPlan, lobeField, stageMap, type EruptIntent, type EruptSettings, type Point } from "./erupt";
import { snapshotMap, type FullForceMap } from "./force";
import type { Verb } from "./op";
import { QuakePlan, revealQuake, type QuakeIntent, type QuakeSettings } from "./quake";
import { clamp, smooth } from "./random";
import { transportRock, trimRock } from "./rock";

/** What a force is doing now, for the effects, the camera and the sounds. */
export interface ForceCue {
  verb: Verb;
  /** incoming (an impactor falling), impact, rumble (the ground stirring), rise (a volcano
   *  swelling), crack (a fault breaking), slide (a block moving), carve (a river cutting), done. */
  phase: "incoming" | "impact" | "rumble" | "rise" | "crack" | "slide" | "carve" | "done";
  /** 0–1 through the event's stages. */
  progress: number;
  /** Its focus: a tile and the level there. */
  x: number;
  y: number;
  z: number;
  /** How big it is, in tiles across. */
  size: number;
  /** 0–100. */
  power: number;
  /** An impact: its ellipse (half-axes along and across its travel), travel angle and glance. */
  crater?: { a: number; b: number; angle: number; glance: number; radius: number; datum: number };
  /** An eruption: its vents, its radius, a fissure's line. */
  erupt?: { vents: Point[]; radius: number; fissure: boolean; line: Point[] };
  /** A quake: its crack as it runs, and whether it slides. */
  quake?: { path: Point[]; slide: boolean; side: 1 | -1 };
}

/** A staged force as the worker drives it. */
export interface StagedRun {
  readonly verb: "craterize" | "erupt" | "quake";
  /** The map as it shows now (ground, objects, fresh rock, fallen trees, its water). */
  readonly map: FullForceMap;
  readonly done: boolean;
  readonly steps: number;
  readonly reason: string;
  /** One step: plan more rows, or show the next stage. */
  step(): void;
  cue(): ForceCue;
  /** The planned result (null until planned). */
  final(): FullForceMap | null;
  /** The water as it shows, for the map's water to flow on from once kept. */
  liveWater(): WarmState;
  /** An eruption's heat on the land (RGBA a tile: vents, flows, dust, arrival), once planned. */
  heat?(): Uint8Array | null;
}

/** The water model of a force's map. */
export const modelOf = (m: FullForceMap): WaterModel => waterModel(m.W, m.H, m.heights, m.entities.map(toMapObject));

/** A planning slice's budget (ms): the worker answers the page's other calls between them. */
const PLAN_MS = 12;

/** Ground a force leaves exactly as it was: the land above the layer showing, an imported map's
 *  caves. Their levels, rock and objects are put back. */
export function respectKeep(before: FullForceMap, after: FullForceMap, keep: Uint8Array | null): void {
  if (!keep) return;
  let any = false;
  for (let i = 0; i < keep.length; i++)
    if (keep[i] && (after.heights[i] !== before.heights[i] || after.lava[i] !== before.lava[i])) {
      after.heights[i] = before.heights[i];
      after.lava[i] = before.lava[i];
      any = true;
    }
  const W = before.W;
  const kept = (e: { x: number; y: number }) => keep[e.y * W + e.x] === 1;
  const now = new Map(after.entities.map((e) => [e.id, e]));
  const out = after.entities.filter((e) => !kept(e) || before.entities.some((b) => b.id === e.id && kept(b)));
  for (const b of before.entities) if (kept(b)) {
    const k = out.findIndex((e) => e.id === b.id);
    if (k >= 0) out[k] = structuredClone(b);
    else out.push(structuredClone(b));
    any = true;
  }
  if (any || out.length !== now.size) {
    after.entities = out;
    const ids = new Set(out.map((e) => e.id));
    after.fallen = after.fallen.filter((f) => ids.has(f.id) && !kept({ x: Math.floor(f.x), y: Math.floor(f.y) }));
    for (const f of before.fallen) if (kept({ x: Math.floor(f.x), y: Math.floor(f.y) }) && !after.fallen.some((g) => g.id === f.id)) after.fallen.push(structuredClone(f));
  }
}

/** Run the game's water on a map for a few ticks, from `water`. */
function flow(m: FullForceMap, water: WaterState, ticks: number): WaterSim {
  const sim = new WaterSim(modelOf(m), water);
  sim.run(ticks);
  m.water = { depth: sim.D.slice(), contamination: sim.C.slice() };
  return sim;
}

function warm(sim: WaterSim, m: FullForceMap): WarmState {
  return { model: modelOf(m), water: { settled: false, ticks: sim.ticks, depth: sim.D.slice(), contamination: sim.C.slice(), sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } };
}

abstract class Staged {
  map: FullForceMap;
  protected stage = 0;
  protected planSteps = 0;
  protected sim: WaterSim | null = null;
  protected ended = false;
  steps = 0;

  constructor(
    readonly before: FullForceMap,
    protected readonly keep: Uint8Array | null,
  ) {
    this.map = snapshotMap(before);
  }

  /** Plan within the budget; true once planned. */
  protected abstract plan(budgetMs: number): boolean;
  protected abstract get planned(): boolean;
  /** Stages it shows once planned, and the fewest planning steps (its approach). */
  protected abstract readonly stages: number;
  protected abstract readonly approach: number;
  protected abstract show(stage: number): void;

  get done(): boolean {
    return this.ended;
  }
  get reason(): string {
    return this.ended ? "done" : "";
  }

  step(): void {
    if (this.ended) return;
    this.steps++;
    if (!this.planned || this.planSteps < this.approach) {
      this.planSteps++;
      if (!this.planned) this.plan(PLAN_MS);
      return;
    }
    this.stage++;
    this.show(this.stage);
    if (this.stage >= this.stages) this.ended = true;
  }

  /** Plan all of it at once (tests, Claude's step). */
  planAll(): this {
    while (!this.plan(Infinity)) {
      // planned in slices
    }
    return this;
  }

  /** Run to the end at once. */
  finishAll(): this {
    this.planAll();
    this.planSteps = Math.max(this.planSteps, this.approach);
    while (!this.ended) this.step();
    return this;
  }

  liveWater(): WarmState {
    if (!this.sim) this.sim = new WaterSim(modelOf(this.map), this.map.water);
    return warm(this.sim, this.map);
  }
}

// ---------------------------------------------------------------------------------------- Craterize

/** An impact: the impactor falls for a moment while it is planned, then the bowl opens at once and
 *  the debris flies out ring by ring. */
export class CraterRun extends Staged implements StagedRun {
  readonly verb = "craterize" as const;
  readonly plan0: ImpactPlan;
  protected readonly stages = 8;
  protected readonly approach = 3;
  private arrival: Float32Array | null = null;

  constructor(before: FullForceMap, readonly settings: CraterSettings, readonly intent: CraterIntent, keep: Uint8Array | null = null) {
    super(before, keep);
    this.plan0 = new ImpactPlan(before, settings, intent, keep);
  }

  protected get planned(): boolean {
    return this.plan0.planned;
  }

  protected plan(budgetMs: number): boolean {
    const t0 = performance.now();
    while (!this.plan0.advance(8)) if (performance.now() - t0 > budgetMs) return false;
    trimRock(this.plan0.map);
    respectKeep(this.before, this.plan0.map, this.keep);
    return true;
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.map : null;
  }

  /** When each tile takes its final level: the bowl at once, then the ejecta outward. */
  private arrivals(): Float32Array {
    if (this.arrival) return this.arrival;
    const a = this.plan0.anatomy;
    const { W, H } = this.before;
    const out = new Float32Array(W * H);
    const reach = (this.settings.debris === "heavy" ? 2.65 : 1.48) + (this.settings.rays ? 1.4 : 0);
    const c = Math.cos(a.angle);
    const s = Math.sin(a.angle);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = x - a.x;
        const dy = y - a.y;
        const r = Math.hypot((dx * c + dy * s) / a.a, (-dx * s + dy * c) / a.b);
        out[y * W + x] = r < 1.05 ? 0 : clamp(0.125 + ((r - 1.05) / Math.max(0.5, reach - 1.05)) * 0.875, 0.125, 1);
      }
    return (this.arrival = out);
  }

  protected show(stage: number): void {
    const after = this.plan0.map;
    const arrival = this.arrivals();
    const t = stage / this.stages;
    const prev = this.map;
    const m = stage >= this.stages ? snapshotMap(after) : snapshotMap(stage === 1 ? after : prev);
    if (stage < this.stages) for (let i = 0; i < m.heights.length; i++) m.heights[i] = arrival[i] <= t ? after.heights[i] : this.before.heights[i];
    if (stage === 1) {
      m.lava = after.lava.slice();
      trimRock(m);
    }
    this.map = m;
    this.sim = flow(m, prev.water, 8);
  }

  cue(): ForceCue {
    const a = this.plan0.anatomy;
    const p = this.planned && this.planSteps >= this.approach ? this.stage / this.stages : 0;
    const phase = this.ended ? "done" : !this.stage ? "incoming" : "impact";
    return {
      verb: "craterize",
      phase,
      progress: p,
      x: a.x,
      y: a.y,
      z: a.datum,
      size: a.diameter,
      power: this.settings.power,
      crater: { a: a.a, b: a.b, angle: a.angle, glance: a.glance, radius: a.radius, datum: a.datum },
    };
  }
}

// ------------------------------------------------------------------------------------------ Erupt

/** An eruption: the ground stirs while it is planned, then the volcano swells level by level. */
export class EruptRun extends Staged implements StagedRun {
  readonly verb = "erupt" as const;
  readonly plan0: EruptPlan;
  protected readonly stages = 14;
  protected readonly approach = 2;
  private mask: Uint8Array | null = null;

  constructor(before: FullForceMap, readonly settings: EruptSettings, readonly intent: EruptIntent, keep: Uint8Array | null = null) {
    super(before, keep);
    this.plan0 = new EruptPlan(before, settings, intent, keep);
  }

  protected get planned(): boolean {
    return this.plan0.planned;
  }

  protected plan(budgetMs: number): boolean {
    const t0 = performance.now();
    while (!this.plan0.advance(4)) if (performance.now() - t0 > budgetMs) return false;
    trimRock(this.plan0.map);
    respectKeep(this.before, this.plan0.map, this.keep);
    return true;
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.map : null;
  }

  protected show(stage: number): void {
    const prev = this.map;
    const m = stage >= this.stages ? snapshotMap(this.plan0.map) : stageMap(this.before, this.plan0.map, stage / this.stages);
    this.map = m;
    this.sim = flow(m, prev.water, 8);
  }

  /** The eruption's heat on the land (from the prototype's view): red, vents; green, flows' cracks;
   *  blue, dust; alpha, when the heat arrives there (0–1 along the flows, out from the vent). */
  heat(): Uint8Array | null {
    if (!this.planned) return null;
    if (this.mask) return this.mask;
    const a = this.plan0.anatomy;
    const s = this.settings;
    const { W, H } = this.before;
    const mask = new Uint8Array(W * H * 4);
    const flows = lobeField(W, H, a.lobes);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let dist = Math.hypot(x - a.x, y - a.y);
        let along = 0;
        if (a.segments.length) {
          dist = Infinity;
          for (const seg of a.segments) {
            const dx = seg.b.x - seg.a.x;
            const dy = seg.b.y - seg.a.y;
            const t = clamp(((x - seg.a.x) * dx + (y - seg.a.y) * dy) / (seg.length * seg.length), 0, 1);
            const d = Math.hypot(x - seg.a.x - dx * t, y - seg.a.y - dy * t);
            if (d < dist) {
              dist = d;
              along = (seg.along + t * seg.length) / a.length;
            }
          }
        }
        const r = dist / a.radius;
        const vent = a.segments.length ? 1 - smooth(dist / 2.1) : 1 - smooth(r / 0.22);
        const hot = Math.max(vent, s.ridges ? Math.min(1, flows[i] / 1.7) : Math.max(0, 1 - r) * 0.14);
        mask[i * 4] = Math.round(255 * hot);
        mask[i * 4 + 1] = Math.round(110 * (1 - smooth(r / 1.1)));
        mask[i * 4 + 2] = Math.round(255 * (1 - smooth(r / 2.1)));
        mask[i * 4 + 3] = Math.round(255 * (a.segments.length ? along : Math.min(1, r / 1.8)));
      }
    return (this.mask = mask);
  }

  cue(): ForceCue {
    const a = this.plan0.anatomy;
    const p = this.stage / this.stages;
    return {
      verb: "erupt",
      phase: this.ended ? "done" : this.stage ? "rise" : "rumble",
      progress: p,
      x: a.x,
      y: a.y,
      z: a.datum + a.height * smooth(p),
      size: a.radius * 2,
      power: this.settings.power,
      erupt: { vents: a.vents.map((v) => ({ ...v })), radius: a.radius, fissure: this.settings.mode === "fissure", line: a.segments.length ? [a.segments[0].a, ...a.segments.map((s) => s.b)] : [] },
    };
  }
}

// ------------------------------------------------------------------------------------------ Quake

/** A quake: Lift's front races along the fault (eight stages); Slide's block moves along its heading
 *  a tile at a time, all of it together. A painted Lift shows its whole result as it is painted
 *  (`repaint`): the ground reacts behind the pointer. */
export class QuakeRun extends Staged implements StagedRun {
  readonly verb = "quake" as const;
  plan0: QuakePlan;
  protected readonly approach = 1;
  private shownSource: Uint32Array | null = null;
  private painted = false;

  constructor(before: FullForceMap, readonly settings: QuakeSettings, public intent: QuakeIntent, keep: Uint8Array | null = null) {
    super(before, keep);
    this.plan0 = new QuakePlan(before, settings, intent);
  }

  protected get stages(): number {
    return this.settings.mode === "slide" ? Math.max(8, this.plan0.fault.slide + 2) : 8;
  }

  protected get planned(): boolean {
    return this.plan0.planned;
  }

  protected plan(budgetMs: number): boolean {
    const t0 = performance.now();
    while (!this.plan0.advance(4)) if (performance.now() - t0 > budgetMs) return false;
    const p = this.plan0;
    transportRock(this.before, p.map, p.source, this.settings.mode === "lift");
    trimRock(p.map);
    respectKeep(this.before, p.map, this.keep);
    return true;
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.map : null;
  }

  /** A painted Lift: the fault as painted so far, planned whole and shown at once (the page's pointer
   *  never waits: the worker takes the latest stroke when it is free). */
  repaint(intent: QuakeIntent): void {
    const prev = this.map;
    this.intent = intent;
    this.plan0 = new QuakePlan(this.before, this.settings, intent);
    this.planAll();
    this.painted = true;
    const m = snapshotMap(this.plan0.map);
    m.water = { depth: prev.water.depth.slice(), contamination: prev.water.contamination.slice() };
    this.map = m;
    this.sim = flow(m, m.water, 12);
    this.stage = this.stages;
  }

  /** The painted fault is let go: the quake is done. */
  release(): void {
    this.painted = false;
    this.ended = true;
  }

  get painting(): boolean {
    return this.painted && !this.ended;
  }

  protected show(stage: number): void {
    const prev = this.map;
    const p = this.plan0;
    if (this.settings.mode === "lift") {
      const m = stage >= this.stages ? snapshotMap(p.map) : revealQuake(p, prev, stage, this.stages);
      if (stage < this.stages) {
        m.lava = p.map.lava.slice();
        for (let i = 0; i < m.lava.length; i++) if (p.arrival[i] > stage / this.stages) m.lava[i] = prev.lava[i];
      }
      m.water = { depth: prev.water.depth.slice(), contamination: prev.water.contamination.slice() };
      this.map = m;
      this.sim = flow(m, m.water, 12);
      return;
    }
    // Slide: every moving tile a share of its travel along (whole tiles), the block together
    const f = stage / this.stages;
    const { W, H } = this.before;
    const N = W * H;
    let m: FullForceMap;
    const src = new Uint32Array(N);
    if (stage >= this.stages) {
      m = snapshotMap(p.map);
      src.set(p.source);
    } else {
      m = snapshotMap(this.before);
      const off = (v: number) => Math.round(v * f);
      for (let j = 0; j < N; j++) {
        const x = j % W;
        const y = (j - x) / W;
        const s = clamp(y - off(p.dy[j]), 0, H - 1) * W + clamp(x - off(p.dx[j]), 0, W - 1);
        m.heights[j] = this.before.heights[s];
        m.lava[j] = this.before.lava[s];
        src[j] = s;
      }
      const priority = new Float32Array(N).fill(-1);
      for (let i = 0; i < N; i++) {
        if (!p.dx[i] && !p.dy[i]) continue;
        const x = (i % W) + off(p.dx[i]);
        const y = Math.floor(i / W) + off(p.dy[i]);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x;
        const travel = Math.hypot(p.dx[i], p.dy[i]);
        if (travel < priority[j]) continue;
        priority[j] = travel;
        m.heights[j] = this.before.heights[i];
        m.lava[j] = this.before.lava[i];
        src[j] = i;
      }
      trimRock(m);
      // the objects move with their ground (the view's: the kept result is the plan's)
      const final = new Map(p.map.entities.map((e) => [e.id, e]));
      m.entities = this.before.entities.map((e) => {
        const to = final.get(e.id) ?? e;
        const x = e.x + off(to.x - e.x);
        const y = e.y + off(to.y - e.y);
        return { ...structuredClone(e), x, y, z: m.heights[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] };
      });
    }
    // the water moves with the ground it stood on (its volume and badwater kept), then flows
    const D = new Float64Array(N);
    const C = new Float64Array(N);
    const from = this.shownSource ?? Uint32Array.from({ length: N }, (_, i) => i);
    const where = new Int32Array(N).fill(-1);
    for (let j = 0; j < N; j++) where[src[j]] = j;
    for (let q = 0; q < N; q++) {
      const d = prev.water.depth[q];
      if (!d) continue;
      const i = from[q];
      const j = where[i] >= 0 ? where[i] : q;
      D[j] += d;
      C[j] += d * prev.water.contamination[q];
    }
    m.water = { depth: D, contamination: Float64Array.from(C, (v, i) => (D[i] ? v / D[i] : 0)) };
    this.shownSource = src;
    this.map = m;
    this.sim = flow(m, m.water, 12);
  }

  cue(): ForceCue {
    const p = this.plan0;
    const progress = this.stage / this.stages;
    const pts = p.fault.points;
    const head = pts[Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1)))] ?? pts[0];
    const slide = this.settings.mode === "slide";
    return {
      verb: "quake",
      phase: this.ended ? "done" : !this.stage ? "rumble" : slide ? "slide" : "crack",
      progress,
      x: head.x,
      y: head.y,
      z: this.map.heights[clamp(Math.round(head.y), 0, this.map.H - 1) * this.map.W + clamp(Math.round(head.x), 0, this.map.W - 1)],
      size: p.fault.length,
      power: this.settings.power,
      quake: { path: pts.map((q) => ({ ...q })), slide, side: this.intent.side },
    };
  }
}

/** The natural size of an impact at `power` (for the cursor's footprint on the page). */
export const craterNaturalSize = craterSize;
