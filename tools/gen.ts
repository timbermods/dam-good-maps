// Generate maps from the command line with the same core the website runs.
//
//   npx tsx tools/gen.ts --seeds 1-10 --sizes 96,128,256 --out out/m1-batch [--difficulty normal] [--project] [--quiet]
//
// Writes "<Theme> (<seed>).timber" (and the .damgoodmaps.json project file with --project) per seed
// and size, into <out>/<size>/, and prints timing, attempts and the sha256 of each file.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generate } from "../src/core/gen/generate";
import { fileName } from "../src/core/gen/pack";
import { encodeProject, projectFileName, generatedDocument } from "../src/core/doc/document";
import { makeSpec, type Difficulty } from "../src/core/spec/mapspec";

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

const seeds = parseSeeds(arg("seeds", "1"));
const sizes = arg("sizes", "128").split(",").map(Number);
const outDir = arg("out", "out/m1-batch");
const difficulty = arg("difficulty", "normal") as Difficulty;
const withProject = process.argv.includes("--project");
const quiet = process.argv.includes("--quiet");

let failed = 0;
const rows: string[] = [];
for (const size of sizes) {
  const dir = join(outDir, String(size));
  mkdirSync(dir, { recursive: true });
  for (const seed of seeds) {
    const spec = makeSpec({ seed, size: { x: size, y: size }, designedFor: difficulty });
    const t0 = performance.now();
    const r = generate(spec);
    const ms = Math.round(performance.now() - t0);
    if (!r.report.passed) {
      failed++;
      console.log(`FAIL seed ${seed} ${size}: ${r.report.checks.filter((c) => !c.ok).map((c) => `${c.id} (${c.message})`).join("; ")}`);
      continue;
    }
    const name = fileName(r.spec);
    writeFileSync(join(dir, name), r.bytes);
    if (withProject) writeFileSync(join(dir, projectFileName(r.spec)), encodeProject(generatedDocument(r)));
    const sha = createHash("sha256").update(r.bytes).digest("hex");
    const row = `${size}\t${seed}\t${ms} ms\tattempts ${r.attempts}\tentities ${r.built.entities.length}\t${sha}`;
    rows.push(row);
    if (!quiet) console.log(row);
  }
}
console.log(`${rows.length} maps written, ${failed} failed`);
process.exit(failed ? 1 : 0);
