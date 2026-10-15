// Erode (D281): wind and water wear rock, the land deciding the form (a cave or an alcove at a
// cliff's foot, an overhang where hard rock caps softer rock, an arch through a thin ridge; on flat
// ground a scoured hollow). Presentation only: the wear, the rock kept to hold every roof (nothing the
// game drops, D121) and the order it shows in are planned in Rust (rust/forces/src/erode.rs, D438,
// D444); this shows the plan as its voxels go, bucket by bucket, over two to four seconds (Power sets
// the length), and gives the effects their cue: where, and which voxels went in the last stage (the
// page's dust and falling stones start from them, D240: the land never depends on them).
//
// Its result writes runs (`ForceMap.masks`, the operation's `runs`): the hollows are under a roof, so
// the surface, its objects and its water stay where they are; only scoured ground changes level, and
// what stands on it rides it down.

import type { SourcesRule } from "./clear";
import { snapshotMap, STEPS_PER_SECOND, type FullForceMap } from "./force";
import { Staged, type ForceCue, type StagedRun } from "./runs";
import { planInRust, type ErodeRecords } from "./rust/bridge";
import { forceSettingsProblem } from "./settings";
import type { Point } from "./quake";
import { clamp } from "./random";
import { trimRock } from "./rock";
import { maskPlain, maskSurface } from "../terrain/runs";

export interface ErodeSettings { mode: "wear"; power: number; size: number | null; floor: number; seed: number; sources?: SourcesRule }
/** A click (one point) or a drawn sweep. */
export interface ErodeIntent { path: Point[] }
export const ERODE_DEFAULTS: ErodeSettings = { mode: "wear", power: 55, size: null, floor: 1, seed: 1 };
/** The showing's buckets (rust/forces/src/erode.rs `BUCKETS`). */
export const ERODE_BUCKETS = 24;
/** Its Size across, in tiles, on Auto: what Power gives (rust/forces/src/erode.rs `auto_size`). */
export const erodeSize = (power: number): number => 6 + 0.14 * clamp(power, 0, 100);
/** How long it plays, in its own seconds: two at Power 0, four at 100 (D344: each force its own pace). */
export const erodeSeconds = (power: number): number => 2 + 0.02 * clamp(power, 0, 100);

export function validateErode(s: ErodeSettings): void {
  const why = forceSettingsProblem("erode", s as unknown as Record<string, unknown>);
  if (why) throw new Error(why);
}

/** The voxels of a heightfield: one plain run per tile, up to its height. */
export function plainMasks(heights: ArrayLike<number>): Uint32Array {
  return Uint32Array.from(heights as ArrayLike<number>, (h) => (h >= 32 ? 0xffffffff : h > 0 ? (2 ** h - 1) >>> 0 : 0));
}

/** A force's map with its voxels (the heightfield's when it has none of its own). */
export function withMasks(m: FullForceMap): FullForceMap {
  return m.masks ? m : { ...m, masks: plainMasks(m.heights) };
}

export class ErodeRun extends Staged implements StagedRun {
  readonly verb = "erode" as const;
  readonly plan0: ErodeRecords;
  protected readonly stages: number;
  protected readonly approach = 1;
  /** The voxels that went in the stage just shown (z·N + tile). */
  private went: Uint32Array = new Uint32Array(0);
  /** How many of the plan's voxels have gone by the stage shown. */
  private gone = 0;

  constructor(before: FullForceMap, readonly settings: ErodeSettings, readonly intent: ErodeIntent, keep: Uint8Array | null = null, areaDepth: Uint8Array | null = null) {
    validateErode(settings);
    const m = withMasks(before);
    super(m, keep);
    this.stages = Math.round(STEPS_PER_SECOND * erodeSeconds(settings.power));
    this.plan0 = planInRust({ verb: "erode", map: m, settings, intent, keep, areaDepth });
  }

  protected settle(): void {
    const raw = this.plan0.raw;
    // the build's last touches round the ground it scoured: a tile they move is a plain one
    const was = raw.heights.slice();
    this.finalize?.(raw);
    const masks = raw.masks!;
    for (let i = 0; i < was.length; i++) if (raw.heights[i] !== was[i] && maskPlain(masks[i])) masks[i] = plainMasks([raw.heights[i]])[0];
    trimRock(raw);
  }

  final(): FullForceMap | null {
    return this.planned ? this.plan0.raw : null;
  }

  protected show(stage: number): void {
    const { raw, cells, buckets } = this.plan0;
    const N = raw.W * raw.H;
    // the buckets gone by the end of this stage
    const shown = stage >= this.stages ? ERODE_BUCKETS : Math.floor((stage / this.stages) * ERODE_BUCKETS);
    let k = this.gone;
    while (k < cells.length && buckets[k] < shown) k++;
    this.went = cells.slice(this.gone, k);
    this.gone = k;
    if (stage >= this.stages) {
      this.map = snapshotMap(raw);
      return;
    }
    const out = snapshotMap<FullForceMap>({ ...this.before, entities: [], fallen: [] });
    const masks = out.masks!;
    const touched = new Set<number>();
    for (let q = 0; q < k; q++) {
      const c = cells[q];
      const i = c % N;
      masks[i] &= ~(1 << ((c - i) / N)) >>> 0;
      touched.add(i);
    }
    for (const i of touched) {
      out.heights[i] = maskSurface(masks[i]);
      out.lava[i] &= masks[i];
    }
    // what stands on scoured ground rides it down; nothing else moves
    const dz = (x: number, y: number) => {
      const i = Math.floor(y) * raw.W + Math.floor(x);
      return out.heights[i] - this.before.heights[i];
    };
    if (!this.plan0.stats.scoured) {
      // (a hollow under a roof moves nothing: the same objects every stage, never sent again)
      out.entities = this.before.entities;
      out.fallen = this.before.fallen;
    } else {
      out.entities = this.before.entities.map((e) => ({ ...structuredClone(e), z: e.z + dz(e.x, e.y) }));
      out.fallen = this.before.fallen.map((f) => ({ ...structuredClone(f), z: f.z + dz(f.x, f.y) }));
    }
    this.map = out;
  }

  cue(): ForceCue {
    const s = this.plan0.stats;
    const progress = this.stage / this.stages;
    return {
      verb: "erode",
      phase: this.done ? "done" : this.stage ? "wear" : "rumble",
      progress,
      x: s.x,
      y: s.y,
      z: s.z,
      size: s.size,
      power: this.settings.power,
      erode: { went: this.went.slice(), worn: s.worn, scoured: s.scoured > 0 },
    };
  }
}
