// A small animated GIF writer (GIF89a) and PNG reader for the tools' captures: one palette of up to
// 255 colours for all the frames (median cut over a sample of their pixels), and each frame after the
// first only where it changed (the rest transparent), so a still camera over a changing land costs
// little. LZW as the format asks (variable code size, a clear code when the table fills).

import { unzlibSync } from "fflate";

export interface Rgba {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Decode an 8-bit RGB or RGBA PNG (as Playwright's screenshots are). */
export function readPng(bytes: Uint8Array): Rgba {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  const idat: Uint8Array[] = [];
  while (p < bytes.length) {
    const len = view.getUint32(p);
    const kind = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, p + 8 + len);
    if (kind === "IHDR") {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      if (bytes[p + 16] !== 8) throw new Error("only 8-bit PNGs");
      type = bytes[p + 17];
    } else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error("only RGB or RGBA PNGs");
  const all = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  let o = 0;
  for (const d of idat) {
    all.set(d, o);
    o += d.length;
  }
  const raw = unzlibSync(all);
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out.set([cur[x * bpp], cur[x * bpp + 1], cur[x * bpp + 2], bpp === 4 ? cur[x * bpp + 3] : 255], (y * width + x) * 4);
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

/** Median cut: up to `n` colours for these pixels (RGB triples). */
function palette(pixels: Uint8Array, n: number): number[][] {
  type Box = { px: number[][] };
  const px: number[][] = [];
  for (let i = 0; i < pixels.length; i += 3) px.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
  const boxes: Box[] = [{ px }];
  while (boxes.length < n) {
    let best = -1;
    let bestRange = -1;
    let axis = 0;
    boxes.forEach((b, k) => {
      if (b.px.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255;
        let hi = 0;
        for (const p of b.px) {
          if (p[c] < lo) lo = p[c];
          if (p[c] > hi) hi = p[c];
        }
        // (weighted by how many pixels share the box, so busy colours get more of the palette)
        const r = (hi - lo) * Math.sqrt(b.px.length);
        if (r > bestRange) {
          bestRange = r;
          best = k;
          axis = c;
        }
      }
    });
    if (best < 0 || bestRange <= 0) break;
    const b = boxes[best];
    b.px.sort((p, q) => p[axis] - q[axis]);
    const mid = b.px.length >> 1;
    boxes.splice(best, 1, { px: b.px.slice(0, mid) }, { px: b.px.slice(mid) });
  }
  return boxes.map((b) => {
    const s = [0, 0, 0];
    for (const p of b.px) for (let c = 0; c < 3; c++) s[c] += p[c];
    return s.map((v) => Math.round(v / Math.max(1, b.px.length)));
  });
}

/** LZW-compress indices with the given minimum code size, as GIF image data sub-blocks. */
function lzw(indices: Uint8Array, minSize: number): Uint8Array {
  const clear = 1 << minSize;
  const eoi = clear + 1;
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  let size = minSize + 1;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  let dict = new Map<number, number>();
  let next = eoi + 1;
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      next = eoi + 1;
      size = minSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) out.push(acc & 255);
  // sub-blocks of at most 255 bytes
  const blocks: number[] = [minSize];
  for (let i = 0; i < out.length; i += 255) {
    const n = Math.min(255, out.length - i);
    blocks.push(n, ...out.slice(i, i + n));
  }
  blocks.push(0);
  return Uint8Array.from(blocks);
}

/** An animated GIF of these frames (all the same size), each shown for its delay (ms); it loops. */
export function writeGif(frames: Rgba[], delays: number[]): Uint8Array {
  const { width, height } = frames[0];
  // one palette for all: a sample of every frame's pixels
  const sample: number[] = [];
  const step = Math.max(1, Math.floor((width * height * frames.length) / 120_000));
  let n = 0;
  for (const f of frames)
    for (let i = 0; i < width * height; i++)
      if (n++ % step === 0) sample.push(f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2]);
  const pal = palette(Uint8Array.from(sample), 255);
  const TRANSPARENT = 255;
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r: number, g: number, b: number) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    if (cache[key] >= 0) return cache[key];
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < pal.length; k++) {
      const d = (pal[k][0] - r) ** 2 + (pal[k][1] - g) ** 2 + (pal[k][2] - b) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return (cache[key] = best);
  };
  const bytes: number[] = [];
  const u16 = (v: number) => bytes.push(v & 255, (v >> 8) & 255);
  bytes.push(...Array.from("GIF89a", (c) => c.charCodeAt(0)));
  u16(width);
  u16(height);
  bytes.push(0xf7, 0, 0); // a global table of 256 colours
  for (let k = 0; k < 256; k++) bytes.push(...(pal[k] ?? [0, 0, 0]));
  // loop forever
  bytes.push(0x21, 0xff, 11, ...Array.from("NETSCAPE2.0", (c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  let last: Uint8Array | null = null;
  frames.forEach((f, k) => {
    const idx = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) idx[i] = nearest(f.data[i * 4], f.data[i * 4 + 1], f.data[i * 4 + 2]);
    // after the first: only what changed, in its bounding box; the rest transparent
    let x0 = 0;
    let y0 = 0;
    let x1 = width - 1;
    let y1 = height - 1;
    let frame = idx;
    if (last) {
      x0 = width;
      y0 = height;
      x1 = -1;
      y1 = -1;
      for (let i = 0; i < idx.length; i++)
        if (idx[i] !== last[i]) {
          const x = i % width;
          const y = (i - x) / width;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      if (x1 < 0) {
        x0 = y0 = x1 = y1 = 0;
      }
      const w = x1 - x0 + 1;
      frame = new Uint8Array(w * (y1 - y0 + 1));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = y * width + x;
          frame[(y - y0) * w + (x - x0)] = idx[i] === last[i] ? TRANSPARENT : idx[i];
        }
    }
    const delay = Math.max(2, Math.round(delays[k] / 10));
    bytes.push(0x21, 0xf9, 4, last ? 0x05 : 0x04, delay & 255, delay >> 8, TRANSPARENT, 0);
    bytes.push(0x2c);
    u16(x0);
    u16(y0);
    u16(x1 - x0 + 1);
    u16(y1 - y0 + 1);
    bytes.push(0);
    bytes.push(...lzw(frame, 8));
    last = idx;
  });
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}

/** A region of an image. */
export function crop(img: Rgba, x: number, y: number, w: number, h: number): Rgba {
  const out = new Uint8Array(w * h * 4);
  for (let yy = 0; yy < h; yy++) out.set(img.data.subarray(((y + yy) * img.width + x) * 4, ((y + yy) * img.width + x + w) * 4), yy * w * 4);
  return { width: w, height: h, data: out };
}

/** Half the size (each 2×2 averaged). */
export function half(img: Rgba): Rgba {
  const w = img.width >> 1;
  const h = img.height >> 1;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 4; c++) {
        const at = (xx: number, yy: number) => img.data[(yy * img.width + xx) * 4 + c];
        out[(y * w + x) * 4 + c] = (at(2 * x, 2 * y) + at(2 * x + 1, 2 * y) + at(2 * x, 2 * y + 1) + at(2 * x + 1, 2 * y + 1) + 2) >> 2;
      }
  return { width: w, height: h, data: out };
}
