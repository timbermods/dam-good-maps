// The portable maths (src/core/math/portable.ts, PLAN §2.1, §20 D366): the same bits in every engine,
// close to the native functions, and the guard that keeps native approximate maths out of the core.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as portable from "../../src/core/math/portable";
import { cosDet, expDet, sinDet } from "../../src/core/math/detmath";
import { Rng } from "../../src/core/math/rng";

describe("portable maths", () => {
  it("reuses the existing sine, cosine and exp, bit for bit", () => {
    for (const x of [-10, -1, -0, 0, 0.5, 1, 10, 123.456]) {
      expect(Object.is(portable.sin(x), sinDet(x))).toBe(true);
      expect(Object.is(portable.cos(x), cosDet(x))).toBe(true);
      expect(Object.is(portable.exp(x), expDet(x))).toBe(true);
    }
  });

  it("sqrt is correctly rounded (WebAssembly's f64.sqrt), signed zero and specials included", () => {
    const rng = new Rng(520031);
    for (let k = 0; k < 20000; k++) {
      const x = rng.range(0, 1e6) * (k % 3 === 0 ? 1e-9 : 1);
      expect(portable.sqrt(x)).toBe(Math.sqrt(x));
    }
    expect(Object.is(portable.sqrt(-0), -0)).toBe(true);
    expect(portable.sqrt(Infinity)).toBe(Infinity);
    expect(portable.sqrt(-1)).toBeNaN();
    expect(portable.sqrt(Number.MIN_VALUE)).toBe(Math.sqrt(Number.MIN_VALUE));
  });

  it("hypot, atan, atan2, log, log2, pow and tanh stay close to the native functions on map inputs", () => {
    const rng = new Rng(9);
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
    for (let k = 0; k < 4096; k++) {
      const x = rng.range(-300, 300);
      const y = rng.range(-300, 300);
      const p = rng.range(0.001, 5);
      expect(rel(portable.hypot(x, y), Math.hypot(x, y))).toBeLessThan(1e-14);
      expect(rel(portable.atan(x), Math.atan(x))).toBeLessThan(1e-14);
      expect(rel(portable.atan2(y, x), Math.atan2(y, x))).toBeLessThan(1e-14);
      expect(rel(portable.log(p), Math.log(p))).toBeLessThan(1e-14);
      expect(rel(portable.log2(p), Math.log2(p))).toBeLessThan(1e-14);
      const e = rng.range(0.2, 6);
      expect(rel(portable.pow(p, e), Math.pow(p, e))).toBeLessThan(1e-12);
      expect(rel(portable.tanh(x / 30), Math.tanh(x / 30))).toBeLessThan(1e-14);
    }
  });

  it("keeps quadrants, signed zeros and exact cases", () => {
    expect(portable.hypot(3, 4)).toBe(5);
    expect(portable.hypot(11, -24)).toBe(Math.hypot(11, -24));
    expect(portable.hypot(0, 0)).toBe(0);
    expect(portable.hypot()).toBe(0);
    expect(portable.hypot(-2)).toBe(2);
    for (const y of [-0, 0, -1, 1])
      for (const x of [-0, 0, -1, 1]) expect(Object.is(portable.atan2(y, x), Math.atan2(y, x))).toBe(true);
    expect(portable.atan2(1, -1)).toBeCloseTo((3 * Math.PI) / 4, 15);
    expect(portable.atan2(-1, -1)).toBeCloseTo((-3 * Math.PI) / 4, 15);
    expect(portable.log(1)).toBe(0);
    expect(portable.log(0)).toBe(-Infinity);
    expect(portable.log(-1)).toBeNaN();
    expect(portable.log2(8)).toBe(3);
    expect(portable.log2(0.25)).toBe(-2);
    // integer powers multiply exactly, in a fixed order
    expect(portable.pow(3, 4)).toBe(81);
    expect(portable.pow(2, -3)).toBe(0.125);
    expect(portable.pow(1.5, 2)).toBe(1.5 * 1.5);
    expect(portable.pow(7, 0)).toBe(1);
    expect(portable.pow(0, 0.5)).toBe(0);
  });

  it("refuses powers outside the map's finite domain rather than guessing", () => {
    expect(() => portable.pow(-2, 0.5)).toThrow();
    expect(() => portable.pow(2, Infinity)).toThrow();
    expect(() => portable.pow(10, 400.5)).toThrow();
  });
});

// ------------------------------------------------------------------------------------------ the guard

/** Native functions an engine may approximate (the language allows it), random, and `**`. */
const APPROXIMATE = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sinh", "cosh", "tanh", "asinh", "acosh", "atanh", "exp", "expm1", "log", "log2", "log10", "log1p", "pow", "hypot", "sqrt", "cbrt", "random"]);

/** Native functions a core file may still use, and why (keep this short: D366). */
const ALLOWED: Record<string, { names: string[]; why: string }> = {
  "src/core/math/portable.ts": { names: ["sqrt"], why: "Math.sqrt, only where a page's policy refuses WebAssembly" },
};

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : /\.[jt]sx?$/.test(d.name) ? [join(dir, d.name)] : []));
}

describe("the core uses no native approximate maths (D366)", () => {
  it("no Math.sin, cos, exp, log, pow, hypot, sqrt and the like, no Math.random and no ** in src/core", () => {
    const root = join(import.meta.dirname, "../..");
    const found: string[] = [];
    for (const file of files(join(root, "src/core"))) {
      const name = relative(root, file).replaceAll("\\", "/");
      const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (n: ts.Node): void => {
        const call = ts.isPropertyAccessExpression(n) && n.expression.getText(sf) === "Math" && APPROXIMATE.has(n.name.text) && !ALLOWED[name]?.names.includes(n.name.text);
        const power = (ts.isBinaryExpression(n) && (n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || n.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken));
        if (call || power) found.push(`${name}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.getText(sf).replace(/\s+/g, " ").slice(0, 100)}`);
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    // use src/core/math/portable.ts (sqrt, hypot, atan, atan2, log, log2, pow, tanh; sin, cos and exp are detmath's)
    expect(found).toEqual([]);
  });
});
