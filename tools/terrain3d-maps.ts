// The test maps for terrain above terrain, T1–T6 (investigation/terrain3d/DESIGN.md §8; PLAN §20 D127,
// D279): small deterministic scenes built round what each tests, and their build with the 3D
// foundations' own modules (the support rule, the stacked water's canonical settle in rust/water, soil
// per run, the multi-slot writer). tools/probe-3d.ts writes them for the DGM Probe. The scenes are the
// ones tests/golden/stacked-water.json pins the engine on (its t1–t6 cases hold these masks and
// sources; tests/contract/terrain3dMaps.test.ts checks they still are), which the game played in probe
// runs terrain3d-20260927 and terrain3d-20260929.

import { bush, entityJson, slope, startingLocation, tree, waterSource, type EntitySpec, type TreeSpecies } from "../src/core/format/entities";
import { FOOTPRINTS, startEntranceTile, worldBlocks } from "../src/core/format/footprints";
import { mapMetadata, writeTimber } from "../src/core/format/timber";
import { GAME_VERSION, LAYERS, stackedSimulationSingletons } from "../src/core/format/world";
import { toMapObject } from "../src/core/features/build";
import { TIMESTAMP } from "../src/core/gen/pack";
import { guidFrom } from "../src/core/math/hash";
import { thumbnailJpeg } from "../src/core/render/shade";
import { terrainColumns, waterColumns, type VoxelMasks } from "../src/core/sim/columns";
import { soil3d } from "../src/core/sim/soil3d";
import { canonicalStackSettle } from "../src/core/sim/stackWater";
import { ColumnTerrain } from "../src/core/terrain/runs";
import { unsupportedVoxels } from "../src/core/terrain/support";

export const OWNER = "dgm-probe-terrain3d";
export const DESCRIPTION = "DGM Probe terrain-3D test map (not for play).";
/** Voxel layers the game allows solid (the top layer stays empty). */
export const TOP = LAYERS - 1;

// ------------------------------------------------------------------------------------------ scenes

/** A map being built: one voxel mask per tile and the objects on it. */
export class Scene {
  readonly N: number;
  readonly mask: Uint32Array;
  readonly entities: EntitySpec[] = [];
  constructor(
    readonly W: number,
    readonly H: number,
    ground: number,
  ) {
    this.N = W * H;
    this.mask = new Uint32Array(this.N).fill((1 << ground) - 1);
  }
  /** Solid (or air) over x0..x1 × y0..y1 (inclusive) and z0 ≤ z < z1. */
  box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, solid = true): this {
    let bits = 0;
    for (let z = Math.max(0, z0); z < Math.min(TOP, z1); z++) bits |= 1 << z;
    for (let y = Math.max(0, y0); y <= Math.min(this.H - 1, y1); y++)
      for (let x = Math.max(0, x0); x <= Math.min(this.W - 1, x1); x++) {
        const i = y * this.W + x;
        this.mask[i] = (solid ? this.mask[i] | bits : this.mask[i] & ~bits) >>> 0;
      }
    return this;
  }
  /** Tiles x0..x1 × y0..y1 made plain columns of height h. */
  columns(x0: number, y0: number, x1: number, y1: number, h: number): this {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.mask[y * this.W + x] = (1 << h) - 1;
    return this;
  }
  solid(x: number, y: number, z: number): boolean {
    return (this.mask[y * this.W + x] & (1 << z)) !== 0;
  }
  /** The surface: the first air above the highest solid voxel. */
  top(x: number, y: number): number {
    const m = this.mask[y * this.W + x];
    return m === 0 ? 0 : 32 - Math.clz32(m);
  }
  get masks(): VoxelMasks {
    return { W: this.W, H: this.H, mask: this.mask };
  }
  id(what: string): string {
    return guidFrom(OWNER, what);
  }
  add(e: EntitySpec): this {
    this.entities.push(e);
    return this;
  }
  source(what: string, x: number, y: number, z: number, strength: number): this {
    return this.add(waterSource({ id: this.id(what), owner: OWNER, x, y, z, strength }));
  }
  start(x: number, y: number, z: number): this {
    return this.add(startingLocation({ id: this.id("start"), owner: OWNER, x, y, z, orientation: "Cw0" }));
  }
  plant(what: string, template: TreeSpecies | "BlueberryBush", x: number, y: number, z: number): this {
    return this.add(template === "BlueberryBush" ? bush({ id: this.id(what), owner: OWNER, x, y, z, ripe: true }) : tree({ id: this.id(what), owner: OWNER, x, y, z, species: template }));
  }
}

/** Air a plant needs above its floor (GAME_RULES.md §5): its blocks. */
export const CLEARANCE: Record<string, number> = { Pine: 3, Oak: 3, Birch: 2, Succulent: 2, BlueberryBush: 1 };

// ------------------------------------------------------------------------------------------ the maps

export interface Focus {
  id: string;
  /** The tile the pose looks at, and the level it looks at. */
  x: number;
  y: number;
  z: number;
  /** A side view rather than the game's own angle. */
  side?: boolean;
}

export interface Terrain3dMap {
  id: string;
  title: string;
  tests: string;
  scene: Scene;
  /** Game days the probe plays it. */
  days: number;
  /** Snapshot moments, in days after the start. */
  snapshots: number[];
  checks: string[];
  focus: Focus[];
  samples: [number, number][];
  /** The water written into the file: the canonical settle (the default) or none. */
  water: "settled" | "none";
}

export function t1Support(): Terrain3dMap {
  const s = new Scene(96, 64, 4);
  s.start(3, 40, 4);
  // a wall 8 thick and 20 high: ledges out of its east face at layer 15, and undercuts at its foot
  s.box(8, 4, 15, 36, 4, 20);
  s.box(16, 6, 18, 6, 15, 16); // a ledge 3 long: stands
  s.box(16, 10, 19, 10, 15, 16); // a ledge 4 long: its outer voxel falls
  s.box(13, 14, 15, 20, 5, 8, false); // undercut 3 deep along the face: stands
  s.box(12, 24, 15, 34, 5, 8, false); // undercut 4 deep, 11 long: the roof's outer row falls, but for
  // the 3 tiles at each end, which the uncut rock beside them holds
  // a wall 6 thick and 18 high whose face leans east: 3 a level from layer 8 (stands), and 4 a level
  // over its top two layers (each layer loses what reaches past 3 beyond the one below)
  s.box(24, 4, 29, 28, 4, 18);
  for (let z = 8; z < 18; z++) s.box(30, 4, 29 + 3 * (z - 7), 12, z, z + 1);
  for (let z = 16; z < 18; z++) s.box(30, 18, 29 + 4 * (z - 15), 20, z, z + 1);
  // flat roofs one voxel thick at layer 11 between walls 12 high: over 6 (stands) and over 7 (falls)
  s.box(72, 36, 73, 44, 4, 12).box(80, 36, 81, 44, 4, 12).box(74, 36, 79, 44, 11, 12);
  s.box(84, 36, 85, 44, 4, 12).box(93, 36, 94, 44, 4, 12).box(86, 36, 92, 44, 11, 12);
  // a bridge over a gap 12 wide between walls 16 high: the deck at layer 15 on one corbelled layer
  s.box(72, 16, 75, 26, 4, 16).box(88, 16, 91, 26, 4, 16);
  s.box(76, 20, 87, 22, 15, 16).box(76, 20, 78, 22, 14, 15).box(85, 20, 87, 22, 14, 15);
  return {
    id: "t1-support",
    title: "T1 · Support: ledges, roofs, a bridge, leaning faces, undercuts",
    tests: "The game's load-time support rule: ledges 3 and 4 long out of a wall, flat roofs over gaps of 6 and 7, a bridge corbelled over a gap of 12, faces leaning 3 and 4 a level, undercuts 3 and 4 deep along a face. The game must delete exactly the voxels our rule predicts (the 4-long ledge's tip, the 7-wide roof's middle, the 4-a-level lean's overhang, the 4-deep undercut's outer roof) and nothing else.",
    scene: s,
    days: 0.5,
    snapshots: [],
    checks: ["t3d-load", "t3d-support", "t3d-shots"],
    focus: [
      { id: "ledges", x: 17, y: 8, z: 15 },
      { id: "undercuts", x: 15, y: 24, z: 6, side: true },
      { id: "leans", x: 34, y: 12, z: 12 },
      { id: "roofs", x: 83, y: 40, z: 11 },
      { id: "bridge", x: 82, y: 21, z: 15, side: true },
    ],
    samples: [],
    water: "none",
  };
}

export function t2Walking(): Terrain3dMap {
  const s = new Scene(64, 48, 4);
  s.start(6, 20, 4);
  // a ridge 8 thick and 12 high across the map, pierced by a tunnel 1 high and a tunnel 2 high
  s.box(28, 0, 35, 47, 4, 12);
  s.box(28, 10, 35, 10, 4, 5, false);
  s.box(28, 30, 35, 31, 4, 6, false);
  // a step of one level with a slope on it, under a roof at the slope's z + 2
  s.box(14, 36, 18, 44, 4, 5); // the upper terrace at 5, north of the slope
  s.box(12, 34, 18, 40, 6, 7); // the roof over the slope and its high side: a slab at 6 on pillars
  s.box(12, 34, 12, 40, 4, 6).box(18, 34, 18, 40, 4, 6);
  s.add(slope({ id: s.id("slope under a roof"), owner: OWNER, x: 15, y: 35, z: 4, orientation: "Cw180" }));
  // a ledge path cut 2 deep into the ridge's west face, rising a level every 3 tiles, with slopes
  for (let t = 0; t < 12; t++) {
    const y = 34 + t;
    const floor = 5 + Math.floor(t / 3);
    s.box(28, y, 29, y, floor, Math.min(12, floor + 3), false);
  }
  // onto the ledge from the ground, and up each of its steps (a slope's high side is north, Cw180)
  s.add(slope({ id: s.id("ledge slope 0"), owner: OWNER, x: 27, y: 34, z: 4, orientation: "Cw270" }));
  for (const t of [3, 6, 9]) s.add(slope({ id: s.id(`ledge slope ${t}`), owner: OWNER, x: 28, y: 33 + t, z: 4 + t / 3, orientation: "Cw180" }));
  return {
    id: "t2-walking",
    title: "T2 · Walking: tunnels 1 and 2 high, a slope under a roof, a ledge path",
    tests: "Tunnels 1 and 2 high through a ridge that splits the map, a slope with a roof at its z + 2, and a ledge path up the ridge's face. The game keeps every voxel; beavers walking them is judged from the screenshots until the probe directs beavers.",
    scene: s,
    days: 1,
    snapshots: [],
    checks: ["t3d-load", "t3d-support", "t3d-objects", "t3d-walk", "t3d-shots"],
    focus: [
      { id: "tunnels", x: 27, y: 20, z: 4, side: true },
      { id: "slope-roof", x: 15, y: 37, z: 4, side: true },
      { id: "ledges", x: 27, y: 40, z: 8, side: true },
    ],
    samples: [],
    water: "settled",
  };
}

export function t3CaveWater(): Terrain3dMap {
  const s = new Scene(64, 64, 8);
  s.start(56, 40, 8);
  // (a) a spring cave: a chamber at 3–6 under the plateau, a pool below its floor fed by a source,
  //     and a tunnel from it to the map's west edge
  s.box(6, 6, 11, 11, 3, 7, false);
  s.box(8, 8, 10, 10, 2, 3, false);
  s.source("spring cave", 9, 9, 2, 1);
  s.box(0, 9, 5, 9, 3, 5, false);
  // (b) a sealed cave with a source
  s.box(26, 6, 31, 11, 3, 6, false);
  s.source("sealed cave", 29, 9, 3, 0.5);
  // (c) a siphon: basin A (floor 4) fed by a source, a U passage at 1–2 under the rock to basin B
  //     (floor 4), which spills east at 6 to the map edge
  s.box(44, 4, 52, 12, 4, 8, false);
  s.source("basin A", 48, 6, 4, 2);
  s.box(48, 12, 48, 12, 1, 4, false);
  s.box(48, 13, 48, 20, 1, 3, false);
  s.box(48, 21, 48, 21, 1, 4, false);
  s.box(44, 21, 52, 28, 4, 8, false);
  s.box(53, 24, 63, 25, 6, 8, false);
  // (d) an underground river: a hill to 14 with a basin (floor 11) fed by a source, draining east
  //     through a gallery whose bed falls a level every 2 tiles, out of the hill's face onto the plateau
  s.box(16, 40, 40, 60, 8, 14);
  s.box(22, 46, 28, 52, 11, 14, false);
  s.source("hill basin", 25, 49, 11, 1.5);
  for (let x = 29; x <= 40; x++) {
    const bed = Math.max(8, 11 - Math.floor((x - 29) / 2));
    s.box(x, 49, x, 49, bed, bed + 2, false);
  }
  return {
    id: "t3-cave-water",
    title: "T3 · Cave water: a spring cave, a sealed cave, a siphon, an underground river",
    tests: "Water under roofs and between floors: a spring cave whose pool drains through a tunnel to the map edge, a sealed cave with a source (it fills, is pressurised, and loses what passes the cap), a U-shaped passage full of water between two basins (a siphon under pressure), and an underground river through a hill out of its face. The game's water columns after 1 and 3 days against the stacked engine's from the same start: wet columns, depths and pressure.",
    scene: s,
    days: 3.2,
    snapshots: [1, 3],
    checks: ["t3d-load", "t3d-support", "t3d-objects", "t3d-water", "t3d-soil", "t3d-shots"],
    focus: [
      { id: "spring-cave", x: 9, y: 9, z: 4, side: true },
      { id: "sealed-cave", x: 29, y: 9, z: 4, side: true },
      { id: "siphon", x: 48, y: 16, z: 4, side: true },
      { id: "underground-river", x: 40, y: 49, z: 9, side: true },
    ],
    samples: [[9, 9], [3, 9], [29, 9], [48, 6], [48, 16], [48, 24], [58, 24], [25, 49], [34, 49], [41, 49]],
    water: "settled",
  };
}

export function t4Soil(): Terrain3dMap {
  const s = new Scene(64, 48, 8);
  s.start(56, 40, 8);
  // a sealed cave at 3–4, full of water from its source, under roofs 1, 2 and 3 thick (the ground
  // over it lowered to 6, 7 and 8)
  s.box(8, 8, 40, 13, 3, 5, false);
  s.source("full cave", 24, 11, 3, 1);
  s.columns(4, 6, 18, 16, 6).box(8, 8, 18, 13, 3, 5, false);
  s.columns(19, 6, 29, 16, 7).box(19, 8, 29, 13, 3, 5, false);
  // a stream through a tunnel: a source in a pool at the tunnel's west end, the tunnel 2 high through
  // a hill 14 high, out to a channel to the map's east edge
  s.box(10, 30, 40, 40, 8, 14);
  s.box(6, 34, 9, 36, 6, 8, false);
  s.source("tunnel stream", 7, 35, 6, 1);
  s.box(10, 35, 40, 35, 6, 8, false);
  s.box(41, 35, 63, 35, 6, 8, false);
  return {
    id: "t4-soil",
    title: "T4 · Soil: a full cave under roofs 1, 2 and 3 thick, a stream through a tunnel",
    tests: "Moisture per terrain run: the roofs over a cave full of water (16, 10 and 4 through 1, 2 and 3 levels of rock), the cave's own floor, and the floor and roof of a tunnel with a stream. The game's moisture and soil contamination on every run of every layered tile against our soil rules on the game's own water.",
    scene: s,
    days: 1,
    snapshots: [0.5, 1],
    checks: ["t3d-load", "t3d-support", "t3d-objects", "t3d-water", "t3d-soil", "t3d-shots"],
    focus: [
      { id: "roofs", x: 24, y: 11, z: 6, side: true },
      { id: "tunnel", x: 25, y: 35, z: 7, side: true },
    ],
    samples: [[13, 11], [24, 11], [35, 11], [7, 35], [25, 35], [50, 35]],
    water: "settled",
  };
}

export function t5Plants(): Terrain3dMap {
  const s = new Scene(48, 48, 6);
  // the start under a roof at z + 5 (a slab at 11 over the start and its entrance, held by walls)
  s.box(8, 6, 8, 13, 6, 12).box(14, 6, 14, 13, 6, 12).box(9, 6, 13, 13, 11, 12);
  s.start(10, 9, 6);
  // a stream along the plants' rows so their soil is moist
  s.box(20, 4, 20, 40, 5, 6, false);
  s.source("stream", 20, 4, 5, 1);
  s.box(20, 41, 20, 47, 4, 6, false);
  // slabs over rows of plants at 1, 2 and 3 above the ground (z 7, 8 and 9), each held by a wall on
  // the stream's far side
  const rows: [number, number][] = [[1, 10], [2, 20], [3, 30]];
  for (const [above, y] of rows) {
    s.box(22, y - 2, 22, y + 2, 6, 6 + above + 1).box(28, y - 2, 28, y + 2, 6, 6 + above + 1);
    s.box(23, y - 2, 27, y + 2, 6 + above, 6 + above + 1);
    s.plant(`pine under ${above}`, "Pine", 23, y, 6);
    s.plant(`oak under ${above}`, "Oak", 24, y - 1, 6);
    s.plant(`birch under ${above}`, "Birch", 25, y, 6);
    s.plant(`bush under ${above}`, "BlueberryBush", 26, y + 1, 6);
  }
  // the same plants in the open, for comparison
  s.plant("pine open", "Pine", 23, 40, 6).plant("birch open", "Birch", 25, 40, 6).plant("bush open", "BlueberryBush", 26, 40, 6);
  return {
    id: "t5-plants",
    title: "T5 · Plants and objects: plants under roofs 1, 2 and 3 above, the start under a roof at z + 5",
    tests: "What fits under a roof: pines and oaks need 3 air cells, birches 2, bushes 1, so a pine under a roof 2 above is removed on load and one under 3 stays. The start under a roof at its z + 5 places its district center. Pumps need building (not played by the probe yet).",
    scene: s,
    days: 3,
    snapshots: [1, 3],
    checks: ["t3d-load", "t3d-support", "t3d-plants", "t3d-start", "t3d-pumps", "t3d-shots"],
    focus: [
      { id: "plants", x: 24, y: 20, z: 6, side: true },
      { id: "start-roof", x: 11, y: 10, z: 6, side: true },
    ],
    samples: [[23, 10], [23, 20], [23, 30], [23, 40]],
    water: "settled",
  };
}

export async function t6Heights(): Promise<Terrain3dMap> {
  const { gen3d } = await import("../investigation/terrain3d/proto/gen3d");
  return t6HeightsFrom(gen3d);
}

/** T6 from the investigation's prototype landscape generator (investigation/terrain3d/proto/gen3d.ts `gen3d`; its
 *  operators keep the support rule by construction). */
export function t6HeightsFrom(gen3d: (size: number, verticality: "high", seed: number) => { vx: { v: ArrayLike<number> }; entities: EntitySpec[] }): Terrain3dMap {
  const r = gen3d(256, "high", 1);
  const s = new Scene(256, 256, 0);
  for (let z = 0; z < LAYERS; z++) for (let i = 0; i < s.N; i++) if (r.vx.v[z * s.N + i]) s.mask[i] |= 1 << z;
  for (const e of r.entities) s.add({ ...e, owner: OWNER });
  let hi = 0;
  let hiAt: [number, number] = [0, 0];
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      if (s.top(x, y) > hi) {
        hi = s.top(x, y);
        hiAt = [x, y];
      }
  const start = s.entities.find((e) => e.template === "StartingLocation");
  return {
    id: "t6-heights",
    title: "T6 · Heights: the investigation's high-verticality landscape at 256² (relief 3–22)",
    tests: "A whole landscape to the game's full height (22) with every 3D form the investigation carved: a tunnel and an arch through a ridge, a cliff path of ledges, a leaning massif face, a sky bridge over a gorge at 20, a cliffside cave, a spring cave and an underground river. It loads, keeps its terrain, water and objects, and the camera shows it whole.",
    scene: s,
    days: 1.5,
    snapshots: [0.5, 1],
    checks: ["t3d-load", "t3d-support", "t3d-objects", "t3d-water", "t3d-shots"],
    focus: [{ id: "summit", x: hiAt[0], y: hiAt[1], z: hi }, ...(start ? [{ id: "start-side", x: start.x + 1, y: start.y + 1, z: start.z, side: true }] : [])],
    samples: [],
    water: "settled",
  };
}

/** T7: sinks (a water source with a strength below 0, D337). Under a roof the engine follows the game's
 *  code (`UpdateWaterSourcesTask`, `WaterDepthSetter.SetWaterDepth`), which no probe run has played yet:
 *  this map is for that. Not one of the fixtures' scenes. */
export function t7Sink(): Terrain3dMap {
  const s = new Scene(48, 48, 8);
  s.start(40, 40, 8);
  // (a) a sealed cave with a source and a weaker sink: it fills and comes under pressure, less than without
  s.box(6, 6, 11, 11, 3, 6, false);
  s.source("sealed cave", 8, 8, 3, 1);
  s.source("sealed cave sink", 10, 10, 3, -0.4);
  // (b) a sealed cave whose sink is the stronger: it never fills
  s.box(26, 6, 31, 11, 3, 6, false);
  s.source("drained cave", 28, 8, 3, 0.5);
  s.source("drained cave sink", 30, 10, 3, -1.5);
  // (c) the same pair in the open, for comparison: a basin (floor 5) that spills east at 7 to the map edge
  s.box(20, 24, 30, 34, 5, 8, false);
  s.box(31, 29, 47, 29, 7, 8, false);
  s.source("open basin", 22, 26, 5, 2);
  s.source("open basin sink", 28, 32, 5, -1);
  return {
    id: "t7-sink",
    title: "T7 · Sinks: a source and a sink in a sealed cave, a cave its sink keeps from filling, and the pair in the open",
    tests: "A water source with a negative strength takes water away. Under a roof it takes pressure first, then depth, never below dry (from the game's code, not yet played); in the open it is the rule the editor already uses.",
    scene: s,
    days: 3.2,
    snapshots: [1, 3],
    checks: ["t3d-load", "t3d-support", "t3d-objects", "t3d-water", "t3d-shots"],
    focus: [
      { id: "sealed-cave", x: 8, y: 8, z: 4, side: true },
      { id: "drained-cave", x: 28, y: 8, z: 4, side: true },
      { id: "open-basin", x: 25, y: 29, z: 6 },
    ],
    samples: [[8, 8], [10, 10], [28, 8], [30, 10], [22, 26], [28, 32], [40, 29]],
    water: "settled",
  };
}

// ------------------------------------------------------------------------------------------ build

export interface Built {
  bytes: Uint8Array;
  /** The voxels the support rule deletes on load (cells z·N + tile). */
  dropped: number[];
  /** Plants whose blocks do not fit under the terrain above them: the game removes them on load. */
  plantsRemoved: { id: string; template: string; x: number; y: number; z: number; air: number }[];
  layeredTiles: number;
  maxHeight: number;
  wetColumns: number;
  roofedWetColumns: number;
  pressurised: number;
  settled: { settled: boolean; ticks: number } | null;
  /** What the file holds, per water column id and per run id (the golden fixtures hash them). */
  arrays: { depth: Float64Array; overflow: Float64Array; contamination: Float64Array; moisture: Float64Array; soilContamination: Float64Array };
}

/** The cells (z·N + tile) holding the top of a stackable object's block: the voxel above each counts
 *  as standing on ground (a NaturalOverhang holds the rock over it). */
export function stackableTops(W: number, H: number, entities: readonly EntitySpec[]): number[] {
  const out: number[] = [];
  for (const e of entities) {
    const fp = FOOTPRINTS[e.template];
    if (!fp) continue;
    for (const b of worldBlocks(fp, e)) if (b.stackable && b.x >= 0 && b.x < W && b.y >= 0 && b.y < H) out.push(b.z * W * H + b.y * W + b.x);
  }
  return out;
}

export function build(m: Terrain3dMap): Built {
  const s = m.scene;
  const { W, H, N } = s;
  const objects = s.entities.map(toMapObject);
  // what the game deletes on load, and the terrain it keeps
  const falls = unsupportedVoxels(s.masks, stackableTops(W, H, s.entities));
  const dropped: number[] = [];
  const keptMask = s.mask.slice();
  for (let c = 0; c < falls.length; c++)
    if (falls[c]) {
      dropped.push(c);
      keptMask[c % N] &= ~(1 << Math.floor(c / N));
    }
  const support = { dropped, kept: keptMask };
  const kept: VoxelMasks = { W, H, mask: keptMask };
  const runs = terrainColumns(s.masks);
  const fileCols = waterColumns(s.masks, objects);
  let depth: Float64Array = new Float64Array(fileCols.L * N);
  let overflow: Float64Array = new Float64Array(fileCols.L * N);
  let contamination: Float64Array = new Float64Array(fileCols.L * N);
  let sat: Uint8Array = new Uint8Array(fileCols.L * N);
  let moisture: Float64Array = new Float64Array(runs.T * N);
  let soilContamination: Float64Array = new Float64Array(runs.T * N);
  let settled: Built["settled"] = null;
  if (m.water === "settled") {
    // the water and soil the game settles to are on the terrain it keeps
    if (support.dropped.length) throw new Error(`${m.id}: the settled water needs terrain the game keeps, but the rule deletes ${support.dropped.length} voxels`);
    const w = canonicalStackSettle(kept, objects);
    if (w.L !== fileCols.L || w.count.some((c, i) => c !== fileCols.count[i])) throw new Error(`${m.id}: the engine's water columns are not the writer's`);
    settled = { settled: w.settled, ticks: w.ticks };
    const soil = soil3d(kept, fileCols, w, objects);
    depth = w.depth;
    overflow = w.overflow;
    contamination = w.contamination;
    sat = w.sat;
    moisture = soil.moisture;
    soilContamination = soil.contamination;
  }
  const singletons = stackedSimulationSingletons(W, H, { cols: fileCols, depth, overflow, contamination, sat, runs, moisture, soilContamination });
  const heights = new Uint8Array(N);
  let maxHeight = 0;
  let layeredTiles = 0;
  for (let i = 0; i < N; i++) {
    const v = s.mask[i];
    heights[i] = v === 0 ? 0 : 32 - Math.clz32(v);
    maxHeight = Math.max(maxHeight, heights[i]);
    if ((v & (v + 1)) !== 0) layeredTiles++;
  }
  // the water seen from above, for the thumbnail: each tile's top column
  const topDepth = new Float64Array(N);
  for (let i = 0; i < N; i++) topDepth[i] = depth[(fileCols.count[i] - 1) * N + i];
  const bytes = writeTimber({
    metadata: mapMetadata(W, H, `${DESCRIPTION} ${m.title}. ${m.tests}`),
    thumbnail: thumbnailJpeg(heights, W, H, topDepth),
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: TIMESTAMP, sizeX: W, sizeY: H, layers: LAYERS, voxels: new ColumnTerrain(W, H, s.mask).voxels(LAYERS), singletons, entities: s.entities.map(entityJson) },
    extraFiles: [],
  });
  // plants whose blocks do not fit under the rock above them
  const plantsRemoved: Built["plantsRemoved"] = [];
  for (const e of s.entities) {
    const need = CLEARANCE[e.template];
    if (need === undefined) continue;
    let air = 0;
    while (e.z + air < TOP && !(support.kept[e.y * W + e.x] & (1 << (e.z + air)))) air++;
    if (air < need) plantsRemoved.push({ id: e.id, template: e.template, x: e.x, y: e.y, z: e.z, air });
  }
  let wetColumns = 0;
  let roofedWetColumns = 0;
  let pressurised = 0;
  for (let c = 0; c < depth.length; c++) {
    if (depth[c] > 0.05) {
      wetColumns++;
      if (fileCols.ceil[c] < 34) roofedWetColumns++;
    }
    if (overflow[c] > 0.001) pressurised++;
  }
  return { bytes, dropped: support.dropped, plantsRemoved, layeredTiles, maxHeight, wetColumns, roofedWetColumns, pressurised, settled, arrays: { depth, overflow, contamination, moisture, soilContamination } };
}

/** Every object stands where the game lets it: on solid ground (or a stackable), in air. */
export function checkPlacements(m: Terrain3dMap): string[] {
  const s = m.scene;
  const out: string[] = [];
  for (const e of s.entities) {
    const fp = FOOTPRINTS[e.template];
    if (!fp) continue;
    // a plant's upper blocks may meet a roof on purpose: its clearance is predicted (build)
    const plant = CLEARANCE[e.template] !== undefined;
    for (const b of worldBlocks(fp, e)) {
      if (b.x < 0 || b.y < 0 || b.x >= s.W || b.y >= s.H) out.push(`${e.template} (${e.x}, ${e.y}, ${e.z}) leaves the map`);
      else if (s.solid(b.x, b.y, b.z) && !(plant && b.localZ > 0)) out.push(`${e.template} (${e.x}, ${e.y}, ${e.z}) is inside terrain at (${b.x}, ${b.y}, ${b.z})`);
      else if ((b.below === "ground" || b.below === "groundOrStackable") && b.localZ === 0 && !s.solid(b.x, b.y, b.z - 1)) out.push(`${e.template} (${e.x}, ${e.y}, ${e.z}) floats at (${b.x}, ${b.y}, ${b.z})`);
    }
    if (e.template === "StartingLocation") {
      const [ex, ey] = startEntranceTile(e.x, e.y, e.orientation);
      if (s.top(ex, ey) !== e.z && !(s.solid(ex, ey, e.z - 1) && !s.solid(ex, ey, e.z))) out.push(`the start's entrance (${ex}, ${ey}) is not at its level`);
    }
  }
  return out;
}

/** Every map, in order (T1–T6 are the scenes the game played in September; T7 is new). T6 builds the investigation's 256² landscape (a few seconds). */
export const TERRAIN3D_MAPS: (() => Terrain3dMap | Promise<Terrain3dMap>)[] = [t1Support, t2Walking, t3CaveWater, t4Soil, t5Plants, t6Heights, t7Sink];
