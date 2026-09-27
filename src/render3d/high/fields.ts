// The High look's per-map textures: the ambient occlusion (#65) and the water's flow, contamination
// and rough water (#38, #67). A whole map's are made in a worker (bake.worker.ts) and arrive a moment
// after the map; until then the ground has no occlusion and the water no current (a quiet start, never
// a wait). An edit's own tiles are redone here at once. A newer request always wins over an older.

import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";
import type { EntityView, SurfaceWater } from "../model";
import { DEAD } from "../model";
import { AMBIENT_REACH, ambientRect, canopyCover, canopyInto, canopyKind, runBake, type BakeJob, type BakeResult, type Canopies } from "./bake";
import type { RoughCounts } from "./flow";

type Job = BakeJob extends infer J ? (J extends { id: number } ? Omit<J, "id"> : never) : never;

/** The worker the fields are made in (one per High look), or the page's thread where a worker can't
 *  start. */
export class Baker {
  private worker: Worker | null = null;
  private next = 1;
  private waiting = new Map<number, (r: BakeResult) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<BakeResult>) => {
        const done = this.waiting.get(e.data.id);
        this.waiting.delete(e.data.id);
        done?.(e.data);
      };
      this.worker.onerror = () => {
        // (no worker after all: the rest on the page's thread)
        this.worker?.terminate();
        this.worker = null;
      };
    } catch {
      this.worker = null;
    }
  }

  run(job: Job): Promise<BakeResult> {
    const id = this.next++;
    const full = { ...job, id } as BakeJob;
    if (!this.worker) return new Promise((resolve) => setTimeout(() => resolve(runBake(full)), 0));
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.worker!.postMessage(full);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }
}

function texture(W: number, H: number, fill: [number, number, number, number]): DataTexture {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) data.set(fill, i * 4);
  const t = new DataTexture(data, W, H, RGBAFormat, UnsignedByteType);
  t.minFilter = t.magFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

function canopies(e: EntityView): Canopies {
  const kind = new Uint8Array(e.count);
  for (let k = 0; k < e.count; k++) kind[k] = canopyKind(e.templates[e.template[k]], !!(e.flags[k] & DEAD));
  return { kind, x: e.x.slice(), y: e.y.slice(), z: e.z.slice() };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };
const union = (a: Rect | null, b: Rect): Rect => (a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b });

export class AmbientField {
  readonly texture: DataTexture;
  private cover: Float32Array | null = null;
  private latest = 0;
  /** What changed since the bake in flight was asked for (redone when it arrives). */
  private since: Rect | null = null;
  private objectsSince: EntityView | null = null;
  private heights: Uint8Array;
  ms = 0;

  constructor(
    readonly W: number,
    readonly H: number,
    private baker: Baker,
    private changed: () => void,
  ) {
    // no occlusion until the bake arrives
    this.texture = texture(W, H, [255, 255, 0, 255]);
    this.heights = new Uint8Array(W * H);
  }

  /** Whether the last bake asked for has arrived. */
  get ready(): boolean {
    return this.done === this.latest;
  }
  private done = 0;

  bake(heights: Uint8Array, e: EntityView): void {
    const id = ++this.latest;
    this.heights = heights;
    this.since = null;
    this.objectsSince = null;
    void this.baker.run({ kind: "ambient", W: this.W, H: this.H, heights: heights.slice(), canopies: canopies(e) }).then((r) => {
      if (id !== this.latest || r.kind !== "ambient") return;
      this.done = id;
      this.cover = r.cover;
      (this.texture.image.data as Uint8Array).set(r.data);
      this.ms = r.ms;
      if (this.objectsSince) this.objects(this.heights, this.objectsSince);
      if (this.since) this.redo(this.since);
      this.since = null;
      this.texture.needsUpdate = true;
      this.changed();
    });
  }

  /** The canopies again (the objects changed). */
  objects(heights: Uint8Array, e: EntityView): void {
    this.heights = heights;
    if (!this.cover) {
      this.objectsSince = e;
      return;
    }
    this.cover = canopyCover(this.W, this.H, heights, canopies(e));
    canopyInto(this.cover, this.texture.image.data as Uint8Array);
    this.texture.needsUpdate = true;
  }

  /** The terrain round a rectangle of changed heights. */
  terrainAround(heights: Uint8Array, rect: Rect): void {
    this.heights = heights;
    const r = AMBIENT_REACH;
    const grown = { x0: rect.x0 - r, y0: rect.y0 - r, x1: rect.x1 + r, y1: rect.y1 + r };
    if (!this.cover) {
      this.since = union(this.since, grown);
      return;
    }
    this.redo(grown);
    this.texture.needsUpdate = true;
  }

  private redo(r: Rect): void {
    ambientRect(this.W, this.H, this.heights, this.cover!, this.texture.image.data as Uint8Array, r.x0, r.y0, r.x1, r.y1);
  }

  dispose(): void {
    this.latest = -1;
    this.texture.dispose();
  }
}

export class FlowField {
  /** The flow (RG, 128 still) and the smoothed contamination (B); the rough water (R). */
  readonly flow: DataTexture;
  readonly rough: DataTexture;
  counts: RoughCounts = { falls: 0, rapids: 0, obstacles: 0, wet: 0 };
  ms = 0;
  private latest = 0;
  private done = 0;
  private baked = false;

  /** Whether the last bake asked for has arrived. */
  get ready(): boolean {
    return this.done === this.latest;
  }

  constructor(
    readonly W: number,
    readonly H: number,
    private baker: Baker,
    private changed: () => void,
  ) {
    this.flow = texture(W, H, [128, 128, 0, 255]);
    this.rough = texture(W, H, [0, 0, 0, 255]);
  }

  /** The water changed: its flow and rough water again, a moment later (a new map's contamination
   *  shows at once, unsmoothed, until its first bake arrives). */
  update(heights: Uint8Array, sw: SurfaceWater): void {
    const id = ++this.latest;
    if (!this.baked) {
      const f = this.flow.image.data as Uint8Array;
      for (let i = 0; i < this.W * this.H; i++) f[i * 4 + 2] = Math.round(Math.max(0, Math.min(1, sw.contamination[i] || 0)) * 255);
      this.flow.needsUpdate = true;
    }
    const copy: SurfaceWater = { surface: sw.surface.slice(), floor: sw.floor.slice(), depth: sw.depth.slice(), contamination: sw.contamination.slice(), lower: [] };
    void this.baker.run({ kind: "flow", W: this.W, H: this.H, heights: heights.slice(), sw: copy }).then((r) => {
      if (id !== this.latest || r.kind !== "flow") return;
      this.done = id;
      (this.flow.image.data as Uint8Array).set(r.flow);
      (this.rough.image.data as Uint8Array).set(r.rough);
      this.flow.needsUpdate = true;
      this.rough.needsUpdate = true;
      this.counts = r.counts;
      this.ms = r.ms;
      this.baked = true;
      this.changed();
    });
  }

  dispose(): void {
    this.latest = -1;
    this.flow.dispose();
    this.rough.dispose();
  }
}
