// The Rust analysis' WebAssembly binding (PLAN §20 D381, D391; #157): rust/analysis, compiled with strict
// floating point and embedded in ./analysisWasm.ts by tools/rust/build.ts, so nothing is fetched and the core
// stays headless (Node, workers and every engine run the same module). Six kernels run in Rust everywhere
// (D391's fixed policy): `distanceFrom`, `walkDistance`, `landRegions`, `spillLevels`, `damSites` and
// `roomMap`, the same bytes as the TypeScript they replaced (tag `ts-analysis-final`). Their exports keep
// their signatures and call `analyze`. The outcomes and M9b's descriptive rows keep a TypeScript
// `distanceFrom` (math/grid.ts `distanceFromInTs`).
//
// One call is one kernel: its frame (the kernel, W, H, its numbers, its arrays, all binary64) is written
// straight into the module's memory, and the result is copied out before it is freed.
//
// Format: rust/analysis/src/lib.rs (`execute`).

import { ANALYSIS_WASM } from "./analysisWasm";

interface Exports {
  memory: WebAssembly.Memory;
  analysis_alloc(n: number): number;
  analysis_free(ptr: number, n: number): void;
  analysis_execute(ptr: number, n: number, outLen: number): number;
}

let module: Exports | null = null;

/** The instantiated module, compiled once per thread on first use. */
function rustAnalysis(): Exports {
  if (!module) {
    const text = atob(ANALYSIS_WASM);
    const bytes = new Uint8Array(text.length);
    for (let k = 0; k < text.length; k++) bytes[k] = text.charCodeAt(k);
    module = new WebAssembly.Instance(new WebAssembly.Module(bytes), {}).exports as unknown as Exports;
  }
  return module;
}

/** Each kernel's number in the frame (rust/analysis/src/lib.rs). */
export const KERNELS = { distanceFrom: 1, walkDistance: 2, landRegions: 4, spillLevels: 7, damSites: 8, roomMap: 9 } as const;
export type Kernel = keyof typeof KERNELS;

/** A kernel's frame: [kernel, W, H, number of parameters, parameters…, number of arrays, (length, values…)
 *  per array]. */
export function frame(kernel: Kernel, W: number, H: number, params: readonly number[], arrays: readonly ArrayLike<number>[]): Float64Array {
  let n = 5 + params.length + arrays.length;
  for (const a of arrays) n += a.length;
  const out = new Float64Array(n);
  writeFrame(out, kernel, W, H, params, arrays);
  return out;
}

function writeFrame(out: Float64Array, kernel: Kernel, W: number, H: number, params: readonly number[], arrays: readonly ArrayLike<number>[]): void {
  let at = 0;
  out[at++] = KERNELS[kernel];
  out[at++] = W;
  out[at++] = H;
  out[at++] = params.length;
  for (const p of params) out[at++] = p;
  out[at++] = arrays.length;
  for (const a of arrays) {
    out[at++] = a.length;
    out.set(a, at);
    at += a.length;
  }
}

/** Runs one kernel in Rust; its result, owned by JavaScript. */
export function analyze(kernel: Kernel, W: number, H: number, params: readonly number[], arrays: readonly ArrayLike<number>[]): Float64Array {
  const x = rustAnalysis();
  let n = 5 + params.length + arrays.length;
  for (const a of arrays) n += a.length;
  const ptr = x.analysis_alloc(n);
  const lenPtr = x.analysis_alloc(1);
  let res = 0;
  let len = 0;
  try {
    writeFrame(new Float64Array(x.memory.buffer, ptr, n), kernel, W, H, params, arrays);
    res = x.analysis_execute(ptr, n, lenPtr);
    // (fresh views: the call may have grown the memory)
    len = new Uint32Array(x.memory.buffer, lenPtr, 1)[0];
    return new Float64Array(x.memory.buffer, res, len).slice();
  } finally {
    if (res) x.analysis_free(res, len);
    x.analysis_free(lenPtr, 1);
    x.analysis_free(ptr, n);
  }
}

/** A frame run in Rust (the identity check's: tools/rust/analysis-jobs.ts). */
export function executeInRust(input: Float64Array): Float64Array {
  const x = rustAnalysis();
  const ptr = x.analysis_alloc(input.length);
  const lenPtr = x.analysis_alloc(1);
  let res = 0;
  let len = 0;
  try {
    new Float64Array(x.memory.buffer, ptr, input.length).set(input);
    res = x.analysis_execute(ptr, input.length, lenPtr);
    len = new Uint32Array(x.memory.buffer, lenPtr, 1)[0];
    return new Float64Array(x.memory.buffer, res, len).slice();
  } finally {
    if (res) x.analysis_free(res, len);
    x.analysis_free(lenPtr, 1);
    x.analysis_free(ptr, input.length);
  }
}
