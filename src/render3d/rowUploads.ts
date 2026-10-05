// A data texture's changed rectangle to the GPU on its own (R1, the performance audit): a brush
// changes a few dozen tiles' data each frame, and uploading a whole 256² map's textures every frame
// for them (the tile data 256 KB, the shadow map 1 MB) cost the page's thread more than the change
// itself. Rectangles touched between two frames are joined; at the next frame only that rectangle goes
// up, copied into a small array of its own and sent in one call, unless the texture has never been on
// the GPU whole, a whole upload is already waiting, or the rectangle is most of the texture. The
// texture's bytes on the GPU are the same either way. (One call, not a call a row out of the whole
// texture's array: Firefox spent 110-200 ms on the hundreds of rows at a stroke's end.)

import { DataTexture, RGBAFormat, UnsignedByteType, Vector2, type WebGLRenderer } from "three";

type Rect = { x0: number; y0: number; x1: number; y1: number };

export class RowUploads {
  private dirty: Rect | null = null;

  constructor(
    private readonly gl: WebGLRenderer,
    private readonly texture: () => DataTexture | null,
  ) {}

  /** Texels x0…x1 × y0…y1 changed (clipped to the texture). */
  touch(x0: number, y0: number, x1: number, y1: number): void {
    const t = this.texture();
    if (!t) return;
    const w = t.image.width;
    const h = t.image.height;
    const r = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(w - 1, x1), y1: Math.min(h - 1, y1) };
    if (r.x0 > r.x1 || r.y0 > r.y1) return;
    const d = this.dirty;
    this.dirty = d ? { x0: Math.min(d.x0, r.x0), y0: Math.min(d.y0, r.y0), x1: Math.max(d.x1, r.x1), y1: Math.max(d.y1, r.y1) } : r;
  }

  /** Before a frame is drawn: what changed, to go up with it. */
  flush(): void {
    const t = this.texture();
    const d = this.dirty;
    this.dirty = null;
    if (!t || !d) return;
    const w = t.image.width;
    const width = d.x1 - d.x0 + 1;
    const rows = d.y1 - d.y0 + 1;
    const onGpu = (this.gl.properties.get(t) as { __version?: number }).__version === t.version;
    if (!onGpu || width * rows * 4 >= w * t.image.height) {
      t.needsUpdate = true;
      return;
    }
    const src = t.image.data as Uint8Array;
    const patch = new Uint8Array(width * rows * 4);
    for (let y = 0; y < rows; y++) patch.set(src.subarray(((d.y0 + y) * w + d.x0) * 4, ((d.y0 + y) * w + d.x1 + 1) * 4), y * width * 4);
    const p = new DataTexture(patch, width, rows, RGBAFormat, UnsignedByteType);
    this.gl.copyTextureToTexture(p, t, null, new Vector2(d.x0, d.y0));
    p.dispose();
  }

  /** A new map (its textures are new): nothing waits. */
  clear(): void {
    this.dirty = null;
  }
}
