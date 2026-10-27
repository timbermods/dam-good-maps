// Presentation only; the conserved cut/fill, branches and arrival tape are produced in Rust.
import { snapshotMap, type FullForceMap } from "./force";
import { footprint } from "./objects";
import { Staged, type StagedRun, type ForceCue } from "./runs";
import { planInRust, type DepositRecords } from "./rust/bridge";
import { forceSettingsProblem } from "./settings";
import type { Point } from "./quake";
import { smoothstep } from "../math/clamp";
import { trimRock } from "./rock";

export interface DepositSettings { mode: "fan"; power: number; size: number | null; channels: "auto" | "few" | "many"; floor: number; seed: number }
export interface DepositIntent { path: Point[] }
export const DEPOSIT_DEFAULTS: DepositSettings = { mode: "fan", power: 70, size: null, channels: "auto", floor: 1, seed: 1 };
export function validateDeposit(s: DepositSettings): void {
  const why = forceSettingsProblem("deposit", s as unknown as Record<string, unknown>);
  if (why) throw new Error(why);
}
/** Rust applies Keep, Floor and the working area's depth before balancing sediment. */
export class DepositRun extends Staged implements StagedRun {
  readonly verb = "deposit" as const;
  readonly plan0: DepositRecords;
  protected readonly stages = 40;
  protected readonly approach = 0;
  constructor(before: FullForceMap, readonly settings: DepositSettings, readonly intent: DepositIntent,
    keep: Uint8Array | null = null, areaDepth: Uint8Array | null = null) {
    validateDeposit(settings);
    super(before, keep);
    this.plan0 = planInRust({ verb: "deposit", map: before, settings, intent, keep, areaDepth });
  }
  // An independent weathering/clamping pass would create or destroy the balanced material.
  protected settle(): void {}
  final(): FullForceMap | null { return this.planned ? this.plan0.raw : null; }
  protected show(stage: number): void {
    const { raw, arrival, channelStages, mouth } = this.plan0;
    const t = stage / this.stages, out = snapshotMap(this.before);
    const channels = channelStages[Math.min(2, Math.floor(t * 3))];
    for (let i = 0; i < arrival.length; i++) if (arrival[i] <= t) {
      out.heights[i] = Math.round(this.before.heights[i] + (raw.heights[i] - this.before.heights[i]) * smoothstep((t - arrival[i]) / .10));
      // The temporary channel bed belongs to playback only; the final frame is the full Rust map.
      if (t < 2 / 3 && channels[i] && raw.heights[i] > this.before.heights[i])
        out.heights[i] = Math.max(this.before.heights[i], out.heights[i] - 1);
    }
    trimRock(out);
    const after = new Map(raw.entities.map(e => [e.id, e]));
    out.entities = this.before.entities.flatMap(e => {
      if (!footprint(this.before, e).some(i => arrival[i] <= t)) return [structuredClone(e)];
      const final = after.get(e.id);
      if (!final) return [];
      const rider=structuredClone(final), i=final.y*raw.W+final.x;
      rider.z += out.heights[i]-raw.heights[i];
      return [rider];
    });
    out.fallen = this.before.fallen.flatMap(f => {
      const i = Math.floor(f.y) * raw.W + Math.floor(f.x);
      const final = raw.fallen.find(g => g.id === f.id);
      return arrival[i] > t ? [structuredClone(f)] : final ? [{...structuredClone(final),z:final.z+out.heights[i]-raw.heights[i]}] : [];
    });
    this.map = stage >= this.stages ? snapshotMap(raw) : out;
  }
  cue(): ForceCue {
    const p = this.plan0.mouth, progress = this.stage / this.stages;
    const x = Math.max(0, Math.min(this.map.W - 1, Math.round(p.x))), y = Math.max(0, Math.min(this.map.H - 1, Math.round(p.y)));
    return { verb: "deposit", phase: this.done ? "done" : "advance", progress, x: p.x, y: p.y,
      z: this.map.heights[y * this.map.W + x], size: this.plan0.width, power: this.settings.power,
      deposit: { mouth: p, direction: this.plan0.direction, reach: this.plan0.reach, branches: this.plan0.branches } };
  }
}
