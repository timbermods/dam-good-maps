// The small thumbnail as an image the page can show (Your maps, the candidates strip): the pixels are
// core/render/thumb.ts's; the data URL needs a browser canvas.

import { THUMB_SIZE, thumbnailPixels } from "../core/render/thumb";

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
