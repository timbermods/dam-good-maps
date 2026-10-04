// A stroke's water meshed off the page's thread (waterMesher.ts, renderer.updateWaterSoon): the
// page sends the water of each version it wants drawn and the chunks to mesh on it, nearest the view
// first; each chunk comes back as its arrays (meshWaterChunk, the same bytes as on the page), on the
// latest water the worker has. One chunk a turn, so a newer water or list is taken in between.

import type { SurfaceWater, WaterView } from "./model";
import { boundingSphereOf } from "./bounds";
import { meshWaterChunk } from "./waterMesh";
import type { MesherReply, MesherRequest } from "./waterMesher";

let state: { version: number; W: number; H: number; heights: Uint8Array; sw: SurfaceWater } | null = null;
const queue = new Set<string>();
// (no lower water on a stroke's path: the view's columns are never read)
const NO_VIEW = {} as WaterView;
const turn = new MessageChannel();
let waiting = false;

const post = (r: MesherReply, transfer: ArrayBuffer[] = []) => (self as unknown as Worker).postMessage(r, transfer);

function next(): void {
  if (waiting || !queue.size || !state) return;
  waiting = true;
  turn.port2.postMessage(0);
}

turn.port1.onmessage = () => {
  waiting = false;
  const s = state;
  const key = queue.values().next().value;
  if (!s || key === undefined) return;
  queue.delete(key);
  const [cx, cy] = key.split(",").map(Number);
  try {
    const d = meshWaterChunk(s.W, s.H, s.heights, s.sw, NO_VIEW, null, cx, cy);
    const sphere = boundingSphereOf(d.positions);
    post({ kind: "chunk", key, version: s.version, data: { ...d, sphere } }, [d.positions.buffer, d.data.buffer, d.flags.buffer, d.normals.buffer, d.indices.buffer, d.falls.buffer, sphere.buffer] as ArrayBuffer[]);
  } catch (err) {
    post({ kind: "error", key, version: s.version, error: err instanceof Error ? err.message : String(err) });
  }
  next();
};

self.onmessage = (e: MessageEvent<MesherRequest>) => {
  const m = e.data;
  if (m.kind === "water") state = { version: m.version, W: m.W, H: m.H, heights: m.heights, sw: { ...m.sw, lower: [] } };
  else if (m.kind === "mesh") for (const k of m.keys) queue.add(k);
  else queue.clear();
  next();
};
