// The contact sheet for "Resources like the official maps" (D144): seeds 1–30 of every theme at
// 128², top-down, north up, each labelled with its theme and seed; our own generated maps only; a
// paletted PNG under 1 MB, committed as docs/sheets/resources.png. Trees, bushes, ruins and mine
// sites are marked on the shaded ground (`resourceTopDown`, which the local comparison page uses
// too).
//
//   npx tsx tools/resources-sheet.ts [--seeds 1-30] [--size 128] [--out docs/sheets/resources.png] [--maps <folder to keep the .timber files>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { zlibSync } from "fflate";
import { footprintTiles } from "../src/core/format/footprints";
import { readTimber, type TimberFile } from "../src/core/format/timber";
import { generate } from "../src/core/gen/generate";
import { shadeTiles } from "../src/core/render/shade";
import { groundOfFile } from "../src/core/resources/measure";
import { AVAILABLE_THEMES, makeSpec, type ThemeId } from "../src/core/spec/mapspec";

type RGB = readonly [number, number, number];

/** The marks: living trees by species, dead trees, succulents, bushes, ruins by storeys (pale 1,
 *  dark 8), mine sites and the start. */
export const MARKS = {
  Pine: [22, 84, 42],
  Birch: [118, 176, 58],
  Oak: [58, 118, 24],
  dead: [128, 98, 66],
  Succulent: [64, 170, 150],
  bush: [178, 40, 170],
  mine: [16, 16, 16],
  start: [236, 36, 36],
} as const satisfies Record<string, RGB>;
export const ruinShade = (h: number): RGB => {
  const v = 236 - 19 * (h - 1);
  return [v, v - 4, v - 10];
};

/** A top-down picture of a map's ground and resources, `scale` pixels per tile, north up. Each tile's
 *  object fills its pixels but a one-pixel gap (from 3 pixels a tile). */
export function resourceTopDown(file: TimberFile, scale = 1): { rgb: Uint8Array; w: number; h: number } {
  const g = groundOfFile(file);
  const { W, H } = g;
  const base = shadeTiles(g.heights as Uint8Array, W, H, g.depth);
  const w = W * scale;
  const h = H * scale;
  const rgb = new Uint8Array(w * h * 3);
  const put = (px: number, py: number, c: ArrayLike<number>, off = 0) => {
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const k = (py * w + px) * 3;
    rgb[k] = c[off];
    rgb[k + 1] = c[off + 1];
    rgb[k + 2] = c[off + 2];
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) put(x * scale + dx, (H - 1 - y) * scale + dy, base, (y * W + x) * 3);
  const gap = scale >= 3 ? 1 : 0;
  const fill = (x: number, y: number, c: RGB, full = false) => {
    const m = full ? 0 : gap;
    for (let dy = m; dy < scale - (full ? 0 : 0); dy++) for (let dx = m; dx < scale; dx++) put(x * scale + dx, (H - 1 - y) * scale + dy, c);
  };
  for (const o of g.objects) {
    if (o.x < 0 || o.y < 0 || o.x >= W || o.y >= H) continue;
    const t = o.template;
    const dead = (o.components.LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead === true;
    if (t === "Pine" || t === "Birch" || t === "Oak") fill(o.x, o.y, dead ? MARKS.dead : MARKS[t]);
    else if (t === "Succulent") fill(o.x, o.y, MARKS.Succulent);
    else if (t === "BlueberryBush") fill(o.x, o.y, MARKS.bush);
    else if (t.startsWith("RuinColumnH")) fill(o.x, o.y, ruinShade(Number(t.slice(11))));
  }
  for (const o of g.objects) {
    if (o.template !== "UndergroundRuins" && o.template !== "StartingLocation") continue;
    for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && y >= 0 && x < W && y < H) fill(x, y, o.template === "UndergroundRuins" ? MARKS.mine : MARKS.start, true);
  }
  return { rgb, w, h };
}

// ------------------------------------------------------------------------------------------ sheet

const FONT: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", H: "101101111101101",
  I: "111010010010111", L: "100100100100111", N: "110101101101101", R: "110101110101101", S: "011100010001110", V: "101101101101010",
  " ": "000000000000000",
};
const TAG: Record<ThemeId, string> = { riverValley: "RV", canyon: "CA", highlands: "HI", lakeBasin: "LB", delta: "DE", islands: "IS" };

/** A paletted PNG (6×7×6 levels of red, green and blue) of an RGB image. */
export function palettedPng(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const LR = 6;
  const LG = 7;
  const LB = 6;
  const q = (v: number, n: number) => Math.min(n - 1, Math.round((v / 255) * (n - 1)));
  const pal = new Uint8Array(LR * LG * LB * 3);
  for (let r = 0; r < LR; r++)
    for (let g = 0; g < LG; g++)
      for (let b = 0; b < LB; b++) {
        const k = (r * LG + g) * LB + b;
        pal[k * 3] = Math.round((r * 255) / (LR - 1));
        pal[k * 3 + 1] = Math.round((g * 255) / (LG - 1));
        pal[k * 3 + 2] = Math.round((b * 255) / (LB - 1));
      }
  const raw = new Uint8Array(h * (w + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[y * (w + 1) + 1 + x] = (q(rgb[i], LR) * LG + q(rgb[i + 1], LG)) * LB + q(rgb[i + 2], LB);
    }
  const crcT = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcT[(c ^ b) & 0xff] ^ (c >>> 8);
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
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8;
  ihdr[9] = 3;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("PLTE", pal), chunk("IDAT", zlibSync(raw, { level: 9 })), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function main(): void {
  const arg = (name: string, fallback: string) => {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
  };
  const [a, b] = arg("seeds", "1-30").split("-").map(Number);
  const seeds = Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k);
  const size = Number(arg("size", "128"));
  const out = arg("out", "docs/sheets/resources.png");
  const keep = arg("maps", "");
  const T = size;
  const pad = 3;
  const cols = 15;
  const rowsPer = Math.ceil(seeds.length / cols);
  const rows = AVAILABLE_THEMES.length * rowsPer;
  const Wimg = cols * (T + pad) + pad;
  const Himg = rows * (T + pad) + pad;
  const rgb = new Uint8Array(Wimg * Himg * 3);
  for (let i = 0; i < Wimg * Himg; i++) rgb.set([38, 35, 31], i * 3);
  const put = (x: number, y: number, c: ArrayLike<number>) => {
    if (x < 0 || y < 0 || x >= Wimg || y >= Himg) return;
    const k = (y * Wimg + x) * 3;
    rgb[k] = c[0];
    rgb[k + 1] = c[1];
    rgb[k + 2] = c[2];
  };
  const text = (s: string, x0: number, y0: number) => {
    const w = s.length * 4 + 1;
    for (let y = y0 - 1; y < y0 + 6; y++) for (let x = x0 - 1; x < x0 + w; x++) put(x, y, [20, 18, 16]);
    [...s].forEach((ch, k) => {
      const g = FONT[ch] ?? FONT[" "];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === "1") put(x0 + k * 4 + c, y0 + r, [250, 246, 236]);
    });
  };
  if (keep) mkdirSync(keep, { recursive: true });
  AVAILABLE_THEMES.forEach((theme, t) => {
    seeds.forEach((seed, k) => {
      const path = keep ? join(keep, `${theme}-${size}-${seed}.timber`) : "";
      let file: TimberFile;
      if (path && existsSync(path)) file = readTimber(new Uint8Array(readFileSync(path)));
      else {
        const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
        if (!r.report.passed) throw new Error(`${theme} ${seed} did not pass`);
        file = r.file;
        if (path) writeFileSync(path, r.bytes);
      }
      const p = resourceTopDown(file, 1);
      const x0 = pad + (k % cols) * (T + pad);
      const y0 = pad + (t * rowsPer + Math.floor(k / cols)) * (T + pad);
      for (let y = 0; y < Math.min(T, p.h); y++) for (let x = 0; x < Math.min(T, p.w); x++) put(x0 + x, y0 + y, p.rgb.subarray((y * p.w + x) * 3, (y * p.w + x) * 3 + 3));
      text(`${TAG[theme]} ${seed}`, x0 + 2, y0 + 2);
    });
    console.log(`${theme}: ${seeds.length} maps`);
  });
  const png = palettedPng(rgb, Wimg, Himg);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  console.log(`wrote ${out} (${Math.round(png.length / 1024)} KB, ${Wimg}×${Himg})`);
}

if (process.argv[1] && /resources-sheet\.ts$/.test(process.argv[1])) main();
