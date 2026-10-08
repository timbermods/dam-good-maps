// The DGM Probe's test maps for terrain above terrain (investigation/terrain3d/DESIGN.md §8; PLAN §20 D127, D279,
// D481), by hand: the same writer the runner calls before it plans `--group "Terrain 3D"`
// (tools/probe-maps/terrain3d.ts). Writes <id>.timber for T3–T7 and terrain3d.json (what each map tests, its
// sha256, its checks, the tiles the probe samples, the places its poses look at, and what our models predict),
// rewriting only the maps whose bytes changed.
//
//   npx tsx tools/probe-3d.ts [--out C:\dgm-probe\terrain3d-2] [--check]
//
// --check writes nothing and fails when a file on disk differs from a fresh build. The files the game played in
// September (runs terrain3d-20260927 and -20260929) stay in C:\dgm-probe\terrain3d: this never writes there by
// default. Nothing here launches Timberborn.
//
// The maps (tools/terrain3d-maps.ts):
// - T3 cave water: a spring cave with a pool and a tunnel to the map edge, a sealed cave with a source, a
//   U-shaped passage full of water between two basins (a siphon), an underground river through a hill.
// - T4 soil: a full cave under roofs 1, 2 and 3 thick, and a stream through a tunnel.
// - T5 plants and objects: pines, birches and bushes under roofs 1, 2 and 3 above them, and the start
//   under a roof at z + 5.
// - T6 heights: the investigation's high-verticality landscape at 256² (relief 3–22).
// - T7 sinks: a source and a weaker sink in a sealed cave, a cave its sink keeps from filling, and the pair in
//   the open (the sink under a roof is from the game's code, not yet played).
// T1 (support) and T2 (walking) hold no water and are still the bytes the game played; their scenes are in
// tools/terrain3d-maps.ts and pinned by tests/golden/stacked-water.json.

import { describeWrite, writeGroup } from "./probe-maps/group";
import { TERRAIN3D_WRITER } from "./probe-maps/terrain3d";

const i = process.argv.indexOf("--out");
const dir = i >= 0 ? process.argv[i + 1] : undefined;
const check = process.argv.includes("--check");
let g;
try {
  g = writeGroup(TERRAIN3D_WRITER, { dir, check, log: (l) => console.log(l) });
} catch (e) {
  console.error(`FAIL ${(e as Error).message}`);
  process.exit(1);
}
for (const l of describeWrite(g)) console.log(l);
if (check && g.files.some((f) => f.status !== "current")) {
  console.error("DIFFERS: the files on disk are not what this checkout builds");
  process.exitCode = 1;
}
