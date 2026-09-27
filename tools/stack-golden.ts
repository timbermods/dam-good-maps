// The stacked water engine's golden fixtures (PLAN §20 D279: once the game agrees, the engine's
// results on our own maps are saved and CI checks them on every push). Each case is one of our own
// maps with terrain above terrain (the Probe's T1–T6, and two cave cases), built as the Probe's maps are
// (tools/terrain3d-maps.ts `build`: the support rule, the canonical stacked settle in game mode, soil
// per run in game mode); the fixture keeps the settle's result and a hash of every array the map file
// would hold, so any change to the engine's bits shows.
//
//   npx tsx tools/stack-golden.ts [--check]
//
// Writes tests/golden/terrain3d.json (tests/unit/stack-golden.test.ts reads it); --check writes
// nothing and fails when a case differs. `verified` records, per case, the DGM Probe run whose records
// agreed with the case's map (the Probe plays the same file) and what they confirmed: the terrain the
// game keeps, its water over the days played (from the file's water, this settle's), the soil on every
// run, the plants and the start. A verification holds only for the case it verified (its sha256): a
// changed case needs the batch again.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { blockObject } from "../src/core/format/entities";
import { build, OWNER, Scene, t1Support, t2Walking, t3CaveWater, t4Soil, t5Plants, t6Heights, type Terrain3dMap } from "./terrain3d-maps";

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

/** What a DGM Probe run confirmed about a case: the parts of the game's own records that agreed. It holds
 *  for the case as it was then (`caseSha256`, the sha256 of its JSON), built from the file the run played
 *  (`mapSha256`). */
export interface Verification {
  run: string;
  confirmed: ("terrain" | "water" | "soil" | "plants" | "start")[];
  note: string;
  mapSha256: string;
  caseSha256: string;
}

export interface GoldenFile {
  note: string;
  /** Per case name: the run that verified it, or absent (our own cave cases are not played). */
  verified: Record<string, Verification>;
  cases: GoldenCase[];
}

/** The sha256 of a case as the fixture holds it. */
export const caseSha256 = (c: GoldenCase): string => createHash("sha256").update(JSON.stringify(c)).digest("hex");

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

/** Every case with the sha256 of the map file its build writes (the file the Probe plays). */
async function builtCases(): Promise<{ golden: GoldenCase; mapSha256: string }[]> {
  const maps = [t1Support(), t2Walking(), t3CaveWater(), t4Soil(), t5Plants(), await t6Heights(), caveValley(), lakeCave()];
  return maps.map((m) => {
    const b = build(m);
    const a = b.arrays;
    let volume = 0;
    let moistRuns = 0;
    for (let c = 0; c < a.depth.length; c++) volume += a.depth[c] + a.overflow[c];
    for (const v of a.moisture) if (v > 0) moistRuns++;
    const s = m.scene;
    const golden: GoldenCase = {
      name: m.id,
      size: [s.W, s.H],
      levels: a.depth.length / s.N,
      runs: a.moisture.length / s.N,
      settle: b.settled,
      dropped: b.dropped.length,
      hashes: { depth: hash(a.depth), overflow: hash(a.overflow), contamination: hash(a.contamination), moisture: hash(a.moisture), soilContamination: hash(a.soilContamination), dropped: hash(Int32Array.from(b.dropped)) },
      summary: { volume: round(volume), wetColumns: b.wetColumns, roofedWetColumns: b.roofedWetColumns, pressurised: b.pressurised, moistRuns },
    };
    return { golden, mapSha256: createHash("sha256").update(b.bytes).digest("hex") };
  });
}

export async function goldenCases(): Promise<GoldenCase[]> {
  return (await builtCases()).map((b) => b.golden);
}

export function readGolden(): GoldenFile | null {
  return existsSync(GOLDEN_FILE) ? (JSON.parse(readFileSync(GOLDEN_FILE, "utf8")) as GoldenFile) : null;
}

/** Run terrain3d-20260927 (DGM Probe 0.3.0, with Kyler's installed mods): what it confirmed per map, and the
 *  sha256 of the file it played (C:\dgm-probe\maps\terrain3d-20260927). */
const RUN_20260927: Record<string, Omit<Verification, "caseSha256">> = {
  "t1-support": { run: "terrain3d-20260927", confirmed: ["terrain"], note: "the game deleted exactly the rule's 24 voxels (its log names them; its terrain from the first tick on is the rule's, run for run)", mapSha256: "be37e7a3ec60a6032e1db2483bc51d45feb8fcc9a6268eb9c2d37c8b668dffe4" },
  "t2-walking": { run: "terrain3d-20260927", confirmed: ["terrain"], note: "no voxel deleted, every run kept; its water and soil were not compared (walking needs beavers)", mapSha256: "71e7a7aa2aa56b652041e2e1d2abac8e6b06f0c6ee21363ceb3030f7dc941ef8" },
  "t3-cave-water": { run: "terrain3d-20260927", confirmed: ["terrain", "water", "soil"], note: "after 1, 3 and 3.18 days from the file's water: every wet column within 0.002 of the engine's, the same 44 columns under pressure, soil on all 4,194 runs as ours", mapSha256: "34b56c24492a555b6a5b6faa2a5748311f5f5f6ede4c619649daf6661591c7fa" },
  "t4-soil": { run: "terrain3d-20260927", confirmed: ["terrain", "water", "soil"], note: "after 0.5 and 1 day: water exactly the engine's (198 columns under pressure), soil on all 3,301 runs as ours", mapSha256: "d8b3e405b35416fc199d1f04a0cfa38cbc296e79c6dc55a71210c93cee15e285" },
  "t5-plants": { run: "terrain3d-20260927", confirmed: ["terrain", "plants", "start"], note: "the 5 plants our clearance rule removes were removed, the other 10 loaded and lived; the start under its roof placed; its water and soil were not compared", mapSha256: "9f5239c1e3a57b7a39543db0ef5c4caff099b8bcbd0d0300c95d569d559dba9f" },
  "t6-heights": { run: "terrain3d-20260927", confirmed: ["terrain", "water"], note: "at 256² to 22: after 0.5, 1 and 1.48 days every wet column within 0.1 of the engine's (the largest difference 0.034), wet IoU 0.999–1.000; its soil was not compared", mapSha256: "30824492208b9c47c0e35c4fb4cceb1f8b505b8c78f4abb2858a433c994c8a51" },
};

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tools/stack-golden.ts")) {
  void (async () => {
    const built = await builtCases();
    const cases = built.map((b) => b.golden);
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
    // a case keeps its verification only while it is the case the run verified; a run's own entry
    // applies when the map built now is the very file it played
    const verified: Record<string, Verification> = {};
    for (const { golden: c, mapSha256 } of built) {
      const sha = caseSha256(c);
      const kept = old?.verified?.[c.name];
      const seed = RUN_20260927[c.name];
      if (kept && kept.caseSha256 === sha) verified[c.name] = kept;
      else if (seed && seed.mapSha256 === mapSha256) verified[c.name] = { ...seed, caseSha256: sha };
      else if (kept || seed) console.log(`${c.name} changed since ${(kept ?? seed)!.run} verified it: run the Terrain 3D batch again`);
    }
    const file: GoldenFile = {
      note: "The stacked water engine's results on our own maps with terrain above terrain (tools/stack-golden.ts; PLAN §20 D279). Regenerate with npx tsx tools/stack-golden.ts only when the engine is meant to change, and say why in the commit.",
      verified,
      cases,
    };
    writeFileSync(GOLDEN_FILE, JSON.stringify(file, null, 1) + "\n");
    for (const c of cases) console.log(`${c.name}: ${c.size.join("×")}, ${c.levels} levels, ${c.runs} runs; ${c.settle ? `settled ${c.settle.settled} in ${c.settle.ticks} ticks` : "no water"}; ${c.dropped} voxels deleted; volume ${c.summary.volume}, ${c.summary.wetColumns} wet columns (${c.summary.roofedWetColumns} roofed, ${c.summary.pressurised} pressurised), ${c.summary.moistRuns} moist runs${verified[c.name] ? `; verified by ${verified[c.name].run} (${verified[c.name].confirmed.join(", ")})` : ""}`);
  })();
}
