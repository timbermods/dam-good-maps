// The flow texture where nothing moves (the light look in software, a view held still): no current, only the
// water's badwater share (high/flow.ts `surfaceContamination`), which the ground under a film reads for its
// tint (waterPalette.ts WATER_FILM). One texture for the map, kept without costing the page's thread a frame
// (D453): the share is worked out in the bake worker (high/bake.ts `shareBytes`), one job at a time and at most
// every `STILL_FLOW_WAIT` ms while the water moves, always on the latest water, and only the rows whose share
// changed go to the GPU; so once the water stops the texture is exactly the one built from it whole
// (motion.ts `stillFlowTexture`). Only a map's first water is worked out at once, here (a still view's picture
// is drawn straight after it).

import { DataTexture, LinearFilter, RGBAFormat, UnsignedByteType } from "three";
import type { SurfaceWater } from "./model";
import { shareBytes } from "./high/bake";

/** The least time between two jobs while the water keeps changing (ms). */
export const STILL_FLOW_WAIT = 250;

type Water = Pick<SurfaceWater, "surface" | "depth" | "contamination">;
/** The share of some water, a byte a tile, worked out elsewhere (the bake worker; its arrays are its own). */
export type ShareJob = (W: number, H: number, sw: Water) => Promise<Uint8Array>;

export class StillFlow {
  readonly texture: DataTexture;
  private readonly data: Uint8Array;
  private pending: Water | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private lastSent = -Infinity;
  private disposed = false;
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
  ) {
    const N = W * H;
    this.data = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) this.data.set([128, 128, 0, 255], i * 4);
    this.texture = new DataTexture(this.data, W, H, RGBAFormat, UnsignedByteType);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.needsUpdate = true;
  }

  /** A map's first water, worked out at once. */
  start(sw: Water): void {
    this.write(shareBytes(this.W, this.H, sw));
  }

  /** The water changed: a job soon, on the latest water; `now` (water put in place to show with the land put in with
   *  it, a version flipped to): worked out at once, here, and a job still out on older water dropped. */
  update(sw: Water, now = false): void {
    if (now) {
      this.version++;
      this.pending = null;
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.write(shareBytes(this.W, this.H, sw));
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
      this.job(this.W, this.H, { surface: sw.surface.slice(), depth: sw.depth.slice(), contamination: sw.contamination.slice() }).then((share) => {
        if (!this.disposed && version === this.version && this.write(share)) this.drawn();
        done();
      }, done);
    }, wait);
  }

  /** The share into the texture's bytes, the rows that changed sent with the next frame. Whether any changed. */
  private write(share: Uint8Array): boolean {
    const { W, H, data } = this;
    let y0 = H;
    let y1 = -1;
    for (let y = 0; y < H; y++)
      for (let i = y * W, end = i + W; i < end; i++) {
        const v = share[i];
        if (data[i * 4 + 2] === v) continue;
        data[i * 4 + 2] = v;
        if (y < y0) y0 = y;
        y1 = y;
      }
    if (y1 < 0) return false;
    this.touch(0, y0, W - 1, y1);
    return true;
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
