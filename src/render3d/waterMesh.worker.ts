// Moving water meshed off the page's thread (waterMesher.ts): a batch is one moment of the water and its
// share of the chunks to mesh on it; each chunk is meshWaterChunk's arrays (the same bytes as on the page)
// with its bounding sphere, and the whole share goes back at once. With water per column (waterLayers.ts) the
// batch carries the view and the map's columns, and the water is dealt into its layers here, once a batch.

import { columnMap, type SurfaceWater } from "./model";
import { boundingSphereOf } from "./bounds";
import { meshWaterChunk, type WaterMeshData } from "./waterMesh";
import { plainLayers, waterLayers } from "./waterLayers";
import type { MesherReply, MesherRequest } from "./waterMesher";

/** The map's columns as last sent, kept while their version holds (their gaps are kept with them; a batch on the
 *  same version comes without them). */
let columns: { key: number; map: Map<number, Uint8Array> } | null = null;

self.onmessage = (e: MessageEvent<MesherRequest>) => {
  const m = e.data;
  const sw: SurfaceWater = { ...m.sw, lower: [] };
  const chunks: { key: string; data: WaterMeshData }[] = [];
  const failed: { key: string; error: string }[] = [];
  const transfer: ArrayBuffer[] = [];
  let layers = plainLayers(m.heights, sw);
  if (m.layered) {
    const c = m.layered.columns;
    // (columns of a version this worker never had, sent without their voxels: its chunks go back to the page)
    if (columns?.key !== c.key && !c.tiles.length) {
      const why = "the map's columns weren't sent to the water worker";
      (self as unknown as Worker).postMessage({ kind: "batch", id: m.id, chunks: [], failed: m.keys.map((key) => ({ key, error: why })) } satisfies MesherReply);
      return;
    }
    if (columns?.key !== c.key) columns = { key: c.key, map: columnMap(c) };
    layers = waterLayers(m.W, m.H, m.heights, columns.map, m.layered.view, sw);
  }
  for (const key of m.keys) {
    const [cx, cy] = key.split(",").map(Number);
    try {
      const d = meshWaterChunk(m.W, m.H, layers, cx, cy);
      const sphere = boundingSphereOf(d.positions);
      chunks.push({ key, data: { ...d, sphere } });
      transfer.push(...([d.positions.buffer, d.data.buffer, d.flags.buffer, d.normals.buffer, d.indices.buffer, d.falls.buffer, sphere.buffer] as ArrayBuffer[]));
    } catch (err) {
      failed.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }
  (self as unknown as Worker).postMessage({ kind: "batch", id: m.id, chunks, failed } satisfies MesherReply, transfer);
};
