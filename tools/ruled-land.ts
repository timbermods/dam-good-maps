// Ruled land (`src/core/validate/ruledLand.ts`, the gate's `terrain.ruled_land`): its three numbers and verdict for a
// map file, a theme's seeds, the lake stair's or today's Gate.
//
//   npx tsx tools/ruled-land.ts map.timber …
//   npx tsx tools/ruled-land.ts --theme canyon|all [--seeds 1-12] [--size 128]
//   npx tsx tools/ruled-land.ts --premise lakeStair|gate [--seeds 1-3] [--size 128]

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { readTimber } from "../src/core/format/timber";
import { generate } from "../src/core/gen/generate";
import { generatePremise } from "../src/core/premise/generate";
import { gateMap } from "../src/core/premise/gateMap";
import { makeSpec, THEMES, type ThemeId } from "../src/core/spec/mapspec";
import { validateMap } from "../src/core/validate/checks";
import { ruledLand, wetOf, type RuledLand } from "../src/core/validate/ruledLand";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};
const side = Number(opt("size") ?? 128);
const range = (opt("seeds") ?? "1-12").split("-").map(Number);
const seeds = Array.from({ length: (range[1] ?? range[0]) - range[0] + 1 }, (_, k) => range[0] + k);

const line = (label: string, r: RuledLand, ms?: number) =>
  console.log(`${label.padEnd(28)} straight ${(100 * r.straight).toFixed(1).padStart(5)} %  bands ${(100 * r.bands).toFixed(1).padStart(5)} %  corners ${r.corners.toFixed(1).padStart(5)}  longest ${String(r.longest.length).padStart(3)} at X ${r.longest.x} · Y ${r.longest.y}  ${r.ok ? "pass" : "FAIL"}${ms !== undefined ? `  ${ms.toFixed(1)} ms` : ""}`);
const measure = (label: string, b: { heights: ArrayLike<number>; settle: { depth: ArrayLike<number> }; W: number; H: number }) => {
  const wet = wetOf(b.settle.depth);
  const t = performance.now();
  const r = ruledLand(b.heights, wet, b.W, b.H);
  line(label, r, performance.now() - t);
};

const files = args.filter((a) => /\.timber$/.test(a));
for (const f of files) {
  const v = validateMap(readTimber(new Uint8Array(readFileSync(f))), { profile: "import", external: true });
  const row = v.report.checks.find((c) => c.id === "terrain.ruled_land");
  console.log(`${basename(f)}: ${row ? `${row.ok ? "pass" : "FAIL"} ${row.message}` : "no ruled-land row"}`);
}
const theme = opt("theme");
const premise = opt("premise");
for (const t of theme === "all" ? THEMES.filter((x) => x !== "any") : theme ? [theme as ThemeId] : []) {
  for (const seed of seeds) {
    const r = generate(makeSpec({ seed, size: { x: side, y: side }, theme: t }));
    measure(`${t} ${side}² seed ${seed}`, r.built);
  }
}
if (premise === "lakeStair") {
  for (const seed of seeds) {
    const r = generatePremise(makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "lakeStair" }));
    if ("reason" in r) console.log(`lakeStair seed ${seed}: ${r.reason}`);
    else measure(`lakeStair ${side}² seed ${seed}`, r.result.built);
  }
}
if (premise === "gate") {
  for (const seed of seeds) {
    const r = gateMap(makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" }));
    if ("reason" in r || !r.map) console.log(`gate seed ${seed}: no map`);
    else measure(`gate ${side}² seed ${seed}`, r.map.built);
  }
}
