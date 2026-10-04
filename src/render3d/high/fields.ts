// The page's bake worker (`Baker`: both looks' moving water, motion.ts) and the High look's
// ambient occlusion (#65). A whole map's occlusion is made in the worker (bake.worker.ts) and arrives a
// moment after the map; until then the ground has none (a quiet start, never a wait). An edit's own
// tiles are redone here at once. A newer request always wins over an older.

import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";
import type { EntityView } from "../model";
import { DEAD } from "../model";
import { AMBIENT_REACH, ambientRect, canopyCover, canopyInto, canopyKind, runBake, type BakeJob, type BakeReply, type BakeResult, type Canopies } from "./bake";

type Job = BakeJob extends infer J ? (J extends { id: number } ? Omit<J, "id"> : never) : never;

let warned = false;
/** A worker's failure, said once a page (the look carries on without it). */
function warnOnce(why: string): void {
  if (warned) return;
  warned = true;
  console.warn(`The renderer's bake worker failed (${why}); its fields are made on the page's thread.`);
}

/** The worker the fields are made in (one per view), or the page's thread where a worker can't
 *  start. A job always settles: the worker's jobs are kept until they come back, and if the worker
 *  fails they and every later job are made on the page's thread; a job that itself throws rejects. */
export class Baker {
  private worker: Worker | null = null;
  private next = 1;
  private inFlight = new Map<number, { job: BakeJob; resolve: (r: BakeResult) => void; reject: (e: Error) => void }>();

  constructor() {
    try {
      this.worker = new Worker(new URL("./bake.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<BakeReply>) => {
        const r = e.data;
        const j = this.inFlight.get(r.id);
        if (!j) return;
        this.inFlight.delete(r.id);
        if (r.kind === "error") j.reject(new Error(r.error));
        else j.resolve(r);
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

  /** No worker from now on: what it had, and the rest, on the page's thread. */
  private fail(why: string): void {
    warnOnce(why);
    this.worker?.terminate();
    this.worker = null;
    const jobs = [...this.inFlight.values()];
    this.inFlight.clear();
    for (const j of jobs) this.here(j.job).then(j.resolve, j.reject);
  }

  private here(job: BakeJob): Promise<BakeResult> {
    return new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(runBake(job));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }, 0),
    );
  }

  /** A job (its arrays the caller's own copies, kept until the answer comes back). */
  run(job: Job): Promise<BakeResult> {
    const id = this.next++;
    const full = { ...job, id } as BakeJob;
    if (!this.worker) return this.here(full);
    return new Promise((resolve, reject) => {
      this.inFlight.set(id, { job: full, resolve, reject });
      try {
        this.worker!.postMessage(full);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : "a job couldn't be sent");
      }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.inFlight.clear();
  }
}

let shared: Baker | null = null;
/** The page's bake worker, one for every view: started with the first map's (the warm-up's, D367) and
 *  kept, so no view waits for a worker to start. (On CI's software drawing a new worker took over 3 s
 *  to answer its first job, and each view started its own.) A job for a view since closed is answered
 *  and dropped. */
export function pageBaker(): Baker {
  return (shared ??= new Baker());
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
    }, () => {
      // (the bake failed: the ground stays without occlusion, the quiet start's look)
      if (id === this.latest) this.done = id;
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
