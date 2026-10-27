// The Rust analysis' byte fixtures (PLAN §20 D366, D381, D391): fixed frames for each of the six kernels
// (src/core/analysis/rust/bridge.ts) on ground that never changes with the generator: the golden water
// fixtures (tests/golden/water.json.gz, with their settled water), the forces' studies
// (tests/contract/forceFixtures.ts) and random ground of odd shapes, from one tile up. tools/rust/check.ts
// runs them natively, in Node's WebAssembly and in each engine, and checks every result against
// tools/rust/analysis-pins.json: the sha256s pinned when the TypeScript kernels (tag `ts-analysis-final`)
// gave the same results, so a change to a kernel shows here.
//
//   npx tsx tools/rust/check.ts                                         checks them (CI's rust job)
//   npx tsx tools/rust/analysis-jobs.ts > tools/rust/analysis-pins.json   pins the current Rust (a deliberate change)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { executeInRust, frame } from "../../src/core/analysis/rust/bridge";
import { distanceFromInTs } from "../../src/core/math/grid";
import { fixture } from "../../tests/contract/forceFixtures";

const ROOT = resolve(import.meta.dirname, "../..");

/** One kernel's frame, by name. */
export interface AnalysisJob {
  name: string;
  frame: Float64Array;
}

interface Ground {
  name: string;
  W: number;
  H: number;
  /** Whole levels. */
  h: Uint8Array;
  /** Water standing on each tile. */
  depth: Float64Array;
  dam: Float64Array | null;
  emitters: number[];
}

/** A seeded xorshift in [0, 1). */
function random(seed: number): () => number {
  let state = (seed * 2654435761) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function grounds(): Ground[] {
  const out: Ground[] = [];
  const golden = JSON.parse(gunzipSync(readFileSync(join(ROOT, "tests/golden/water.json.gz"))).toString("utf8")) as {
    fixtures: { name: string; W: number; H: number; floor: number[]; dam: number[] | null; emitters: { cells: number[] }[]; canonical: { depth: number[] } }[];
  };
  for (const f of golden.fixtures)
    out.push({
      name: `golden ${f.name}`,
      W: f.W,
      H: f.H,
      h: Uint8Array.from(f.floor, (v) => Math.round(v)),
      depth: Float64Array.from(f.canonical.depth),
      dam: f.dam ? Float64Array.from(f.dam) : null,
      emitters: f.emitters.flatMap((e) => e.cells),
    });
  for (const kind of ["river", "slide", "lake", "plain"] as const)
    for (const n of [48, 96]) {
      const m = fixture(kind, n);
      const emitters: number[] = [];
      for (let i = 0; i < n * n; i++) if (m.water.depth[i] > 0 && (i % n === 0 || i < n)) emitters.push(i);
      out.push({ name: `study ${kind} ${n}²`, W: n, H: n, h: m.heights, depth: m.water.depth, dam: null, emitters });
    }
  // random ground: level plateaus, a few pits and ponds, odd shapes
  for (const [k, W, H] of [[1, 1, 1], [2, 3, 1], [3, 1, 5], [4, 7, 3], [5, 12, 12], [6, 40, 25], [7, 25, 40], [8, 64, 48], [9, 96, 96], [10, 128, 80]]) {
    const u = random(k);
    const N = W * H;
    const h = new Uint8Array(N);
    const depth = new Float64Array(N);
    const dam = new Float64Array(N).fill(-1);
    const cell = 4 + Math.floor(u() * 8);
    const levels = Array.from({ length: Math.ceil(W / cell) * Math.ceil(H / cell) }, () => 2 + Math.floor(u() * 6));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        h[i] = levels[Math.floor(y / cell) * Math.ceil(W / cell) + Math.floor(x / cell)];
        if (u() < 0.03) h[i] = Math.max(0, h[i] - 1 - Math.floor(u() * 3));
        if (u() < 0.08) depth[i] = u() < 0.3 ? 0.05 : u() * 2;
        if (u() < 0.01) dam[i] = Math.floor(u() * 3);
      }
    const emitters: number[] = [];
    for (let i = 0; i < N; i++) if (u() < 0.02) emitters.push(i);
    out.push({ name: `random ${k} ${W}×${H}`, W, H, h, depth, dam, emitters });
  }
  return out;
}

/** Every fixture's frame, in a fixed order. */
export function analysisFixtures(): AnalysisJob[] {
  const jobs: AnalysisJob[] = [];
  for (const g of grounds()) {
    const { W, H, h, depth } = g;
    const N = W * H;
    const wet = Uint8Array.from(depth, (d) => (d > 0.05 ? 1 : 0));
    const emitting = new Uint8Array(N);
    for (const i of g.emitters) emitting[i] = 1;
    const sx = Math.floor(W * 0.3);
    const sy = Math.floor(H * 0.6);
    const start = new Uint8Array(N);
    for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H) start[y * W + x] = 1;
    // slope links: every 23rd tile to the one north of it, where both are on the map
    const links: number[] = [];
    for (let i = 0; i + W < N; i += 23) links.push(i, i + W);
    const blocked = Uint8Array.from({ length: N }, (_, i) => (wet[i] || i % 41 === 7 ? 1 : 0));
    const add = (name: string, f: Float64Array) => jobs.push({ name: `${g.name}: ${name}`, frame: f });

    add("distance from the water", frame("distanceFrom", W, H, [], [wet]));
    add("distance from the start", frame("distanceFrom", W, H, [], [start]));
    add("distance from nothing", frame("distanceFrom", W, H, [], [new Uint8Array(N)]));
    add("walk", frame("walkDistance", W, H, [sx, sy, 64], [h, blocked, links]));
    add("walk, no links, far", frame("walkDistance", W, H, [sx, sy, 4 * (W + H)], [h, new Uint8Array(N), []]));
    add("walk from a corner", frame("walkDistance", W, H, [0, 0, 20], [h, new Uint8Array(N), links]));
    add("land", frame("landRegions", W, H, [], [h, wet]));
    add("land, all dry", frame("landRegions", W, H, [], [h, new Uint8Array(N)]));
    add("spill", frame("spillLevels", W, H, [], [h, g.dam ?? new Float64Array(N).fill(-1), emitting]));
    add("spill, no emitters", frame("spillLevels", W, H, [], [h, new Float64Array(N).fill(-1), new Uint8Array(N)]));
    const surface = Float64Array.from(h, (v, i) => v + depth[i]);
    const channel = Uint8Array.from(depth, (d) => (d > 0 ? 1 : 0));
    const startDist = distanceFromInTs(start, W, H);
    add("dams", frame("damSites", W, H, [60, 2, 30, 0], [h, channel, surface, startDist, [1, 2, 3]]));
    add("dams, any distance, deep", frame("damSites", W, H, [Infinity, 1, 1, 0.5], [h, channel, surface, [], [1, 2, 3, 4]]));
    for (const [want, lo, firm] of [[1, 8, 0], [2, 12, 2], [3, 6, 2], [2, 30.5, 0]])
      add(`room for ${want}, ${lo} out, firm ${firm}`, frame("roomMap", W, H, [want, lo, firm], [h, depth, blocked]));
  }
  return jobs;
}

export const sha256 = (v: Float64Array): string => createHash("sha256").update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)).digest("hex");

// pins: every fixture's sha256 in the current Rust
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const pins: Record<string, string> = {};
  for (const j of analysisFixtures()) pins[j.name] = sha256(executeInRust(j.frame));
  console.log(JSON.stringify(pins, null, 2));
}
