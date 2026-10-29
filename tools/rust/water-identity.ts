// The Rust water's settle against the app's (PLAN §20 D366, D381): `npx tsx tools/rust/water-identity.ts`, in
// CI's rust job. The app settles in TypeScript (prefill.ts, water.ts's SettleRun) round the Rust simulation;
// the native batch settles wholly in Rust (rust/water/src/settle.rs): the two must give the same bytes.
//
// For each case, the canonical settle three ways, compared byte for byte (settled, ticks, steadyTicks,
// depth, badwater share, saturation, outflows):
//  1. the settle as the app runs it (src/core/sim/prefill.ts and water.ts);
//  2. the Rust settle in WebAssembly (the native batch's code, in this thread);
//  3. the native binary (rust/target/release/water-batch), when built (`tools/rust/build.ts --native`;
//     --require-native makes its absence a failure, as in CI).
// Cases: the golden water fixtures under the game's rules and the port's (the Real places keep the port's),
// generated maps of every theme (96², 128², 256²), and each generated map again with a stored lake and
// drained tiles, so the sealed settle, the stored lakes' water and the unfed water's removal run too.
//
// With --threads N, the app's settle runs twice: on one thread and on N (the multi-core water, src/core/sim/
// parallel.ts, here on Node's worker_threads at every size), and both must give the same bytes as the others;
// --sizes adds 512² (a 256² map tiled two by two: no generated map is bigger).
//
// A generated map with terrain above terrain (its 3D forms, D488, at the default Verticality too) settles in the
// stacked engine (stackWater.ts `canonicalStackRun`, rust/water's `stack_*`), not the heightfield's, so its settle
// is compared the stacked way, every column's bytes: the app's against the same operations run in Node's
// WebAssembly and in the native stack-fixture binary (tools/rust/stack-fixtures.ts's input and output, built by
// `cargo build --release -p water --example stack-fixture` as stack-identity.ts runs it; --require-native asks
// for it too), and, with --threads, the app's on N threads. Its stored-lake variant is the heightfield's case
// (stack-identity.ts holds the stacked lakes).
//
//   npx tsx tools/rust/water-identity.ts [--seeds 1-2] [--require-native] [--threads 4] [--sizes 96,128,256,512]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync, strFromU8 } from "fflate";
import { generate } from "../../src/core/gen/generate";
import { canonicalSettle, prefill, type CanonicalWater } from "../../src/core/sim/prefill";
import { canonicalInWasm, encodeCanonicalJob } from "../../src/core/sim/rustWater";
import type { Emitter, RetainedWater, WaterModel, WaterSimOptions } from "../../src/core/sim/water";
import { AVAILABLE_THEMES, makeSpec } from "../../src/core/spec/mapspec";
import { nativeCanonical, nativeWaterBinary } from "./native-water";
import { parallelWaterStats, withoutParallelWater } from "../../src/core/sim/parallel";
import { installNodeThreads, nodeThreadsReady, uninstallParallelWater } from "./water-threads";
import { STACK_FIELD, STACK_INFO, STACK_OP, STACK_SETTLE_DAYS, StackWater, type StackSettle } from "../../src/core/sim/stackWater";
import { fixtureOutput } from "./stack-fixtures";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const [s0, s1] = arg("seeds", "1-2").split("-").map(Number);
const threads = Number(arg("threads", "0"));
const sizes = arg("sizes", "96,128,256").split(",").map(Number);
if (threads) {
  installNodeThreads(threads);
  await nodeThreadsReady(threads);
}
const exe = nativeWaterBinary();
if (!exe && process.argv.includes("--require-native")) throw new Error("the native water isn't built: npx tsx tools/rust/build.ts --native");
const ROOT = resolve(import.meta.dirname, "../..");
const stackExe = join(ROOT, "rust/target/release/examples", process.platform === "win32" ? "stack-fixture.exe" : "stack-fixture");
const stackNative = existsSync(stackExe) ? stackExe : null;

const bytesOf = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
function same(a: CanonicalWater, b: CanonicalWater): string | null {
  if (a.settled !== b.settled || a.ticks !== b.ticks || a.steadyTicks !== b.steadyTicks) return `result ${JSON.stringify([a.settled, a.ticks, a.steadyTicks])} vs ${JSON.stringify([b.settled, b.ticks, b.steadyTicks])}`;
  for (const k of ["depth", "contamination", "sat", "out"] as const) {
    const x = bytesOf(a[k]!);
    const y = bytesOf(b[k]!);
    if (x.length !== y.length) return `${k}: ${x.length} vs ${y.length} bytes`;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${k}: byte ${i} differs`;
  }
  return null;
}

let cases = 0;
const failures: string[] = [];

/** The stacked engine's operations for a canonical settle with nothing retained or drained, on one thread (as
 *  `canonicalStackRun` runs them): build, the settle's days, its ticks until it ends, the saturation. */
const stackOps = (days: number): [number, number, number][] => [[STACK_OP.build, 0, 0], [STACK_OP.settleBegin, days, 0], [STACK_OP.advance, 10_000_000, 0], [STACK_OP.saturation, 0, 0]];

/** Those operations in stack-fixtures.ts's input format: the size, the masks, the objects' rows, then the operations. */
function stackInput(m: WaterModel, days: number): Uint8Array {
  const t = m.stacked!;
  const N = m.W * m.H;
  const ops = stackOps(days);
  const b = new Uint8Array(20 + 4 * N + 8 * t.objects.length + 24 * ops.length);
  const d = new DataView(b.buffer);
  [m.W, m.H, t.objects.length / 8, 0, ops.length].forEach((v, k) => d.setUint32(4 * k, v, true));
  let at = 20;
  for (let i = 0; i < N; i++, at += 4) d.setUint32(at, t.mask[i], true);
  for (const v of t.objects) {
    d.setFloat64(at, v, true);
    at += 8;
  }
  for (const op of ops)
    for (const v of op) {
      d.setFloat64(at, v, true);
      at += 8;
    }
  return b;
}

/** The same operations in Node's WebAssembly, read as stack-fixtures.ts `runStackFixture` reads a fixture's. */
function stackInWasm(m: WaterModel, days: number): { info: number[]; fields: Uint8Array<ArrayBuffer>[] } {
  const t = m.stacked!;
  const w = new StackWater(m.W, m.H, t.objects.length / 8, 0);
  try {
    (w.view(STACK_FIELD.masks) as Uint32Array).set(t.mask);
    (w.view(STACK_FIELD.objects) as Float64Array).set(t.objects);
    for (const [op, a, b] of stackOps(days)) w.op(op, a, b);
    const fields = Array.from({ length: 20 }, (_, i) => {
      const v = w.view(i);
      return new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice();
    });
    return { info: [0, 1, 2, 3, 4].map((q) => w.info(q)), fields };
  } finally {
    w.close();
  }
}

/** A stacked settle's result and the bytes of every column, against the same fields read from an engine. */
function sameStack(a: StackSettle, info: number[], field: (id: number) => Uint8Array): string | null {
  const steady = info[STACK_INFO.steadyTicks];
  const r = [info[STACK_INFO.settle] === 1, info[STACK_INFO.ticks], steady >= 0 ? steady : undefined];
  if (a.settled !== r[0] || a.ticks !== r[1] || a.steadyTicks !== r[2]) return `result ${JSON.stringify([a.settled, a.ticks, a.steadyTicks])} vs ${JSON.stringify(r)}`;
  for (const [k, id] of [["count", STACK_FIELD.count], ["floor", STACK_FIELD.floor], ["depth", STACK_FIELD.depth], ["contamination", STACK_FIELD.contamination], ["overflow", STACK_FIELD.overflow], ["sat", STACK_FIELD.saturation]] as const) {
    const x = bytesOf(a[k]);
    const y = field(id);
    if (x.length !== y.length) return `${k}: ${x.length} vs ${y.length} bytes`;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return `${k}: byte ${i} differs`;
  }
  return null;
}

let stacked = 0;
/** A model with terrain above terrain: the app's stacked settle against the same operations in Node's WebAssembly
 *  and natively (byte for byte, every field), and on N threads. */
function checkStacked(name: string, m: WaterModel): CanonicalWater {
  const app = withoutParallelWater(() => canonicalSettle(m));
  const s = app.stack!;
  const days = s.stacked ? STACK_SETTLE_DAYS : 6;
  const wasm = stackInWasm(m, days);
  const diffs: [string, string | null][] = [["the stacked engine in Wasm", sameStack(s, wasm.info, (id) => wasm.fields[id])]];
  if (stackNative) {
    const dir = join(ROOT, ".scratch/water-identity");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${name.replace(/[^a-z0-9]+/gi, "-")}.input`);
    writeFileSync(file, stackInput(m, days));
    const native = execFileSync(stackNative, [file], { maxBuffer: 512 * 1024 * 1024, windowsHide: true });
    const out = fixtureOutput(wasm);
    const at = native.length === out.length ? native.findIndex((b, i) => b !== out[i]) : 0;
    diffs.push(["the stacked engine natively", at >= 0 ? `${native.length} vs ${out.length} bytes, first difference at byte ${at}` : null]);
  }
  if (threads) {
    const on = canonicalSettle(m).stack!;
    const f = (id: number) => {
      const k = id === STACK_FIELD.count ? "count" : id === STACK_FIELD.floor ? "floor" : id === STACK_FIELD.depth ? "depth" : id === STACK_FIELD.contamination ? "contamination" : id === STACK_FIELD.overflow ? "overflow" : "sat";
      return bytesOf(on[k]);
    };
    diffs.push([`the app on ${threads} threads`, sameStack(s, [on.ticks, 1, on.settled ? 1 : 2, on.steadyTicks ?? -1, 0], f)]);
  }
  for (const [path, diff] of diffs) if (diff) failures.push(`${name} (stacked), ${path}: ${diff}`);
  cases++;
  stacked++;
  return app;
}

function check(name: string, m: WaterModel, opts: WaterSimOptions = {}): CanonicalWater {
  if (m.stacked) return checkStacked(name, m);
  const app = withoutParallelWater(() => canonicalSettle(m, opts));
  const game = (opts.rules ?? "game") === "game";
  const start = prefill(m);
  const job = encodeCanonicalJob(m, start.depth, start.contamination, { game, edgeSpill: game });
  const wasm = canonicalInWasm(job, m.W * m.H) as CanonicalWater;
  const diffs = [["Rust settle in Wasm", same(app, wasm)]];
  if (exe) diffs.push(["native", same(app, nativeCanonical(exe, m, start, opts))]);
  if (threads) {
    const before = parallelWaterStats.ticks;
    diffs.push([`the app on ${threads} threads`, same(app, canonicalSettle(m, opts))]);
    // (a seep may keep a small map on one thread: its depth would be read off a strip)
    if (parallelWaterStats.ticks === before && !m.emitters.some((e) => e.depthLimit)) failures.push(`${name}: the threads never ran`);
  }
  for (const [path, diff] of diffs) if (diff) failures.push(`${name}, ${path}: ${diff}`);
  cases++;
  return app;
}

/** A generated map's model with a stored lake (a block of its settled water) and drained tiles (another). */
function withStoredWater(m: WaterModel, settled: CanonicalWater): WaterModel | null {
  const wet: number[] = [];
  for (let i = 0; i < m.W * m.H; i++) if (settled.depth[i] > 0.001) wet.push(i);
  if (wet.length < 40) return null;
  const lakeTiles = wet.slice(0, Math.floor(wet.length / 3));
  const lake: RetainedWater = {
    tiles: lakeTiles,
    floor: lakeTiles.map((i) => m.floor[i]),
    depth: lakeTiles.map((i) => settled.depth[i]),
    contamination: lakeTiles.map((i) => settled.contamination[i]),
  };
  const drained = wet.slice(Math.floor((2 * wet.length) / 3));
  return { ...m, retained: [lake], drained };
}

// 1. the golden water fixtures
interface Fixture {
  name: string;
  W: number;
  H: number;
  floor: number[];
  dam: number[] | null;
  emitters: Emitter[];
}
const golden = JSON.parse(strFromU8(gunzipSync(readFileSync("tests/golden/water.json.gz")))) as { fixtures: Fixture[] };
for (const f of golden.fixtures)
  for (const rules of ["game", "port"] as const)
    check(`golden ${f.name} (${rules} rules)`, { W: f.W, H: f.H, floor: Float64Array.from(f.floor), dam: f.dam ? Float64Array.from(f.dam) : null, emitters: f.emitters }, { rules });

/** A model tiled two by two (its emitters on each copy): a bigger map than the generator makes. */
function tiled(m: WaterModel): WaterModel {
  const W = 2 * m.W;
  const H = 2 * m.H;
  const floor = new Float64Array(W * H);
  const dam = m.dam ? new Float64Array(W * H) : null;
  const at = (i: number, tx: number, ty: number) => (ty * m.H + Math.floor(i / m.W)) * W + tx * m.W + (i % m.W);
  const emitters: Emitter[] = [];
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      for (let i = 0; i < m.W * m.H; i++) {
        floor[at(i, tx, ty)] = m.floor[i];
        if (dam) dam[at(i, tx, ty)] = m.dam![i];
      }
      for (const e of m.emitters)
        emitters.push({ ...e, cells: e.cells.map((i) => at(i, tx, ty)), ...(e.depthLimit ? { depthLimit: { ...e.depthLimit, anchor: at(e.depthLimit.anchor, tx, ty) } } : {}) });
    }
  return { W, H, floor, dam, emitters };
}

// 2. generated maps, and each again with stored water
for (const size of sizes)
  for (const theme of AVAILABLE_THEMES)
    for (let seed = s0; seed <= (size >= 256 ? s0 : s1); seed++) {
      if (size === 512 && theme !== AVAILABLE_THEMES[0]) continue;
      const m = size === 512 ? tiled(generate(makeSpec({ seed, size: { x: 256, y: 256 }, theme })).built.waterModel) : generate(makeSpec({ seed, size: { x: size, y: size }, theme })).built.waterModel;
      const name = `${theme} ${size}² seed ${seed}`;
      const settled = check(name, m);
      const stored = m.stacked ? null : withStoredWater(m, settled);
      if (stored) check(`${name} with a stored lake and drained tiles`, stored);
    }

if (threads) uninstallParallelWater();
if (stacked && !stackNative && process.argv.includes("--require-native")) failures.push("the native stack-fixture isn't built: cd rust && cargo build --release -p water --example stack-fixture");
console.log(`${cases} canonical settles (${stacked} stacked${stacked && !stackNative ? ", the native stack-fixture not built" : ""})${exe ? ", natively too" : " (native not built)"}${threads ? `, on ${threads} threads too (${parallelWaterStats.ticks} ticks)` : ""}: ${failures.length ? `${failures.length} differ` : "the same bytes every way"}`);
if (failures.length) {
  for (const f of failures.slice(0, 20)) console.error(f);
  process.exit(1);
}
