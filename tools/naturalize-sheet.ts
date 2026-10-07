// Naturalize's rules side by side, for Kyler's eye (D399): each case's land before a stroke and after it
// under each rule asked for, top-down in the preview's shading (north up), labelled with the land's
// level edges (neighbouring tiles at different levels). The stroke is the contract test's (an older
// map has fewer terraces): one Size 64, Strength 10 drag across a 96² map at Terracing 100.
//
//   npx tsx tools/naturalize-sheet.ts --cases riverValley:3,lakeBasin:1 --rules 4,5 [--out .scratch/naturalize-sheet] [--append]
//   python tools/naturalize-sheet.py .scratch/naturalize-sheet docs/sheets/<name>.png "<title>"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MapSession } from "../src/core/doc/session";
import type { BrushParams } from "../src/core/features/raster/brush";
import { generate } from "../src/core/gen/generate";
import { shadeTiles } from "../src/core/render/shade";
import { GENERATOR_VERSION, makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { encodePng } from "./png";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const OUT = arg("out", ".scratch/naturalize-sheet");
const CASES = arg("cases", "riverValley:3,lakeBasin:1").split(",").map((c) => c.split(":")) as [ThemeId, string][];
const RULES = arg("rules", "4,5").split(",").map(Number);
const W = 96;
mkdirSync(OUT, { recursive: true });

const edges = (h: Uint8Array) => {
  let c = 0;
  for (let i = 0; i < h.length; i++) {
    if (i % W < W - 1 && h[i] !== h[i + 1]) c++;
    if (i + W < h.length && h[i] !== h[i + W]) c++;
  }
  return c;
};

function picture(heights: Uint8Array, water: ArrayLike<number>, file: string): void {
  const rgb = shadeTiles(heights, W, W, water);
  const img = new Uint8Array(W * W * 3);
  for (let y = 0; y < W; y++) img.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), (W - 1 - y) * W * 3);
  writeFileSync(join(OUT, file), encodePng(img, W, W));
}

// (`--append` adds to the cases already there, as from another generator version)
const prior = join(OUT, "index.json");
const index: { theme: string; seed: number; generator: string; cells: { label: string; file: string; edges: number; raised: number; lowered: number }[] }[] =
  process.argv.includes("--append") && existsSync(prior) ? JSON.parse(readFileSync(prior, "utf8")).cases : [];
for (const [theme, s] of CASES) {
  const seed = Number(s);
  const fresh = () => {
    const spec = makeSpec({ seed, theme, size: { x: W, y: W } });
    spec.settings.terrain.terracing = 100;
    const r = generate(spec);
    const m = MapSession.fromGenerated(r, r.file);
    m.setWaterMode("defer");
    return m;
  };
  const m0 = fresh();
  const before = m0.built.heights.slice();
  const water = m0.built.water.slice();
  const cells = [{ label: "Before", file: `${theme}-${seed}-before.png`, edges: edges(before), raised: 0, lowered: 0 }];
  picture(before, water, cells[0].file);
  const dabs: number[] = [];
  for (let k = 0; k < 30; k++) dabs.push(4 * (W / 2 - 30 + 2 * k) + 2, 4 * (W / 2) + 2);
  for (const rule of RULES) {
    const m = fresh();
    const p = { tool: "naturalize", size: 64, strength: 10, seed: 5, weathers: true, dabs, weathering: rule } as BrushParams;
    const u = m.apply({ op: "brush", params: p }, "user", "Naturalize");
    if (u.errors.length) throw new Error(u.errors.join("; "));
    const after = m.built.heights;
    let raised = 0;
    let lowered = 0;
    for (let i = 0; i < after.length; i++) {
      if (after[i] > before[i]) raised++;
      else if (after[i] < before[i]) lowered++;
    }
    const file = `${theme}-${seed}-rule${rule}.png`;
    picture(after, water, file);
    cells.push({ label: `Rule ${rule}`, file, edges: edges(after), raised, lowered });
  }
  index.push({ theme, seed, generator: GENERATOR_VERSION, cells });
  console.log(`${theme} ${seed}: ${cells.map((c) => `${c.label} ${c.edges}${c.raised || c.lowered ? ` (+${c.raised} -${c.lowered})` : ""}`).join(" | ")}`);
}
writeFileSync(prior, JSON.stringify({ cases: index }, null, 1));
