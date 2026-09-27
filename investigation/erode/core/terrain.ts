// Terrain as runs (investigation/terrain3d DESIGN §2.1): each tile's 23 voxel layers as one 32-bit
// mask (bit z set: the voxel from z to z + 1 is solid). A heightfield tile is `(1 << h) − 1`; a
// tile with a cave, an overhang or an arch has more than one run. Runs, the surface and the air gaps
// all derive from the mask with bit operations. Pure TypeScript: it runs in Node, the worker and the
// page alike.

/** Voxel layers in a map file (FORMAT.md §4.2). Layer 22 must stay empty, so terrain tops at 22. */
export const LAYERS = 23;

export class Terrain {
  readonly N: number;
  constructor(readonly W: number, readonly H: number, readonly cols: Uint32Array) {
    this.N = W * H;
  }

  static fromHeights(W: number, H: number, heights: ArrayLike<number>): Terrain {
    const cols = new Uint32Array(W * H);
    for (let i = 0; i < W * H; i++) cols[i] = heights[i] >= 32 ? 0xffffffff : ((1 << heights[i]) >>> 0) - 1;
    return new Terrain(W, H, cols);
  }

  clone(): Terrain {
    return new Terrain(this.W, this.H, this.cols.slice());
  }

  /** Solid at (x, y, z)? Below the map's floor is solid; outside the map and above it is air. */
  solid(x: number, y: number, z: number): boolean {
    if (z < 0) return true;
    if (x < 0 || y < 0 || x >= this.W || y >= this.H || z >= LAYERS) return false;
    return ((this.cols[y * this.W + x] >>> z) & 1) === 1;
  }

  at(i: number, z: number): boolean {
    return z < 0 || (z < LAYERS && ((this.cols[i] >>> z) & 1) === 1);
  }

  set(i: number, z: number, on: boolean): void {
    if (on) this.cols[i] = (this.cols[i] | (1 << z)) >>> 0;
    else this.cols[i] = (this.cols[i] & ~(1 << z)) >>> 0;
  }

  /** The walking surface on top of the highest run (0 when the tile is empty). */
  surface(i: number): number {
    const c = this.cols[i];
    return c === 0 ? 0 : 32 - Math.clz32(c);
  }

  /** The top of run 0, the run that reaches down to z = 0. */
  run0Top(i: number): number {
    const c = this.cols[i];
    // count trailing ones
    const inv = ~c >>> 0;
    return inv === 0 ? 32 : 31 - Math.clz32((inv & -inv) >>> 0);
  }

  /** True when the tile is one run from z = 0 (a heightfield tile). */
  plain(i: number): boolean {
    const c = this.cols[i];
    return (c & (c + 1)) === 0;
  }

  /** The solid runs of a tile, bottom to top: [floor, ceiling) pairs (run 0 first, empty when the
   *  bottom voxel is air, as the game's `ColumnTerrainMap`). */
  runs(i: number): number[] {
    const out: number[] = [];
    let z = 0;
    const c = this.cols[i];
    // run 0
    while (z < LAYERS && (c >>> z) & 1) z++;
    out.push(0, z);
    while (z < LAYERS) {
      while (z < LAYERS && !((c >>> z) & 1)) z++;
      if (z >= LAYERS) break;
      const f = z;
      while (z < LAYERS && (c >>> z) & 1) z++;
      out.push(f, z);
    }
    return out;
  }

  /** The heights (surface per tile). */
  heights(): Uint8Array {
    const h = new Uint8Array(this.N);
    for (let i = 0; i < this.N; i++) h[i] = this.surface(i);
    return h;
  }

  /** Every voxel as one byte, index z·N + tile (the support model's layout). */
  voxels(): Uint8Array {
    const v = new Uint8Array(this.N * LAYERS);
    for (let i = 0; i < this.N; i++) {
      const c = this.cols[i];
      if (!c) continue;
      for (let z = 0; z < LAYERS; z++) if ((c >>> z) & 1) v[z * this.N + i] = 1;
    }
    return v;
  }

  /** Tiles with more than one run. */
  multiRun(): number {
    let n = 0;
    for (let i = 0; i < this.N; i++) if (!this.plain(i)) n++;
    return n;
  }
}
