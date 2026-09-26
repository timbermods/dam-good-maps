// Tall maps (heights above 16, Verticality 85; D172), measured on the land the
// prototype makes before the build: the field, the levels, the rivers' channels, the hollows filled
// and the ramps cut (generate.ts up to its first look). The product's build clips terrain at 16
// (`MAX_TERRAIN` in src/core/features/raster/terrain.ts, `integrityAt`), so without a src change
// the tall maps cannot be built as they are planned: M9a lifts that cap for Verticality 70+ (the
// tall-maps probe confirmed such maps load, D172). This reads the land that would be built.
//
//   npx tsx investigation/generative/v2/unlocked.ts [--seeds 1-100] [--vt 85]

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { AVAILABLE_THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { arg, parseSeeds } from "../lib/paths";
import { cleanPitsAndSpikes, fillDryHollows, mergeSmallRegions } from "../proto/levels";
import { fieldV2 } from "./field";
import { drawGenomeV2 } from "./genome";
import { planHydro } from "./hydro";
import { naturalRamps, relaxEdges, snapLevelsV2 } from "./levels";
import { vertical } from "./vertical";

const seeds = parseSeeds(arg("seeds", "1-100"));
const vt = Number(arg("vt", "85"));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const band = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
  return { p10: r3(q(0.1)), median: r3(q(0.5)), p90: r3(q(0.9)) };
};
const W = 128;
const rows: { theme: string; range: number; levels: number; maxHeight: number; above16: number; flatShare: number; cliffShare: number; top: number }[] = [];
for (const theme of AVAILABLE_THEMES as readonly ThemeId[])
  for (const seed of seeds) {
    const g = drawGenomeV2(theme, seed, W, W, 0, { vt, unlocked: true });
    const F = fieldV2(g, seed, W, W);
    const h = snapLevelsV2(F.E, g, seed, W, W);
    relaxEdges(h, W, W);
    const hy = planHydro(F.E, h, g, seed, W, W, 0);
    relaxEdges(h, W, W);
    const keep = new Uint8Array(W * W);
    for (let i = 0; i < W * W; i++) keep[i] = hy.water[i] === 1 || hy.water[i] === 2 ? 1 : 0;
    mergeSmallRegions(h, W, W, 4, keep);
    cleanPitsAndSpikes(h, W, W, keep);
    fillDryHollows(h, W, W, keep);
    naturalRamps(h, W, W, keep, new Uint8Array(W * W), g, seed, 0);
    const v = vertical(h, W, W, new Float64Array(W * W), [], null);
    rows.push({ theme, range: v.range, levels: v.levels, maxHeight: v.maxHeight, above16: v.above16, flatShare: v.flatShare, cliffShare: v.cliffShare, top: g.top });
  }
const out = {
  note: `Verticality ${vt} unlocked (heights up to 22), seeds ${seeds[0]}–${seeds[seeds.length - 1]} per theme at 128²: the land before the build (the product's build clips at 16 until M9a lifts it behind the probe lock)`,
  maps: rows.length,
  all: Object.fromEntries((["range", "levels", "maxHeight", "above16", "flatShare", "cliffShare", "top"] as const).map((k) => [k, band(rows.map((r) => r[k]))])),
  above16Maps: r3(rows.filter((r) => r.maxHeight > 16).length / rows.length),
  byTheme: Object.fromEntries(AVAILABLE_THEMES.map((t) => [t, Object.fromEntries((["range", "maxHeight", "above16", "cliffShare"] as const).map((k) => [k, band(rows.filter((r) => r.theme === t).map((r) => r[k]))]))])),
};
writeFileSync(join(process.cwd(), "investigation", "generative", "unlocked-v2.json"), JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify({ ...out, byTheme: undefined }, null, 1));
