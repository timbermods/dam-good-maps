// Top-down pictures of a map for the MCP server (D141, D501): the core's own shading (core/render/shade.ts, the map's
// thumbnail colours) with tile coordinates in the margins, so a picture can be read back as tiles. North (higher Y)
// is up, as in the map's thumbnail. Layers draw one field of the map instead of its look.

import type { MapSession } from "../../src/core/doc/session";
import { shadeTiles } from "../../src/core/render/shade";
import { encodePng } from "../../tools/png";

export const LAYERS = ["map", "depth", "moisture", "badwater", "heights"] as const;
export type Layer = (typeof LAYERS)[number];

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The longest side of the map part of a picture, in pixels. */
const MOST_PX = 768;

// a 3×5 font for the coordinates
const DIGITS = ["111101101101111", "010110010010111", "111001111100111", "111001111001111", "101101111001001", "111100111001111", "111100111101111", "111001001001001", "111101111101111", "111101111001111"];

type RGB = [number, number, number];

function ramp(stops: RGB[], t: number): RGB {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const k = Math.min(stops.length - 2, Math.floor(u));
  const f = u - k;
  const a = stops[k];
  const b = stops[k + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

const DRY: RGB = [70, 66, 60];

/** The colour of each tile for a layer. */
function tileColours(s: MapSession, layer: Layer): Uint8Array {
  const b = s.built;
  const { W, H } = b;
  const N = W * H;
  const out = new Uint8Array(N * 3);
  const put = (i: number, c: RGB) => {
    out[i * 3] = c[0];
    out[i * 3 + 1] = c[1];
    out[i * 3 + 2] = c[2];
  };
  if (layer === "map") {
    const rgb = shadeTiles(b.heights, W, H, b.water);
    out.set(rgb);
    // badwater shows purple, as the tools' pictures show it
    for (let i = 0; i < N; i++) if (b.water[i] > 0.05 && b.contamination[i] >= 0.05) put(i, [150, 60, 170]);
    return out;
  }
  let hi = 0;
  let lo = 255;
  for (let i = 0; i < N; i++) {
    hi = Math.max(hi, b.heights[i]);
    lo = Math.min(lo, b.heights[i]);
  }
  for (let i = 0; i < N; i++) {
    const shade = 0.75 + 0.25 * ((b.heights[i] - lo) / Math.max(1, hi - lo));
    const ground: RGB = [DRY[0] * shade + 40, DRY[1] * shade + 40, DRY[2] * shade + 40];
    if (layer === "heights") {
      // a colour a level, light to dark, every other level a touch lighter so steps read
      const c = ramp([[40, 90, 60], [120, 160, 80], [220, 200, 120], [200, 130, 80], [150, 90, 90], [240, 240, 240]], b.heights[i] / 22);
      const k = b.heights[i] % 2 ? 1.08 : 0.94;
      put(i, [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]);
    } else if (layer === "depth") {
      const d = b.water[i];
      put(i, d > 0.05 ? ramp([[170, 220, 250], [60, 130, 210], [10, 30, 110]], d / 4) : ground);
    } else if (layer === "moisture") {
      const m = b.moisture[i];
      put(i, b.water[i] > 0.05 ? [60, 110, 200] : m > 0 ? ramp([[150, 200, 90], [30, 120, 40]], m / 4) : ground);
    } else {
      const wet = b.water[i] > 0.05;
      const c = wet ? b.contamination[i] : 0;
      const soil = b.soilContamination[i];
      put(i, wet ? (c >= 0.05 ? ramp([[200, 130, 220], [110, 20, 140]], c) : [60, 110, 200]) : soil > 0 ? [190, 120, 160] : ground);
    }
  }
  return out;
}

/** A PNG of the map or a region of it, with coordinates in the margins and the start and sources marked. */
export function picture(s: MapSession, opts: { layer?: Layer; region?: Region } = {}): { png: Uint8Array; region: Region; scale: number; legend: string } {
  const layer = opts.layer ?? "map";
  const { W, H } = s.built;
  const r = opts.region ?? { x: 0, y: 0, w: W, h: H };
  const region = { x: Math.max(0, r.x), y: Math.max(0, r.y), w: 0, h: 0 };
  region.w = Math.min(W, r.x + r.w) - region.x;
  region.h = Math.min(H, r.y + r.h) - region.y;
  if (region.w < 1 || region.h < 1) throw new Error("The region is off the map");
  const S = Math.max(1, Math.min(16, Math.floor(MOST_PX / Math.max(region.w, region.h))));
  const F = 2; // font pixel size
  const ML = 4 * 4 * F + 6;
  const MB = 5 * F + 8;
  const MT = 6;
  const MR = 8;
  const IW = ML + region.w * S + MR;
  const IH = MT + region.h * S + MB;
  const img = new Uint8Array(IW * IH * 3).fill(250);
  const set = (px: number, py: number, c: RGB) => {
    if (px < 0 || py < 0 || px >= IW || py >= IH) return;
    const k = (py * IW + px) * 3;
    img[k] = c[0];
    img[k + 1] = c[1];
    img[k + 2] = c[2];
  };
  const blend = (px: number, py: number, c: RGB, a: number) => {
    const k = (py * IW + px) * 3;
    img[k] = img[k] * (1 - a) + c[0] * a;
    img[k + 1] = img[k + 1] * (1 - a) + c[1] * a;
    img[k + 2] = img[k + 2] * (1 - a) + c[2] * a;
  };
  // tile (x, y) to its pixel rectangle's top-left (north up: higher y nearer the top)
  const px = (x: number) => ML + (x - region.x) * S;
  const py = (y: number) => MT + (region.y + region.h - 1 - y) * S;
  const col = tileColours(s, layer);
  for (let y = region.y; y < region.y + region.h; y++)
    for (let x = region.x; x < region.x + region.w; x++) {
      const i = y * W + x;
      const c: RGB = [col[i * 3], col[i * 3 + 1], col[i * 3 + 2]];
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) set(px(x) + dx, py(y) + dy, c);
    }
  // the grid: a line every few tiles, numbered in the margins
  const span = Math.max(region.w, region.h);
  const G = [4, 8, 16, 32, 64].find((g) => (g * S >= 40 && span / g <= 16)) ?? 64;
  const text = (n: number, x0: number, y0: number) => {
    const str = String(n);
    for (let k = 0; k < str.length; k++) {
      const d = DIGITS[str.charCodeAt(k) - 48];
      for (let r2 = 0; r2 < 5; r2++) for (let c2 = 0; c2 < 3; c2++) if (d[r2 * 3 + c2] === "1") for (let a = 0; a < F; a++) for (let b2 = 0; b2 < F; b2++) set(x0 + (k * 4 + c2) * F + b2, y0 + r2 * F + a, [30, 30, 30]);
    }
  };
  const textWidth = (n: number) => (String(n).length * 4 - 1) * F;
  for (let x = Math.ceil(region.x / G) * G; x < region.x + region.w; x += G) {
    for (let y = MT; y < MT + region.h * S; y++) blend(px(x), y, [255, 255, 255], 0.45);
    text(x, Math.min(IW - textWidth(x) - 1, Math.max(ML, px(x) - textWidth(x) / 2)), MT + region.h * S + 4);
  }
  for (let y = Math.ceil(region.y / G) * G; y < region.y + region.h; y += G) {
    const yy = py(y) + S - 1;
    for (let x = ML; x < ML + region.w * S; x++) blend(x, yy, [255, 255, 255], 0.45);
    text(y, ML - 4 - textWidth(y), Math.max(MT, yy - (5 * F) / 2));
  }
  // the start's 3×3 in red, water sources in white, badwater sources in magenta
  const inR = (x: number, y: number) => x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h;
  const dot = (x: number, y: number, c: RGB, full: boolean) => {
    if (!inR(x, y)) return;
    const m = full ? 0 : Math.floor(S / 4);
    for (let dy = m; dy < S - m; dy++) for (let dx = m; dx < S - m; dx++) set(px(x) + dx, py(y) + dy, c);
  };
  for (const e of s.built.entities) {
    if (e.template === "WaterSource") dot(e.x, e.y, [255, 255, 255], false);
    else if (e.template === "BadwaterSource") dot(e.x, e.y, [255, 60, 220], false);
  }
  const st = s.built.start;
  if (st) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) dot(st.x + dx, st.y + dy, [230, 20, 20], true);
  const legend = {
    map: "The map's look: land shaded by height, water blue, badwater purple.",
    depth: "Water depth: light blue shallow to dark blue 4 levels deep or more; dry land grey.",
    moisture: "Soil moisture: green where plants live, darker wetter; water blue; dry land grey.",
    badwater: "Badwater: purple water, darker more contaminated; pink soil that badwater kills plants on; clean water blue.",
    heights: "Heights: one colour a level, from green low ground through sand and brown to white at level 22.",
  }[layer];
  return { png: encodePng(img, IW, IH), region, scale: S, legend: `${legend} North (higher Y) is up. Grid lines every ${G} tiles, numbered in the margins. Red: the start. White dots: water sources. Magenta dots: badwater sources.` };
}
