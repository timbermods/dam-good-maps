// Batch pass rates (PLAN §15; ROADMAP M2 acceptance: 100 seeds at 128² Normal, final pass ≥ 98%,
// first attempt ≥ 60%). Generates each seed with the retry loop and reports first-attempt and
// final pass rates, which checks failed and how often, attempts used, and timings.
//
// Every accepted map's project file (PLAN §19.6, the page's download) is also reopened: it must pass
// the checks on open and rebuild the same .timber byte for byte, or the batch fails.
//
//   npx tsx tools/batch.ts [--seeds 1-100] [--size 128] [--difficulty normal] [--theme riverValley]
//                          [--set rl=80&wf=m] [--report file.md] [--min-final 0.98] [--min-first 0.6]
//
// --set takes settings in the share link's short keys (src/core/spec/codec.ts).
//
// Exits non-zero when a rate is below its gate, or when a project file does not reopen to the same
// bytes.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { decodeProject, encodeProject, toDocument } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";
import { generate, MAX_ATTEMPTS } from "../src/core/gen/generate";
import { officialRange } from "../src/core/gen/calibrated";
import { decodeSpecFragment, type Difficulty, type ThemeId } from "../src/core/spec/mapspec";

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

const seeds = parseSeeds(arg("seeds", "1-100"));
const size = Number(arg("size", "128"));
const difficulty = arg("difficulty", "normal") as Difficulty;
const theme = arg("theme", "riverValley") as ThemeId;
const extra = arg("set", "");
const minFinal = Number(arg("min-final", "0.98"));
const minFirst = Number(arg("min-first", "0.6"));
const report = arg("report", "");

let first = 0;
let final = 0;
const attempts: number[] = [];
const times: number[] = [];
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let reopened = 0;
const reopenTimes: number[] = [];
const reopenFailures: string[] = [];
const failedChecks = new Map<string, number>(); // every failed attempt's blocking checks
// information (Kyler, 2026-09-25): accepted maps whose amounts sit in the official maps' typical
// range for their size and settings, and their mine sites
const inRange = { trees: 0, bushes: 0, scrap: 0 };
const mines: number[] = [];
const advisory = new Map<string, number>();
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  console.log(s);
};

for (const seed of seeds) {
  const t0 = performance.now();
  const d = decodeSpecFragment(`s=${seed}&t=${theme}&z=${size}&d=${difficulty[0]}${extra ? "&" + extra : ""}`)!;
  if (d.problems.length) throw new Error(d.problems.join("; "));
  const r = generate(d.spec);
  const ms = performance.now() - t0;
  times.push(ms);
  attempts.push(r.attempts);
  if (r.report.passed) {
    final++;
    if (r.attempts === 1) first++;
  }
  for (const f of r.failures) for (const id of f.failed) failedChecks.set(id, (failedChecks.get(id) ?? 0) + 1);
  for (const c of r.report.checks) if (c.advisory && !c.ok) advisory.set(c.id, (advisory.get(c.id) ?? 0) + 1);
  if (r.report.passed) {
    const have = { trees: 0, bushes: 0, scrap: 0 };
    let m = 0;
    for (const e of r.built.entities) {
      const t = e.template;
      if (t === "Pine" || t === "Birch" || t === "Oak" || t === "Succulent") have.trees++;
      else if (t === "BlueberryBush") have.bushes++;
      else if (t.startsWith("RuinColumnH")) have.scrap += 15 * Number(t.slice(11));
      else if (t === "UndergroundRuins") m++;
    }
    const s = r.spec.settings.resources;
    const k = { trees: s.forestDensity / 100, bushes: s.berryBushes / 100, scrap: s.ruins / 100 };
    for (const key of ["trees", "bushes", "scrap"] as const) {
      const o = officialRange(key, size * size);
      if (have[key] >= o.low * k[key] && have[key] <= o.high * k[key]) inRange[key]++;
    }
    mines.push(m);
  }
  // the accepted map's project file reopens and rebuilds the same .timber
  let reopen = "";
  if (r.report.passed) {
    const t1 = performance.now();
    try {
      const s = MapSession.open(decodeProject(encodeProject(toDocument(r.spec, r.features, r.built, r.file))));
      if (sha(s.exportTimber().bytes) === sha(r.bytes)) reopened++;
      else reopen = "its project file rebuilds different bytes";
    } catch (e) {
      reopen = `its project file does not reopen: ${(e as Error).message}`;
    }
    reopenTimes.push(performance.now() - t1);
    if (reopen) reopenFailures.push(`seed ${seed}: ${reopen}`);
  }
  const status = r.report.passed ? (r.attempts === 1 ? "pass" : `pass after ${r.attempts}`) : `FAIL after ${r.attempts}`;
  log(`seed ${seed}: ${status}, ${Math.round(ms)} ms${r.failures.length ? `  (${r.failures.map((f) => f.failed.join(",")).join(" | ")})` : ""}${reopen ? `  PROJECT: ${reopen}` : ""}`);
}

const n = seeds.length;
const sorted = times.slice().sort((a, b) => a - b);
const pct = (k: number) => `${((100 * k) / n).toFixed(1)}%`;
log("");
log(`${n} seeds of ${theme} at ${size}×${size}, designed for ${difficulty}${extra ? ` with ${extra}` : ""}, at most ${MAX_ATTEMPTS} attempts:`);
log(`- first attempt: ${first}/${n} = ${pct(first)} (gate ${Math.round(minFirst * 100)}%)`);
log(`- final: ${final}/${n} = ${pct(final)} (gate ${Math.round(minFinal * 100)}%)`);
log(`- attempts: mean ${(attempts.reduce((a, b) => a + b, 0) / n).toFixed(2)}, max ${attempts.reduce((a, b) => Math.max(a, b), 0)}`);
log(`- time per map: median ${Math.round(sorted[n >> 1])} ms, p90 ${Math.round(sorted[Math.floor(n * 0.9)])} ms, max ${Math.round(sorted[n - 1])} ms`);
log(`- checks that failed an attempt: ${[...failedChecks].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
log(`- advisory warnings on the accepted maps: ${[...advisory].map(([k, v]) => `${k} ${v}/${n}`).join(", ") || "none"}`);
log(`- in the official maps' typical range for the size and settings (information): trees ${inRange.trees}/${final}, bushes ${inRange.bushes}/${final}, scrap ${inRange.scrap}/${final}; mine sites ${mines.length ? `${Math.min(...mines)}–${Math.max(...mines)}` : "none"}`);
const rt = reopenTimes.slice().sort((a, b) => a - b);
log(`- project round trip: ${reopened}/${final} accepted maps reopen from their project file and rebuild the same .timber${rt.length ? ` (median ${Math.round(rt[rt.length >> 1])} ms, max ${Math.round(rt[rt.length - 1])} ms)` : ""}`);
for (const f of reopenFailures) log(`  - ${f}`);
if (report) writeFileSync(report, lines.join("\n") + "\n");
process.exit(final / n >= minFinal && first / n >= minFirst && reopenFailures.length === 0 ? 0 : 1);
