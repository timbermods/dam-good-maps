// Moving water meshed off the page's thread (waterMesher.ts): a batch is one moment of the water and its
// share of the chunks to mesh on it; each chunk is meshWaterChunk's arrays (the same bytes as on the page)
// with its bounding sphere, and the whole share goes back at once.

import type { SurfaceWater } from "./model";
import { boundingSphereOf } from "./bounds";
import { meshWaterChunk, type WaterMeshData } from "./waterMesh";
import { plainLayers } from "./waterLayers";
import type { MesherReply, MesherRequest } from "./waterMesher";

// (a map without terrain above terrain only: one layer, its surface water; a map with it is meshed on the page)

self.onmessage = (e: MessageEvent<MesherRequest>) => {
  const m = e.data;
  const sw: SurfaceWater = { ...m.sw, lower: [] };
  const chunks: { key: string; data: WaterMeshData }[] = [];
  const failed: { key: string; error: string }[] = [];
  const transfer: ArrayBuffer[] = [];
  for (const key of m.keys) {
    const [cx, cy] = key.split(",").map(Number);
    try {
      const d = meshWaterChunk(m.W, m.H, plainLayers(m.heights, sw), cx, cy);
      const sphere = boundingSphereOf(d.positions);
      chunks.push({ key, data: { ...d, sphere } });
      transfer.push(...([d.positions.buffer, d.data.buffer, d.flags.buffer, d.normals.buffer, d.indices.buffer, d.falls.buffer, sphere.buffer] as ArrayBuffer[]));
    } catch (err) {
      failed.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }
  (self as unknown as Worker).postMessage({ kind: "batch", id: m.id, chunks, failed } satisfies MesherReply, transfer);
};
