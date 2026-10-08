// The DGM Probe's Terrain 3D group's writer (PLAN §20 D127, D279, D481): the test maps for terrain above terrain
// that the game has not played as dev writes them now. T3–T6 (tools/terrain3d-maps.ts; played in September with
// seven-digit water tokens, written since with nine) and T7, the sink map, whose rule under a roof is from the
// game's code and not yet played. T1 and T2 hold no water and are the bytes the game played: they are not rewritten.
//
// The maps go to C:\dgm-probe\terrain3d-2 (DGM_PROBE_TERRAIN3D moves it), never C:\dgm-probe\terrain3d, which keeps
// the files runs terrain3d-20260927 and terrain3d-20260929 played. The runner calls this before it plans
// `--group "Terrain 3D"`; tools/probe-3d.ts runs it by hand.
//
// The edited Hollows and Canyon (imported caves with simulated water, Foundations' stage 6): each official map
// imported, given one small edit and exported by the app, so its water on every column and its soil on every run
// are the app's own. The official maps are not in the repository (investigation/raw/builtin, gitignored): where
// they are missing the writer says so in one line and leaves the two out.

import { existsSync, readFileSync } from "node:fs";
import { gen3d } from "../../investigation/terrain3d/proto/gen3d";
import { MapSession } from "../../src/core/doc/session";
import { unsupportedVoxels } from "../../src/core/terrain/support";
import { GAME_VERSION } from "../../src/core/format/world";
import { build, checkPlacements, CLEARANCE, stackableTops, t3CaveWater, t4Soil, t5Plants, t6HeightsFrom, t7Sink, type Terrain3dMap } from "../terrain3d-maps";
import { repoFile, type BuiltMap, type GroupWriter } from "./group";

const MAKERS: (() => Terrain3dMap)[] = [t3CaveWater, t4Soil, t5Plants, () => t6HeightsFrom(gen3d), t7Sink];

/** An official map with caves, edited: its id, its file and what the probe looks at. */
const EDITED = [
  { id: "hollows-edited", file: "Hollows.timber", name: "Hollows" },
  { id: "canyon-edited", file: "Canyon.timber", name: "Canyon" },
] as const;

/** An official cave map imported, edited once (its first three plain tiles in a row below level 15, raised by
 *  one: tools/import-hashes.ts makes the same edit) and exported: the whole map's water is then the stacked
 *  engine's canonical settle, under its roofs too, and its soil is per run. Null when the map is not on this
 *  machine. */
function editedImport(m: (typeof EDITED)[number], log?: (line: string) => void): BuiltMap | null {
  const path = repoFile("investigation", "raw", "builtin", m.file);
  if (!existsSync(path)) {
    log?.(`${m.id}: ${m.file} is not on this machine (investigation/raw/builtin): left out`);
    return null;
  }
  const s = MapSession.importMap(new Uint8Array(readFileSync(path)), m.file);
  const { x: W, y: H } = s.size;
  const N = W * H;
  const h = s.built.heights.slice();
  const caves = s.columns;
  let at = -1;
  for (let i = 0; i + 2 < N && at < 0; i++) if (i % W < W - 2 && [i, i + 1, i + 2].every((j) => !caves.has(j) && h[j] > 0 && h[j] < 15)) at = i;
  const ex = at % W;
  const ey = Math.floor(at / W);
  const r = at < 0 ? { ok: false, errors: ["no plain tiles to edit"] } : s.apply({ op: "sculpt", params: { mode: "raise", cells: [[ey, ex, ex + 2]], amount: 1 } });
  if (!r.ok) throw new Error(`${m.id}: ${r.errors[0]}`);
  const bytes = s.exportTimber().bytes;
  const st = s.built.settle.stack;
  if (!st) throw new Error(`${m.id}: the edited map has no water on stacked columns`);
  // what the game does to the file on load, by our rules: the voxels it deletes, the plants that do not fit
  const terrain = s.terrain;
  const falls = unsupportedVoxels(terrain, stackableTops(W, H, s.built.entities));
  const dropped: number[] = [];
  const kept = terrain.mask.slice();
  for (let c = 0; c < falls.length; c++)
    if (falls[c]) {
      dropped.push(c);
      kept[c % N] &= ~(1 << Math.floor(c / N));
    }
  const plantsRemoved: { id: string; template: string; x: number; y: number; z: number; air: number }[] = [];
  for (const e of s.built.entities) {
    const need = CLEARANCE[e.template];
    if (need === undefined || e.x < 0 || e.y < 0 || e.x >= W || e.y >= H) continue;
    let air = 0;
    while (e.z + air < 23 && !(kept[e.y * W + e.x] & (1 << (e.z + air)))) air++;
    if (air < need) plantsRemoved.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, air });
  }
  let wetColumns = 0;
  let roofedWetColumns = 0;
  let pressurised = 0;
  const roofedWet: [number, number, number][] = [];
  for (let c = 0; c < st.depth.length; c++) {
    if (st.depth[c] > 0.05) {
      wetColumns++;
      if (st.ceil[c] < 34) {
        roofedWetColumns++;
        roofedWet.push([c % W, Math.floor((c % N) / W), st.floor[c]]);
      }
    }
    if (st.overflow[c] > 0.001) pressurised++;
  }
  // looked at: the edit, and water under a roof (the first, the middle and the last of them)
  const pick = roofedWet.length ? [roofedWet[0], roofedWet[roofedWet.length >> 1], roofedWet[roofedWet.length - 1]] : [];
  let maxHeight = 0;
  for (let i = 0; i < N; i++) maxHeight = Math.max(maxHeight, s.built.heights[i]);
  log?.(
    `${m.id}.timber: ${m.name} edited at (${ex}, ${ey}); ${caves.size} layered tiles; the rule deletes ${dropped.length} voxels; ${plantsRemoved.length} plants do not fit; ${wetColumns} wet columns (${roofedWetColumns} roofed, ${pressurised} pressurised); settled ${s.built.settle.settled} in ${s.built.settle.ticks} ticks`,
  );
  return {
    file: `${m.id}.timber`,
    bytes,
    size: [W, H],
    entry: {
      id: m.id,
      title: `${m.name}, edited · an imported map's caves with simulated water`,
      tests: `The official map ${m.name} imported, three tiles raised by one at (${ex}, ${ey}) and exported: its water on every column, under its roofs too, is the stacked engine's canonical settle, and its soil is per run top. The game must load it with no issue and every voxel kept; its water after a day against the engine's from the same start, and its soil on every run.`,
      days: 1.2,
      snapshots: [1],
      checks: ["t3d-load", "t3d-support", "t3d-objects", "t3d-water", "t3d-soil", "t3d-shots"],
      focus: [{ id: "edit", x: ex + 1, y: ey, z: h[at] + 1 }, ...pick.map(([x, y, z], k) => ({ id: `roofed-${k + 1}`, x, y, z, side: true }))],
      samples: [[ex + 1, ey], ...pick.map(([x, y]) => [x, y])],
      maxHeight,
      layeredTiles: caves.size,
      predicted: { dropped: dropped.length, droppedCells: dropped.slice(0, 500), plantsRemoved, wetColumns, roofedWetColumns, pressurised, settled: { settled: s.built.settle.settled, ticks: s.built.settle.ticks } },
    },
  };
}

export const TERRAIN3D_WRITER: GroupWriter = {
  group: "Terrain 3D",
  ids: ["t3-cave-water", "t4-soil", "t5-plants", "t6-heights", "t7-sink", ...EDITED.map((m) => m.id)],
  tool: "tools/probe-3d.ts",
  folder: "terrain3d-2",
  env: "DGM_PROBE_TERRAIN3D",
  manifest: "terrain3d.json",
  build(log) {
    const maps: BuiltMap[] = [];
    for (const make of MAKERS) {
      const m = make();
      const problems = checkPlacements(m);
      if (problems.length) throw new Error(`${m.id}: ${problems.slice(0, 5).join("; ")}`);
      const b = build(m);
      const s = m.scene;
      log?.(
        `${m.id}.timber: up to ${b.maxHeight}, ${b.layeredTiles} layered tiles; the rule deletes ${b.dropped.length} voxels; ${b.plantsRemoved.length} plants do not fit; ${b.wetColumns} wet columns (${b.roofedWetColumns} roofed, ${b.pressurised} pressurised)${b.settled ? `; settled ${b.settled.settled} in ${b.settled.ticks} ticks` : ""}`,
      );
      maps.push({
        file: `${m.id}.timber`,
        bytes: b.bytes,
        size: [s.W, s.H],
        entry: {
          id: m.id,
          title: m.title,
          tests: m.tests,
          days: m.days,
          snapshots: m.snapshots,
          checks: m.checks,
          focus: m.focus,
          samples: m.samples,
          maxHeight: b.maxHeight,
          layeredTiles: b.layeredTiles,
          predicted: { dropped: b.dropped.length, droppedCells: b.dropped.slice(0, 500), plantsRemoved: b.plantsRemoved, wetColumns: b.wetColumns, roofedWetColumns: b.roofedWetColumns, pressurised: b.pressurised, settled: b.settled },
        },
      });
    }
    for (const m of EDITED) {
      const b = editedImport(m, log);
      if (b) maps.push(b);
    }
    return { maps, manifest: { format: 2, tool: "tools/probe-3d.ts", gameVersion: GAME_VERSION } };
  },
};
