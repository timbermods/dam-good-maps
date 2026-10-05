// Rift presentation only. All geometry, terrain, rock and riders are planned in Rust (D438).
import { snapshotMap, type FullForceMap } from "./force";
import { footprint } from "./objects";
import { Staged, type StagedRun, type ForceCue } from "./runs";
import { planInRust, type RiftRecords } from "./rust/bridge";
import { forceSettingsProblem } from "./settings";
import type { Point } from "./quake";
import { smoothstep } from "../math/clamp";
import { transportRock } from "./rock";
export interface RiftSettings { mode: "drop"; power: number; size: number | null; walls: "auto" | "sheer" | "stepped"; floor: number; seed: number }
export interface RiftIntent { path: Point[] }
export const RIFT_DEFAULTS: RiftSettings = { mode: "drop", power: 70, size: null, walls: "auto", floor: 1, seed: 1 };
export function validateRift(s: RiftSettings): void { const why = forceSettingsProblem("rift", s as unknown as Record<string, unknown>); if (why) throw new Error(why); }
/** One Rust call, then the ordinary staged playback/keep/history path; no UI dependencies. */
export class RiftRun extends Staged implements StagedRun {
  readonly verb = "rift" as const;
  readonly plan0: RiftRecords;
  private readonly source: Uint32Array;
  protected readonly stages = 20;
  protected readonly approach = 1;
  constructor(before: FullForceMap, readonly settings: RiftSettings, readonly intent: RiftIntent, keep: Uint8Array | null = null, areaDepth: Uint8Array | null = null) {
    validateRift(settings);
    super(before, keep);
    this.source = Uint32Array.from(before.heights, (_, i) => i);
    this.plan0 = planInRust({ verb: "rift", map: before, settings, intent, keep, areaDepth });
  }
  protected settle(): void {
    this.finalize?.(this.plan0.raw);
    // Build touches can weather neighbouring tiles: put them behind the nearest rupture front.
    const { raw, arrival, fault } = this.plan0;
    for (let i = 0; i < arrival.length; i++) if (raw.heights[i] !== this.before.heights[i] && arrival[i] > 1) {
      let near = 0, best = Infinity;
      for (let k = 0; k < fault.points.length; k++) {
        const p = fault.points[k], dx = p.x - i % raw.W, dy = p.y - Math.floor(i / raw.W), d = dx * dx + dy * dy;
        if (d < best) { best = d; near = k; }
      }
      arrival[i] = .04 + .74 * near / Math.max(1, fault.points.length - 1);
    }
  }
  final(): FullForceMap | null { return this.planned ? this.plan0.raw : null; }
  protected show(stage: number): void {
    const { raw, arrival } = this.plan0;
    const t = stage / this.stages;
    if (stage >= this.stages) { this.map = snapshotMap(raw); return; }
    // Both object lists are replaced below; do not clone the discarded lists.
    const out = snapshotMap<FullForceMap>({ ...this.before, entities: [], fallen: [] });
    for (let i = 0; i < arrival.length; i++) if (arrival[i] <= t)
      out.heights[i] = Math.round(this.before.heights[i] + (raw.heights[i] - this.before.heights[i]) * smoothstep((t - arrival[i]) / .14));
    transportRock(this.before, out, this.source, true);
    const after = new Map(raw.entities.map(e => [e.id, e]));
    out.entities = this.before.entities.flatMap(e => {
      if (!footprint(this.before, e).some(i => arrival[i] <= t)) return [structuredClone(e)];
      const final = after.get(e.id); if (!final) return [];
      const rider=structuredClone(final), i=final.y*raw.W+final.x;
      rider.z += out.heights[i]-raw.heights[i];return [rider];
    });
    const oldFallen = new Map<string, typeof this.before.fallen[number]>();
    for (const f of this.before.fallen) if (!oldFallen.has(f.id)) oldFallen.set(f.id, f);
    out.fallen = raw.fallen.map(f => {
      const old = oldFallen.get(f.id);
      const i = Math.floor(f.y) * raw.W + Math.floor(f.x);
      if (old && arrival[i] > t) return structuredClone(old);
      return {...structuredClone(f),z:f.z+out.heights[i]-raw.heights[i]};
    });
    // No water or sources are minted; the ordinary warm simulation continues on the displayed ground.
    this.map = out;
  }
  cue(): ForceCue {
    const progress = this.stage / this.stages, pts = this.plan0.fault.points;
    const p = pts[Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1)))];
    const x = Math.max(0, Math.min(this.map.W - 1, Math.round(p.x))), y = Math.max(0, Math.min(this.map.H - 1, Math.round(p.y)));
    return { verb: "rift", phase: this.done ? "done" : this.stage ? "crack" : "rumble", progress, x: p.x, y: p.y,
      z: this.map.heights[y * this.map.W + x], size: this.plan0.stats.width, power: this.settings.power,
      rift: { path: pts, width: this.plan0.stats.width } };
  }
}
