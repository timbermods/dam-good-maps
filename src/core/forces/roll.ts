// Roll presentation only: the swells and the grade are planned in Rust (rust/forces/src/roll.rs, D438).
// The land under the gesture rolls in one-level steps: tabletops break into swells and hollows, cliffs slump
// into graded flanks. Water and the ground beside it stay as they are.
import type { SourcesRule } from "./clear";
import { snapshotMap, type FullForceMap } from "./force";
import { footprint } from "./objects";
import { Staged, type StagedRun, type ForceCue } from "./runs";
import { planInRust, type RollRecords } from "./rust/bridge";
import { forceSettingsProblem } from "./settings";
import type { Point } from "./quake";
import { smoothstep } from "../math/clamp";

export interface RollSettings { mode: "roll"; power: number; size: number | null; floor: number; seed: number; sources?: SourcesRule }
export interface RollIntent { path: Point[] }
export const ROLL_DEFAULTS: RollSettings = { mode: "roll", power: 50, size: null, floor: 1, seed: 1 };
/** Its Size's range, tiles across (core/forces/settings.ts). */
export const ROLL_SIZE_MIN = 8;
export const ROLL_SIZE_MAX = 64;
/** Its width across on Auto, tiles: what Power gives (rust/forces/src/roll.rs `auto_width`). */
export const rollWidth = (power: number): number => 14 + 0.3 * Math.max(0, Math.min(100, power));

export function validateRoll(s: RollSettings): void {
  const why = forceSettingsProblem("roll", s as unknown as Record<string, unknown>);
  if (why) throw new Error(why);
}

/** One Rust call, then the ordinary staged playback, keep and history; no UI dependencies. */
export class RollRun extends Staged implements StagedRun {
  readonly verb = "roll" as const;
  readonly plan0: RollRecords;
  protected readonly stages = 20;
  protected readonly approach = 1;
  constructor(before: FullForceMap, readonly settings: RollSettings, readonly intent: RollIntent, keep: Uint8Array | null = null, areaDepth: Uint8Array | null = null) {
    validateRoll(settings);
    super(before, keep);
    this.plan0 = planInRust({ verb: "roll", map: before, settings, intent, keep, areaDepth });
  }
  protected settle(): void {
    this.finalize?.(this.plan0.raw);
    // the build's touches can change a tile the plan left: it moves with the last of the sweep
    const { raw, arrival } = this.plan0;
    for (let i = 0; i < arrival.length; i++) if (raw.heights[i] !== this.before.heights[i] && arrival[i] > 1) arrival[i] = 0.78;
  }
  final(): FullForceMap | null {
    return this.planned ? this.plan0.raw : null;
  }
  protected show(stage: number): void {
    const { raw, arrival } = this.plan0;
    const t = stage / this.stages;
    if (stage >= this.stages) {
      this.map = snapshotMap(raw);
      return;
    }
    const out = snapshotMap<FullForceMap>({ ...this.before, entities: [], fallen: [] });
    for (let i = 0; i < arrival.length; i++)
      if (arrival[i] <= t) out.heights[i] = Math.round(this.before.heights[i] + (raw.heights[i] - this.before.heights[i]) * smoothstep((t - arrival[i]) / 0.14));
    // objects ride their ground as it moves; no object is added or minted
    const after = new Map(raw.entities.map((e) => [e.id, e]));
    out.entities = this.before.entities.flatMap((e) => {
      if (!footprint(this.before, e).some((i) => arrival[i] <= t)) return [structuredClone(e)];
      const final = after.get(e.id);
      if (!final) return [];
      const rider = structuredClone(final);
      rider.z += out.heights[final.y * raw.W + final.x] - raw.heights[final.y * raw.W + final.x];
      return [rider];
    });
    const oldFallen = new Map<string, (typeof this.before.fallen)[number]>();
    for (const f of this.before.fallen) if (!oldFallen.has(f.id)) oldFallen.set(f.id, f);
    out.fallen = raw.fallen.map((f) => {
      const old = oldFallen.get(f.id);
      const i = Math.floor(f.y) * raw.W + Math.floor(f.x);
      if (old && arrival[i] > t) return structuredClone(old);
      return { ...structuredClone(f), z: f.z + out.heights[i] - raw.heights[i] };
    });
    this.map = out;
  }
  cue(): ForceCue {
    const progress = this.stage / this.stages;
    const pts = this.intent.path;
    const p = pts[Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1)))];
    const x = Math.max(0, Math.min(this.map.W - 1, Math.round(p.x)));
    const y = Math.max(0, Math.min(this.map.H - 1, Math.round(p.y)));
    return { verb: "roll", phase: this.done ? "done" : "rumble", progress, x: p.x, y: p.y, z: this.map.heights[y * this.map.W + x], size: this.plan0.stats.width, power: this.settings.power };
  }
}
