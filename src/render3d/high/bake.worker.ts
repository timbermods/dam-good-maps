// The renderer's per-map fields made off the page's thread (bake.ts): the High look's ambient
// occlusion (about 0.2 s at 256²) and, for both looks, the water's flow and the moving water's shapes,
// so the view never waits on them. A job that throws comes back as its error (fields.ts's Baker), so
// the worker carries on with the next.

import { shapeBuffers } from "../motionShapes";
import { runBake, type BakeJob, type BakeReply } from "./bake";

self.onmessage = (e: MessageEvent<BakeJob>) => {
  const post = (r: BakeReply, transfer: ArrayBuffer[] = []) => (self as unknown as Worker).postMessage(r, transfer);
  try {
    const r = runBake(e.data);
    post(r, r.kind === "ambient" ? [r.data.buffer as ArrayBuffer, r.cover.buffer as ArrayBuffer] : [r.flow.buffer as ArrayBuffer, r.rough.buffer as ArrayBuffer, ...shapeBuffers(r.shapes)]);
  } catch (err) {
    post({ id: e.data.id, kind: "error", error: err instanceof Error ? err.message : String(err) });
  }
};
