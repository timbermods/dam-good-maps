// The first-visit maps (docs/UI-BRIEF.md §7, PLAN §20 D330): a handful of ready-made 128² maps the
// page loads instantly on a first visit, with no generation. Run at each generator release
// (docs/HANDOFF.md §7, "Releases"), after the generator's version is set:
//
//   npx tsx tools/first-visit-maps.ts [--check] [--no-python]
//
// For each named theme, seeds 1, 2, … are generated at 128² (Designed for Normal) until one passes
// the release checks, and that map is kept (the checks are src/core/library/firstVisit.ts's
// `firstVisitProblems` and `reopensAs`):
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
import { FIRST_VISIT_DIR, FIRST_VISIT_FORMAT, FIRST_VISIT_SIZE, makeFirstVisit, type FirstVisitIndex, type FirstVisitMap } from "../src/core/library/firstVisit";
import { AVAILABLE_THEMES, GENERATOR_VERSION, THEME_NAMES, type ThemeId } from "../src/core/spec/mapspec";

const CHECK = process.argv.includes("--check");
const PYTHON = !process.argv.includes("--no-python");
const OUT = join("public", FIRST_VISIT_DIR);

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

interface Made {
  entry: FirstVisitMap;
  project: Uint8Array;
  timber: Uint8Array;
}

function make(theme: ThemeId): Made | null {
  const { made, passedOver } = makeFirstVisit(theme);
  for (const p of passedOver) console.log(`  ${THEME_NAMES[theme]} seed ${p.seed}: passed over (${p.why.join("; ")})`);
  if (!made) {
    console.log(`  ${THEME_NAMES[theme]}: no seed passed; left out`);
    return null;
  }
  const e = made.entry;
  console.log(`  ${THEME_NAMES[theme]} seed ${e.seed}: kept as ${e.id} (${e.name}; generated in ${made.genMs} ms, reopens in ${made.openMs} ms; ${(e.bytes / 1024).toFixed(0)} KB)`);
  return { entry: { ...e, sha256: sha256(made.timber) }, project: made.project, timber: made.timber };
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
