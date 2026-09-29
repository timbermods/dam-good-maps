// The Python oracle (ROADMAP M1 and M2 acceptance): generate maps with the TypeScript core, then
// check them with the independent Python implementation.
//
//   npx tsx tools/oracle.ts --seeds 1-50 --sizes 96,128,256 [--themes riverValley,canyon,…] (default: all six)
//                           [--out .scratch/oracle] [--report file.md] [--parity-seeds 1-50] [--no-official]
//
// 1. Load and round trip (M1): every map must pass `prototype/validate.py --load-only` (the load
//    class: format, entity placement emulation, terrain support, slopes, start) and
//    `prototype/roundtrip_test.py` (read → write → read byte for byte, plus a terrain edit).
//    Seed k is generated in theme themes[⌊(k − 1) / 3⌋ mod m], so every theme meets every size.
// 2. Validator parity (M2): for the --parity-seeds (default: the --seeds), the map of seed k at
//    size sizes[k mod n] is validated in full by both validators, the TypeScript one re-reading the
//    written file and its project file (as the Python one does), and their verdicts must agree
//    check by check: pass, fail, not applicable or approximate (PLAN §11, D98).
//    The first parity map is also written once more with WaterSimulationMigrator.IsMigrated false
//    (the audit's A1): both validators must fail its file.singletons, and agree on the rest.
// 3. The same parity on the official maps in investigation/raw/builtin (import profile, default
//    Normal thresholds), when they are present (they are local only, never in CI).
//
// Exits non-zero on any failure or disagreement.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "fflate";
import { encodeProject, projectFileName, generatedDocument } from "../src/core/doc/document";
import { readTimber, writeTimber } from "../src/core/format/timber";
import { generate } from "../src/core/gen/generate";
import { fileName } from "../src/core/gen/pack";
import { AVAILABLE_THEMES, makeSpec, type Difficulty, type ThemeId } from "../src/core/spec/mapspec";
import { validateMap } from "../src/core/validate/checks";
import type { CheckResult } from "../src/core/validate/report";

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

const seeds = parseSeeds(arg("seeds", "1-50"));
const sizes = arg("sizes", "96,128,256").split(",").map(Number);
const paritySeeds = parseSeeds(arg("parity-seeds", arg("seeds", "1-50")));
const outDir = arg("out", ".scratch/oracle");
const difficulty = arg("difficulty", "normal") as Difficulty;
const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",") as ThemeId[];
const themeOf = (seed: number): ThemeId => themes[Math.floor((seed - 1) / 3) % themes.length];
const report = arg("report", "");
const python = process.env.PYTHON ?? "python";
const OFFICIAL = "investigation/raw/builtin";
const official = !process.argv.includes("--no-official") && existsSync(OFFICIAL);

function py(script: string, args: string[]): { code: number; out: string } {
  const r = spawnSync(python, [script, ...args], { encoding: "utf8", maxBuffer: 256 << 20 });
  if (r.error) throw r.error;
  return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

rmSync(outDir, { recursive: true, force: true });
const lines: string[] = [];
const log = (s: string) => {
  lines.push(s);
  console.log(s);
};

// ------------------------------------------------------------------------------ 1. load, round trip

let genFail = 0;
let loadFail = 0;
let rtFail = 0;
let total = 0;
const written = new Map<string, string>(); // `${seed}/${size}` -> path
for (const size of sizes) {
  const dir = join(outDir, String(size));
  mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  const times: number[] = [];
  for (const seed of seeds) {
    total++;
    const spec = makeSpec({ seed, size: { x: size, y: size }, designedFor: difficulty, theme: themeOf(seed) });
    const t0 = performance.now();
    const r = generate(spec);
    times.push(performance.now() - t0);
    if (!r.report.passed) {
      genFail++;
      log(`GEN FAIL  ${size} seed ${seed}: ${r.report.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id).join(", ")}`);
      continue;
    }
    const p = join(dir, fileName(r.spec));
    writeFileSync(p, r.bytes);
    writeFileSync(join(dir, projectFileName(r.spec)), encodeProject(generatedDocument(r)));
    paths.push(p);
    written.set(`${seed}/${size}`, p);
  }

  const v = py("prototype/validate.py", ["--load-only", "--quiet", ...paths]);
  const passLines = v.out.split(/\r?\n/).filter((l) => l.startsWith("PASS"));
  for (const l of v.out.split(/\r?\n/).filter((l) => l.startsWith("FAIL") || /Error|Traceback/.test(l))) log(`LOAD ${l}`);
  if (passLines.length !== paths.length || v.code !== 0) loadFail += paths.length - passLines.length || 1;

  const rt = py("prototype/roundtrip_test.py", paths);
  const okLines = rt.out.split(/\r?\n/).filter((l) => l.startsWith("OK"));
  for (const l of rt.out.split(/\r?\n/).filter((l) => /^(FAIL|SKIP)/.test(l) || /Error|Traceback/.test(l))) log(`ROUNDTRIP ${l}`);
  if (okLines.length !== paths.length || rt.code !== 0) rtFail += paths.length - okLines.length || 1;

  const t = times.slice().sort((a, b) => a - b);
  log(
    `${size}×${size}: ${paths.length}/${seeds.length} generated, ${passLines.length} pass validate.py --load-only, ` +
      `${okLines.length} round-trip OK; generate median ${Math.round(t[t.length >> 1])} ms, max ${Math.round(t[t.length - 1])} ms`,
  );
}

// ------------------------------------------------------------------------------ 2, 3. parity

type Verdict = "pass" | "fail" | "na" | "approx";
interface PyCheck {
  id: string;
  ok: boolean;
  na: boolean;
  advisory: boolean;
  approx?: string;
  detail: string;
  value: unknown;
}

const tsVerdict = (c: CheckResult): Verdict => (c.applicable === false ? "na" : c.approximate ? "approx" : c.ok ? "pass" : "fail");
const pyVerdict = (c: PyCheck): Verdict => (c.na ? "na" : c.approx ? "approx" : c.ok ? "pass" : "fail");

/** Compare the two reports of one map; returns the disagreements. */
function compare(label: string, ts: CheckResult[], pyChecks: PyCheck[]): string[] {
  const out: string[] = [];
  const a = new Map(ts.map((c) => [c.id, c]));
  const b = new Map(pyChecks.map((c) => [c.id, c]));
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id);
    const y = b.get(id);
    if (!x || !y) {
      out.push(`${label}: ${id} only in ${x ? "TypeScript" : "Python"}`);
      continue;
    }
    if (tsVerdict(x) !== pyVerdict(y)) {
      out.push(`${label}: ${id} TypeScript ${tsVerdict(x)} (${x.value ?? ""} ${x.message}) vs Python ${pyVerdict(y)} (${String(y.value ?? "")} ${y.detail})`);
    }
  }
  return out;
}

function pythonReports(paths: string[]): Map<string, PyCheck[]> {
  const out = new Map<string, PyCheck[]>();
  if (!paths.length) return out;
  const r = py("prototype/validate.py", ["--json", ...paths]);
  for (const line of r.out.split(/\r?\n/)) {
    if (!line.startsWith("{")) continue;
    const j = JSON.parse(line) as { path: string; checks: PyCheck[] };
    out.set(j.path, j.checks);
  }
  for (const l of r.out.split(/\r?\n/).filter((l) => /Error|Traceback/.test(l))) log(`PYTHON ${l}`);
  return out;
}

let disagreements = 0;
let parityMaps = 0;
let checksCompared = 0;
{
  const paths: string[] = [];
  for (const seed of paritySeeds) {
    const size = sizes[(seed - 1 + sizes.length) % sizes.length];
    const p = written.get(`${seed}/${size}`);
    if (p) paths.push(p);
  }
  // A1: the first map once more, its migration marker false
  let unmigrated = "";
  if (paths.length) {
    const f = readTimber(new Uint8Array(readFileSync(paths[0])));
    f.world.singletons = { ...f.world.singletons, WaterSimulationMigrator: { IsMigrated: false } };
    unmigrated = paths[0].replace(/\.timber$/, "-unmigrated.timber");
    writeFileSync(unmigrated, writeTimber(f));
    writeFileSync(unmigrated.replace(/\.timber$/, ".damgoodmaps.json"), readFileSync(paths[0].replace(/\.timber$/, ".damgoodmaps.json")));
    paths.push(unmigrated);
  }
  const pyr = pythonReports(paths);
  for (const p of paths) {
    const bytes = new Uint8Array(readFileSync(p));
    const doc = JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(readFileSync(p.replace(/\.timber$/, ".damgoodmaps.json"))))));
    const v = validateMap(readTimber(bytes), { profile: "generate", spec: doc.spec, features: doc.features });
    const pyc = pyr.get(p);
    if (!pyc) {
      log(`PARITY no Python report for ${p}`);
      disagreements++;
      continue;
    }
    parityMaps++;
    checksCompared += v.report.checks.length;
    const d = compare(p, v.report.checks, pyc);
    if (p === unmigrated) {
      const ts = v.report.checks.find((c) => c.id === "file.singletons");
      const pc = pyc.find((c) => c.id === "file.singletons");
      if (!ts || ts.ok || !pc || pc.ok) d.push(`${p}: file.singletons must fail in both validators when IsMigrated is false (TypeScript ${ts?.ok}, Python ${pc?.ok})`);
      else log(`A1: IsMigrated false fails file.singletons in both validators`);
    }
    for (const s of d) log(`PARITY ${s}`);
    disagreements += d.length;
  }
  log(`parity: ${parityMaps} generated maps, ${checksCompared} checks compared, ${disagreements} disagreements`);
}

let officialMaps = 0;
let officialDisagreements = 0;
if (official) {
  const maps = readdirSync(OFFICIAL)
    .filter((n) => n.endsWith(".timber") && !n.startsWith("_"))
    .sort()
    .map((n) => join(OFFICIAL, n));
  const pyr = pythonReports(maps);
  for (const p of maps) {
    const v = validateMap(readTimber(new Uint8Array(readFileSync(p))), { profile: "import", designedFor: difficulty });
    const pyc = pyr.get(p);
    if (!pyc) {
      log(`OFFICIAL no Python report for ${p}`);
      officialDisagreements++;
      continue;
    }
    officialMaps++;
    const d = compare(p, v.report.checks, pyc);
    for (const s of d) log(`OFFICIAL ${s}`);
    officialDisagreements += d.length;
    const fails = v.report.checks.filter((c) => tsVerdict(c) === "fail").map((c) => c.id);
    const approx = v.report.checks.filter((c) => tsVerdict(c) === "approx").length;
    log(`  ${p.split(/[\\/]/).pop()}: ${v.report.checks.length} checks agree=${d.length === 0}; failing (both): ${fails.join(", ") || "none"}${approx ? `; approximate: ${approx}` : ""}`);
  }
  log(`official maps: ${officialMaps} validated in the import profile, ${officialDisagreements} disagreements`);
} else {
  log("official maps: skipped (investigation/raw/builtin is not present)");
}

const ok = genFail === 0 && loadFail === 0 && rtFail === 0 && disagreements === 0 && officialDisagreements === 0;
log(
  `${ok ? "PASS" : "FAIL"}: ${total} maps (${seeds.length} seeds × ${sizes.length} sizes; themes ${themes.join(", ")}), ${genFail} generation failures, ${loadFail} load failures, ` +
    `${rtFail} round-trip failures; parity on ${parityMaps} generated and ${officialMaps} official maps, ${disagreements + officialDisagreements} disagreements`,
);
if (report) writeFileSync(report, lines.join("\n") + "\n");
process.exit(ok ? 0 : 1);
