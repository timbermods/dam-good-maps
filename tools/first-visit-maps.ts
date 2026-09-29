// The first-visit maps (docs/UI-BRIEF.md §7, PLAN §20 D330): a handful of ready-made 128² maps the
// page loads instantly on a first visit, with no generation. Run at each generator release
// (docs/HANDOFF.md §7, "Releases"), after the generator's version is set:
//
//   npx tsx tools/first-visit-maps.ts [--check] [--no-python]
//
// For each named theme, seeds 1, 2, … are generated at 128² (Designed for Normal) until one passes
// the release checks, and that map is kept:
//   - the generator's own report passes (every blocking check, the starting-logs floor among them,
//     and item 47's must-haves where the generator has them);
//   - the written .timber, read back, passes the TypeScript validator's export profile (every check
//     but information and the advisory ones) and the starting-logs floor, as tools/check-maps.ts
//     checks a probe batch's maps;
//   - all three outcomes, where the generator reports them (M9b), so a first map shows its theme;
//   - its project file reopens as the same map (land and objects), and how long that takes;
//   - and, unless --no-python, the Python validator's load checks (prototype/validate.py).
// Then public/first-visit/ gets each map's project file (gzip JSON) and index.json.
//
// --check regenerates and compares with the committed files instead of writing: it exits non-zero
// when they are missing, stale (another generator version) or differ.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeProject, encodeProject, generatedDocument } from "../src/core/doc/document";
import { MapSession } from "../src/core/doc/session";
import { readTimber } from "../src/core/format/timber";
import { mapName } from "../src/core/gen/pack";
import { generate, type GenerateResult } from "../src/core/gen/generate";
import { AVAILABLE_THEMES, encodeSpecFragment, GENERATOR_VERSION, makeSpec, THEME_NAMES, type ThemeId } from "../src/core/spec/mapspec";
import { validateMap } from "../src/core/validate/checks";
import { FIRST_VISIT_DIR, FIRST_VISIT_FORMAT, FIRST_VISIT_SIZE, type FirstVisitIndex, type FirstVisitMap } from "../src/page/firstVisit/format";

const CHECK = process.argv.includes("--check");
const PYTHON = !process.argv.includes("--no-python");
/** Seeds tried per theme before giving up on it. */
const MAX_SEEDS = 24;
const OUT = join("public", FIRST_VISIT_DIR);

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const slug = (t: ThemeId) => THEME_NAMES[t].toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** Why a generated map can't be a first-visit map (empty: it can). */
function problems(r: GenerateResult): string[] {
  const out: string[] = [];
  if (!r.report.passed) out.push(`report: ${r.report.checks.filter((c) => !c.ok && !c.advisory && c.severity === "error" && c.applicable !== false).map((c) => c.id).join(", ") || "failed"}`);
  const v = validateMap(readTimber(r.bytes), { profile: "export", designedFor: r.spec.designedFor });
  const blocking = v.report.checks.filter((c) => !c.ok && c.severity !== "info" && !c.advisory && c.applicable !== false).map((c) => c.id);
  if (blocking.length) out.push(`file: ${blocking.join(", ")}`);
  const floor = v.report.checks.find((c) => c.id === "start.wood_floor");
  if (!floor || !floor.ok) out.push("the starting-logs floor");
  // M9b's outcomes (the theme's promise, a standout, readable water), where the generator has them
  const outcomes = (r as GenerateResult & { outcomes?: { met: boolean } | null }).outcomes;
  if (outcomes && !outcomes.met) out.push("not all three outcomes");
  return out;
}

/** The project file reopened: the same land and objects, and the milliseconds it took. */
function reopen(r: GenerateResult, project: Uint8Array): { same: boolean; ms: number } {
  const t0 = performance.now();
  const s = MapSession.open(decodeProject(project));
  const b = s.built;
  const ms = Math.round(performance.now() - t0);
  const h = r.built.heights;
  let same = b.W === r.built.W && b.H === r.built.H && b.heights.length === h.length && b.entities.length === r.built.entities.length;
  for (let i = 0; same && i < h.length; i++) if (b.heights[i] !== h[i]) same = false;
  return { same, ms };
}

interface Made {
  entry: FirstVisitMap;
  project: Uint8Array;
  timber: Uint8Array;
}

function make(theme: ThemeId): Made | null {
  for (let seed = 1; seed <= MAX_SEEDS; seed++) {
    const spec = makeSpec({ seed, theme, size: { x: FIRST_VISIT_SIZE, y: FIRST_VISIT_SIZE } });
    const t0 = performance.now();
    const r = generate(spec);
    const genMs = Math.round(performance.now() - t0);
    const why = problems(r);
    if (why.length) {
      console.log(`  ${THEME_NAMES[theme]} seed ${seed}: passed over (${why.join("; ")})`);
      continue;
    }
    const project = encodeProject(generatedDocument(r));
    const back = reopen(r, project);
    if (!back.same) {
      console.log(`  ${THEME_NAMES[theme]} seed ${seed}: passed over (its project file reopens as a different map)`);
      continue;
    }
    const id = `${slug(theme)}-${seed}`;
    const name = (r as GenerateResult & { name?: string }).name ?? mapName(r.spec);
    console.log(`  ${THEME_NAMES[theme]} seed ${seed}: kept as ${id} (${String(name)}; generated in ${genMs} ms, reopens in ${back.ms} ms; ${(project.length / 1024).toFixed(0)} KB)`);
    return {
      entry: { id, file: `${id}.json.gz`, name: String(name), theme, seed, fragment: encodeSpecFragment(r.spec), bytes: project.length, sha256: sha256(r.bytes) },
      project,
      timber: r.bytes,
    };
  }
  console.log(`  ${THEME_NAMES[theme]}: no seed of ${MAX_SEEDS} passed; left out`);
  return null;
}

function pythonLoadChecks(made: Made[]): boolean {
  const dir = mkdtempSync(join(tmpdir(), "dgm-first-visit-"));
  try {
    const files = made.map((m) => {
      const p = join(dir, `${m.entry.id}.timber`);
      writeFileSync(p, m.timber);
      return p;
    });
    const py = spawnSync("python", ["prototype/validate.py", ...files, "--load-only", "--quiet", "--difficulty", "normal"], { encoding: "utf8" });
    const out = [py.stdout?.trim(), py.stderr?.trim()].filter(Boolean).join("\n");
    console.log(`Python load checks: ${py.status === 0 ? "every map passes" : `exit ${py.status ?? py.error?.message}`}${out ? `\n${out}` : ""}`);
    return py.status === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`First-visit maps: generator ${GENERATOR_VERSION}, ${FIRST_VISIT_SIZE}², one per named theme${CHECK ? " (checking the committed files)" : ""}`);
const themes = AVAILABLE_THEMES.filter((t) => t !== "any");
const made = themes.map(make).filter((m): m is Made => m !== null);
let ok = made.length > 0;
if (PYTHON && made.length) ok = pythonLoadChecks(made) && ok;

const index: FirstVisitIndex = { format: FIRST_VISIT_FORMAT, generatorVersion: GENERATOR_VERSION, size: FIRST_VISIT_SIZE, maps: made.map((m) => m.entry) };

if (CHECK) {
  const path = join(OUT, "index.json");
  if (!existsSync(path)) {
    console.log(`${path} is missing: run npx tsx tools/first-visit-maps.ts`);
    process.exit(1);
  }
  const committed = JSON.parse(readFileSync(path, "utf8")) as FirstVisitIndex;
  const same = JSON.stringify(committed) === JSON.stringify(index) && made.every((m) => existsSync(join(OUT, m.entry.file)) && sha256(new Uint8Array(readFileSync(join(OUT, m.entry.file)))) === sha256(m.project));
  console.log(same ? "The committed first-visit maps are current." : `The committed first-visit maps are stale (theirs: generator ${committed.generatorVersion}): run npx tsx tools/first-visit-maps.ts`);
  process.exit(same && ok ? 0 : 1);
}

if (!ok) {
  console.log("Not written: a check failed.");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
// the folder holds exactly this release's maps
for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
for (const m of made) writeFileSync(join(OUT, m.entry.file), m.project);
writeFileSync(join(OUT, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote ${made.length} maps and index.json to ${OUT} (${(made.reduce((a, m) => a + m.project.length, 0) / 1024).toFixed(0)} KB).`);
