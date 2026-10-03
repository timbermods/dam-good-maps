// The renderer's per-map fields made off the page's thread (bake.ts): the High look's ambient
// occlusion (about 0.2 s at 256²) and, for both looks, the water's flow and the moving water's shapes,
// so the view never waits on them.

import { shapeBuffers } from "../motionShapes";
import { runBake, type BakeJob, type BakeResult } from "./bake";

self.onmessage = (e: MessageEvent<BakeJob>) => {
  const r: BakeResult = runBake(e.data);
  const transfer: ArrayBuffer[] = r.kind === "ambient" ? [r.data.buffer as ArrayBuffer, r.cover.buffer as ArrayBuffer] : [r.flow.buffer as ArrayBuffer, r.rough.buffer as ArrayBuffer, ...shapeBuffers(r.shapes)];
  (self as unknown as Worker).postMessage(r, transfer);
};
