// Glaciate at work (PLAN §20 D246, D291, D292; the investigation's two acts, INTEGRATION.md): while
// it is planned (a few slices a step: the worker answers the page between them) the ice gathers where
// it was asked; then the ice advances for three seconds, the land under it taking its final levels as
// the front passes (every height is the plan's before the retreat begins), and melts back for two.
// The editor paces the stages (D321, item 29: Fast, or Watch); nothing changes before the ice reaches
// it (item 30): the objects in its path go as the front passes, and the water stays as it was until
// the land is final, when the valley's own water (its tarn, its meltwater river) takes over. What is
// kept is always the plan's final map (the stages only show it), so the result never depends on the
// pace, the machine or the effects.

import { prefill } from "../../sim/prefill";
import type { WarmState } from "../../sim/preview";
import { WaterSim } from "../../sim/water";
import { snapshotMap, type FullForceMap } from "../force";
import { clamp } from "../random";
import { trimRock } from "../rock";
import { modelOf, respectKeep, type Finalize, type ForceCue, type StagedRun } from "../runs";
import { sizeOf, Valley, type GlaciateIntent, type GlaciateSettings } from "./model";
import { planGlaciate, type GlaciatePlan } from "./plan";
import { keepSourcesOnMap, type PlacedSource } from "../../water/edgeSources";

/** Steps of its advance and its retreat (ten a second: three seconds, then two). */
export const ADVANCE_STEPS = 30;
export const RETREAT_STEPS = 20;

/** A build for the floor's before-and-after pictures (tools/capture-glaciate.ts) leaves the floor's
 *  water as round 4 left it (D292's "before"); every other build finishes it. */
const ROUND4 = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GLACIATE_ROUND4 === "1";

/** A planning step's budget (ms): at least one slice, then more while they fit. */
const PLAN_MS = 80;

export class GlaciateRun implements StagedRun {
  readonly verb = "glaciate" as const;
  map: FullForceMap;
  steps = 0;
  finalize: Finalize | null = null;
  private plan0: GlaciatePlan | null = null;
  /** The plan being given its last touches (its footprint is protected while they are made). */
  private pending: GlaciatePlan | null = null;
  private readonly slices: Generator<void, GlaciatePlan, void>;
  private stage = 0;
  private ended = false;
  private sim: WaterSim | null = null;
  /** Its meltwater springs whose water can still run straight off the map's edge (item 27). */
  edgeLeaks: PlacedSource[] = [];

  constructor(
    readonly before: FullForceMap,
    readonly settings: GlaciateSettings,
    readonly intent: GlaciateIntent,
    private readonly keep: Uint8Array | null = null,
    valley?: Valley,
  ) {
    this.map = snapshotMap(before);
    // (its settings and gesture are checked now: a bad one never starts)
    this.slices = planGlaciate(before, settings, intent, valley, !ROUND4);
  }

  get done(): boolean {
    return this.ended;
  }
  get reason(): string {
    return this.ended ? "done" : "";
  }
  get planned(): boolean {
    return this.plan0 !== null;
  }
  get total(): number {
    return ADVANCE_STEPS + RETREAT_STEPS;
  }
  get shown(): number {
    return this.stage;
  }
  /** The glacier's own ground (its trough, benches, moraine, channels and outwash): every level
   *  there is the glacier's, the ones it left as they were included (its banks), so the build's
   *  integrity pass never wears a bank down and opens a spillway. Null before it is planned. */
  footprint(): Uint8Array | null {
    const p = this.plan0 ?? this.pending;
    if (!p) return null;
    const out = new Uint8Array(p.mask.length);
    for (let i = 0; i < out.length; i++) if (p.mask[i] || p.stream[i] || p.fan[i]) out[i] = 1;
    if (this.keep) for (let i = 0; i < out.length; i++) if (this.keep[i]) out[i] = 0;
    return out;
  }

  /** The plan, once made (the effects' ice follows its stations). */
  get plan(): GlaciatePlan | null {
    return this.plan0;
  }

  /** Plan within the budget; true once planned. */
  private planFor(budgetMs: number): boolean {
    if (this.plan0) return true;
    const t0 = performance.now();
    for (;;) {
      const r = this.slices.next();
      if (r.done) {
        this.settle(r.value);
        return true;
      }
      if (performance.now() - t0 > budgetMs) return false;
    }
  }

  /** The plan's last touches: the ground a force leaves as it is (the layer showing, caves, outside
   *  the working area), the build's own (its integrity pass), and the water on what is kept. */
  private settle(p: GlaciatePlan): void {
    const m = p.map;
    // its springs at the map's edge flow into the map (item 27: M9b's edge lip, once callable)
    const had = new Set(this.before.entities.map((e) => e.id));
    const springs = m.entities.filter((e) => e.template === "WaterSource" && !had.has(e.id)).map((e) => ({ x: e.x, y: e.y }));
    this.edgeLeaks = keepSourcesOnMap(m, springs).leaks.map((l) => l.source);
    trimRock(m);
    respectKeep(this.before, m, this.keep);
    this.pending = p;
    this.finalize?.(m);
    this.pending = null;
    // (the tarn keeps only the tiles still at its floor)
    const r = p.retained;
    const keepAt = r.tiles.map((i, k) => m.heights[i] === r.floor[k]);
    if (keepAt.some((k) => !k)) p.retained = { tiles: r.tiles.filter((_, k) => keepAt[k]), floor: r.floor.filter((_, k) => keepAt[k]), depth: r.depth.filter((_, k) => keepAt[k]), contamination: r.contamination.filter((_, k) => keepAt[k]) };
    m.water = prefill({ ...modelOf(m), ...(p.retained.tiles.length ? { retained: [p.retained] } : {}) });
    this.plan0 = p;
  }

  step(): void {
    if (this.ended) return;
    this.steps++;
    if (!this.plan0) {
      this.planFor(PLAN_MS);
      return;
    }
    this.stage++;
    this.show(this.stage);
    if (this.stage >= ADVANCE_STEPS + RETREAT_STEPS) this.ended = true;
  }

  /** Plan all of it at once (tests). */
  planAll(): this {
    this.planFor(Infinity);
    return this;
  }

  finishAll(): this {
    this.planAll();
    while (!this.ended) this.step();
    return this;
  }

  final(): FullForceMap | null {
    return this.plan0?.map ?? null;
  }

  /** The land at `stage` of the two acts (the investigation's reveal): under the advancing ice each
   *  tile takes its final level as the front passes it, and the objects there go; the water stays as
   *  it was (D321, item 30). The last stage is the plan's map itself, with the valley's water. */
  private show(stage: number): void {
    const p = this.plan0!;
    const total = ADVANCE_STEPS + RETREAT_STEPS;
    if (stage >= total) {
      this.map = snapshotMap(p.map);
      this.sim = null;
      return;
    }
    const b = this.before;
    const f = p.map;
    const m = snapshotMap(b);
    const advance = clamp(stage / ADVANCE_STEPS, 0, 1);
    const retreating = stage > ADVANCE_STEPS;
    for (let i = 0; i < m.heights.length; i++) {
      if (p.arrival[i] > advance) continue;
      m.heights[i] = f.heights[i];
      m.lava[i] = f.lava[i];
    }
    const W = m.W;
    const final = new Map(f.entities.map((e) => [e.id, e]));
    m.entities = m.entities.flatMap((e) => {
      const i = e.y * W + e.x;
      if (p.arrival[i] > advance) return [e];
      return final.has(e.id) ? [structuredClone(final.get(e.id)!)] : [];
    });
    if (retreating) {
      const had = new Set(b.entities.map((e) => e.id));
      m.entities.push(...f.entities.filter((e) => !had.has(e.id)).map((e) => structuredClone(e)));
    }
    const ids = new Set(m.entities.map((e) => e.id));
    m.fallen = f.fallen.filter((g) => ids.has(g.id));
    this.map = m;
    this.sim = null;
  }

  cue(): ForceCue {
    const p = this.plan0;
    const o = this.intent.origin;
    const W = this.before.W;
    const total = ADVANCE_STEPS + RETREAT_STEPS;
    const phase = this.ended ? "done" : !p ? "gather" : this.stage <= ADVANCE_STEPS ? "advance" : "retreat";
    // its front: the station the ice has reached (while it gathers, where it was asked)
    const front = p ? p.path[Math.max(0, p.path.findIndex((q) => q.s >= Math.min(1, this.stage / ADVANCE_STEPS)))] : null;
    const x = front ? front.x - 0.5 : o % W;
    const y = front ? front.y - 0.5 : Math.floor(o / W);
    return {
      verb: "glaciate",
      phase,
      progress: p ? this.stage / total : 0,
      x,
      y,
      z: this.before.heights[clamp(Math.round(y), 0, this.before.H - 1) * W + clamp(Math.round(x), 0, W - 1)],
      size: sizeOf(this.settings),
      power: this.settings.power,
      glaciate: {
        seconds: p ? this.stage / 10 : 0,
        ...(p ? { path: p.path.map((q) => ({ x: q.x, y: q.y, s: q.s, r: q.r, floor: q.floor })) } : {}),
      },
    };
  }

  liveWater(): WarmState {
    const m = this.map;
    this.sim ??= new WaterSim(modelOf(m), m.water);
    const sim = this.sim;
    return { model: modelOf(m), water: { settled: false, ticks: sim.ticks, depth: sim.D.slice(), contamination: sim.C.slice(), sat: new Uint8Array(sim.N), out: sim.out.slice(), preview: true } };
  }
}
