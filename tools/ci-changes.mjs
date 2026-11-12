// Decides which of CI's suites a change needs. Three classes of change:
//   documents    only documents, investigation/, LICENSE or package.json's descriptive fields: the typecheck and the
//                document tests run; the browser shards and every other suite are skipped (heavy=false).
//   collaboration  only the collaboration connection (isCollabOnly) counts like documents: its own workflow tests it.
//   editor/UI    only src/editor/, src/ui/ and the browser specs (tests/e2e/), plus documents: the tests and the browser
//                shards run; oracle, generation, engines and rust are skipped (suites=false, rust=false).
//   anything else  everything runs, except the Rust job, which needs a change to the Rust or to the TypeScript that
//                wraps it (rust=true; see isRustInput).
// A change this script can't read is the last class with rust. A pull request into dev that touches only
// investigation/ (Codex's investigation PRs, which never touch the app) runs nothing beyond this job: `test` is skipped
// too (test=false); the nightly and the merge check investigation files as before. A skipped job counts as passed for
// merge and release.
//
//   node tools/ci-changes.mjs <base sha> <head sha> [--full | --light]
//
// prints heavy, suites, rust, test, page and generator (and writes them to $GITHUB_OUTPUT). page (pull requests into dev
// only): the change touches src/editor/, src/ui/, src/render3d/ or src/styles/, so the `page` job's browser specs run
// before the merge. generator (pull requests into dev only): the change can change what the generator makes
// (`isGenerator`), so the browser shards run before the merge, as they do on dev after one. --full (pushes to main, pull requests into main,
// manual runs) turns everything on; --light (pull requests into dev) turns suites and rust off, because the merge queue
// runs them on the merged state. Plain Node, no dependencies: the CI job that runs it does not install anything.
// Tested by tests/unit/ci-changes.test.ts.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** package.json fields that describe the package and change nothing a test runs. Everything else is heavy. */
export const LIGHT_PACKAGE_FIELDS = ["license", "description", "author", "repository", "homepage", "bugs", "keywords", "funding"];

const DOC_EXTENSIONS = /\.(md|txt|png|jpe?g|gif|webp|svg)$/i;

/** Documents: Markdown anywhere, plain text and images under docs/, and the LICENSE file. */
export function isDocument(path) {
  if (/\.md$/i.test(path)) return true;
  if (/^LICENSE(\.(md|txt))?$/i.test(path)) return true;
  return path.startsWith("docs/") && DOC_EXTENSIONS.test(path);
}

/** Investigations (reports, code, samples) aren't part of the app, so a change touching only them is light too. */
export function isInvestigation(path) {
  return path.startsWith("investigation/");
}

function withoutLightFields(json, where) {
  const copy = JSON.parse(JSON.stringify(json));
  const target = where === "lock" ? copy.packages?.[""] : copy;
  if (target) for (const f of LIGHT_PACKAGE_FIELDS) delete target[f];
  return copy;
}

/** True if two package.json (or package-lock.json) texts differ only in the light fields. Unreadable means false. */
export function onlyLightFieldsDiffer(oldText, newText, where = "package") {
  try {
    const a = JSON.stringify(withoutLightFields(JSON.parse(oldText), where));
    const b = JSON.stringify(withoutLightFields(JSON.parse(newText), where));
    return a === b;
  } catch {
    return false;
  }
}

/** The editor and the interface, and the browser specs (they run only in the browser shards): no other suite reads them. */
export function isUiOnly(path) {
  return path.startsWith("src/editor/") || path.startsWith("src/ui/") || path.startsWith("tests/e2e/");
}

/**
 * The collaboration connection (collab-worker/, src/collab/, tests/collab/ and their configs and workflows): nothing else
 * in the app imports it, and its own workflow (.github/workflows/collab.yml) runs its tests, so a change only here does not
 * need the browser shards or the quick suite. (The typecheck and the build still run.)
 * NOTE: src/collab/ leaves this light class once the page imports it; take it out of the list then.
 */
export function isCollabOnly(path) {
  return (
    path.startsWith("collab-worker/") ||
    path.startsWith("src/collab/") ||
    path.startsWith("tests/collab/") ||
    /^tests\/unit\/collab[A-Za-z]*\.test\.ts$/.test(path) ||
    path === "playwright.collab.config.ts" ||
    path === "playwright.collab-live.config.ts" ||
    /^\.github\/workflows\/collab[a-z-]*\.yml$/.test(path)
  );
}

/** The Rust job's inputs: the Rust, its build tools, the TypeScript that wraps the Wasm, the app's settle the native one is checked against (water.ts, prefill.ts, fed.ts), the maths it is checked against, the forces' fixture maps, the golden water the water's and the analysis' fixtures read, the checks and what their fixtures' files are made of (validate/, the water model, the entities), and anything that changes the tools or the workflow. */
export function isRustInput(path) {
  return (
    path.startsWith("rust/") ||
    path.startsWith("tools/rust/") ||
    path === "rust-toolchain.toml" ||
    path === "package.json" ||
    path === "package-lock.json" ||
    path.startsWith(".github/") ||
    path.startsWith("src/core/forces/rust/") ||
    path.startsWith("src/core/analysis/rust/") ||
    path.startsWith("src/core/validate/") ||
    path === "src/core/sim/model.ts" ||
    path === "src/core/format/entities.ts" ||
    path === "tests/golden/water.json.gz" ||
    path === "tests/contract/forceFixtures.ts" ||
    path === "tests/golden/stacked-water.json" ||
    ["src/core/sim/rustWater.ts", "src/core/sim/waterWasm.ts", "src/core/sim/water.ts", "src/core/sim/parallel.ts", "src/core/sim/parallelPolicy.ts", "src/platform/isolation.ts", "public/sw.js", "src/core/sim/prefill.ts", "src/core/sim/fed.ts", "src/core/math/portable.ts", "tools/portable-guard.ts"].includes(path)
  );
}

/**
 * @param files changed paths (repository-relative, forward slashes)
 * @param read  (path, "old" | "new") => the file's text before or after the change, or null when it doesn't exist
 * @param mode  "auto" (by the change), "full" (everything on) or "light" (a pull request into dev: no suites, no rust)
 * @returns {{heavy: boolean, suites: boolean, rust: boolean}} heavy: the browser shards (and the whole quick suite) run;
 *          suites: oracle, generation and engines run; rust: the Rust checks run
 */
export function classify(files, read, mode = "auto") {
  if (mode === "full") return { heavy: true, suites: true, rust: true };
  if (!files.length) return mode === "light" ? { heavy: true, suites: false, rust: false } : { heavy: true, suites: true, rust: true }; // nothing to compare against
  let heavy = false;
  let suites = false;
  let rust = false;
  for (const f of files) {
    if (isDocument(f) || isInvestigation(f) || isCollabOnly(f)) continue;
    if (f === "package.json" || f === "package-lock.json") {
      const a = read(f, "old");
      const b = read(f, "new");
      if (a !== null && b !== null && onlyLightFieldsDiffer(a, b, f === "package.json" ? "package" : "lock")) continue;
    }
    heavy = true;
    if (isUiOnly(f)) continue;
    suites = true;
    if (isRustInput(f)) rust = true;
  }
  if (mode === "light") return { heavy, suites: false, rust: false };
  return { heavy, suites, rust };
}

/** True when the `test` job runs: always, except for a pull request into dev (light) touching only investigation/. */
export function needsTest(files, mode = "auto") {
  return mode !== "light" || !files.length || !files.every(isInvestigation);
}

/** The page: the editor, the interface, the 3D view and the styles. A pull request into dev touching any of them runs the `page` job (ci.yml). */
export function isPage(path) {
  return path.startsWith("src/editor/") || path.startsWith("src/ui/") || path.startsWith("src/render3d/") || path.startsWith("src/styles/");
}

/** True when the `page` job runs: a pull request into dev (light) that touches the page. An unreadable change counts as touching it. */
export function needsPage(files, mode = "auto") {
  return mode === "light" && (!files.length || files.some(isPage));
}

/** True when the browser shards and the quick suite must run (anything but documents). */
export function needsHeavy(files, read) {
  return classify(files, read).heavy;
}

/**
 * What can change the maps the generator makes (a pull request into dev touching it runs the browser shards before the
 * merge, as a page PR runs the page job): every file `generate()` (src/core/gen/generate.ts) reaches through its value
 * imports, the generator's version constant (src/core/spec/mapspec.ts) among them, and the Rust crates its Wasm is built
 * from (the water, the analysis, the checks and the maths they share, with the workspace's Cargo files). A directory is
 * listed when `generate()` reaches every file directly in it, else its files one by one; type-only imports, a premise
 * not offered (premise/gate*.ts, premises/wallGate.ts, premises/dev.ts) and the showcase are not reached. Kept true by
 * tests/unit/ci-changes.test.ts, which walks the imports and fails when they and this list differ.
 */
export const GENERATOR_DIRS = [
  "src/core/analysis/rust",
  "src/core/data",
  "src/core/features/setpieces",
  "src/core/land",
  "src/core/math",
  "src/core/premise/raster",
  "src/core/spec",
  "src/core/water",
];

const inDir = (dir, ...names) => names.map((n) => `${dir}/${n}`);

export const GENERATOR_FILES = [
  ...inDir("src/core/analysis", "damsites.ts", "easyStart.ts", "edges.ts", "ground.ts", "mechanics.ts", "opening.ts", "regions.ts", "ridge.ts", "seeThrough.ts", "signature.ts", "sources.ts", "story.ts", "straight.ts", "vertical.ts", "walk.ts", "wood.ts"),
  ...inDir("src/core/doc", "labels.ts"),
  ...inDir("src/core/features", "build.ts", "edits.ts", "features.schema.json", "geometry.ts", "ids.ts", "objects.ts", "route.ts", "slopes.ts", "target.ts"),
  ...inDir("src/core/features/raster", "brush.ts", "resources.ts", "terrain.ts", "weather.ts"),
  ...inDir("src/core/forces", "clear.ts", "floor.ts", "objects.ts", "op.ts", "settings.ts"),
  ...inDir("src/core/format", "base64.ts", "entities.ts", "footprints.ts", "json.ts", "timber.ts", "world.ts"),
  ...inDir("src/core/format/vendor", "jpeg-encoder.js"),
  ...inDir("src/core/gen", "blobs.ts", "calibrated.ts", "extras.ts", "failWords.ts", "forms3d.ts", "generate.ts", "intentions.ts", "names.ts", "outcomes.ts", "pack.ts", "plug.ts", "readback.ts", "resources.ts", "ruinStories.ts", "settler.ts", "weir.ts"),
  ...inDir("src/core/premise", "card.ts", "choice.ts", "draw.ts", "frame.ts", "generate.ts", "geom.ts", "ladder.ts", "levels.ts", "life.ts", "map.ts", "planChecks.ts", "siting.ts", "style.ts", "water.ts", "waterChecks.ts"),
  ...inDir("src/core/premise/premises", "index.ts", "lakeStair.ts"),
  ...inDir("src/core/render", "shade.ts"),
  ...inDir("src/core/resources", "badwater.ts", "baseline.ts", "budget.ts", "measure.ts", "mineGround.ts"),
  ...inDir("src/core/sim", "columns.ts", "drought.ts", "droughtLine.ts", "fed.ts", "firstDays.ts", "model.ts", "moisture.ts", "parallel.ts", "parallelPolicy.ts", "prefill.ts", "preview.ts", "rustWater.ts", "sill.ts", "soil.ts", "soil3d.ts", "stackFed.ts", "stackParallel.ts", "stackWater.ts", "startWaterDay.ts", "water.ts", "waterWasm.ts", "weather.ts", "withering.ts"),
  ...inDir("src/core/terrain", "blocks.ts", "clearance.ts", "runs.ts", "support.ts"),
  ...inDir("src/core/validate", "checks.ts", "checksWasm.ts", "playability.ts", "report.ts", "rust.ts"),
];

/** The Rust the generator's Wasm is built from (src/core/sim/waterWasm.ts, analysis/rust/analysisWasm.ts,
 *  validate/checksWasm.ts): its crates and the workspace's Cargo files. */
export const GENERATOR_RUST = ["rust/water/", "rust/analysis/", "rust/checks/", "rust/portable/", "rust/Cargo.toml", "rust/Cargo.lock"];

const GENERATOR_FILE_SET = new Set(GENERATOR_FILES);

/** True when a change to this path can change what the generator makes (`GENERATOR_DIRS`, `GENERATOR_FILES`,
 *  `GENERATOR_RUST`). Documents never do. */
export function isGenerator(path) {
  if (isDocument(path)) return false;
  if (GENERATOR_FILE_SET.has(path)) return true;
  const slash = path.lastIndexOf("/");
  if (slash > 0 && GENERATOR_DIRS.includes(path.slice(0, slash))) return true;
  return GENERATOR_RUST.some((r) => (r.endsWith("/") ? path.startsWith(r) : path === r));
}

/** True when the browser shards run on a pull request into dev (light) before the merge: it can change what the
 *  generator makes. An unreadable change counts as one that can. */
export function needsGenerator(files, mode = "auto") {
  return mode === "light" && (!files.length || files.some(isGenerator));
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--full") ? "full" : args.includes("--light") ? "light" : "auto";
  const [base, head] = args.filter((a) => !a.startsWith("--"));
  let result = { heavy: true, suites: true, rust: true, test: true, page: false, generator: false };
  const zero = /^0+$/;
  try {
    if (mode === "full") {
      console.log("a full run: every suite runs");
    } else {
      if (!base || !head || zero.test(base)) throw new Error("no base to compare with");
      // the three-dot form compares with the common ancestor, so a pull request shows only its own changes
      const files = git("diff", "--name-only", "--no-renames", `${base}...${head}`).split("\n").filter(Boolean);
      const mergeBase = git("merge-base", base, head).trim();
      const read = (path, side) => {
        try {
          return git("show", `${side === "old" ? mergeBase : head}:${path}`);
        } catch {
          return null;
        }
      };
      result = { ...classify(files, read, mode), test: needsTest(files, mode), page: needsPage(files, mode), generator: needsGenerator(files, mode) };
      console.log(`${files.length} changed file(s), ${mode} run`);
    }
  } catch (e) {
    if (mode === "light") result = { heavy: true, suites: false, rust: false, test: true, page: true, generator: true };
    console.log(`${e.message}: ${mode === "light" ? "the tests and the browser shards run" : "everything runs"}`);
  }
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  console.log(lines.join(" "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
