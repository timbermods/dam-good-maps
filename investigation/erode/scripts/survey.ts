// Looks over candidate seeds for the demo's land (a working tool, output to local/): how many tall
// cliffs and thin ridges each map has, and a shaded picture of each.
//   node --import tsx investigation/erode/scripts/survey.ts highlands 1-12
import { mkdirSync, writeFileSync } from "node:fs";
import { generate } from "../../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { tallLand } from "./tall";
import { png } from "./png";

const theme = process.argv[2] ?? "highlands";
const [a, b] = (process.argv[3] ?? "1-8").split("-").map(Number);
const out = new URL("../local/survey/", import.meta.url);
mkdirSync(out, { recursive: true });

export function features(W: number, H: number, h: Uint8Array) {
  let cliffs = 0, ridges = 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 99 : h[y * W + x]);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const v = h[y * W + x];
      const drop = v - Math.min(at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1));
      if (drop >= 5) cliffs++;
      // thin: high here, 3+ lower within 2 tiles on both sides along x or y
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        let l = 99, r = 99;
        for (let k = 1; k <= 2; k++) (l = Math.min(l, at(x - dx * k, y - dy * k))), (r = Math.min(r, at(x + dx * k, y + dy * k)));
        if (v - l >= 4 && v - r >= 4 && l < 99 && r < 99) ridges++;
      }
    }
  return { cliffs, ridges };
}

export function shade(W: number, H: number, h: Uint8Array, water?: ArrayLike<number>): Uint8Array {
  const rgb = new Uint8Array(W * H * 3);
  const at = (x: number, y: number) => h[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const v = h[i];
      const sx = at(x + 1, y) - at(x - 1, y), sy = at(x, y + 1) - at(x, y - 1);
      const lit = Math.max(0.35, Math.min(1.2, 0.8 + 0.12 * (-sx + sy)));
      let r = 90 + v * 7, g = 110 + v * 5, bl = 70 + v * 4;
      if (water && water[i] > 0.05) (r = 40), (g = 110), (bl = 150);
      const o = ((H - 1 - y) * W + x) * 3;
      rgb[o] = Math.min(255, r * lit);
      rgb[o + 1] = Math.min(255, g * lit);
      rgb[o + 2] = Math.min(255, bl * lit);
      if (x % 16 === 0 || y % 16 === 0) (rgb[o] *= 0.7), (rgb[o + 1] *= 0.7), (rgb[o + 2] *= 0.7);
    }
  return rgb;
}

if (process.argv[1]?.endsWith("survey.ts"))
  for (let seed = a; seed <= b; seed++) {
    const t0 = performance.now();
    let W = 128, H = 128, heights: Uint8Array, water: ArrayLike<number> | undefined;
    if (theme === "tall") {
      const t = tallLand(seed);
      heights = t.heights;
    } else {
      const g = generate(makeSpec({ theme: theme as ThemeId, seed, size: { x: 128, y: 128 } }));
      heights = g.built.heights;
      water = g.built.water;
      W = g.built.W;
      H = g.built.H;
    }
    const f = features(W, H, heights);
    writeFileSync(new URL(`${theme}-${seed}.png`, out), png(W, H, shade(W, H, heights, water)));
    console.log(theme, seed, `max ${Math.max(...heights)}`, f, `${(performance.now() - t0).toFixed(0)} ms`);
  }
