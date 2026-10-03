// The portable maths (src/core/math/portable.ts, PLAN §2.1, §20 D366, D401): the same bits in every engine,
// close to the native functions, and the whole-source guard (tools/portable-guard.ts) that keeps
// engine-dependent maths out of the core, the workers and the data tools. rust/portable is the same maths in
// Rust, checked bit for bit by tools/rust/check.ts.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import * as portable from "../../src/core/math/portable";
import { cosDet, expDet, sinDet } from "../../src/core/math/detmath";
import { Rng } from "../../src/core/math/rng";
import { inGuard, violations } from "../../tools/portable-guard";

describe("portable maths", () => {
  it("reuses the existing sine, cosine and exp, bit for bit", () => {
    for (const x of [-10, -1, -0, 0, 0.5, 1, 10, 123.456]) {
      expect(Object.is(portable.sin(x), sinDet(x))).toBe(true);
      expect(Object.is(portable.cos(x), cosDet(x))).toBe(true);
      expect(Object.is(portable.exp(x), expDet(x))).toBe(true);
    }
  });

  it("the exact square root without WebAssembly matches it bit for bit", () => {
    const rng = new Rng(171);
    for (let k = 0; k < 4000; k++) {
      const x = rng.range(0, 1e6) * (k % 3 === 0 ? 1e-9 : 1);
      expect(Object.is(portable.sqrtExact(x), portable.sqrt(x))).toBe(true);
    }
    for (const x of [0, -0, Infinity, Number.MIN_VALUE, Number.MAX_VALUE, 2, 0.5]) expect(Object.is(portable.sqrtExact(x), portable.sqrt(x))).toBe(true);
    expect(portable.sqrtExact(-1)).toBeNaN();
  });

  it("tan, asin, acos, asinh and rem stay close to, or equal, the native functions", () => {
    const rng = new Rng(401);
    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1, Math.abs(b));
    for (let k = 0; k < 2048; k++) {
      const x = rng.range(-1, 1);
      expect(rel(portable.asin(x), Math.asin(x))).toBeLessThan(1e-14);
      expect(rel(portable.acos(x), Math.acos(x))).toBeLessThan(1e-14);
      const t = rng.range(-1.4, 1.4);
      expect(rel(portable.tan(t), Math.tan(t))).toBeLessThan(1e-13);
      const h = rng.range(-300, 300);
      expect(rel(portable.asinh(h), Math.asinh(h))).toBeLessThan(1e-14);
      expect(portable.rem(h, 7.25)).toBe(h % 7.25);
    }
    expect(Object.is(portable.asinh(-0), -0)).toBe(true);
    expect(Object.is(portable.rem(-8, 4), -0)).toBe(true);
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

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));
}

describe("the core, the workers and the data tools use no engine-dependent maths (D366, D401)", () => {
  it("no Math.sin, cos, exp, log, pow, hypot, sqrt, random and the like, no ** and no way around the guard", () => {
    const root = join(import.meta.dirname, "../..");
    const found: string[] = [];
    let checked = 0;
    for (const file of [...files(join(root, "src")), ...files(join(root, "tools"))]) {
      const name = relative(root, file).replaceAll("\\", "/");
      if (!inGuard(name)) continue;
      checked++;
      found.push(...violations(readFileSync(file, "utf8"), name));
    }
    expect(checked).toBeGreaterThan(150);
    // use src/core/math/portable.ts (sqrt, hypot, atan, atan2, log, log2, pow, tanh, tan, asin, acos, asinh;
    // sin, cos and exp are detmath's); a fresh seed comes from the caller, never Math.random
    expect(found).toEqual([]);
  });

  it("rejects every planted way in", () => {
    const planted: [string, string][] = [
      ["src/core/a.ts", "const y = Math.sin(1);"],
      ["src/core/a.ts", "const y = Math.random();"],
      ["src/core/a.ts", "const { sqrt } = Math;"],
      ["src/core/a.ts", "const m = Math; m.exp(1);"],
      ["src/core/a.ts", 'const y = Math["log"](2);'],
      ["src/core/a.ts", "const y = globalThis.Math.cos(1);"],
      ["src/core/a.ts", "let y = 2 ** 0.5;"],
      ["src/core/a.ts", "let y = 2; y **= 0.5;"],
      ["tools/a.ts", 'await page.evaluate("Math.hypot(3, 4)");'],
      ["tools/a.ts", "const f = new Function('return 1');"],
      ["tools/a.ts", "const y = eval('1');"],
      ["src/worker/a.ts", "const m = new WebAssembly.Module(bytes);"],
      ["tools/a.ts", 'import { sin } from "mathjs";'],
      ["src/core/a.ts", 'import { x } from "three";'],
    ];
    for (const [file, code] of planted) expect(violations(code, file), code).not.toEqual([]);
    const fine: [string, string][] = [
      ["src/core/a.ts", "const y = Math.floor(Math.abs(-2.5)) + Math.PI + Math.max(1, 2);"],
      ["src/core/a.ts", 'import type { X } from "three";'],
      ["src/core/a.ts", 'import { gunzipSync } from "fflate";'],
    ];
    for (const [file, code] of fine) expect(violations(code, file), code).toEqual([]);
  });

  it("covers the core, the workers and the data tools, not the pictures or the renderer", () => {
    for (const f of ["src/core/sim/water.ts", "src/worker/session.ts", "src/places/place.worker.ts", "tools/batch.ts", "tools/ingame-files.ts", "tools/rust/check.ts"]) expect(inGuard(f), f).toBe(true);
    for (const f of ["tools/capture-look.ts", "tools/smooth/scenarios.ts", "src/render3d/renderer.ts", "src/render3d/high/bake.worker.ts", "src/editor/Editor.tsx", "tools/rust/guard.d.mts"]) expect(inGuard(f), f).toBe(false);
  });
});
