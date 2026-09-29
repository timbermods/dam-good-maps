// A small GIF writer (no dependencies): one 256-colour palette for all frames by median cut, a light
// ordered dither, LZW, looping forever.

type Frame = Uint8Array; // RGBA, W × H

function medianCut(samples: number[][], n: number): number[][] {
  let boxes: number[][][] = [samples];
  while (boxes.length < n) {
    let bi = -1, best = -1, axis = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let a = 0; a < 3; a++) {
        let lo = 255, hi = 0;
        for (const p of b) (lo = Math.min(lo, p[a])), (hi = Math.max(hi, p[a]));
        const r = (hi - lo) * Math.sqrt(b.length);
        if (r > best) (best = r), (bi = i), (axis = a);
      }
    });
    if (bi < 0) break;
    const b = boxes[bi].sort((p, q) => p[axis] - q[axis]);
    const m = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, m), b.slice(m));
  }
  return boxes.map((b) => [0, 1, 2].map((a) => Math.round(b.reduce((s, p) => s + p[a], 0) / b.length)));
}

function lzw(indices: Uint8Array, minCode: number): number[] {
  const out: number[] = [];
  let cur = 0, bits = 0;
  const emit = (code: number, size: number) => {
    cur |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(cur & 0xff);
      cur >>>= 8;
      bits -= 8;
    }
  };
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1;
  let dict = new Map<number, number>();
  let next = eoi + 1;
  emit(clear, size);
  let prefix = indices[0];
  for (let k = 1; k < indices.length; k++) {
    const c = indices[k];
    const key = (prefix << 8) | c;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix, size);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear, size);
      dict = new Map();
      next = eoi + 1;
      size = minCode + 1;
    }
    prefix = c;
  }
  emit(prefix, size);
  emit(eoi, size);
  if (bits > 0) out.push(cur & 0xff);
  return out;
}

export function encodeGif(W: number, H: number, frames: Frame[], delayCs: number): Uint8Array {
  // the palette, from pixels sampled across every frame
  const samples: number[][] = [];
  for (const f of frames) for (let k = 0; k < W * H; k += 37) samples.push([f[k * 4], f[k * 4 + 1], f[k * 4 + 2]]);
  const pal = medianCut(samples, 256);
  while (pal.length < 256) pal.push([0, 0, 0]);
  const cache = new Int16Array(32768).fill(-1);
  const nearest = (r: number, g: number, b: number) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const c = cache[key];
    if (c >= 0) return c;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < 256; i++) {
      const p = pal[i];
      const d = (p[0] - r) ** 2 * 0.3 + (p[1] - g) ** 2 * 0.59 + (p[2] - b) ** 2 * 0.11;
      if (d < bd) (bd = d), (bi = i);
    }
    cache[key] = bi;
    return bi;
  };
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bytes: number[] = [];
  const str = (s: string) => {
    for (const ch of s) bytes.push(ch.charCodeAt(0));
  };
  const u16 = (v: number) => bytes.push(v & 0xff, (v >> 8) & 0xff);
  str("GIF89a");
  u16(W);
  u16(H);
  bytes.push(0xf7, 0, 0);
  for (const p of pal) bytes.push(p[0], p[1], p[2]);
  // loop forever
  bytes.push(0x21, 0xff, 0x0b);
  str("NETSCAPE2.0");
  bytes.push(0x03, 0x01, 0, 0, 0);
  for (const f of frames) {
    bytes.push(0x21, 0xf9, 0x04, 0x00);
    u16(delayCs);
    bytes.push(0, 0);
    bytes.push(0x2c);
    u16(0);
    u16(0);
    u16(W);
    u16(H);
    bytes.push(0);
    const idx = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        const d = (bayer[(y & 3) * 4 + (x & 3)] - 7.5) * 0.35;
        const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v + d)));
        idx[k] = nearest(cl(f[k * 4]), cl(f[k * 4 + 1]), cl(f[k * 4 + 2]));
      }
    bytes.push(8);
    const data = lzw(idx, 8);
    for (let o = 0; o < data.length; o += 255) {
      const n = Math.min(255, data.length - o);
      bytes.push(n);
      for (let k = 0; k < n; k++) bytes.push(data[o + k]);
    }
    bytes.push(0);
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
