// A data texture's changed rectangles to the GPU by their rows (R1, the performance audit): a brush
// changes a few dozen tiles' data each frame, and uploading a whole 512² map's textures every frame
// for them (the tile data 1 MB, the shadow map 4 MB) cost the page's thread more than the change
// itself. Rectangles touched between two frames are joined; at the next frame only their rows go up,
// unless the texture has never been on the GPU whole, a whole upload is already waiting, or the
// rectangle is most of the texture. The texture's bytes on the GPU are the same either way.

import type { Data3DTexture, DataTexture, WebGLRenderer } from "three";

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
    if (onGpu && width * rows * 4 < w * t.image.height) for (let y = d.y0; y <= d.y1; y++) t.addUpdateRange((y * w + d.x0) * 4, width * 4);
    else t.clearUpdateRanges();
    t.needsUpdate = true;
  }

  /** A new map (its textures are new): nothing waits. */
  clear(): void {
    this.dirty = null;
  }
}

/** The light under roofs' changed boxes to the GPU (caveLight.ts `relight`): a 3D texture, which three
 *  only uploads whole (3 MB at 256², 12.6 MB at 512²), so the boxes' cells, every level, go up with
 *  the next frame by themselves; whole when the texture is not on the GPU yet or the box is most of it. */
export class BoxUploads {
  private dirty: Rect | null = null;

  constructor(
    private readonly gl: WebGLRenderer,
    private readonly texture: () => Data3DTexture | null,
  ) {}

  /** Cells x0…x1 × y0…y1, every level, changed (clipped to the texture). */
  touch(x0: number, y0: number, x1: number, y1: number): void {
    const t = this.texture();
    if (!t) return;
    const r = { x0: Math.max(0, x0), y0: Math.max(0, y0), x1: Math.min(t.image.width - 1, x1), y1: Math.min(t.image.height - 1, y1) };
    if (r.x0 > r.x1 || r.y0 > r.y1) return;
    const d = this.dirty;
    this.dirty = d ? { x0: Math.min(d.x0, r.x0), y0: Math.min(d.y0, r.y0), x1: Math.max(d.x1, r.x1), y1: Math.max(d.y1, r.y1) } : r;
  }

  /** Before a frame is drawn. */
  flush(): void {
    const t = this.texture();
    const d = this.dirty;
    this.dirty = null;
    if (!t || !d) return;
    const { width: W, height: H, depth: D } = t.image;
    const w = d.x1 - d.x0 + 1;
    const h = d.y1 - d.y0 + 1;
    const props = this.gl.properties.get(t) as { __version?: number; __webglTexture?: WebGLTexture };
    if (props.__version !== t.version || !props.__webglTexture || w * h * 2 > W * H) {
      t.needsUpdate = true;
      return;
    }
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    const state = this.gl.state;
    const keep = [ctx.UNPACK_ALIGNMENT, ctx.UNPACK_ROW_LENGTH, ctx.UNPACK_IMAGE_HEIGHT, ctx.UNPACK_SKIP_PIXELS, ctx.UNPACK_SKIP_ROWS, ctx.UNPACK_SKIP_IMAGES].map((p) => [p, state.getParameter(p)] as const);
    state.activeTexture(ctx.TEXTURE0);
    state.bindTexture(ctx.TEXTURE_3D, props.__webglTexture);
    state.pixelStorei(ctx.UNPACK_ALIGNMENT, 1);
    state.pixelStorei(ctx.UNPACK_ROW_LENGTH, W);
    state.pixelStorei(ctx.UNPACK_IMAGE_HEIGHT, H);
    state.pixelStorei(ctx.UNPACK_SKIP_PIXELS, d.x0);
    state.pixelStorei(ctx.UNPACK_SKIP_ROWS, d.y0);
    state.pixelStorei(ctx.UNPACK_SKIP_IMAGES, 0);
    ctx.texSubImage3D(ctx.TEXTURE_3D, 0, d.x0, d.y0, 0, w, h, D, ctx.RG, ctx.UNSIGNED_BYTE, t.image.data as Uint8Array);
    for (const [p, v] of keep) state.pixelStorei(p, v as number);
  }

  /** A new map: nothing waits. */
  clear(): void {
    this.dirty = null;
  }
}
