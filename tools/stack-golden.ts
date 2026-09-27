// The stacked water engine's golden fixtures (PLAN §20 D279: once the game agrees, the engine's
// results on our own maps are saved and CI checks them on every push). Each case is one of our own
// maps with terrain above terrain (the Probe's T1–T5, and two cave cases), built as the Probe's maps are
// (tools/terrain3d-maps.ts `build`: the support rule, the canonical stacked settle in game mode, soil
// per run in game mode); the fixture keeps the settle's result and a hash of every array the map file
// would hold, so any change to the engine's bits shows.
//
//   npx tsx tools/stack-golden.ts [--check]
//
// Writes tests/golden/terrain3d.json (tests/unit/stack-golden.test.ts reads it); --check writes
// nothing and fails when a case differs. Its `verified` field names the DGM Probe run whose records
// agreed with these results (null until the Terrain 3D batch has run).

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { blockObject } from "../src/core/format/entities";
import { build, OWNER, Scene, t1Support, t2Walking, t3CaveWater, t4Soil, t5Plants, type Terrain3dMap } from "./terrain3d-maps";

export const GOLDEN_FILE = "tests/golden/terrain3d.json";

export interface GoldenCase {
  name: string;
  size: [number, number];
  /** The most water columns and terrain runs of any tile. */
  levels: number;
  runs: number;
  settle: { settled: boolean; ticks: number } | null;
  /** The voxels the support rule deletes. */
  dropped: number;
  /** The first 16 hex digits of the sha256 of each array (little-endian float64). */
  hashes: { depth: string; overflow: string; contamination: string; moisture: string; soilContamination: string; dropped: string };
  /** A few numbers to read at a glance. */
  summary: { volume: number; wetColumns: number; roofedWetColumns: number; pressurised: number; moistRuns: number };
}

export interface GoldenFile {
  note: string;
  verified: string | null;
  cases: GoldenCase[];
}

const hash = (a: Float64Array | Int32Array) => createHash("sha256").update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest("hex").slice(0, 16);
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** The valley of the unit tests with a roof over its stream (5 wide, between two walls), a sealed cave
 *  with a source and a NaturalDam: open, roofed and pressurised water side by side. */
function caveValley(): Terrain3dMap {
  const W = 40;
  const H = 32;
  const s = new Scene(W, H, 0);
  const h = (x: number, y: number) => Math.min(12, 3 + Math.floor(Math.abs(y - H / 2) / 2) + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) + (x < 4 ? 2 : 0) - (x > W - 6 ? 1 : 0));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s.columns(x, y, x, y, h(x, y));
  s.columns(14, 13, 18, 13, 8).columns(14, 19, 18, 19, 8).box(14, 14, 18, 18, 6, 8);
  s.box(22, 1, 26, 3, 3, 6, false);
  s.source("valley stream", 2, H / 2, h(2, H / 2), 3).source("valley sealed cave", 24, 2, 3, 1);
  s.add(blockObject({ id: s.id("valley dam"), owner: OWNER, x: 30, y: H / 2, z: h(30, H / 2), template: "NaturalDam", orientation: "Cw0" }));
  return { id: "cave-valley", title: "cave valley", tests: "", scene: s, days: 1, snapshots: [], checks: [], focus: [], samples: [], water: "settled" };
}

/** A lake whose cave beside it stands full under the lake's head, and a sealed cave with no source. */
function lakeCave(): Terrain3dMap {
  const s = new Scene(30, 20, 10);
  s.columns(5, 5, 12, 14, 2).columns(13, 9, 29, 10, 6);
  s.box(13, 5, 16, 8, 2, 5, false);
  s.box(20, 2, 24, 5, 3, 6, false);
  s.source("lake", 8, 10, 2, 4);
  return { id: "lake-cave", title: "lake cave", tests: "", scene: s, days: 1, snapshots: [], checks: [], focus: [], samples: [], water: "settled" };
}

export function goldenCases(): GoldenCase[] {
  const maps = [t1Support(), t2Walking(), t3CaveWater(), t4Soil(), t5Plants(), caveValley(), lakeCave()];
  return maps.map((m) => {
    const b = build(m);
    const a = b.arrays;
    let volume = 0;
    let moistRuns = 0;
    for (let c = 0; c < a.depth.length; c++) volume += a.depth[c] + a.overflow[c];
    for (const v of a.moisture) if (v > 0) moistRuns++;
    const s = m.scene;
    return {
      name: m.id,
      size: [s.W, s.H],
      levels: a.depth.length / s.N,
      runs: a.moisture.length / s.N,
      settle: b.settled,
      dropped: b.dropped.length,
      hashes: { depth: hash(a.depth), overflow: hash(a.overflow), contamination: hash(a.contamination), moisture: hash(a.moisture), soilContamination: hash(a.soilContamination), dropped: hash(Int32Array.from(b.dropped)) },
      summary: { volume: round(volume), wetColumns: b.wetColumns, roofedWetColumns: b.roofedWetColumns, pressurised: b.pressurised, moistRuns },
    };
  });
}

export function readGolden(): GoldenFile | null {
  return existsSync(GOLDEN_FILE) ? (JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as GoldenFile) : null;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/stack-golden.ts")) {
  const cases = goldenCases();
  const old = readGolden();
  if (process.argv.includes("--check")) {
    let bad = 0;
    for (const c of cases) {
      const o = old?.cases.find((x) => x.name === c.name);
      const same = !!o && JSON.stringify(o) === JSON.stringify(c);
      if (!same) bad++;
      console.log(`${same ? "same" : "DIFFERS"}  ${c.name}`);
    }
    process.exit(bad ? 1 : 0);
  }
  const file: GoldenFile = {
    note: "The stacked water engine's results on our own maps with terrain above terrain (tools/stack-golden.ts; PLAN §20 D279). Regenerate with npx tsx tools/stack-golden.ts only when the engine is meant to change, and say why in the commit.",
    verified: old?.verified ?? null,
    cases,
  };
  writeFileSync(GOLDEN_FILE, JSON.stringify(file, null, 1) + "\n");
  for (const c of cases) console.log(`${c.name}: ${c.size.join("×")}, ${c.levels} levels, ${c.runs} runs; ${c.settle ? `settled ${c.settle.settled} in ${c.settle.ticks} ticks` : "no water"}; ${c.dropped} voxels deleted; volume ${c.summary.volume}, ${c.summary.wetColumns} wet columns (${c.summary.roofedWetColumns} roofed, ${c.summary.pressurised} pressurised), ${c.summary.moistRuns} moist runs`);
}
