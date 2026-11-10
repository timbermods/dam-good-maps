// The Four Lakes design as a picture and its land measures, in a second, without the core:
//   node tools/showcase/four-lakes-view.ts [out.png] [--scale 4]
// The picture: the levels as colours (low green to high pale rock), lit from the north-west, the design's sketch
// water in blue, north up. For judging the land's shape between real builds (four-lakes.ts makes the map).

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { designLand, measureLand, sketchWater, H, N, W } from "./four-lakes-design.ts";

function png(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const crcT = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcT[n] = c >>> 0;
  }
  const crc = (b: Uint8Array) => {
    let c = 0xffffffff;
    for (const v of b) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    for (let k = 0; k < 4; k++) out[4 + k] = type.charCodeAt(k);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const RAMP: [number, number, number][] = [
  [70, 118, 62], [86, 134, 66], [104, 148, 72], [124, 160, 80], [146, 170, 90], [166, 178, 100], [182, 182, 110], [194, 184, 120],
  [202, 184, 130], [208, 186, 140], [212, 190, 150], [216, 196, 160], [220, 202, 170], [224, 208, 180], [228, 214, 190], [234, 222, 202], [240, 232, 216],
];

export function picture(h: Uint8Array, water: ArrayLike<number> | null, scale: number, marks: { x: number; y: number; rgb: [number, number, number] }[] = []): { rgb: Uint8Array; w: number; hgt: number } {
  const w = W * scale;
  const hgt = H * scale;
  const rgb = new Uint8Array(w * hgt * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = h[i];
      const xm = h[y * W + Math.max(0, x - 1)];
      const xp = h[y * W + Math.min(W - 1, x + 1)];
      const ym = h[Math.max(0, y - 1) * W + x];
      const yp = h[Math.min(H - 1, y + 1) * W + x];
      let light = 1 - 0.16 * ((xp - xm) / 2 - (yp - ym) / 2);
      light = Math.max(0.5, Math.min(1.3, light));
      let [r, g, b] = RAMP[Math.min(16, v)];
      r *= light;
      g *= light;
      b *= light;
      const d = water ? water[i] : 0;
      if (d > 0.05) {
        const k = 0.45 + 0.4 * Math.min(1, d / 3);
        r = r * (1 - k) + 40 * k;
        g = g * (1 - k) + 120 * k;
        b = b * (1 - k) + 200 * k;
      }
      // a dark line on every step of two or more (a cliff), a faint one on a one-level step
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) {
          let rr = r;
          let gg = g;
          let bb = b;
          const east = sx === scale - 1 ? Math.abs(xp - v) : 0;
          const south = sy === scale - 1 ? Math.abs(ym - v) : 0;
          const e = Math.max(east, south);
          if (e >= 2) {
            rr *= 0.45;
            gg *= 0.45;
            bb *= 0.45;
          } else if (e === 1) {
            rr *= 0.86;
            gg *= 0.86;
            bb *= 0.86;
          }
          const px = x * scale + sx;
          const py = (H - 1 - y) * scale + sy;
          const o = (py * w + px) * 3;
          rgb[o] = Math.max(0, Math.min(255, rr));
          rgb[o + 1] = Math.max(0, Math.min(255, gg));
          rgb[o + 2] = Math.max(0, Math.min(255, bb));
        }
    }
  for (const m of marks)
    for (let sy = -1; sy <= 0; sy++)
      for (let sx = -1; sx <= 0; sx++) {
        const px = m.x * scale + (scale >> 1) + sx;
        const py = (H - 1 - m.y) * scale + (scale >> 1) + sy;
        if (px < 0 || py < 0 || px >= w || py >= hgt) continue;
        const o = (py * w + px) * 3;
        rgb[o] = m.rgb[0];
        rgb[o + 1] = m.rgb[1];
        rgb[o + 2] = m.rgb[2];
      }
  return { rgb, w, hgt };
}

export function writePicture(file: string, h: Uint8Array, water: ArrayLike<number> | null, scale = 4, marks: { x: number; y: number; rgb: [number, number, number] }[] = []): void {
  const p = picture(h, water, scale, marks);
  writeFileSync(file, png(p.rgb, p.w, p.hgt));
}

if (process.argv[1] && /four-lakes-view\.(ts|mjs)$/.test(process.argv[1])) {
  const out = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".scratch/showcase/design.png";
  const si = process.argv.indexOf("--scale");
  const scale = si >= 0 ? Number(process.argv[si + 1]) : 4;
  const t = performance.now();
  const land = designLand();
  const m = measureLand(land.heights);
  const water = sketchWater(land);
  let wet = 0;
  for (let i = 0; i < N; i++) if (water[i] > 0.05) wet++;
  writePicture(out, land.heights, water, scale);
  console.log(`design ${Math.round(performance.now() - t)} ms -> ${out}`);
  console.log(`flat(8) ${(m.flat8 * 100).toFixed(1)}%  flat(4) ${(m.flat4 * 100).toFixed(1)}%  one-level steps ${(m.step1 * 100).toFixed(1)}%  top-3 levels ${(m.top3 * 100).toFixed(1)}%  sketch water ${((wet / N) * 100).toFixed(1)}%  max step ${m.maxStep}`);
  console.log("old channel land " + land.oldProfile.join(" "));
  console.log("levels " + m.histogram.slice(0, 17).map((n, k) => `${k}:${((n / N) * 100).toFixed(1)}`).join(" "));
}
