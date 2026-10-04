// Craterize, Erupt and Quake at work (PLAN §20 D202, D203, D206, D220): each is planned on its own copy
// of the map when it starts (in Rust, rust/bridge.ts), given the build's last touches in its first step,
// then shown in stages: an impact's bowl at once and its debris flying out, a volcano swelling, a fault's front
// racing along it, a slide carrying its block along tile by tile. What is kept is always the plan's
// final map (the stages are only its presentation), so the result never depends on the pace, the
// machine or the effects. Nothing changes before the force reaches it (D321, item 30): objects and
// sources go as the front, the lava or the ice arrives (an impact's all at once, at its moment; under
// a quake they ride the ground), and the water stays as it was until the land is final, then flows
// on from there as after any edit (a force never adds any). The editor paces the stages (Fast or
// Slow forces, item 29); Carve (carve/play.ts) is played back through the same worker calls.
//
// Each step also says what the effects and the sounds need (its cue): the phase, where, how big.

import * as portable from "../math/portable";
import { modelOf } from "../features/build";
import { warmState, type WarmState } from "../sim/preview";
import { WaterSim } from "../sim/water";
import { ImpactPlan, type CraterIntent, type CraterSettings } from "./craterize";
import { EruptPlan, stageMap, type EruptIntent, type EruptSettings, type Point } from "./erupt";
import { snapshotMap, type FullForceMap } from "./force";
import type { Verb } from "./op";
import { QuakePlan, revealQuake, type QuakeIntent, type QuakeSettings } from "./quake";
import { clamp } from "./random";
import { smoothstep } from "../math/clamp";
import { forceFloor, holdAtFloor } from "./floor";
import { settleKnocked } from "./objects";
import { transportRock, trimRock } from "./rock";

/** What a force is doing now, for the effects, the camera and the sounds. */
export interface ForceCue {
  verb: Verb;
  /** incoming (an impactor falling), impact, rumble (the ground stirring), rise (a volcano
   *  swelling), crack (a fault breaking), slide (a block moving), carve (a river cutting), gather (ice
   *  gathering), advance and retreat (a glacier's two acts), done. */
  phase: "incoming" | "impact" | "rumble" | "rise" | "crack" | "slide" | "carve" | "gather" | "advance" | "retreat" | "done";
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
  /** A glacier: its seconds into the two acts, and its stations once planned (the ice's shape). */
  glaciate?: { seconds: number; path?: { x: number; y: number; s: number; r: number; floor: number }[] };
  /** How many of the force's own seconds each second of its showing is (the page's, from its pace:
   *  Fast compresses it, Slow forces stretch it; D344 A7): its effects and sounds keep to the land. Absent:
   *  its own pace. */
  pace?: number;
}

/** A staged force as the worker drives it. */
export interface StagedRun {
  readonly verb: "craterize" | "erupt" | "quake" | "glaciate";
  /** The map as it shows now (ground, objects, fresh rock, fallen trees, its water). */
  readonly map: FullForceMap;
  readonly done: boolean;
  readonly steps: number;
  readonly reason: string;
  /** One step: its last touches (the first), or the next stage. */
  step(): void;
  /** It is planned and given its last touches: what is left is showing it. */
  readonly planned: boolean;
  /** Steps of its showing in all (once planned), and shown so far. */
  readonly total: number;
  readonly shown: number;
  cue(): ForceCue;
  /** The planned result (null until planned). */
  final(): FullForceMap | null;
  /** The water as it shows, for the map's water to flow on from once kept. */
  liveWater(): WarmState;
  /** An eruption's heat on the land (RGBA a tile: vents, flows, dust, arrival), once planned. */
  heat?(): Uint8Array | null;
  /** Run to the end at once (a force kept part way keeps its whole result). */
  finishAll(): void;
  /** The build's last touches on the planned map. */
  finalize: Finalize | null;
}

/** The water model of a force's map (features/build.ts). */
export { modelOf };

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

/** Called on a force's final map once it is planned: the editor gives it the build's own last
 *  touches (its integrity pass), so the last stage shows exactly what is kept. */
export type Finalize = (m: FullForceMap) => void;

/** A force planned when it starts, given its last touches, then shown in stages: what Craterize, Erupt,
 *  Quake and Glaciate share. */
export abstract class Staged {
  map: FullForceMap;
  protected stage = 0;
  /** Its last touches are made (`settle`). */
  private settled = false;
  /** Steps of its approach shown (the impactor falling, the ground stirring), once planned. */
  protected approached = 0;
  protected ended = false;
  steps = 0;
  /** The build's last touches on the planned map (`planForce` sets it: start.ts `buildTouches`). */
  finalize: Finalize | null = null;

  constructor(
    readonly before: FullForceMap,
    protected readonly keep: Uint8Array | null,
  ) {
    this.map = snapshotMap(before);
  }

  /** Its last touches on the planned map: the Floor, the ground it leaves as it was (Keep), the build's
   *  own (`finalize`) and the objects knocked down. */
  protected abstract settle(): void;
  get planned(): boolean {
    return this.settled;
  }
  /** Planned again (a painted Lift's new stroke): its last touches are made again. */
  protected replanned(): void {
    this.settled = false;
  }
  /** Stages it shows once planned, and the steps of its approach before them. */
  protected abstract readonly stages: number;
  protected abstract readonly approach: number;
  protected abstract show(stage: number): void;

  get done(): boolean {
    return this.ended;
  }
  get reason(): string {
    return this.ended ? "done" : "";
  }

  get total(): number {
    return this.approach + this.stages;
  }
  get shown(): number {
    return this.approached + this.stage;
  }

  step(): void {
    if (this.ended) return;
    this.steps++;
    if (!this.planned) {
      this.planAll();
      return;
    }
    if (this.approached < this.approach) {
      this.approached++;
      return;
    }
    this.stage++;
    this.show(this.stage);
    if (this.stage >= this.stages) this.ended = true;
  }

  /** Its last touches, if not made yet (tests, Claude's step). */
  planAll(): this {
    if (!this.settled) {
      this.settle();
      this.settled = true;
    }
    return this;
  }

  /** Run to the end at once. */
  finishAll(): this {
    this.planAll();
    this.approached = this.approach;
    while (!this.ended) this.step();
    return this;
  }

  liveWater(): WarmState {
    const model = modelOf(this.map);
    const sim = new WaterSim(model, this.map.water);
    const state = warmState(model, sim);
    // (its arrays are copied: the Rust simulation is done)
    sim.dispose();
    return state;
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

  constructor(before: FullForceMap, readonly settings: CraterSettings, readonly intent: CraterIntent, keep: Uint8Array | null = null) {
    super(before, keep);
    this.plan0 = new ImpactPlan(before, settings, intent, keep);
  }

  protected settle(): void {
    holdAtFloor(this.before.heights, this.plan0.map.heights, forceFloor(this.settings));
    trimRock(this.plan0.map);
    respectKeep(this.before, this.plan0.map, this.keep);
    this.finalize?.(this.plan0.map);
    settleKnocked(this.before, this.plan0.map);
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.map : null;
  }

  protected show(stage: number): void {
    const after = this.plan0.map;
    // (when each tile takes its final level: the bowl at once, then the ejecta outward)
    const arrival = this.plan0.arrival;
    const t = stage / this.stages;
    const prev = this.map;
    // (the impact changes every object at once, at its moment; the water waits for the final land)
    const m = stage >= this.stages ? snapshotMap(after) : snapshotMap(stage === 1 ? after : prev);
    if (stage < this.stages) for (let i = 0; i < m.heights.length; i++) m.heights[i] = arrival[i] <= t ? after.heights[i] : this.before.heights[i];
    if (stage === 1) {
      m.lava = after.lava.slice();
      trimRock(m);
    }
    this.map = m;
  }

  cue(): ForceCue {
    const a = this.plan0.anatomy;
    const p = this.planned ? this.stage / this.stages : 0;
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
  protected readonly stages = 28;
  protected readonly approach = 2;

  constructor(before: FullForceMap, readonly settings: EruptSettings, readonly intent: EruptIntent, keep: Uint8Array | null = null) {
    super(before, keep);
    this.plan0 = new EruptPlan(before, settings, intent, keep);
  }

  protected settle(): void {
    holdAtFloor(this.before.heights, this.plan0.map.heights, forceFloor(this.settings));
    trimRock(this.plan0.map);
    respectKeep(this.before, this.plan0.map, this.keep);
    this.finalize?.(this.plan0.map);
    settleKnocked(this.before, this.plan0.map);
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.map : null;
  }

  protected show(stage: number): void {
    const t = stage / this.stages;
    if (stage >= this.stages) {
      this.map = snapshotMap(this.plan0.map);
      return;
    }
    const m = stageMap(this.before, this.plan0.map, t);
    // an object changes (falls, goes, rides the rock) only once the eruption reaches it: the heat's
    // arrival, from the vent outward (or along a fissure); the water waits for the final land
    const heat = this.heat()!;
    const W = m.W;
    const reached = (x: number, y: number) => smoothstep(t) >= 0.12 + 0.76 * (heat[(clamp(Math.floor(y), 0, m.H - 1) * W + clamp(Math.floor(x), 0, W - 1)) * 4 + 3] / 255);
    const now = new Map(m.entities.map((e) => [e.id, e]));
    m.entities = this.before.entities.flatMap((e) => {
      const after = now.get(e.id);
      if (!reached(e.x + 0.5, e.y + 0.5)) return [{ ...structuredClone(e), z: m.heights[e.y * W + e.x] }];
      return after ? [after] : [];
    });
    const had = new Set(this.before.fallen.map((f) => f.id));
    const ids = new Set(m.entities.map((e) => e.id));
    m.fallen = m.fallen.filter((f) => ids.has(f.id) && (had.has(f.id) || reached(f.x, f.y)));
    m.water = { depth: this.before.water.depth.slice(), contamination: this.before.water.contamination.slice() };
    this.map = m;
  }

  /** The eruption's heat on the land (from the prototype's view): red, vents; green, flows' cracks;
   *  blue, dust; alpha, when the heat arrives there (0–1 along the flows, out from the vent). Once planned. */
  heat(): Uint8Array | null {
    return this.planned ? this.plan0.heat : null;
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
      z: a.datum + a.height * smoothstep(p),
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
  private painted = false;

  constructor(before: FullForceMap, public settings: QuakeSettings, public intent: QuakeIntent, keep: Uint8Array | null = null) {
    super(before, keep);
    this.plan0 = new QuakePlan(before, settings, intent);
  }

  protected get stages(): number {
    return this.settings.mode === "slide" ? Math.max(8, this.plan0.fault.slide + 2) : 8;
  }

  protected settle(): void {
    const p = this.plan0;
    holdAtFloor(this.before.heights, p.map.heights, forceFloor(this.settings));
    transportRock(this.before, p.map, p.source, this.settings.mode === "lift");
    trimRock(p.map);
    respectKeep(this.before, p.map, this.keep);
    this.finalize?.(p.map);
    settleKnocked(this.before, p.map);
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.map : null;
  }

  /** A painted Lift: the fault as painted so far, planned whole and shown at once (the page's pointer
   *  never waits: the worker takes the latest stroke when it is free). */
  /** The stroke as it is now, and (D361 (1)) its Power as the row has it now: a Lift answers Power
   *  while it is painted. */
  repaint(intent: QuakeIntent, power?: number): void {
    const prev = this.map;
    this.intent = intent;
    if (power !== undefined && power !== this.settings.power) this.settings = { ...this.settings, power };
    this.plan0 = new QuakePlan(this.before, this.settings, intent);
    this.replanned();
    this.planAll();
    this.painted = true;
    const m = snapshotMap(this.plan0.map);
    m.water = { depth: prev.water.depth.slice(), contamination: prev.water.contamination.slice() };
    this.map = m;
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
      // (the water as it was, until the land is final)
      m.water = { depth: this.before.water.depth.slice(), contamination: this.before.water.contamination.slice() };
      this.map = m;
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
      this.shift(f, m.heights, m.lava, src);
      // (what the fault does besides moving the block, its rivers joined again across it and its
      // tear, D368 (9): each part shown as the slide passes it, never all at the end)
      for (const e of this.extras()) if (e.at <= stage) m.heights[e.i] = p.map.heights[e.i];
      trimRock(m);
      // the objects move with their ground (the view's: the kept result is the plan's)
      const final = new Map(p.map.entities.map((e) => [e.id, e]));
      const off = (v: number) => Math.round(v * f);
      m.entities = this.before.entities.map((e) => {
        const to = final.get(e.id) ?? e;
        const x = e.x + off(to.x - e.x);
        const y = e.y + off(to.y - e.y);
        return { ...structuredClone(e), x, y, z: m.heights[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)] };
      });
    }
    // the water stays as it was while the block moves; with the final land it rides the ground it
    // stood on (its volume and badwater kept) and flows on from there
    if (stage >= this.stages) {
      const D = new Float64Array(N);
      const C = new Float64Array(N);
      const where = new Int32Array(N).fill(-1);
      for (let j = 0; j < N; j++) where[src[j]] = j;
      const w = this.before.water;
      for (let q = 0; q < N; q++) {
        const d = w.depth[q];
        if (!d) continue;
        const j = where[q] >= 0 ? where[q] : q;
        D[j] += d;
        C[j] += d * w.contamination[q];
      }
      m.water = { depth: D, contamination: Float64Array.from(C, (v, i) => (D[i] ? v / D[i] : 0)) };
    } else m.water = { depth: this.before.water.depth.slice(), contamination: this.before.water.contamination.slice() };
    this.map = m;
  }

  /** The block `f` of its way along (whole tiles): the heights, rock and where each tile's ground came
   *  from (of `this.before`). */
  private shift(f: number, heights: Uint8Array, lava: Uint32Array | null, src: Uint32Array | null): void {
    const p = this.plan0;
    const { W, H } = this.before;
    const N = W * H;
    const off = (v: number) => Math.round(v * f);
    for (let j = 0; j < N; j++) {
      const x = j % W;
      const y = (j - x) / W;
      const s = clamp(y - off(p.dy[j]), 0, H - 1) * W + clamp(x - off(p.dx[j]), 0, W - 1);
      heights[j] = this.before.heights[s];
      if (lava) lava[j] = this.before.lava[s];
      if (src) src[j] = s;
    }
    const priority = new Float32Array(N).fill(-1);
    for (let i = 0; i < N; i++) {
      if (!p.dx[i] && !p.dy[i]) continue;
      const x = (i % W) + off(p.dx[i]);
      const y = Math.floor(i / W) + off(p.dy[i]);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x;
      const travel = portable.hypot(p.dx[i], p.dy[i]);
      if (travel < priority[j]) continue;
      priority[j] = travel;
      heights[j] = this.before.heights[i];
      if (lava) lava[j] = this.before.lava[i];
      if (src) src[j] = i;
    }
  }

  private extras0: { i: number; at: number }[] | null = null;

  /** A Slide's land where its plan differs from its block moved all the way (its rivers joined again,
   *  its tear, the Floor held): each tile with the stage it shows at, through the slide's second half
   *  in the order the fault runs, so the last stage adds only the block's last move (D368 (9)). */
  private extras(): { i: number; at: number }[] {
    if (this.extras0) return this.extras0;
    const p = this.plan0;
    const { W } = this.before;
    const moved = new Uint8Array(p.map.heights.length);
    this.shift(1, moved, null, null);
    const pts = p.fault.points;
    const first = Math.ceil(this.stages / 2);
    const span = Math.max(1, this.stages - 1 - first);
    const out: { i: number; at: number }[] = [];
    for (let i = 0; i < moved.length; i++) {
      if (moved[i] === p.map.heights[i]) continue;
      const x = (i % W) + 0.5;
      const y = Math.floor(i / W) + 0.5;
      let near = 0;
      let best = Infinity;
      for (let k = 0; k < pts.length; k++) {
        const d = (pts[k].x - x) * (pts[k].x - x) + (pts[k].y - y) * (pts[k].y - y);
        if (d < best) {
          best = d;
          near = k;
        }
      }
      out.push({ i, at: first + Math.round((span * near) / Math.max(1, pts.length - 1)) });
    }
    return (this.extras0 = out);
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
