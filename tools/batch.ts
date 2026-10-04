// Batch pass rates (PLAN §15; ROADMAP M2 acceptance: 100 seeds at 128² Normal, final pass ≥ 98%,
// first attempt ≥ 60%). Generates each seed with the retry loop and reports first-attempt and
// final pass rates, which checks failed and how often, attempts used, and timings.
//
// Every accepted map's project file (PLAN §19.6, the page's download) is also reopened: it must pass
// the checks on open and rebuild the same .timber byte for byte, or the batch fails.
//
//   npx tsx tools/batch.ts [--seeds 1-100] [--size 128] [--difficulty normal] [--theme riverValley]
//                          [--set rl=80&wf=m] [--report file.md] [--min-final 0.98] [--min-first 0.6] [--wasm]
//
// --set takes settings in the share link's short keys (src/core/spec/codec.ts).
//
// Exits non-zero when a rate is below its gate, or when a project file does not reopen to the same
// bytes.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { decodeProject, encodeProject, generatedDocument } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";
import { generate, MAX_ATTEMPTS } from "../src/core/gen/generate";
import { officialRange } from "../src/core/gen/calibrated";
import { STRAIGHT_LIMITS } from "../src/core/analysis/straight";
import { atan2, hypot } from "../src/core/math/portable";
import { badwaterBudget } from "../src/core/resources/badwater";
import { decodeSpecFragment, type Difficulty, type ThemeId } from "../src/core/spec/mapspec";
import { useNativeWater } from "./rust/native-water";

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
// the canonical settles run in the native Rust water (PLAN §20 D381; build it with `npx tsx
// tools/rust/build.ts --native`); --wasm keeps them in WebAssembly, the same bytes
if (!process.argv.includes("--wasm")) useNativeWater();

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
// and their badwater sources, against the budget for the map (D200)
const badwater: number[] = [];
let badwaterShort = 0;
const advisory = new Map<string, number>();
const straight: { run: number; canal: number }[] = [];
// information: accepted maps with a second district's site (D77: only where one fits) and ruins on a rise
let districts = 0;
let rises = 0;
// the wood added to meet the starting-logs floor (D224, D227, D229): the maps that needed it, and
// each grove's kind, distance and direction from the start
let floorMaps = 0;
const floorKinds = new Map<string, number>();
const floorDist: number[] = [];
const floorDirs = new Map<string, number>();
const COMPASS = ["east", "northeast", "north", "northwest", "west", "southwest", "south", "southeast"];
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
    if (r.info.straight) straight.push(r.info.straight);
    if (r.features.some((f) => f.kind === "setPiece" && f.params.kind === "secondDistrict")) districts++;
    if (r.features.some((f) => f.kind === "setPiece" && f.params.kind === "obstaclePayoff")) rises++;
    const floor = r.features.filter((f) => f.kind === "forest" && !!f.role?.startsWith("forest/floor/"));
    const st = r.features.find((f) => f.kind === "start");
    if (floor.length) floorMaps++;
    if (floor.length && st && st.kind === "start") {
      const [sx, sy] = st.params.position;
      for (const f of floor) {
        if (f.kind !== "forest") continue;
        const kind = (f.role ?? "").split("/")[2];
        floorKinds.set(kind, (floorKinds.get(kind) ?? 0) + 1);
        let cx = 0;
        let cy = 0;
        let n = 0;
        for (const [y, a, b] of f.params.area)
          for (let x = a; x <= b; x++) {
            cx += x;
            cy += y;
            n++;
          }
        const dx = cx / n - sx;
        const dy = cy / n - sy;
        floorDist.push(Math.round(hypot(dx, dy)));
        // (y runs south to north: north is +y)
        const dir = COMPASS[Math.round((atan2(dy, dx) / (Math.PI / 4) + 8)) % 8];
        floorDirs.set(dir, (floorDirs.get(dir) ?? 0) + 1);
      }
    }
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
    const bad = r.built.entities.filter((e) => e.template === "BadwaterSource").length;
    badwater.push(bad);
    if (bad < badwaterBudget(r.spec.size.x, r.spec.size.y, r.spec.settings.hazards.badwater, r.spec.seed).sources) badwaterShort++;
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
      const s = MapSession.open(decodeProject(encodeProject(generatedDocument(r))));
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
log(`- in the official maps' typical range for the size and settings (information): trees ${inRange.trees}/${final}, bushes ${inRange.bushes}/${final}, scrap ${inRange.scrap}/${final}; mine sites ${mines.length ? `${Math.min(...mines)}–${Math.max(...mines)}` : "none"}; badwater sources ${badwater.length ? `${Math.min(...badwater)}–${Math.max(...badwater)}` : "none"}, ${badwaterShort} of ${final} fewer than their budget`);
const spread = (v: number[]) => {
  const s = v.slice().sort((a, b) => a - b);
  return s.length ? `median ${s[s.length >> 1].toFixed(1)}, p90 ${s[Math.floor(s.length * 0.9)].toFixed(1)}, max ${s[s.length - 1].toFixed(1)}` : "none";
};
log(`- straight channels on the accepted maps (information; D209: past the limits a map is planned again): the longest straight bank ${spread(straight.map((x) => x.run))} tiles (limit ${STRAIGHT_LIMITS.run}), the longest canal ${spread(straight.map((x) => x.canal))} (limit ${STRAIGHT_LIMITS.canal})`);
log(`- set pieces the land held (information): a second district's site on ${districts}/${final} accepted maps, ruins on a rise on ${rises}/${final}`);
{
  const q = (v: number[], p: number) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))] : NaN);
  const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
  log(
    `- the starting-logs floor's wood (D229, information): added on ${floorMaps}/${final} accepted maps` +
      (floorDist.length ? `; ${floorDist.length} groves by kind: ${list(floorKinds)}; their middles ${q(floorDist, 0)}–${q(floorDist, 1)} tiles from the start (median ${q(floorDist, 0.5)}); by direction: ${list(floorDirs)}` : ""),
  );
}
const rt = reopenTimes.slice().sort((a, b) => a - b);
log(`- project round trip: ${reopened}/${final} accepted maps reopen from their project file and rebuild the same .timber${rt.length ? ` (median ${Math.round(rt[rt.length >> 1])} ms, max ${Math.round(rt[rt.length - 1])} ms)` : ""}`);
for (const f of reopenFailures) log(`  - ${f}`);
if (report) writeFileSync(report, lines.join("\n") + "\n");
process.exit(final / n >= minFinal && first / n >= minFirst && reopenFailures.length === 0 ? 0 : 1);
