// Design version 2's guards on sample maps (the ten brief maps and seeds of every theme):
// 0. the source audit: only exact arithmetic on output paths (D15: no sin, cos, exp, log, pow,
//    atan2, hypot, random or clock in v2/ and the version-1 modules it uses);
// 1. determinism: the same seed gives the same bytes twice in one process and once more in a
//    fresh one;
// 2. both validators: each map written with its project file, validated in the `generate` profile
//    by the Python oracle (prototype/validate.py) and by the TypeScript validator re-reading the
//    files, every verdict compared;
// 3. no built dam walls (lib/ridge.ts) and no edge walls (rules.ts) on the written map;
// 4. the runs model (terrain.ts): the terrain as runs gives the same voxels as today's writer, and
//    format 3's field and base round-trip exactly.
//
//   npx tsx investigation/generative/v2/check.ts [--seeds 1-5] [--sizes 128] [--maps canyon:8,delta:12] [--vt 85]
//   npx tsx investigation/generative/v2/check.ts --one <theme> <seed> <size> [vt]   (prints a sha256)

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "fflate";
import { encodeProject, toDocument } from "../../../src/core/doc/document";
import { readTimber } from "../../../src/core/format/timber";
import { voxelsFromHeights } from "../../../src/core/format/world";
import { AVAILABLE_THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { validateMap } from "../../../src/core/validate/checks";
import { blocks, type CheckResult } from "../../../src/core/validate/report";
import { damWalls } from "../lib/ridge";
import { edgeWalls, sourcesInFlow, startingWood, startWaterWalk, STARTING_WOOD } from "./rules";
import { arg, lowPriority, parseSeeds } from "../lib/paths";
import { generateV2 } from "./generate";
import { ColumnTerrain } from "./terrain";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const opts = (vt: string | undefined) => (vt ? { vt: Number(vt) } : {});

if (process.argv.includes("--one")) {
  const i = process.argv.indexOf("--one");
  const r = generateV2(process.argv[i + 1] as ThemeId, Number(process.argv[i + 2]), Number(process.argv[i + 3]), "normal", opts(process.argv[i + 4]));
  console.log(sha(r.bytes));
  process.exit(0);
}

lowPriority();
const seeds = parseSeeds(arg("seeds", "1-5"));
const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",") as ThemeId[];
const sizes = arg("sizes", "128").split(",").map(Number);
const only = arg("maps", "");
const vt = arg("vt", "") || undefined;
const jobs: [ThemeId, number, string | undefined][] = only
  ? only.split(",").map((m) => {
      const [t, s, v] = m.split(":");
      return [t as ThemeId, Number(s), v || vt];
    })
  : themes.flatMap((theme) => seeds.map((seed): [ThemeId, number, string | undefined] => [theme, seed, vt]));
const out = arg("out", ".scratch/parity-v2");
const python = process.env.PYTHON ?? "python";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---- 0. the source audit
const banned = /Math\.(sin|cos|tan|exp|log|log2|log10|pow|atan|atan2|hypot|cbrt|random)\b|Date\.now|new Date\(|[\w)\]]\s*\*\*\s*[\w(]/;
const auditHits: string[] = [];
const generating = ["genome.ts", "field.ts", "levels.ts", "hydro.ts", "start.ts", "hazards.ts", "intentions.ts", "generate.ts", "terrain.ts", "narrows.ts", "cycle.ts", "rules.ts"];
for (const f of readdirSync(join("investigation", "generative", "v2")).filter((n) => generating.includes(n))) {
  const text = readFileSync(join("investigation", "generative", "v2", f), "utf8").split("\n");
  text.forEach((line, k) => {
    const code = /^\s*(\/\*\*|\*|\/\/)/.test(line) ? "" : line.replace(/\/\/.*$/, "");
    if (banned.test(code)) auditHits.push(`${f}:${k + 1}: ${line.trim()}`);
  });
}
console.log(`source audit: ${auditHits.length ? auditHits.join("; ") : "only + − × ÷, sqrt, floor, round, abs, min and max on output paths"}`);

// ---- 1. determinism, 3. walls, 4. runs; the files for parity
let same = 0;
let total = 0;
let walls = 0;
let edgeWallMaps = 0;
let mineless = 0;
let sourceMaps = 0;
let ruleOk = 0;
let d85Only = 0;
let runsOk = 0;
const paths: string[] = [];
const hashes: { theme: string; seed: number; size: number; vt: string | null; sha: string; ms: number; format3Bytes: number }[] = [];
for (const size of sizes)
  for (const [theme, seed, v] of jobs) {
    const t0 = performance.now();
    const a = generateV2(theme, seed, size, "normal", opts(v));
    const ms = Math.round(performance.now() - t0);
    const b = generateV2(theme, seed, size, "normal", opts(v));
    total++;
    const ha = sha(a.bytes);
    const fresh = spawnSync(process.execPath, [...process.execArgv, process.argv[1], "--one", theme, String(seed), String(size), v ?? ""], { encoding: "utf8" }).stdout.trim().split(/\r?\n/).pop();
    const ok = a.bytes.length > 0 && ha === sha(b.bytes) && ha === fresh;
    if (ok) same++;
    // walls on the written map
    const w = damWalls(a.built.heights, a.built.W, a.built.H, a.built.water).length;
    if (w) walls++;
    const ew = edgeWalls(a.built.heights, a.built.water, a.built.W, a.built.H).length;
    if (ew) edgeWallMaps++;
    // Kyler's resource rule (a mine site on every map) and D171 (sources start rivers)
    if (!a.built.entities.some((e) => e.template === "UndergroundRuins")) mineless++;
    if (sourcesInFlow(a.hydro.rivers, a.hydro.lakes, a.built.W)) sourceMaps++;
    // Kyler's start water rule on the written map (the validators still carry D85's)
    const sw = a.built.start ? startWaterWalk(a.built.heights, a.built.water, a.built.contamination, a.built.W, a.built.H, a.built.entities, a.built.start) : null;
    const wd = a.built.start ? startingWood(a.built.heights, a.built.W, a.built.H, a.built.entities, a.built.start) : null;
    if (sw && sw.distance <= a.spec.settings.start.rules.waterWithin && wd && wd.logs >= STARTING_WOOD.normal) ruleOk++;
    // runs: voxels and round trip
    let r = false;
    if (a.format3) {
      const t = ColumnTerrain.fromData(a.format3.base, size, size);
      const vox = t.voxels();
      const ref = voxelsFromHeights(a.built.heights, size, size);
      let eq = vox.length === ref.length;
      for (let i = 0; eq && i < vox.length; i++) if (vox[i] !== ref[i]) eq = false;
      const back = ColumnTerrain.fromData(t.toData(), size, size).heights();
      for (let i = 0; eq && i < back.length; i++) if (back[i] !== a.built.heights[i]) eq = false;
      r = eq && a.format3.base.runs.length === 0 && a.format3.field.runs.length === 0;
    }
    if (r) runsOk++;
    const f3 = a.format3 ? JSON.stringify(a.format3).length : 0;
    hashes.push({ theme, seed, size, vt: v ?? null, sha: ha, ms, format3Bytes: f3 });
    console.log(`${theme} ${seed} ${size}${v ? ` vt${v}` : ""}: ${ok ? "same bytes" : "DIFFERENT"} ${ha.slice(0, 12)} (${ms} ms, ${a.attempts} attempt${a.attempts > 1 ? "s" : ""}), walls ${w}, edge walls ${ew}, start water ${sw && Number.isFinite(sw.distance) ? `${Math.round(sw.distance * 10) / 10} tiles' walk${sw.sameLevel ? "" : " (another level)"}` : "none"}, wood ${wd ? `${wd.logs} logs` : "none"}, runs ${r ? "ok" : "MISMATCH"}`);
    if (!a.bytes.length) continue;
    const p = join(out, `${theme}-${seed}-${size}${v ? `-vt${v}` : ""}.timber`);
    writeFileSync(p, a.bytes);
    writeFileSync(p.replace(/\.timber$/, ".damgoodmaps.json"), encodeProject(toDocument(a.spec, a.features, a.built, a.file)));
    paths.push(p);
  }
console.log(`determinism: ${same}/${total} maps give the same bytes twice in one process and in a fresh one; dam walls on ${walls}; edge walls on ${edgeWallMaps}; no mine site on ${mineless}; a source inside a flow on ${sourceMaps}; Kyler's start water and starting wood rules hold on ${ruleOk}/${total}; runs model ok on ${runsOk}/${total}`);

// ---- 2. parity with the Python oracle
type Verdict = "pass" | "fail" | "na" | "approx";
interface PyCheck {
  id: string;
  ok: boolean;
  na: boolean;
  approx?: string;
  advisory?: boolean;
}
const tsVerdict = (c: CheckResult): Verdict => (c.applicable === false ? "na" : c.approximate ? "approx" : c.ok ? "pass" : "fail");
const pyVerdict = (c: PyCheck): Verdict => (c.na ? "na" : c.approx ? "approx" : c.ok ? "pass" : "fail");
const r = spawnSync(python, ["prototype/validate.py", "--json", ...paths], { encoding: "utf8", maxBuffer: 256 << 20 });
const py = new Map<string, PyCheck[]>();
for (const line of `${r.stdout ?? ""}`.split(/\r?\n/)) {
  if (!line.startsWith("{")) continue;
  const j = JSON.parse(line) as { path: string; checks: PyCheck[] };
  py.set(j.path, j.checks);
}
let disagree = 0;
let compared = 0;
let pyPass = 0;
let tsPass = 0;
for (const p of paths) {
  const doc = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(p.replace(/\.timber$/, ".damgoodmaps.json"))))));
  const v = validateMap(readTimber(new Uint8Array(readFileSync(p))), { profile: "generate", spec: doc.spec, features: doc.features });
  // the generate profile with Kyler's start water rule in place of D85's start.water (rules.ts)
  if (v.report.checks.every((c) => !blocks("generate", c) || c.id === "start.water" || c.id === "start.wood")) tsPass++;
  if (v.report.checks.find((c) => c.id === "start.water")?.ok === false) d85Only++;
  const pc = py.get(p);
  if (!pc) {
    console.log(`no Python report for ${p}`);
    disagree++;
    continue;
  }
  if (pc.every((c) => c.ok || c.na || c.approx || c.advisory || c.id === "start.water" || c.id === "start.wood")) pyPass++;
  const a = new Map(v.report.checks.map((c) => [c.id, c]));
  const b = new Map(pc.map((c) => [c.id, c]));
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    compared++;
    const x = a.get(id);
    const y = b.get(id);
    if (!x || !y || tsVerdict(x) !== pyVerdict(y)) {
      disagree++;
      console.log(`PARITY ${p}: ${id} TypeScript ${x ? tsVerdict(x) : "missing"} vs Python ${y ? pyVerdict(y) : "missing"}`);
    }
  }
}
for (const l of `${r.stderr ?? ""}`.split(/\r?\n/).filter((l) => /Error|Traceback/.test(l))) console.log(`PYTHON ${l}`);
console.log(`parity: ${paths.length} maps, ${compared} checks compared, ${disagree} disagreements; generate profile passed (with Kyler's start water and starting wood rules for start.water and start.wood): TypeScript ${tsPass}/${paths.length}, Python ${pyPass}/${paths.length}; D85's start.water fails on ${d85Only}`);
writeFileSync(join(out, "check.json"), JSON.stringify({ audit: auditHits, determinism: { same, total, hashes }, walls, edgeWallMaps, mineless, sourceMaps, ruleOk, runsOk, parity: { maps: paths.length, compared, disagree, tsPass, pyPass, d85Only } }, null, 1));
process.exit(same === total && disagree === 0 && auditHits.length === 0 && walls === 0 && edgeWallMaps === 0 && mineless === 0 && sourceMaps === 0 && ruleOk === total && runsOk === total ? 0 : 1);
