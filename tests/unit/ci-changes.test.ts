// CI skips its heavy suites only for changes that can't affect them (tools/ci-changes.mjs; the rule is in ci.yml's
// header): documents, LICENSE and package.json's descriptive fields. Code, dependencies and scripts keep the full suite.
import { describe, expect, it } from "vitest";
import { isDocument, needsHeavy, onlyLightFieldsDiffer } from "../../tools/ci-changes.mjs";

const pkg = (over: object = {}) =>
  JSON.stringify({ name: "x", version: "1.0.0", license: "MIT", scripts: { test: "a" }, dependencies: { a: "1" }, devDependencies: { b: "1" }, ...over });
const lock = (over: object = {}) => JSON.stringify({ packages: { "": { name: "x", license: "MIT", dependencies: { a: "1" }, ...over }, "node_modules/a": { version: "1.0.0" } } });
const readWith = (files: Record<string, [string, string]>) => (path: string, side: "old" | "new") => (files[path] ? files[path][side === "old" ? 0 : 1] : null);

describe("which changes need the heavy suites", () => {
  it("documents, images under docs and LICENSE are light", () => {
    for (const f of ["README.md", "docs/STATUS.md", "investigation/x/REPORT.md", "docs/sheets/m9.png", "LICENSE", "PLAN.md"]) expect(isDocument(f), f).toBe(true);
    expect(needsHeavy(["README.md", "docs/STATUS.md", "LICENSE"], () => null)).toBe(false);
  });
  it("code, data files, workflows and tests are heavy, even under docs/", () => {
    for (const f of ["src/core/a.ts", "tests/e2e/a.spec.ts", ".github/workflows/ci.yml", "docs/look/reference/pair-map.timber", "public/data.json", "tools/ci-changes.mjs"]) {
      expect(isDocument(f), f).toBe(false);
      expect(needsHeavy([f], () => null), f).toBe(true);
    }
  });
  it("a mix with one code file is heavy; an empty or unknown change is heavy", () => {
    expect(needsHeavy(["README.md", "src/a.ts"], () => null)).toBe(true);
    expect(needsHeavy([], () => null)).toBe(true);
  });
  it("package.json: descriptive fields are light; dependencies, devDependencies, scripts, version and the rest are heavy", () => {
    const light = readWith({ "package.json": [pkg(), pkg({ license: "AGPL-3.0-or-later", description: "d", keywords: ["k"] })] });
    expect(needsHeavy(["package.json", "LICENSE"], light)).toBe(false);
    for (const over of [{ dependencies: { a: "2" } }, { devDependencies: { b: "2" } }, { scripts: { test: "b" } }, { version: "1.0.1" }, { overrides: { z: "1" } }, { type: "module" }]) {
      expect(needsHeavy(["package.json"], readWith({ "package.json": [pkg(), pkg(over)] })), JSON.stringify(over)).toBe(true);
    }
  });
  it("package-lock.json: only the root package's descriptive fields are light", () => {
    expect(needsHeavy(["package.json", "package-lock.json"], readWith({ "package.json": [pkg(), pkg({ license: "Y" })], "package-lock.json": [lock(), lock({ license: "Y" })] }))).toBe(false);
    expect(needsHeavy(["package-lock.json"], readWith({ "package-lock.json": [lock(), lock({ dependencies: { a: "2" } })] }))).toBe(true);
    expect(needsHeavy(["package-lock.json"], readWith({ "package-lock.json": [lock(), JSON.stringify({ packages: { "": { name: "x", license: "MIT", dependencies: { a: "1" } }, "node_modules/a": { version: "1.0.1" } } })] }))).toBe(true);
  });
  it("an unreadable package.json, or one that is new or deleted, is heavy", () => {
    expect(onlyLightFieldsDiffer("{", pkg())).toBe(false);
    expect(needsHeavy(["package.json"], () => null)).toBe(true);
  });
});
