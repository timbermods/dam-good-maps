// The High look's per-map fields made off the page's thread (bake.ts): a map's ambient occlusion
// (about 0.2 s at 256²) and its water's flow (about 50 ms), so the view never waits on them.

import { runBake, type BakeJob, type BakeResult } from "./bake";

self.onmessage = (e: MessageEvent<BakeJob>) => {
  const r: BakeResult = runBake(e.data);
  const transfer: ArrayBuffer[] = r.kind === "ambient" ? [r.data.buffer as ArrayBuffer, r.cover.buffer as ArrayBuffer] : [r.flow.buffer as ArrayBuffer, r.rough.buffer as ArrayBuffer];
  (self as unknown as Worker).postMessage(r, transfer);
};
