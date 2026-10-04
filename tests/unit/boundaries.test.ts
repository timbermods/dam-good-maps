// Product code never imports from investigation/ (investigation/README.md): the studies and their
// prototypes are references, not code the app ships. An adopted piece is ported or moved into src/.
// Tools and tests may still read investigation data files (notes, local maps) at run time.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const INVESTIGATION = join(ROOT, "investigation");

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) out.push(...sources(path));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name)) out.push(path);
  }
  return out;
}

/** Every module a file names: static and dynamic imports, re-exports, require, and worker URLs. */
function specifiers(code: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s[^'"`;]*?\bfrom\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]/g,
    /\bnew\s+URL\s*\(\s*["'`]([^"'`]+)["'`]\s*,\s*import\.meta\.url/g,
  ];
  for (const re of patterns) for (const m of code.matchAll(re)) out.push(m[1]);
  return out;
}

function intoInvestigation(file: string, spec: string): boolean {
  if (/(^|[\\/])investigation([\\/]|$)/.test(spec) && !spec.startsWith(".")) return true;
  if (!spec.startsWith(".")) return false;
  const target = resolve(dirname(file), spec);
  return target === INVESTIGATION || target.startsWith(INVESTIGATION + sep);
}

describe("the investigations stay out of the product", () => {
  it("nothing under src/ imports a module from investigation/", () => {
    const files = sources(join(ROOT, "src"));
    expect(files.length).toBeGreaterThan(50);
    const bad: string[] = [];
    for (const f of files) {
      for (const s of specifiers(readFileSync(f, "utf8"))) if (intoInvestigation(f, s)) bad.push(`${relative(ROOT, f)}: ${s}`);
    }
    expect(bad).toEqual([]);
  });

  it("the check sees each way of importing", () => {
    const f = join(ROOT, "src", "core", "x.ts");
    const code = [
      'import { a } from "../../investigation/generative/proto/genome";',
      'export * from "../../investigation/claude/lib/places";',
      'import "../../investigation/cycles/model";',
      'const m = await import("../../investigation/terrain3d/proto/gen3d");',
      'const r = require("../../investigation/workshop/lib/measures");',
      'new Worker(new URL("../../investigation/simspeed/api.ts", import.meta.url));',
      'import { b } from "../format/timber";',
    ].join("\n");
    const found = specifiers(code).filter((s) => intoInvestigation(f, s));
    expect(found).toHaveLength(6);
  });
});
