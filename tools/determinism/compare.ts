// Compares run.ts's results from different machines (OS and CPU), checkpoint by checkpoint (D366).
//
//   npx tsx tools/determinism/compare.ts <result dir> <result dir> [...]
//
// Each directory holds one host's summary.json and engine manifests. Fails on a mismatch, an
// incomplete or failed run, or runs of different code or case lists.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Row } from "./cases";

const dirs = process.argv.slice(2);
if (dirs.length < 2) throw Error("Pass at least two result directories");
const all: { dir: string; engine: string; summary: any; rows: Row[] }[] = [];
for (const dir of dirs) {
  const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
  if (summary.mismatches.length || Object.values(summary.engines).some((e) => (e as { errors: unknown[] }).errors.length)) throw Error(`${dir}: a failed or mismatched run`);
  for (const engine of Object.keys(summary.engines)) {
    const rows = JSON.parse(readFileSync(join(dir, `${engine}.json`), "utf8")) as Row[];
    if (rows.length !== summary.engines[engine].checkpoints) throw Error(`${dir}/${engine}: a truncated manifest`);
    all.push({ dir, engine, summary, rows });
  }
}
const reference = all[0];
let differences = 0;
for (const r of all.slice(1)) {
  const a = reference.summary;
  const b = r.summary;
  if (b.base !== a.base || b.smoke !== a.smoke || b.only !== a.only || b.cases !== a.cases) throw Error(`${r.dir}: different code or cases`);
  if (r.rows.length !== reference.rows.length) throw Error(`${r.dir}/${r.engine}: a different checkpoint count`);
  for (let k = 0; k < reference.rows.length; k++) {
    const x = reference.rows[k];
    const y = r.rows[k];
    if (x.label !== y.label) throw Error(`${r.dir}/${r.engine}: checkpoints in a different order`);
    if (x.hash !== y.hash) {
      differences++;
      if (differences <= 40) console.error(`${r.dir}/${r.engine} ${x.label}: ${Object.keys(x.components).filter((key) => x.components[key] !== y.components[key]).join(", ")}`);
    }
  }
}
console.log(`${all.length} engine and host manifests, ${reference.rows.length} checkpoints each, ${differences} mismatches (${dirs.map((d) => JSON.parse(readFileSync(join(d, "summary.json"), "utf8")).platform.arch + " " + JSON.parse(readFileSync(join(d, "summary.json"), "utf8")).platform.os).join(", ")})`);
if (differences) process.exitCode = 1;
