// The Rust build and its maths checks (PLAN §20 D366, D381, D401, D442): `npx tsx tools/rust/check.ts`.
//
//  1. The source guard over every .rs under rust/ (tools/rust/guard.mjs): no native transcendental maths,
//     no libm, no mul_add, no floating remainder by a literal.
//  2. Builds each checked crate natively and for wasm32-unknown-unknown with strict floating point
//     (rust/.cargo/config.toml) and audits the optimized LLVM IR, the assembly and the unstripped Wasm:
//     no libm, no transcendental intrinsics, no FMA, no relaxed arithmetic.
//  3. Compares every function of rust/portable with src/core/math/portable.ts, bit for bit, natively and in
//     WebAssembly under Node; with --engines also in Chromium, Firefox and WebKit (Playwright).
//  4. The Rust water (rust/water; src/core/sim/waterWasm.ts, the committed module): the same canonical settle,
//     byte for byte, natively (rust/target/release/water-batch, built by tools/rust/build.ts --native, else
//     here), in Node's WebAssembly and with --engines in each engine, on the golden water fixtures and on
//     generated maps with and without a stored lake and drained tiles. The scaffolding every later port uses
//     (D444): native, Node-Wasm, Chromium, Firefox and WebKit give the same bytes.
//  5. The Rust forces (rust/forces; src/core/forces/rust/forcesWasm.ts, the committed module): every force's
//     byte fixtures (tools/rust/forces-jobs.ts) give the same packed result natively (forces-batch), in Node's
//     WebAssembly and with --engines in each engine, and each matches its pin (tools/rust/forces-pins.json,
//     pinned when the TypeScript forces, tag `ts-forces-final`, gave the same).
//
//   npx tsx tools/rust/check.ts [--engines] [--jobs N]
//
// Cargo runs with -j 4 by default (DGM_CARGO_JOBS or --jobs), so it shares the machine politely.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { generate } from "../../src/core/gen/generate";
import * as portable from "../../src/core/math/portable";
import { prefill } from "../../src/core/sim/prefill";
import { canonicalBytesInWasm, decodeCanonical, encodeCanonicalJob } from "../../src/core/sim/rustWater";
import type { Emitter, WaterModel } from "../../src/core/sim/water";
import { WATER_WASM } from "../../src/core/sim/waterWasm";
import { executeInRust } from "../../src/core/forces/rust/bridge";
import { FORCES_WASM } from "../../src/core/forces/rust/forcesWasm";
import { forceFixtures, sha256 } from "./forces-jobs";
import { makeSpec } from "../../src/core/spec/mapspec";
import { assertClean } from "./guard.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const RUST = join(ROOT, "rust");
const args = process.argv.slice(2);
const jobsAt = args.indexOf("--jobs");
const JOBS = String(jobsAt >= 0 ? args[jobsAt + 1] : (process.env.DGM_CARGO_JOBS ?? 4));
const ENGINES = args.includes("--engines");

/** The crates whose compiled output is audited, and the library each builds. Add every port here. */
const CRATES = [
  { pkg: "portable-check", lib: "portable_check" },
  { pkg: "water", lib: "water" },
  { pkg: "forces", lib: "forces" },
];

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

// 4. the Rust water: the same canonical settle on every target
/** A 53-bit hash of bytes (cyrb53: Math.imul and integer operations only), the same in Node and every page. */
function hash53(b: Uint8Array): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < b.length; i++) {
    h1 = Math.imul(h1 ^ b[i], 2654435761);
    h2 = Math.imul(h2 ^ b[i], 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const waterModels: [string, WaterModel][] = [];
const golden = JSON.parse(strFromU8(gunzipSync(readFileSync(join(ROOT, "tests/golden/water.json.gz"))))) as {
  fixtures: { name: string; W: number; H: number; floor: number[]; dam: number[] | null; emitters: Emitter[] }[];
};
for (const f of golden.fixtures) waterModels.push([`golden ${f.name}`, { W: f.W, H: f.H, floor: Float64Array.from(f.floor), dam: f.dam ? Float64Array.from(f.dam) : null, emitters: f.emitters }]);
for (const theme of ["riverValley", "lakeBasin", "canyon"] as const) waterModels.push([`${theme} 96²`, generate(makeSpec({ seed: 1, size: { x: 96, y: 96 }, theme })).built.waterModel]);
const waterJobs: { name: string; job: Uint8Array }[] = [];
for (const [name, m] of waterModels) {
  const start = prefill(m);
  const job = encodeCanonicalJob(m, start.depth, start.contamination);
  waterJobs.push({ name, job });
  if (name.startsWith("golden")) continue;
  // again with a stored lake and drained tiles from its settled water: the sealed settle and the removal
  const settled = decodeCanonical(canonicalBytesInWasm(job), m.W * m.H);
  const wet: number[] = [];
  for (let i = 0; i < m.W * m.H; i++) if (settled.depth[i] > 0.001) wet.push(i);
  const tiles = wet.slice(0, Math.floor(wet.length / 3));
  const stored: WaterModel = {
    ...m,
    retained: [{ tiles, floor: tiles.map((i) => m.floor[i]), depth: tiles.map((i) => settled.depth[i]), contamination: tiles.map((i) => settled.contamination[i]) }],
    drained: wet.slice(Math.floor((2 * wet.length) / 3)),
  };
  const s2 = prefill(stored);
  waterJobs.push({ name: `${name} with stored water`, job: encodeCanonicalJob(stored, s2.depth, s2.contamination) });
}
const nodeWater = waterJobs.map((j) => hash53(canonicalBytesInWasm(j.job)));
const waterBin = join(RUST, "target/release", process.platform === "win32" ? "water-batch.exe" : "water-batch");
if (!existsSync(waterBin)) cargo(["build", "--release", "-j", JOBS, "-p", "water", "--bin", "water-batch"]);
const framed = Buffer.concat(waterJobs.flatMap((j) => [Buffer.from(new Uint32Array([j.job.length]).buffer), Buffer.from(j.job)]));
const nativeOut = execFileSync(waterBin, [], { input: framed, maxBuffer: 1 << 30, windowsHide: true });
let at = 0;
waterJobs.forEach((j, k) => {
  const len = nativeOut.readUInt32LE(at);
  const got = hash53(new Uint8Array(nativeOut.buffer, nativeOut.byteOffset + at + 4, len));
  at += 4 + len;
  if (got !== nodeWater[k]) throw new Error(`the Rust water differs natively and in Node's Wasm: ${j.name}`);
});
console.log(`the Rust water: ${waterJobs.length} canonical settles, the same bytes natively and in Node's Wasm`);

/** Runs in each page, as plain source (no compiler helpers): the hashes of the canonical settles of the jobs
 *  (base64) in the water's Wasm (base64), the same hash as hash53. */
const WATER_IN_PAGE = `async ({ wasm, jobs }) => {
  const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(decode(wasm));
  const x = instance.exports;
  const out = [];
  for (const j of jobs) {
    const job = decode(j);
    const ptr = x.water_alloc(job.length);
    new Uint8Array(x.memory.buffer, ptr, job.length).set(job);
    const lenPtr = x.water_alloc(4);
    const res = x.water_canonical(ptr, job.length, lenPtr);
    const len = new DataView(x.memory.buffer).getUint32(lenPtr, true);
    const b = new Uint8Array(x.memory.buffer, res, len);
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < b.length; i++) {
      h1 = Math.imul(h1 ^ b[i], 2654435761);
      h2 = Math.imul(h2 ^ b[i], 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    out.push(4294967296 * (2097151 & h2) + (h1 >>> 0));
    x.water_dealloc(res, len);
    x.water_dealloc(lenPtr, 4);
    x.water_dealloc(ptr, job.length);
  }
  return out;
}`;
const waterPayload = { wasm: WATER_WASM, jobs: waterJobs.map((j) => Buffer.from(j.job).toString("base64")) };

// 5. the Rust forces: their byte fixtures, the same packed results on every target, as pinned
const pins = JSON.parse(readFileSync(join(ROOT, "tools/rust/forces-pins.json"), "utf8")) as Record<string, string>;
const forceJobs = forceFixtures();
if (forceJobs.length !== Object.keys(pins).length) throw new Error(`the forces' fixtures (${forceJobs.length}) and their pins (${Object.keys(pins).length}) differ: tools/rust/forces-jobs.ts`);
const nodeForces = forceJobs.map((j) => {
  const out = executeInRust(j.job);
  if (sha256(out) !== pins[j.name]) throw new Error(`the Rust forces' ${j.name} differs from its pin (tools/rust/forces-pins.json): a force changed`);
  return Buffer.from(out);
});
const forcesBin = join(RUST, "target/release", process.platform === "win32" ? "forces-batch.exe" : "forces-batch");
if (!existsSync(forcesBin)) cargo(["build", "--release", "-j", JOBS, "-p", "forces", "--bin", "forces-batch"]);
{
  const framed = Buffer.concat(forceJobs.flatMap((j) => [Buffer.from(new Uint32Array([j.job.length]).buffer), Buffer.from(j.job)]));
  const out = execFileSync(forcesBin, [], { input: framed, maxBuffer: 1 << 30, windowsHide: true });
  let at = 0;
  forceJobs.forEach((j, k) => {
    const len = out.readUInt32LE(at);
    const got = out.subarray(at + 4, at + 4 + len);
    at += 4 + len;
    if (!got.equals(nodeForces[k])) throw new Error(`the Rust forces differ natively and in Node's Wasm: ${j.name}`);
  });
}
console.log(`the Rust forces: ${forceJobs.length} fixtures, the same bytes natively and in Node's Wasm, each as pinned`);

/** Runs in each page, as plain source: the hashes of the forces' packed results for the jobs (base64), in
 *  the forces' Wasm (base64), the same hash as hash53. */
const FORCES_IN_PAGE = `async ({ wasm, jobs }) => {
  const decode = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const { instance } = await WebAssembly.instantiate(decode(wasm));
  const x = instance.exports;
  const out = [];
  for (const j of jobs) {
    const job = decode(j);
    const ptr = x.forces_alloc(job.length);
    new Uint8Array(x.memory.buffer, ptr, job.length).set(job);
    const lenPtr = x.forces_alloc(4);
    const res = x.forces_execute(ptr, job.length, lenPtr);
    const len = new DataView(x.memory.buffer).getUint32(lenPtr, true);
    const b = new Uint8Array(x.memory.buffer, res, len);
    let str = ''; for (const v of b) str += String.fromCharCode(v); out.push(btoa(str));
    x.forces_dealloc(res, len);
    x.forces_dealloc(lenPtr, 4);
    x.forces_dealloc(ptr, job.length);
  }
  return out;
}`;
const forcesPayload = { wasm: FORCES_WASM, jobs: forceJobs.map((j) => Buffer.from(j.job).toString("base64")) };

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
      const hashes = (await page.evaluate(`(${WATER_IN_PAGE})(${JSON.stringify(waterPayload)})`)) as number[];
      hashes.forEach((h, k) => {
        if (h !== nodeWater[k]) throw new Error(`the Rust water differs in ${name}: ${waterJobs[k].name}`);
      });
      console.log(`${name}: the Rust water's ${waterJobs.length} canonical settles, the same bytes`);
      const forceHashes = (await page.evaluate(`(${FORCES_IN_PAGE})(${JSON.stringify(forcesPayload)})`)) as string[];
      forceHashes.forEach((h, k) => {
        if (!Buffer.from(h, "base64").equals(nodeForces[k])) throw new Error(`the Rust forces differ in ${name}: ${forceJobs[k].name}`);
      });
      console.log(`${name}: the Rust forces' ${forceJobs.length} fixtures, the same bytes`);
    } finally {
      await browser.close();
    }
  }
}
console.log("Rust check passed");
