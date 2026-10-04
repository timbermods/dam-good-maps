// A stroke's water meshed in a worker (waterMesh.worker.ts), so painting keeps the display's rate
// while the water follows the brush: meshing a chunk costs a couple of milliseconds, and a stroke's
// water changes chunks all over the map for as long as it is painted. The renderer keeps which chunks
// are still to draw and the water each drawn chunk shows (renderer.updateWaterSoon, drainWater); this
// only carries the work. If the worker can't start or fails, the chunks it had go back to the
// renderer, which meshes them on the page's thread as before.

import type { SurfaceWater } from "./model";
import type { WaterMeshData } from "./waterMesh";

/** The water a chunk is meshed on: the arrays meshWaterChunk reads (no lower water on this path). */
export type MesherWater = Pick<SurfaceWater, "surface" | "floor" | "depth" | "contamination" | "top" | "outflow">;

export type MesherRequest =
  | { kind: "water"; version: number; W: number; H: number; heights: Uint8Array; sw: MesherWater }
  | { kind: "mesh"; keys: string[] }
  | { kind: "clear" };
export type MesherReply = { kind: "chunk"; key: string; version: number; data: WaterMeshData } | { kind: "error"; key: string; version: number; error: string };

let warned = false;
function warnOnce(why: string): void {
  if (warned) return;
  warned = true;
  console.warn(`The renderer's water worker failed (${why}); a stroke's water is meshed on the page's thread.`);
}

export class WaterMesher {
  private worker: Worker | null = null;
  private sent = -1;
  /** The chunks asked for, and the water version each was asked on. */
  readonly asked = new Map<string, number>();

  constructor(
    /** A chunk meshed on the water of `version`. */
    private readonly done: (key: string, version: number, data: WaterMeshData) => void,
    /** The worker is gone: these chunks are still to mesh. */
    private readonly lost: (keys: string[]) => void,
  ) {
    try {
      this.worker = new Worker(new URL("./waterMesh.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<MesherReply>) => {
        const r = e.data;
        const at = this.asked.get(r.key);
        if (at !== undefined && r.version >= at) this.asked.delete(r.key);
        if (r.kind === "chunk") this.done(r.key, r.version, r.data);
        else {
          // (that chunk on the page's thread, where its error shows as it always did)
          warnOnce(r.error);
          this.lost([r.key]);
        }
      };
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.fail(e.message || "it stopped");
      };
      this.worker.onmessageerror = () => this.fail("an answer couldn't be read");
    } catch (e) {
      this.fail(e instanceof Error ? e.message : "it couldn't start");
    }
  }

  /** Whether chunks can be sent. */
  get working(): boolean {
    return this.worker !== null;
  }

  /** Mesh these chunks (nearest the view first) on the water of `version`. */
  mesh(version: number, W: number, H: number, heights: Uint8Array, sw: SurfaceWater, keys: string[]): void {
    if (!this.worker) return this.lost(keys);
    try {
      if (this.sent !== version) {
        // (copies: the page keeps painting its heights in place)
        const water: MesherWater = { surface: sw.surface, floor: sw.floor, depth: sw.depth, contamination: sw.contamination, top: sw.top, outflow: sw.outflow };
        this.worker.postMessage({ kind: "water", version, W, H, heights, sw: water } satisfies MesherRequest);
        this.sent = version;
      }
      this.worker.postMessage({ kind: "mesh", keys } satisfies MesherRequest);
      for (const k of keys) this.asked.set(k, version);
    } catch (e) {
      for (const k of keys) this.asked.set(k, version);
      this.fail(e instanceof Error ? e.message : "the water couldn't be sent");
    }
  }

  /** Forget the chunks asked for (the renderer meshed them itself). */
  clear(): void {
    this.asked.clear();
    this.worker?.postMessage({ kind: "clear" } satisfies MesherRequest);
  }

  private fail(why: string): void {
    warnOnce(why);
    this.worker?.terminate();
    this.worker = null;
    const keys = [...this.asked.keys()];
    this.asked.clear();
    if (keys.length) this.lost(keys);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.asked.clear();
  }
}
