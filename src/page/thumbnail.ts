// A map's small top-down picture for Your maps and the candidates strip (PLAN §20 D234: "a small
// top-down thumbnail reusing the minimap's rendering"): the minimap's look (core/render/shade.ts,
// height and a hillshade, water blue), north up, the longer side `size` pixels. The pixels are a
// pure function of the map; the data URL needs a browser canvas.

import { shadeTiles } from "../core/render/shade";

/** Pixels on the thumbnail's longer side. */
export const THUMB_SIZE = 64;

export interface ThumbPixels {
  w: number;
  h: number;
  /** RGBA, row-major from the top (north). */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/** The thumbnail's pixels: each pixel the average of the tiles it covers. */
export function thumbnailPixels(heights: Uint8Array, W: number, H: number, water: ArrayLike<number> | null, size = THUMB_SIZE): ThumbPixels {
  const tiles = shadeTiles(heights, W, H, water);
  const scale = Math.min(1, size / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let py = 0; py < h; py++) {
    // north (high y) at the top
    const y1 = H - Math.floor((py * H) / h);
    const y0 = Math.max(H - Math.floor(((py + 1) * H) / h), 0);
    for (let px = 0; px < w; px++) {
      const x0 = Math.floor((px * W) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((px + 1) * W) / w));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < Math.max(y0 + 1, y1); y++)
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 3;
          r += tiles[i];
          g += tiles[i + 1];
          b += tiles[i + 2];
          n++;
        }
      const o = (py * w + px) * 4;
      rgba[o] = r / n;
      rgba[o + 1] = g / n;
      rgba[o + 2] = b / n;
      rgba[o + 3] = 255;
    }
  }
  return { w, h, rgba };
}

/** The thumbnail as a PNG data URL (browser only; null where there is no canvas). */
export function thumbnailDataUrl(heights: Uint8Array, W: number, H: number, water: ArrayLike<number> | null, size = THUMB_SIZE): string | null {
  if (typeof document === "undefined") return null;
  const p = thumbnailPixels(heights, W, H, water, size);
  const c = document.createElement("canvas");
  c.width = p.w;
  c.height = p.h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(p.rgba, p.w, p.h), 0, 0);
  return c.toDataURL("image/png");
}
