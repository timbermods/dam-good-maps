// The Rust build and its maths checks (PLAN §20 D366, D381, D401, D442): `npx tsx tools/rust/check.ts`.
//
//  1. The source guard over every .rs under rust/ (tools/rust/guard.mjs): no native transcendental maths,
//     no libm, no mul_add, no floating remainder by a literal.
//  2. Builds each checked crate natively and for wasm32-unknown-unknown with strict floating point
//     (rust/.cargo/config.toml) and audits the optimized LLVM IR, the assembly and the unstripped Wasm:
//     no libm, no transcendental intrinsics, no FMA, no relaxed arithmetic.
//  3. Compares every function of rust/portable with src/core/math/portable.ts, bit for bit, natively and in
//     WebAssembly under Node; with --engines also in Chromium, Firefox and WebKit (Playwright).
//
//   npx tsx tools/rust/check.ts [--engines] [--jobs N]
//
// Cargo runs with -j 4 by default (DGM_CARGO_JOBS or --jobs), so it shares the machine politely.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import * as portable from "../../src/core/math/portable";
import { assertClean } from "./guard.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const RUST = join(ROOT, "rust");
const args = process.argv.slice(2);
const jobsAt = args.indexOf("--jobs");
const JOBS = String(jobsAt >= 0 ? args[jobsAt + 1] : (process.env.DGM_CARGO_JOBS ?? 4));
const ENGINES = args.includes("--engines");

/** The crates whose compiled output is audited, and the library each builds. Add every port here. */
const CRATES = [{ pkg: "portable-check", lib: "portable_check" }];

/** The functions in portable_eval's order (rust/portable-check/src/lib.rs). */
const OPS = ["sin", "cos", "tan", "exp", "log", "log2", "pow", "hypot", "sqrt", "atan", "atan2", "tanh", "asinh", "asin", "acos", "rem"] as const;

function cargo(a: string[]): string {
  return execFileSync("cargo", a, { cwd: RUST, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
}
function rsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.name === "target" ? [] : d.isDirectory() ? rsFiles(join(dir, d.name)) : d.name.endsWith(".rs") ? [join(dir, d.name)] : [],
  );
}
function newest(dir: string, test: (name: string) => boolean): string | null {
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter(test).map((n) => join(dir, n));
  found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return found[0] ?? null;
}

// 1. the source guard
const sources = rsFiles(RUST);
for (const file of sources) {
  try {
    assertClean("source", readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${relative(ROOT, file)}: ${(e as Error).message}`);
  }
}
console.log(`source guard: ${sources.length} Rust files clean`);

// 2. strict builds and their audit
const host = /^host: (.+)$/m.exec(execFileSync("rustc", ["-vV"], { cwd: RUST, encoding: "utf8" }))![1].trim();
const rustc = execFileSync("rustc", ["--version"], { cwd: RUST, encoding: "utf8" }).trim();
console.log(`${rustc}, host ${host}, cargo -j ${JOBS}`);
for (const target of ["wasm32-unknown-unknown", host]) {
  for (const { pkg, lib } of CRATES) {
    cargo(["rustc", "--release", "-j", JOBS, "-p", pkg, "--lib", "--crate-type", "cdylib", "--target", target, "--", "--emit=link,llvm-ir,asm"]);
    const deps = join(RUST, "target", target, "release", "deps");
    const ir = join(deps, `${lib}.ll`);
    const asm = join(deps, `${lib}.s`);
    if (!existsSync(ir) || !existsSync(asm)) throw new Error(`missing IR or assembly for ${pkg} (${target})`);
    assertClean("ir", readFileSync(ir, "utf8"));
    assertClean("assembly", readFileSync(asm, "utf8"));
    if (target.startsWith("wasm")) {
      const wasm = newest(deps, (n) => n.startsWith(lib) && n.endsWith(".wasm"));
      if (!wasm) throw new Error(`missing Wasm for ${pkg}`);
      assertClean("wasm", readFileSync(wasm));
    }
    console.log(`strict build: ${pkg} for ${target}: IR, assembly${target.startsWith("wasm") ? " and Wasm" : ""} clean`);
  }
}
cargo(["build", "--release", "-j", JOBS, "-p", "portable-check", "--bin", "portable-check", "--target", host]);

// 3. the same bits as portable.ts
const hex = (x: number): string => {
  const d = new DataView(new ArrayBuffer(8));
  d.setFloat64(0, x);
  return d.getBigUint64(0).toString(16).padStart(16, "0");
};
const fromBits = (b: bigint): number => {
  const d = new DataView(new ArrayBuffer(8));
  d.setBigUint64(0, b);
  return d.getFloat64(0);
};
let state = 0x94ab305d;
const random = (): number => {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4294967296;
};
type Vector = { op: number; x: number; y: number; z: number; expected: string };
const evalTs = (op: number, x: number, y: number, z: number): number => {
  const f = OPS[op];
  if (f === "hypot") return portable.hypot(x, y, z);
  if (f === "pow" || f === "atan2" || f === "rem") return portable[f](x, y);
  return portable[f](x);
};
const vectors: Vector[] = [];
const push = (op: number, x: number, y = 0, z = 0) => vectors.push({ op, x, y, z, expected: hex(evalTs(op, x, y, z)) });
for (const [op, f] of OPS.entries()) {
  for (let i = 0; i < 2500; i++) {
    let x = (random() - 0.5) * 1000;
    let y = (random() - 0.5) * 20;
    const z = (random() - 0.5) * 1000;
    if (f === "asin" || f === "acos") x = random() * 2 - 1;
    if (f === "log" || f === "log2" || f === "sqrt") x = random() * 1e6;
    if (f === "pow") {
      x = random() * 10 + 0.001;
      y = i % 2 ? (i % 41) - 20 : (random() - 0.5) * 8;
    }
    push(op, x, y, z);
  }
}
// every binade's square root, the exact fallback included, and the specials
const sqrtOp = OPS.indexOf("sqrt");
const binades = Array.from({ length: 2046 }, (_, i) => fromBits(BigInt(i + 1) << 52n));
for (const x of [0, -0, Number.MIN_VALUE, Number.MAX_VALUE, ...binades]) {
  push(sqrtOp, x);
  if (!Object.is(portable.sqrtExact(x), portable.sqrt(x))) throw new Error(`sqrtExact(${x}) differs from the Wasm sqrt`);
}
const remOp = OPS.indexOf("rem");
for (let i = 0; i < 5000; i++) {
  const any = () => {
    const x = fromBits((BigInt(Math.floor(random() * 4294967296)) << 32n) | BigInt(Math.floor(random() * 4294967296)));
    return Number.isFinite(x) ? x : 1;
  };
  push(remOp, any(), any() || Number.MIN_VALUE);
}
for (const [x, y] of [[0, 4], [-0, 4], [7, 4], [-7, 4], [4, -4], [Number.MIN_VALUE, 1], [Number.MAX_VALUE, Number.MIN_VALUE], [1e-300, 1e-310], [20.75, 4], [-32.25, 12], [12, Infinity], [-12, Infinity], [-0, -4]])
  push(remOp, x, y);

const native = join(RUST, "target", host, "release", process.platform === "win32" ? "portable-check.exe" : "portable-check");
const lines = execFileSync(native, [], {
  input: vectors.map((v) => [v.op, hex(v.x), hex(v.y), hex(v.z)].join(" ")).join("\n") + "\n",
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
})
  .trim()
  .split(/\r?\n/);
if (lines.length !== vectors.length) throw new Error(`native: ${lines.length} results for ${vectors.length} vectors`);
lines.forEach((got, i) => {
  if (got !== vectors[i].expected) throw new Error(`native ${OPS[vectors[i].op]}(${vectors[i].x}, ${vectors[i].y}, ${vectors[i].z}): ${got}, portable.ts ${vectors[i].expected}`);
});
console.log(`native: ${vectors.length} vectors, the same bits as portable.ts`);

const wasmPath = newest(join(RUST, "target", "wasm32-unknown-unknown", "release", "deps"), (n) => n.startsWith("portable_check") && n.endsWith(".wasm"))!;
const wasmBytes = readFileSync(wasmPath);
/** Runs in Node and, serialised, in each browser page: returns the first mismatch or null. */
async function compareInWasm({ bytes, vectors }: { bytes: number[]; vectors: Vector[] }): Promise<string | null> {
  const { instance } = await WebAssembly.instantiate(Uint8Array.from(bytes));
  const f = instance.exports.portable_eval as (op: number, x: number, y: number, z: number) => number;
  const view = new DataView(new ArrayBuffer(8));
  for (const v of vectors) {
    view.setFloat64(0, f(v.op, v.x, v.y, v.z));
    const got = view.getBigUint64(0).toString(16).padStart(16, "0");
    if (got !== v.expected) return `op ${v.op} (${v.x}, ${v.y}, ${v.z}): ${got}, portable.ts ${v.expected}`;
  }
  return null;
}
const payload = { bytes: [...wasmBytes], vectors };
const nodeMismatch = await compareInWasm(payload);
if (nodeMismatch) throw new Error(`Node Wasm: ${nodeMismatch}`);
console.log(`Node Wasm: ${vectors.length} vectors, the same bits`);

if (ENGINES) {
  const playwright = await import("@playwright/test");
  for (const name of ["chromium", "firefox", "webkit"] as const) {
    // locally Chromium is the installed Chrome, as in playwright.config.ts; CI installs all three engines
    const channel = name === "chromium" ? (process.env.PW_CHANNEL ?? (process.env.CI ? undefined : "chrome")) : undefined;
    let browser;
    try {
      browser = await playwright[name].launch({ headless: true, ...(channel ? { channel } : {}) });
    } catch (e) {
      if (process.env.CI) throw e;
      console.log(`${name}: not installed here, skipped (CI runs it; npx playwright install ${name})`);
      continue;
    }
    try {
      const page = await browser.newPage();
      const mismatch = await page.evaluate(compareInWasm, payload);
      if (mismatch) throw new Error(`${name} Wasm: ${mismatch}`);
      console.log(`${name} ${browser.version()} Wasm: ${vectors.length} vectors, the same bits`);
    } finally {
      await browser.close();
    }
  }
}
console.log("Rust check passed");
