// The flow texture where nothing moves (the light look in software, a view held still): no current, only the
// water's badwater share (high/flow.ts `surfaceContamination`), which the ground under water reads for its
// tint where no copy of the screen is made (materials.ts behindShare), and the game's waterfall mask (A, fallMask.ts). One texture for the map, kept
// without costing the page's thread a frame (D453): both are worked out in the bake worker (high/bake.ts
// `stillBytes`), one job at a time and at most
// every `STILL_FLOW_WAIT` ms while the water moves, always on the latest water, and only the rows whose share
// changed go to the GPU; so once the water stops the texture is exactly the one built from it whole
// (motion.ts `stillFlowTexture`). Only a map's first water is worked out at once, here (a still view's picture
// is drawn straight after it).

import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";
import type { SurfaceWater } from "./model";
import { stillBytes } from "./high/bake";
import { writeShare } from "./high/flow";

/** The least time between two jobs while the water keeps changing (ms). */
export const STILL_FLOW_WAIT = 250;

type Water = Pick<SurfaceWater, "surface" | "depth" | "contamination">;
/** The share and the waterfall mask of some water, a byte a tile each, worked out elsewhere (the bake worker; its arrays
 *  are its own). */
export type ShareJob = (W: number, H: number, sw: Water) => Promise<{ share: Uint8Array; fall: Uint8Array }>;

export class StillFlow {
  readonly texture: DataTexture;
  private readonly data: Uint8Array;
  private pending: Water | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private lastSent = -Infinity;
  private disposed = false;
  /** The latest water: its share and wetness are in the texture from the moment it came (`writeShare`). */
  private latest: Water | null = null;
  /** One more each time the share is set here at once: a job sent before it is dropped when it answers. */
  private version = 0;

  /** `job`: the share worked out off the page's thread; `touch`: texels x0…x1 × y0…y1 changed, to go up with the
   *  next frame (a RowUploads); `drawn`: a share that changed asks for a frame. */
  constructor(
    readonly W: number,
    readonly H: number,
    private readonly job: ShareJob,
    private readonly touch: (x0: number, y0: number, x1: number, y1: number) => void = () => {},
    private readonly drawn: () => void = () => {},
    /** Whether the look draws the waterfall mask (A): the light look doesn't, and none is worked out for it. */
    private readonly fall = true,
  ) {
    const N = W * H;
    this.data = new Uint8Array(N * 4);
    // (no water yet: no fall, A 0 as a dry tile's)
    for (let i = 0; i < N; i++) this.data.set([128, 128, 0, 0], i * 4);
    this.texture = new DataTexture(this.data, W, H, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** A map's first water, worked out at once. */
  start(sw: Water): void {
    this.latest = sw;
    this.write(stillBytes(this.W, this.H, sw, this.fall));
  }

  /** The water changed: a job soon, on the latest water; `now` (water put in place to show with the land put in with
   *  it, a version flipped to): worked out at once, here, and a job still out on older water dropped. */
  update(sw: Water, now = false): void {
    // (the share and which tiles are wet at once, so badwater is drawn with the water it came with: only the dry
    // tiles' carry and the waterfall mask wait for the job)
    this.latest = sw;
    this.current();
    if (now) {
      this.version++;
      this.pending = null;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.write(stillBytes(this.W, this.H, sw, this.fall));
      return;
    }
    this.pending = sw;
    this.kick();
  }

  /** The next job, when none is out and the wait since the last is over. */
  private kick(): void {
    if (this.busy || this.timer !== null || !this.pending || this.disposed) return;
    const wait = Math.max(0, this.lastSent + STILL_FLOW_WAIT - performance.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      const sw = this.pending;
      this.pending = null;
      if (!sw || this.disposed) return;
      this.busy = true;
      this.lastSent = performance.now();
      const version = this.version;
      const done = () => {
        this.busy = false;
        this.kick();
      };
      // (copies: the map's water may change in place before the job is done)
      this.job(this.W, this.H, { surface: sw.surface.slice(), depth: sw.depth.slice(), contamination: sw.contamination.slice() }).then((bytes) => {
        if (!this.disposed && version === this.version && this.write(bytes)) this.drawn();
        done();
      }, done);
    }, wait);
  }

  /** The latest water's share and wetness into the texture's bytes (a job's answer on older water leaves them behind),
   *  the rows that changed sent with the next frame. Whether any changed. */
  private current(): boolean {
    if (!this.latest) return false;
    const r = writeShare(this.W, this.H, this.latest, this.data);
    if (r) this.touch(0, r.y0, this.W - 1, r.y1);
    return !!r;
  }

  /** The share and the mask into the texture's bytes, the rows that changed sent with the next frame. Whether any
   *  changed. */
  private write({ share, fall }: { share: Uint8Array; fall: Uint8Array }): boolean {
    const { W, H, data } = this;
    let y0 = H;
    let y1 = -1;
    for (let y = 0; y < H; y++)
      for (let i = y * W, end = i + W; i < end; i++) {
        const v = share[i];
        const a = fall[i];
        if (data[i * 4 + 2] === v && data[i * 4 + 3] === a) continue;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = a;
        if (y < y0) y0 = y;
        y1 = y;
      }
    if (y1 >= 0) this.touch(0, y0, W - 1, y1);
    // (a job on older water: the latest's share and wetness again)
    return this.current() || y1 >= 0;
  }

  /** No job waits, an answer still to come is dropped, and the texture is let go. */
  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
    this.texture.dispose();
  }
}
