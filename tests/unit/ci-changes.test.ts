// CI skips suites only for changes that can't affect them (tools/ci-changes.mjs; the rule is in ci.yml's header):
// documents, LICENSE and package.json's descriptive fields skip everything but the typecheck and the document tests; a
// change only under src/editor/, src/ui/ and tests/e2e/ skips oracle, generation, engines and rust; rust runs only for
// the Rust and the TypeScript that wraps it. Code, dependencies and scripts keep the rest of the suite.
import { describe, expect, it } from "vitest";
import { classify, isDocument, isInvestigation, isRustInput, isUiOnly, needsHeavy, onlyLightFieldsDiffer } from "../../tools/ci-changes.mjs";

const pkg = (over: object = {}) =>
  JSON.stringify({ name: "x", version: "1.0.0", license: "MIT", scripts: { test: "a" }, dependencies: { a: "1" }, devDependencies: { b: "1" }, ...over });
const lock = (over: object = {}) => JSON.stringify({ packages: { "": { name: "x", license: "MIT", dependencies: { a: "1" }, ...over }, "node_modules/a": { version: "1.0.0" } } });
const readWith = (files: Record<string, [string, string]>) => (path: string, side: "old" | "new") => (files[path] ? files[path][side === "old" ? 0 : 1] : null);

describe("which changes need the heavy suites", () => {
  it("documents, images under docs and LICENSE are light", () => {
    for (const f of ["README.md", "docs/STATUS.md", "investigation/x/REPORT.md", "docs/sheets/m9.png", "LICENSE", "PLAN.md"]) expect(isDocument(f), f).toBe(true);
    expect(needsHeavy(["README.md", "docs/STATUS.md", "LICENSE"], () => null)).toBe(false);
  });
  it("a change touching only investigation/ (plus documents) is light", () => {
    expect(isInvestigation("investigation/probe/run.ts")).toBe(true);
    expect(needsHeavy(["investigation/probe/run.ts", "investigation/x/data.json", "docs/STATUS.md"], () => null)).toBe(false);
    expect(needsHeavy(["investigation/x/a.json", "src/a.ts"], () => null)).toBe(true);
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

describe("which suites a change needs", () => {
  const none = () => null;
  const all = { heavy: true, suites: true, rust: true };
  it("documents only: nothing but the document tests", () => {
    expect(classify(["README.md", "docs/STATUS.md"], none)).toEqual({ heavy: false, suites: false, rust: false });
  });
  it("only the editor, the interface and the browser specs (and documents): the browser shards, no other suite", () => {
    for (const f of ["src/editor/brush.ts", "src/ui/Shelf.tsx", "tests/e2e/shelf.spec.ts"]) expect(isUiOnly(f), f).toBe(true);
    for (const f of ["src/core/gen/a.ts", "src/main.tsx", "tests/unit/a.test.ts", "playwright.config.ts"]) expect(isUiOnly(f), f).toBe(false);
    expect(classify(["src/editor/brush.ts", "tests/e2e/brush.spec.ts", "EDITOR_PLAN.md"], none)).toEqual({ heavy: true, suites: false, rust: false });
  });
  it("one core file brings the suites back; rust only when the Rust or what wraps it changes", () => {
    expect(classify(["src/editor/a.ts", "src/core/gen/a.ts"], none)).toEqual({ heavy: true, suites: true, rust: false });
    for (const f of ["rust/water/src/lib.rs", "tools/rust/check.ts", "rust-toolchain.toml", "src/core/sim/rustWater.ts", "src/core/sim/waterWasm.ts", "src/core/math/portable.ts", ".github/workflows/ci.yml"]) {
      expect(isRustInput(f), f).toBe(true);
      expect(classify([f], none), f).toEqual(all);
    }
    expect(isRustInput("src/core/sim/water.ts")).toBe(false);
    // (the forces' Wasm and what wraps it, and the maps their byte fixtures stand on)
    for (const f of ["src/core/forces/rust/bridge.ts", "src/core/forces/rust/forcesWasm.ts", "tests/contract/forceFixtures.ts", "tools/rust/forces-pins.json"]) expect(isRustInput(f), f).toBe(true);
    expect(isRustInput("src/core/forces/runs.ts")).toBe(false);
  });
  it("dependency changes run everything; a descriptive package.json change is a document", () => {
    const deps = readWith({ "package.json": [pkg(), pkg({ dependencies: { a: "2" } })] });
    expect(classify(["package.json", "src/editor/a.ts"], deps)).toEqual(all);
    const light = readWith({ "package.json": [pkg(), pkg({ license: "Y" })] });
    expect(classify(["package.json", "src/editor/a.ts"], light)).toEqual({ heavy: true, suites: false, rust: false });
  });
  it("a full run turns everything on; a light run (a pull request into dev) never runs the suites or rust", () => {
    expect(classify(["README.md"], none, "full")).toEqual(all);
    expect(classify(["rust/a.rs", "src/core/a.ts"], none, "light")).toEqual({ heavy: true, suites: false, rust: false });
    expect(classify(["README.md"], none, "light")).toEqual({ heavy: false, suites: false, rust: false });
    expect(classify([], none, "light")).toEqual({ heavy: true, suites: false, rust: false });
    expect(classify([], none)).toEqual(all);
  });
});
