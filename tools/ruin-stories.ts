// Ruins placed with meaning (D488 (2)): how often each story appears per theme, its line, and the
// map's scrap against the official range.
//
//   npx tsx tools/ruin-stories.ts [--seeds 1-10] [--size 128] [--themes riverValley,canyon]

import { generate } from "../src/core/gen/generate";
import { ruinStories } from "../src/core/gen/ruinStories";
import { decodeSpecFragment, type ThemeId } from "../src/core/spec/mapspec";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const [a, b] = arg("seeds", "1-10").split("-").map(Number);
const size = Number(arg("size", "128"));
const themes = arg("themes", "riverValley,canyon,highlands,lakeBasin,delta,islands").split(",") as ThemeId[];
for (const theme of themes) {
  let dams = 0;
  let villages = 0;
  let n = 0;
  let outOfRange = 0;
  for (let seed = a; seed <= (b ?? a); seed++) {
    const spec = decodeSpecFragment(`s=${seed}&t=${theme}&z=${size}&d=n`)!;
    const t0 = performance.now();
    const r = generate(spec.spec);
    const ms = Math.round(performance.now() - t0);
    if (!r.report.passed) {
      console.log(`${theme} ${seed}: failed`);
      continue;
    }
    n++;
    const W = r.built.W;
    const st = ruinStories(r.features, W);
    let scrap = 0;
    for (const e of r.built.entities) {
      const m = /^RuinColumnH(\d)$/.exec(e.template);
      if (m) scrap += 15 * Number(m[1]);
    }
    // (the checks' own reading: the official range times the theme's and the settings' Ruins)
    const sc = r.report.checks.find((c) => c.id === "resources.scrap");
    const place = /(above|below|within) the official range of ([\d,]+–[\d,]+)/.exec(sc?.message ?? "");
    if (place && place[1] !== "within") outOfRange++;
    for (const s of st) {
      if (s.kind === "dam") dams++;
      else villages++;
      console.log(`${theme} ${seed} ${s.kind} (${s.x},${s.y}): ${s.say}`);
    }
    const ruinsCheck = r.report.checks.filter((c) => c.id.startsWith("ruins.") || c.id === "resources.scrap").map((c) => `${c.id}=${c.ok ? "ok" : "FAIL"}`);
    console.log(`${theme} ${seed} (${ms} ms): scrap ${scrap} (${place?.[1] ?? "?"} ${place?.[2] ?? ""}) ${ruinsCheck.join(" ")}`);
  }
  console.log(`== ${theme}: ${n} maps, dam ${dams}, village ${villages}, scrap out of range ${outOfRange}`);
}
