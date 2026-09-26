// Speed at 256² and 128² (design version 2, task f), measured, not only planned: version 2's
// prototype (the field once, one settle, first-attempt fixes) against version 1's and the current
// generator, one candidate each, in Node and in the installed Chrome (bundled with esbuild into a
// page, as tests/e2e/water.spec.ts does). For version 2 it also records when a first look (the land
// and its planned water), the first settled water and the finished map are ready: what the page can
// show as the rest streams in. The machine is shared with other jobs, so every time is inflated;
// Node's CPU time is the closest to an idle machine.
//
//   npx tsx investigation/generative/v2/bench.ts [--sizes 128,256] [--seeds 1-2] [--no-chrome]

/* eslint-disable @typescript-eslint/no-explicit-any */

import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { generate } from "../../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../../src/core/spec/mapspec";
import { arg, parseSeeds } from "../lib/paths";
import { generateProto } from "../proto/generate";
import { generateV2 } from "./generate";

const sizes = arg("sizes", "128,256").split(",").map(Number);
const seeds = parseSeeds(arg("seeds", "1-2"));
const themes = arg("themes", "riverValley,canyon,highlands,lakeBasin,delta,islands").split(",") as ThemeId[];
const med = (v: number[]) => v.slice().sort((a, b) => a - b)[v.length >> 1];
const cpuNow = () => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};

interface Row {
  where: string;
  gen: string;
  size: number;
  theme: string;
  seed: number;
  ms: number;
  cpu: number;
  attempts: number;
  firstLook?: number;
  firstWater?: number;
  settles?: number;
}
const rows: Row[] = [];

for (const size of sizes)
  for (const theme of themes)
    for (const seed of seeds) {
      for (const gen of ["proto2", "proto", "current"]) {
        const t0 = performance.now();
        const c0 = cpuNow();
        const r: any = gen === "proto2" ? generateV2(theme, seed, size) : gen === "proto" ? generateProto(theme, seed, size) : generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
        const row: Row = { where: "node", gen, size, theme, seed, ms: Math.round(performance.now() - t0), cpu: Math.round(cpuNow() - c0), attempts: r.attempts };
        if (gen === "proto2") Object.assign(row, { firstLook: r.timings.firstLook, firstWater: r.timings.firstWater, settles: r.info.settles });
        rows.push(row);
        console.log(`node ${size} ${theme} ${seed} ${gen}: ${row.ms} ms (cpu ${row.cpu}), ${row.attempts} attempt(s)${row.firstLook !== undefined ? `, first look ${row.firstLook} ms, first water ${row.firstWater} ms, ${row.settles} settle(s)` : ""}`);
      }
    }

if (!process.argv.includes("--no-chrome")) {
  const entry = join(process.cwd(), ".scratch", "bench2-entry.ts");
  writeFileSync(
    entry,
    `import { generateV2 } from "../investigation/generative/v2/generate";
import { generateProto } from "../investigation/generative/proto/generate";
import { generate } from "../src/core/gen/generate";
import { makeSpec } from "../src/core/spec/mapspec";
(globalThis as any).bench = (gen: string, theme: any, seed: number, size: number) => {
  const t0 = performance.now();
  const r: any = gen === "proto2" ? generateV2(theme, seed, size) : gen === "proto" ? generateProto(theme, seed, size) : generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
  return { ms: Math.round(performance.now() - t0), attempts: r.attempts, firstLook: r.timings?.firstLook, firstWater: r.timings?.firstWater, settles: r.info?.settles };
};
`,
  );
  const out = await build({ entryPoints: [entry], bundle: true, format: "iife", platform: "browser", write: false, target: "es2022", logLevel: "error", define: { "process.env.DGM_DEBUG": '"0"' } });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.setContent("<!doctype html><title>bench</title>");
  await page.addScriptTag({ content: out.outputFiles[0].text });
  for (const size of sizes)
    for (const theme of themes)
      for (const seed of seeds)
        for (const gen of ["proto2", "proto", "current"]) {
          const x = (await page.evaluate(([g, t, s, z]) => (globalThis as any).bench(g, t, s, z), [gen, theme, seed, size] as const)) as any;
          rows.push({ where: "chrome", gen, size, theme, seed, ms: x.ms, cpu: NaN, attempts: x.attempts, firstLook: x.firstLook, firstWater: x.firstWater, settles: x.settles });
          console.log(`chrome ${size} ${theme} ${seed} ${gen}: ${x.ms} ms, ${x.attempts} attempt(s)${x.firstLook !== undefined ? `, first look ${x.firstLook}, first water ${x.firstWater}` : ""}`);
        }
  await browser.close();
}

const summary: any[] = [];
for (const where of ["node", "chrome"])
  for (const size of sizes)
    for (const gen of ["proto2", "proto", "current"]) {
      const r = rows.filter((x) => x.where === where && x.size === size && x.gen === gen);
      if (!r.length) continue;
      summary.push({
        where,
        size,
        gen,
        medianMs: med(r.map((x) => x.ms)),
        maxMs: Math.max(...r.map((x) => x.ms)),
        medianCpu: where === "node" ? med(r.map((x) => x.cpu)) : null,
        firstAttemptShare: Math.round((100 * r.filter((x) => x.attempts === 1).length) / r.length),
        medianFirstLook: gen === "proto2" ? med(r.map((x) => x.firstLook ?? NaN)) : null,
        medianFirstWater: gen === "proto2" ? med(r.map((x) => x.firstWater ?? NaN)) : null,
        maxFirstLook: gen === "proto2" ? Math.max(...r.map((x) => x.firstLook ?? 0)) : null,
      });
    }
writeFileSync(join(process.cwd(), "investigation", "generative", "bench-v2.json"), JSON.stringify({ machine: `${cpus()[0]?.model} × ${cpus().length}`, node: process.version, seeds, summary, rows }, null, 1) + "\n");
console.table(summary);
