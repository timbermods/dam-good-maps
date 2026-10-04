// The native Rust water for batch jobs (PLAN §20 D381, D442): `useNativeWater()` makes every canonical settle
// in this process (generation, the checks, the measures) run its settle in the native binary
// rust/target/release/water-batch (tools/batch.ts --native). Build it with `npx tsx tools/rust/build.ts
// --native`. When it isn't built, the batch says so once and keeps the settle it has. Opt-in until the Rust
// water is switched on, after M9b (waterRust.ts); tools/rust/water-identity.ts compares it with the app's.
//
// Each settle runs the binary once (spawnSync), so the settle stays a plain synchronous function call; the
// start-up is small beside a settle.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { setCanonicalBackend, type CanonicalWater } from "../../src/core/sim/prefill";
import { decodeCanonical, encodeCanonicalJob } from "../../src/core/sim/rustWater";
import type { WaterModel, WaterState } from "../../src/core/sim/water";

const ROOT = resolve(import.meta.dirname, "../..");

/** The native binary's path, or null when it isn't built. */
export function nativeWaterBinary(): string | null {
  const exe = join(ROOT, "rust/target/release", process.platform === "win32" ? "water-batch.exe" : "water-batch");
  return existsSync(exe) ? exe : null;
}

/** One canonical settle job in the native binary. */
export function nativeCanonical(exe: string, m: WaterModel, start: WaterState): CanonicalWater {
  const job = encodeCanonicalJob(m, start.depth, start.contamination);
  const framed = new Uint8Array(4 + job.length);
  new DataView(framed.buffer).setUint32(0, job.length, true);
  framed.set(job, 4);
  const r = spawnSync(exe, [], { input: framed, maxBuffer: 1 << 30, windowsHide: true });
  if (r.status !== 0 || !r.stdout) throw new Error(`the native water failed (${r.status}): ${r.stderr?.toString().trim()}`);
  const out = new Uint8Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength);
  const len = new DataView(out.buffer, out.byteOffset, out.byteLength).getUint32(0, true);
  return decodeCanonical(out.subarray(4, 4 + len), m.W * m.H);
}

/** Runs this process's canonical settles natively; false (and a note) when the binary isn't built. */
export function useNativeWater(log: (s: string) => void = (s) => console.error(s)): boolean {
  const exe = nativeWaterBinary();
  if (!exe) {
    log("native water: not built (npx tsx tools/rust/build.ts --native); the settle runs here");
    return false;
  }
  setCanonicalBackend((m, start) => nativeCanonical(exe, m, start));
  return true;
}
