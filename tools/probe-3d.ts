// The DGM Probe's test maps for terrain above terrain, T1–T7 (investigation/terrain3d/DESIGN.md §8;
// PLAN §20 D127, D279): small deterministic maps, each built round what it tests, with the 3D
// foundations' own modules (the stacked water's canonical settle, soil per run, the multi-slot writer,
// the support rule), for a probe batch the milestone session runs (never launched from here).
//
//   npx tsx tools/probe-3d.ts [--out .scratch/terrain3d] [--check] [--only t3-cave-water]
//
// The files the game played (probe runs terrain3d-20260927 and -20260929) are in C:\dgm-probe\terrain3d:
// `--out C:\dgm-probe\terrain3d --check` compares a fresh build with them and writes nothing. A file
// that differs there has not been played: it needs the Terrain 3D batch again (asked under D117).
//
// Writes <id>.timber for every map and terrain3d.json: what each map tests, its sha256, its checks, the
// tiles the probe samples and the places its poses look at, and what our models predict (the voxels the
// support rule deletes, the plants that do not fit under their roof, the pressurised columns). The
// runner (investigation/probe/runner/terrain3d.ts) derives every other expectation from the file itself.
// --check writes nothing and fails when a file on disk differs from a fresh build.
//
// The maps (DESIGN.md §8):
// - T1 support: ledges 3 and 4 out of a wall, flat roofs over 6 and 7, a corbelled bridge, faces leaning
//   3 and 4 a level, undercuts 3 and 4 deep: the game deletes exactly the voxels the rule predicts.
// - T2 walking: tunnels 1 and 2 high through a ridge, a slope under a roof at z + 2, a ledge path.
// - T3 cave water: a spring cave with a pool and a tunnel to the map edge, a sealed cave with a source, a
//   U-shaped passage full of water between two basins (a siphon), an underground river through a hill.
// - T4 soil: a full cave under roofs 1, 2 and 3 thick, and a stream through a tunnel.
// - T5 plants and objects: pines, birches and bushes under roofs 1, 2 and 3 above them, and the start
//   under a roof at z + 5.
// - T6 heights: the investigation's high-verticality landscape at 256² (relief 3–22).
// - T7 sinks: a source and a weaker sink in a sealed cave, a cave its sink keeps from filling, and the pair in
//   the open (the sink under a roof is from the game's code, not yet played).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build, checkPlacements, TERRAIN3D_MAPS } from "./terrain3d-maps";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// ------------------------------------------------------------------------------------------ main

async function main(): Promise<void> {
  const out = arg("out", process.env.DGM_PROBE_TERRAIN3D ?? ".scratch/terrain3d");
  const check = process.argv.includes("--check");
  const only = arg("only", "");
  const makers = TERRAIN3D_MAPS;
  const entries: Record<string, unknown>[] = [];
  let failed = 0;
  if (!check) mkdirSync(out, { recursive: true });
  for (const make of makers) {
    const m = await make();
    if (only && m.id !== only) continue;
    const t0 = performance.now();
    const problems = checkPlacements(m);
    if (problems.length) {
      console.log(`FAIL ${m.id}: ${problems.slice(0, 5).join("; ")}`);
      failed++;
      continue;
    }
    const b = build(m);
    const file = `${m.id}.timber`;
    const sha256 = createHash("sha256").update(b.bytes).digest("hex");
    const path = join(out, file);
    if (check) {
      const same = existsSync(path) && createHash("sha256").update(readFileSync(path)).digest("hex") === sha256;
      if (!same) failed++;
      console.log(`${same ? "same" : "DIFFERS"}  ${m.id}`);
    } else writeFileSync(path, b.bytes);
    const s = m.scene;
    entries.push({
      id: m.id,
      title: m.title,
      tests: m.tests,
      file,
      sha256,
      size: [s.W, s.H],
      days: m.days,
      snapshots: m.snapshots,
      checks: m.checks,
      focus: m.focus,
      samples: m.samples,
      maxHeight: b.maxHeight,
      layeredTiles: b.layeredTiles,
      predicted: { dropped: b.dropped.length, droppedCells: b.dropped.slice(0, 500), plantsRemoved: b.plantsRemoved, wetColumns: b.wetColumns, roofedWetColumns: b.roofedWetColumns, pressurised: b.pressurised, settle: b.settled },
    });
    console.log(
      `${m.id}: ${s.W}×${s.H}, up to ${b.maxHeight}, ${b.layeredTiles} layered tiles; the rule deletes ${b.dropped.length} voxels; ${b.plantsRemoved.length} plants do not fit; ${b.wetColumns} wet columns (${b.roofedWetColumns} roofed, ${b.pressurised} pressurised)${b.settled ? `; settled ${b.settled.settled} in ${b.settled.ticks} ticks` : ""} (${((performance.now() - t0) / 1000).toFixed(1)} s)`,
    );
  }
  if (!check && !only) writeFileSync(join(out, "terrain3d.json"), JSON.stringify({ maps: entries }, null, 1) + "\n");
  if (failed) process.exit(1);
}

void main();
