// Water that moves (a stroke's, a force's, the water's journey after an edit) meshed in workers
// (waterMesh.worker.ts), so the view keeps the display's rate while it flows: meshing a chunk costs a
// couple of milliseconds, and moving water changes a dozen or more chunks many times a second. A batch
// is one moment of the water: all the chunks it changed, meshed on that one water (split over a few
// workers) and handed back whole, so the renderer draws them together, never a mix of moments
// (renderer.drainWater). While a batch is out, newer water waits; the next batch takes the latest water
// and every chunk changed since, so a moment the workers can't keep up with is skipped, never shown in
// pieces. If a worker can't start or fails, the chunks go back to the renderer, which meshes them on the
// page's thread.

import type { MapView, SurfaceWater, WaterView } from "./model";
import type { WaterMeshData } from "./waterMesh";
import { SharedBlock } from "./shared";

/** The water a chunk is meshed on: the arrays meshWaterChunk reads (its one layer on a heightfield, `plainLayers`). */
export type MesherWater = Pick<SurfaceWater, "surface" | "floor" | "depth" | "contamination" | "top" | "outflow">;

/** With water per column (waterLayers.ts): the view itself and the map's columns, `key` their version, which the
 *  workers deal into layers. */
export type MesherLayered = { view: WaterView; columns: MapView["columns"] & { key: number } };

export type MesherRequest = { kind: "batch"; id: number; version: number; W: number; H: number; heights: Uint8Array; sw: MesherWater; keys: string[]; layered?: MesherLayered };
export type MesherReply = { kind: "batch"; id: number; chunks: { key: string; data: WaterMeshData }[]; failed: { key: string; error: string }[] };

let warned = false;
function warnOnce(why: string): void {
  if (warned) return;
  warned = true;
  console.warn(`The renderer's water worker failed (${why}); moving water is meshed on the page's thread.`);
}

/** Workers for the water's meshes: a few, never more than a quarter of the machine's threads. */
function poolSize(): number {
  const n = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  return Math.max(1, Math.min(3, Math.floor(n / 4)));
}

export class WaterMesher {
  private workers: Worker[] = [];
  /** The version of the columns each worker was last sent (water per column, `MesherLayered`). */
  private readonly columnsKey: number[] = [];
  private nextId = 1;
  /** The batch out: its water's version, its chunks, the parts still to come back, what came back. */
  private batch: { id: number; version: number; keys: string[]; parts: number; chunks: Map<string, WaterMeshData>; failed: string[] } | null = null;
  /** The shared memory a batch's water goes to the workers in (shared.ts): one batch out at a time, and the answer
   *  of one forgotten (`clear`) is never drawn, so the next batch may reuse it. */
  private readonly block = new SharedBlock();

  constructor(
    /** A batch meshed: every chunk it asked for, on the water of `version`. */
    private readonly done: (version: number, chunks: Map<string, WaterMeshData>) => void,
    /** These chunks are still to mesh (a worker failed, or one chunk threw there). */
    private readonly lost: (keys: string[]) => void,
    size = poolSize(),
  ) {
    try {
      for (let k = 0; k < size; k++) {
        const w = new Worker(new URL("./waterMesh.worker.ts", import.meta.url), { type: "module" });
        w.onmessage = (e: MessageEvent<MesherReply>) => this.part(e.data);
        w.onerror = (e) => {
          e.preventDefault();
          this.fail(e.message || "it stopped");
        };
        w.onmessageerror = () => this.fail("an answer couldn't be read");
        this.workers.push(w);
        // (a new worker has no columns: the next batch sends them)
        this.columnsKey[this.workers.length - 1] = -1;
      }
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "it couldn't start");
    }
  }

  /** Whether chunks can be sent. */
  get working(): boolean {
    return this.workers.length > 0;
  }

  /** A batch is out. */
  get busy(): boolean {
    return this.batch !== null;
  }

  /** The chunks of the batch out. */
  get asked(): readonly string[] {
    return this.batch?.keys ?? [];
  }

  /** Mesh these chunks (nearest the view first) on the water of `version`: one batch, shared out. */
  mesh(version: number, W: number, H: number, heights: Uint8Array, sw: SurfaceWater, keys: string[], layered?: MesherLayered): void {
    if (!this.workers.length) return this.lost(keys);
    const id = this.nextId++;
    // (dealt in turn, so each worker gets near and far chunks alike)
    const parts = this.workers.map(() => [] as string[]);
    keys.forEach((k, j) => parts[j % parts.length].push(k));
    this.batch = { id, version, keys, parts: parts.filter((p) => p.length).length, chunks: new Map(), failed: [] };
    // (a worker keeps the columns it was last sent, by their version: they go again only when that changed)
    const known = layered && { ...layered, columns: { key: layered.columns.key, tiles: new Int32Array(0), voxels: new Uint8Array(0) } };
    let water: MesherWater = { surface: sw.surface, floor: sw.floor, depth: sw.depth, contamination: sw.contamination, top: sw.top, outflow: sw.outflow };
    // (one copy on shared memory where the page can share it, the same for every worker, in the block the last batch
    // was read from; else each worker gets its own copy as it is posted. Copies either way: the page keeps changing
    // its heights, and a stroke its water's floor, in place)
    const shared = this.block.copies([heights, sw.surface, sw.floor, sw.depth, sw.contamination, sw.top, sw.outflow ?? new Float32Array(0)] as const);
    if (shared) {
      const [h, surface, floor, depth, contamination, top, outflow] = shared;
      heights = h;
      water = { surface, floor, depth, contamination, top, outflow: sw.outflow ? outflow : null };
    }
    try {
      parts.forEach((p, j) => {
        if (!p.length) return;
        const fresh = layered && this.columnsKey[j] !== layered.columns.key;
        this.workers[j].postMessage({ kind: "batch", id, version, W, H, heights, sw: water, keys: p, layered: fresh ? layered : known || undefined } satisfies MesherRequest);
        if (layered) this.columnsKey[j] = layered.columns.key;
      });
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "the water couldn't be sent");
    }
  }

  private part(r: MesherReply): void {
    const b = this.batch;
    if (!b || r.id !== b.id) return;
    for (const c of r.chunks) b.chunks.set(c.key, c.data);
    for (const f of r.failed) {
      // (that chunk on the page's thread, where its error shows as it always did)
      warnOnce(f.error);
      b.failed.push(f.key);
    }
    if (--b.parts > 0) return;
    this.batch = null;
    this.done(b.version, b.chunks);
    if (b.failed.length) this.lost(b.failed);
  }

  /** Forget the batch out (the renderer meshed its chunks itself). */
  clear(): void {
    this.batch = null;
  }

  private fail(why: string): void {
    warnOnce(why);
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.columnsKey.length = 0;
    const keys = this.batch?.keys ?? [];
    this.batch = null;
    if (keys.length) this.lost([...keys]);
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.batch = null;
    this.columnsKey.length = 0;
  }
}
