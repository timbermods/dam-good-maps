// Decides whether a change needs CI's heavy suites (the browser tests, the cross-engine determinism check, the
// map batches and the Python oracle). A change that only touches documents, the LICENSE file or package.json's
// descriptive fields is "light": the typecheck and the quick suite still run, the heavy jobs are skipped (a skipped
// job counts as passed for merge and release). Anything else, including a change this script can't read, is "heavy".
//
//   node tools/ci-changes.mjs <base sha> <head sha>   prints heavy=true|false (and writes it to $GITHUB_OUTPUT)
//
// Plain Node, no dependencies: the CI job that runs it does not install anything. Tested by tests/unit/ci-changes.test.ts.

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

/**
 * @param files changed paths (repository-relative, forward slashes)
 * @param read  (path, "old" | "new") => the file's text before or after the change, or null when it doesn't exist
 * @returns true when the heavy suites must run
 */
export function needsHeavy(files, read) {
  if (!files.length) return true; // nothing to compare against: run everything
  for (const f of files) {
    if (isDocument(f)) continue;
    if (f === "package.json" || f === "package-lock.json") {
      const a = read(f, "old");
      const b = read(f, "new");
      if (a !== null && b !== null && onlyLightFieldsDiffer(a, b, f === "package.json" ? "package" : "lock")) continue;
    }
    return true;
  }
  return false;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

function main() {
  const [base, head] = process.argv.slice(2);
  let heavy = true;
  const zero = /^0+$/;
  try {
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
    heavy = needsHeavy(files, read);
    console.log(`${files.length} changed file(s); ${heavy ? "the heavy suites run" : "only documents, LICENSE or light package.json fields: the heavy suites are skipped"}`);
  } catch (e) {
    console.log(`${e.message}: the heavy suites run`);
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `heavy=${heavy}\n`);
  console.log(`heavy=${heavy}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
