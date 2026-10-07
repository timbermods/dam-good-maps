// Decides which of CI's suites a change needs. Three classes of change:
//   documents    only documents, investigation/, LICENSE or package.json's descriptive fields: the typecheck and the
//                document tests run; the browser shards and every other suite are skipped (heavy=false).
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
// prints heavy, suites, rust and test (and writes them to $GITHUB_OUTPUT). --full (pushes to main, pull requests into main,
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
    if (isDocument(f) || isInvestigation(f)) continue;
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

/** True when the browser shards and the quick suite must run (anything but documents). */
export function needsHeavy(files, read) {
  return classify(files, read).heavy;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--full") ? "full" : args.includes("--light") ? "light" : "auto";
  const [base, head] = args.filter((a) => !a.startsWith("--"));
  let result = { heavy: true, suites: true, rust: true, test: true };
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
      result = { ...classify(files, read, mode), test: needsTest(files, mode) };
      console.log(`${files.length} changed file(s), ${mode} run`);
    }
  } catch (e) {
    if (mode === "light") result = { heavy: true, suites: false, rust: false, test: true };
    console.log(`${e.message}: ${mode === "light" ? "the tests and the browser shards run" : "everything runs"}`);
  }
  const lines = Object.entries(result).map(([k, v]) => `${k}=${v}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  console.log(lines.join(" "));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
