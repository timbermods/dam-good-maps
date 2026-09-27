// Each setting's effect on its measured target (ROADMAP M6), on more seeds than the test runs:
//
//   npx tsx tools/settings-batch.ts [--seeds 1-20] [--size 96] [--only "Relief,Rivers"] [--out out/m6/settings.md] [--detail]
//
// Prints one row per setting: its two values, the target, the mean at each value, and whether it
// moved as far as the test asks. Writes the table as Markdown with --out. Exits non-zero when a
// setting did not move.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { EXPERIMENTS, runExperiment, seedsFor } from "./settings-suite";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function parseSeeds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    else out.push(Number(part));
  }
  return out;
}

const seeds = parseSeeds(arg("seeds", "1-20"));
const size = Number(arg("size", "96"));
const only = arg("only", "");
const out = arg("out", "");
// --detail prints each seed's value at both settings under its row
const detail = process.argv.includes("--detail");
const picked = EXPERIMENTS.filter((e) => !only || only.split(",").includes(e.setting));

const rows: string[] = [
  `${seeds.length} seeds (${seeds[0]}–${seeds[seeds.length - 1]}) at ${size}×${size}, each setting at two values, the rest at the theme's preset.`,
  "",
  "| Setting | Values | Target (PLAN §5) | Mean at the low value | Mean at the high value | Result |",
  "|---|---|---|---|---|---|",
];
let bad = 0;
for (const e of picked) {
  const t0 = performance.now();
  const o = runExperiment(e, seedsFor(e, seeds), size);
  const d = e.digits ?? 0;
  if (!o.ok) bad++;
  const row = `| ${e.setting} | ${e.values.join(" → ")} | ${e.target} | ${o.means[0].toFixed(d)} | ${o.means[1].toFixed(d)} | ${o.ok ? "moves" : "**does not move**"}: ${o.why}${o.failed ? `; ${o.failed} maps failed a check` : ""} |`;
  rows.push(row);
  console.log(`${row}  (${Math.round((performance.now() - t0) / 1000)} s)`);
  if (detail) {
    const ss = seedsFor(e, seeds);
    for (let k = 0; k < 2; k++) console.log(`    ${e.values[k]}: ${o.values[k].map((v, j) => `${ss[j]}=${v.toFixed(d)}`).join("  ")}`);
  }
}
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, rows.join("\n") + "\n");
}
console.log(bad ? `${bad} settings did not move` : "every setting moved its target");
process.exit(bad ? 1 : 0);
