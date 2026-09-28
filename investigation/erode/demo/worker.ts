// Plans an erode off the page (the page keeps its frame rate and its dust while the rock is
// planned), and checks the final land with the game's support rule (terrain3d's port, over every
// voxel of the map): the number the demo shows as "dropped on load".
import { checkSupport } from "../../terrain3d/proto/support";
import { planErode, type ErodeSettings, type Gesture } from "../core/erode";
import { LAYERS, Terrain } from "../core/terrain";
import type { WashDetails } from "../core/wash";

export interface PlanRequest {
  id: number;
  W: number;
  H: number;
  cols: Uint32Array;
  rock: number[];
  keep: Uint8Array;
  water: Float32Array;
  gesture: Gesture;
  settings: ErodeSettings;
}

export interface PlanReply {
  id: number;
  removed: Int32Array;
  bucket: Uint8Array;
  buckets: number;
  duration: number;
  finalCols: Uint32Array;
  worn: number;
  held: number;
  fell: number;
  focus: { x: number; y: number; z: number } | null;
  box: { x0: number; y0: number; x1: number; y1: number };
  ms: number;
  checkMs: number;
  dropped: number;
  reason?: string;
  details?: WashDetails;
}

self.onmessage = (ev: MessageEvent<PlanRequest>) => {
  const r = ev.data;
  const t = new Terrain(r.W, r.H, r.cols);
  const plan = planErode({ terrain: t, rock: r.rock, keep: r.keep, water: r.water }, r.gesture, r.settings);
  const c0 = performance.now();
  const dropped = plan.reason ? 0 : checkSupport(r.W, r.H, plan.final.voxels(), LAYERS).unsupported.length;
  const reply: PlanReply = {
    id: r.id,
    removed: plan.removed,
    bucket: plan.bucket,
    buckets: plan.buckets,
    duration: plan.duration,
    finalCols: plan.final.cols,
    worn: plan.worn,
    held: plan.held,
    fell: plan.fell,
    focus: plan.focus,
    box: plan.box,
    ms: plan.ms,
    checkMs: performance.now() - c0,
    dropped,
    reason: plan.reason,
    details: plan.details,
  };
  (self as unknown as Worker).postMessage(reply, [plan.removed.buffer, plan.bucket.buffer, plan.final.cols.buffer]);
};
