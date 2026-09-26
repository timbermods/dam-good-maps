// Contact sheets (D144; the prototype's own sheet tool until `npm run sheet` exists in M9a):
// - a local page, <ROOT>\v2\sheet.html: seeds 1–30 of every theme at 128², version 1 and version 2
//   side by side, and a row at high Verticality (85, heights within 16), top-down, never committed;
// - the committed record, docs/sheets/design-v2.png: seeds 1–30 of every theme of version 2 at
//   128², top-down, each labelled with its seed and theme; our own maps only; a paletted PNG under
//   1 MB.
// Maps come from the batch folders (<ROOT>\maps\<set>), rendered with the workshop study's
// top-down shading (investigation/workshop/lib/render.ts).
//
//   npx tsx investigation/generative/v2/sheet.ts [--seeds 1-30]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { zlibSync } from "fflate";
import { readTimber } from "../../../src/core/format/timber";
import { surfaceOf } from "../../../src/core/format/world";
import { mapObjects } from "../../../src/core/sim/model";
import { THEMES, THEME_NAMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { encodePng } from "../../../tools/png";
import { topDown } from "../../workshop/lib/render";
import { arg, MAPS, parseSeeds } from "../lib/paths";
import { V2_ROOT } from "./refs";

const seeds = parseSeeds(arg("seeds", "1-30"));

/** A map's top-down picture at one pixel per tile (null when the batch has no file for it). */
function picture(set: string, theme: string, seed: number): { rgb: Uint8Array; w: number; h: number } | null {
  const dir = join(MAPS, set);
  const t = join(dir, `${theme}-${seed}.timber`);
  const f = join(dir, `${theme}-${seed}.f32`);
  if (!existsSync(t) || !existsSync(f)) return null;
  const file = readTimber(new Uint8Array(readFileSync(t)));
  const w = file.world;
  const N = w.sizeX * w.sizeY;
  const b = readFileSync(f);
  const a = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  return topDown(surfaceOf(w), w.sizeX, w.sizeY, a.subarray(0, N), a.subarray(N, 2 * N), mapObjects(w), w.sizeX);
}

// ------------------------------------------------------------------------------ the local page

function pageHtml(): string {
  const rowsOf = (label: string, set: string, theme: string) => {
    const cells = seeds
      .map((s) => {
        const p = picture(set, theme, s);
        if (!p) return `<figure class="none"><div></div><figcaption>${s}</figcaption></figure>`;
        const png = Buffer.from(encodePng(p.rgb, p.w, p.h)).toString("base64");
        return `<figure><img src="data:image/png;base64,${png}" alt="${THEME_NAMES[theme as ThemeId]} ${s}"><figcaption>${s}</figcaption></figure>`;
      })
      .join("");
    return `<div class="row"><h3>${label}</h3><div class="grid">${cells}</div></div>`;
  };
  const blocks = THEMES.map((theme) => `<section><h2>${THEME_NAMES[theme]}</h2>${rowsOf("Version 1", "v1-128", theme)}${rowsOf("Version 2", "v2-128", theme)}${rowsOf("Version 2, Verticality 85", "v2-128-vt85", theme)}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Design v2 sheet</title>
<style>
:root{--bg:#f4f1ea;--ink:#2b2620;--muted:#6b6358}
@media (prefers-color-scheme: dark){:root{--bg:#1d1b18;--ink:#ece6da;--muted:#a79f92}}
body{background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif;margin:16px}
h1{font-size:20px;margin:0 0 4px} p{color:var(--muted);margin:0 0 16px}
section{margin:0 0 28px} h2{font-size:16px;margin:0 0 6px} h3{font-size:12px;font-weight:600;color:var(--muted);margin:6px 0 2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:4px}
figure{margin:0} img{width:100%;image-rendering:pixelated;display:block;border-radius:2px}
.none div{aspect-ratio:1;background:repeating-linear-gradient(45deg,#8883,#8883 4px,transparent 4px,transparent 8px)}
figcaption{font-size:11px;color:var(--muted);text-align:center}
</style></head><body>
<h1>M9 design version 2: seeds ${seeds[0]}–${seeds[seeds.length - 1]} at 128²</h1>
<p>Top-down, north up. Each theme: version 1, version 2 at its default Verticality, and version 2 at Verticality 85 (heights kept within 16). Local only.</p>
${blocks}</body></html>`;
}

// ------------------------------------------------------------------------ the committed image

/** A 3×5 pixel font for the labels. */
const FONT: Record<string, string> = {
  "0": "111101101101111", "1": "010110010010111", "2": "111001111100111", "3": "111001111001111", "4": "101101111001001",
  "5": "111100111001111", "6": "111100111101111", "7": "111001010010010", "8": "111101111101111", "9": "111101111001111",
  A: "010101111101101", B: "110101110101110", C: "011100100100011", D: "110101101101110", E: "111100110100111", F: "111100110100100",
  G: "011100101101011", H: "101101111101101", I: "111010010010111", K: "101101110101101", L: "100100100100111", N: "110101101101101",
  O: "010101101101010", R: "110101110101101", S: "011100010001110", T: "111010010010010", V: "101101101101010", Y: "101101010010010",
  " ": "000000000000000",
};
const THEME_TAG: Record<string, string> = { riverValley: "RV", canyon: "CA", highlands: "HI", lakeBasin: "LB", delta: "DE", islands: "IS" };

function sheetPng(): Uint8Array {
  const T = 64; // thumbnail side
  const pad = 3;
  const left = 0;
  const cols = seeds.length;
  const rowsN = THEMES.length;
  const Wimg = left + cols * (T + pad) + pad;
  const Himg = rowsN * (T + pad) + pad;
  const rgb = new Uint8Array(Wimg * Himg * 3).fill(0);
  for (let i = 0; i < Wimg * Himg; i++) {
    rgb[i * 3] = 38;
    rgb[i * 3 + 1] = 35;
    rgb[i * 3 + 2] = 31;
  }
  const put = (x: number, y: number, c: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= Wimg || y >= Himg) return;
    const k = (y * Wimg + x) * 3;
    rgb[k] = c[0];
    rgb[k + 1] = c[1];
    rgb[k + 2] = c[2];
  };
  const text = (s: string, x0: number, y0: number) => {
    // a dark box, then light glyphs (2 px per font pixel is too big: 1 px, 3×5)
    const w = s.length * 4 + 1;
    for (let y = y0 - 1; y < y0 + 6; y++) for (let x = x0 - 1; x < x0 + w; x++) put(x, y, [20, 18, 16]);
    [...s].forEach((ch, k) => {
      const g = FONT[ch] ?? FONT[" "];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === "1") put(x0 + k * 4 + c, y0 + r, [250, 246, 236]);
    });
  };
  THEMES.forEach((theme, row) => {
    seeds.forEach((seed, col) => {
      const x0 = left + pad + col * (T + pad);
      const y0 = pad + row * (T + pad);
      const p = picture("v2-128", theme, seed);
      if (p) {
        const s = p.w / T;
        for (let y = 0; y < T; y++)
          for (let x = 0; x < T; x++) {
            // box average of the s×s tiles under this pixel
            let r = 0, g = 0, b = 0, n = 0;
            for (let dy = 0; dy < s; dy++)
              for (let dx = 0; dx < s; dx++) {
                const k = ((y * s + dy) * p.w + x * s + dx) * 3;
                r += p.rgb[k];
                g += p.rgb[k + 1];
                b += p.rgb[k + 2];
                n++;
              }
            put(x0 + x, y0 + y, [Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
          }
      }
      text(`${THEME_TAG[theme]} ${seed}`, x0 + 2, y0 + 2);
    });
  });
  return paletted(rgb, Wimg, Himg);
}

/** A paletted PNG (6×7×6 levels of red, green and blue) of an RGB image. */
function paletted(rgb: Uint8Array, w: number, h: number): Uint8Array {
  const LR = 6, LG = 7, LB = 6;
  const q = (v: number, n: number) => Math.min(n - 1, Math.round((v / 255) * (n - 1)));
  const pal = new Uint8Array(LR * LG * LB * 3);
  for (let r = 0; r < LR; r++) for (let g = 0; g < LG; g++) for (let b = 0; b < LB; b++) {
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

if (process.argv[1] && /sheet\.ts$/.test(process.argv[1])) {
  mkdirSync(V2_ROOT, { recursive: true });
  const html = join(V2_ROOT, "sheet.html");
  writeFileSync(html, pageHtml());
  console.log(`wrote ${html}`);
  if (!process.argv.includes("--no-png")) {
    mkdirSync(join("docs", "sheets"), { recursive: true });
    const png = sheetPng();
    writeFileSync(join("docs", "sheets", "design-v2.png"), png);
    console.log(`wrote docs/sheets/design-v2.png (${Math.round(png.length / 1024)} KB)`);
  }
}
