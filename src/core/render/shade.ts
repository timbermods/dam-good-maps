// Top-down colours for a map: an elevation ramp with a north-west hillshade so terraces read as
// steps, plus water. Used by the 2D preview and by the map thumbnail. Pure arithmetic, so the
// thumbnail bytes are the same in every engine.

import encodeJpeg from "../format/vendor/jpeg-encoder.js";

const LOW = [122, 150, 84]; // grass on the valley floor
const HIGH = [196, 178, 140]; // dry rock on the heights
const WATER = [64, 128, 200];

/** RGB per tile (3 bytes per tile, row-major, y north = row index). */
export function shadeTiles(heights: Uint8Array, W: number, H: number, water?: ArrayLike<number> | null): Uint8Array {
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] < lo) lo = heights[i];
    if (heights[i] > hi) hi = heights[i];
  }
  const span = Math.max(1, hi - lo);
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const h = heights[i];
      const t = (h - lo) / span;
      // gradient by central differences; light from the north-west (−x, +y)
      const hx0 = heights[y * W + Math.max(0, x - 1)];
      const hx1 = heights[y * W + Math.min(W - 1, x + 1)];
      const hy0 = heights[Math.max(0, y - 1) * W + x];
      const hy1 = heights[Math.min(H - 1, y + 1) * W + x];
      const gx = (hx1 - hx0) / 2;
      const gy = (hy1 - hy0) / 2;
      let light = 1 - 0.18 * (gx - gy);
      if (light < 0.55) light = 0.55;
      if (light > 1.25) light = 1.25;
      let r = (LOW[0] * (1 - t) + HIGH[0] * t) * light;
      let g = (LOW[1] * (1 - t) + HIGH[1] * t) * light;
      let b = (LOW[2] * (1 - t) + HIGH[2] * t) * light;
      if (water && water[i] > 0.05) {
        const d = Math.min(water[i], 3) / 3;
        const k = 0.35 + 0.4 * d;
        r = r * (1 - k) + WATER[0] * k;
        g = g * (1 - k) + WATER[1] * k;
        b = b * (1 - k) + WATER[2] * k;
      }
      out[i * 3] = clamp255(r);
      out[i * 3 + 1] = clamp255(g);
      out[i * 3 + 2] = clamp255(b);
    }
  }
  return out;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export const THUMB_W = 960;
export const THUMB_H = 540;

/** An RGBA thumbnail, 960×540 unless given another size (the Real places cards): the shaded map
 *  fitted and centred on a dark background, north up, sampled bilinearly between tile centres. */
export function thumbnailRgba(heights: Uint8Array, W: number, H: number, water?: ArrayLike<number> | null, width = THUMB_W, height = THUMB_H): Uint8Array {
  const tiles = shadeTiles(heights, W, H, water);
  const fit = Math.min(width / W, height / H);
  const w = Math.max(1, Math.floor(W * fit));
  const h = Math.max(1, Math.floor(H * fit));
  const ox = Math.floor((width - w) / 2);
  const oy = Math.floor((height - h) / 2);
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = 38;
    out[i * 4 + 1] = 44;
    out[i * 4 + 2] = 36;
    out[i * 4 + 3] = 255;
  }
  for (let py = 0; py < h; py++) {
    // north (high y) at the top: image row py samples map y = H·(1 − v) − 0.5 in tile-centre units
    const my = Math.min(H - 1, Math.max(0, H * (1 - (py + 0.5) / h) - 0.5));
    const y0 = Math.floor(my);
    const y1 = Math.min(H - 1, y0 + 1);
    const ty = my - y0;
    for (let px = 0; px < w; px++) {
      const mx = Math.min(W - 1, Math.max(0, ((px + 0.5) / w) * W - 0.5));
      const x0 = Math.floor(mx);
      const x1 = Math.min(W - 1, x0 + 1);
      const tx = mx - x0;
      const o = ((py + oy) * width + (px + ox)) * 4;
      for (let c = 0; c < 3; c++) {
        const a = tiles[(y0 * W + x0) * 3 + c] * (1 - tx) + tiles[(y0 * W + x1) * 3 + c] * tx;
        const b = tiles[(y1 * W + x0) * 3 + c] * (1 - tx) + tiles[(y1 * W + x1) * 3 + c] * tx;
        out[o + c] = clamp255(a * (1 - ty) + b * ty);
      }
    }
  }
  return out;
}

export function thumbnailJpeg(heights: Uint8Array, W: number, H: number, water?: ArrayLike<number> | null): Uint8Array {
  const rgba = thumbnailRgba(heights, W, H, water);
  return encodeJpeg({ data: rgba, width: THUMB_W, height: THUMB_H }, 88).data;
}
