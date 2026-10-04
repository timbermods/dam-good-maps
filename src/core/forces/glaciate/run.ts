// Glaciate at work (PLAN §20 D246, D291, D292; the investigation's two acts, INTEGRATION.md): planned
// when it starts (in Rust, rust/bridge.ts; the land of investigation/glaciate's round 4, its floor's water
// led into the main river, D292), the ice gathers where it was asked while the plan is given its last
// touches; then the ice advances for three seconds, the land under it taking its final levels as
// the front passes (every height is the plan's before the retreat begins), and melts back for two.
// The editor paces the stages (D321, item 29: Fast, or Slow forces); nothing changes before the ice reaches
// it (item 30): the objects in its path go as the front passes, and the water stays as it was until
// the land is final, when the valley's own water (its tarn, its meltwater river) takes over. What is
// kept is always the plan's final map (the stages only show it), so the result never depends on the
// pace, the machine or the effects.

import { prefill } from "../../sim/prefill";
import type { RetainedWater } from "../../sim/water";
import { snapshotMap, type FullForceMap } from "../force";
import { clamp } from "../random";
import { trimRock } from "../rock";
import { modelOf, respectKeep, Staged, type ForceCue, type StagedRun } from "../runs";
import { planInRust } from "../rust/bridge";
import { glaciateProblem, sizeOf, type Basin, type GlaciateIntent, type GlaciateSettings, type Hanging, type Point, type Station } from "./model";

/** What a glacier did: the levels cut and laid, what it carried away, the objects it took, the sources
 *  it swept (clean ones fed into its cirque head, badwater discarded), its pools' joins, and its
 *  lengths. */
export interface GlaciateMetrics {
  cut: number;
  deposited: number;
  carriedAway: number;
  treesRemoved: number;
  objectsRemoved: number;
  cleanAbsorbed: number;
  badSwept: number;
  maxPoolJoin: number;
  length: number;
  valleyLength: number;
  centreline: number;
  valley: number;
  outwash: number;
  requestedWidth: number;
}

/** A planned glacier: the map it started from and the one it makes, its route and stations, when
 *  each tile takes its final level (0–1 along the way: the ice's advance), the trough (1 floor, 2
 *  benches and moraine), the floor datum, the channels (1 the main river, 2 pools and joins, 3
 *  hanging gullies), the outwash fan, its basins and their kept water, its hanging valleys. */
export interface GlaciatePlan {
  before: FullForceMap;
  map: FullForceMap;
  settings: GlaciateSettings;
  intent: GlaciateIntent;
  path: Station[];
  reference: Point[];
  streamPath: Point[];
  arrival: Float32Array;
  mask: Uint8Array;
  floor: Uint8Array;
  nearest: Int32Array;
  stream: Uint8Array;
  fan: Uint8Array;
  retained: RetainedWater;
  basins: Basin[];
  hanging: Hanging[];
  metrics: GlaciateMetrics;
  /** The floor's water as one river (D292): the falls' pools and inflows the river could visit, and
   *  the ones it reached. */
  finished: { style: string; visits: number; reached: number; floods?: number; floodTicks?: number };
  /** The channels led across the floor to the river: from a fall's pool, a lip's other face, an
   *  inflow; where from, and how long. */
  joins: { kind: "fall" | "spill" | "inflow"; from: number; length: number }[];
}

/** A glacier planned on `input` (in Rust, in one call), before the editor's last touches (Keep, the
 *  build's own, its water): the land of round 4, its floor's water led into the main river (D292). Throws
 *  why it can't start. */
export function planGlacier(input: FullForceMap, settings: GlaciateSettings, intent: GlaciateIntent): GlaciatePlan {
  const problem = glaciateProblem(input.W, input.H, settings, intent);
  if (problem) throw new Error(problem);
  const { raw, verb: _verb, ...records } = planInRust({ verb: "glaciate", map: input, settings, intent, keep: null });
  return { before: input, map: raw, settings, intent, ...records };
}

/** Steps of its advance and its retreat (ten a second: three seconds, then two). */
export const ADVANCE_STEPS = 30;
export const RETREAT_STEPS = 20;

export class GlaciateRun extends Staged implements StagedRun {
  readonly verb = "glaciate" as const;
  protected readonly stages = ADVANCE_STEPS + RETREAT_STEPS;
  protected readonly approach = 0;
  /** The plan, once given its last touches. */
  private plan0: GlaciatePlan | null = null;
  /** The plan as Rust made it (its last touches still to come). */
  private readonly made: GlaciatePlan;
  /** The plan being given its last touches (its footprint is protected while they are made). */
  private pending: GlaciatePlan | null = null;

  constructor(
    before: FullForceMap,
    readonly settings: GlaciateSettings,
    readonly intent: GlaciateIntent,
    keep: Uint8Array | null = null,
  ) {
    super(before, keep);
    // (its settings and gesture are checked now: a bad one never starts)
    this.made = planGlacier(before, settings, intent);
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

  /** The plan's last touches: the ground a force leaves as it is (the layer showing, caves, outside
   *  the working area), the build's own (its integrity pass), and the water on what is kept. */
  protected settle(): void {
    const p = this.made;
    const m = p.map;
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

  final(): FullForceMap | null {
    return this.plan0?.map ?? null;
  }

  /** The land at `stage` of the two acts (the investigation's reveal): under the advancing ice each
   *  tile takes its final level as the front passes it, and the objects there go; the water stays as
   *  it was (D321, item 30). The last stage is the plan's map itself, with the valley's water. */
  protected show(stage: number): void {
    const p = this.plan0!;
    const total = ADVANCE_STEPS + RETREAT_STEPS;
    if (stage >= total) {
      this.map = snapshotMap(p.map);
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
}
