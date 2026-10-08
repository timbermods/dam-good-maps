// The DGM Probe's Terrain 3D group's writer (PLAN §20 D127, D279, D481): the test maps for terrain above terrain
// that the game has not played as dev writes them now. T3–T6 (tools/terrain3d-maps.ts; played in September with
// seven-digit water tokens, written since with nine) and T7, the sink map, whose rule under a roof is from the
// game's code and not yet played. T1 and T2 hold no water and are the bytes the game played: they are not rewritten.
//
// The maps go to C:\dgm-probe\terrain3d-2 (DGM_PROBE_TERRAIN3D moves it), never C:\dgm-probe\terrain3d, which keeps
// the files runs terrain3d-20260927 and terrain3d-20260929 played. The runner calls this before it plans
// `--group "Terrain 3D"`; tools/probe-3d.ts runs it by hand.
//
// The edited Hollows and Canyon (imported caves with simulated water) join the group when Foundations' stage 6
// can export them; until then the writer says so in one line and leaves them out.

import { gen3d } from "../../investigation/terrain3d/proto/gen3d";
import { GAME_VERSION } from "../../src/core/format/world";
import { build, checkPlacements, t3CaveWater, t4Soil, t5Plants, t6HeightsFrom, t7Sink, type Terrain3dMap } from "../terrain3d-maps";
import type { BuiltMap, GroupWriter } from "./group";

const MAKERS: (() => Terrain3dMap)[] = [t3CaveWater, t4Soil, t5Plants, () => t6HeightsFrom(gen3d), t7Sink];

export const TERRAIN3D_WRITER: GroupWriter = {
  group: "Terrain 3D",
  ids: ["t3-cave-water", "t4-soil", "t5-plants", "t6-heights", "t7-sink"],
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
    log?.("edited Hollows and Canyon (imported caves, simulated water): not written yet; they join when Foundations' stage 6 can export them");
    return { maps, manifest: { format: 2, tool: "tools/probe-3d.ts", gameVersion: GAME_VERSION } };
  },
};
