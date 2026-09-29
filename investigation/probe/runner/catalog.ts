// Every probe game the batch can play, and the checks each one answers. The list follows the project's own
// lists: the in-game checks of docs/ingame-log.md that concern the map itself (their files and the numbers
// in each milestone's checks.txt), the cycle model's calibration points (investigation/cycles/CALIBRATION.md
// on branch investigation/cycles-exact), the Map look captures (docs/map-look/after/after.json), the high
// terrain test maps, the tall maps (tools/probe-tall.ts, PLAN §20 D172), and any .timber files given on the
// command line (the M9 prototypes, for example).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Action, Cycle, Pose } from './job';
import { NEW_GAME_DAY } from './job';
import { firstGenerated, generated, generatedFrom, mesa, raised, withoutStart } from './derived';
import { readMapBytes, wetAreas, type MapInfo } from './mapfile';
import { REPO, tallDir } from './paths';
import { PUMP_CLEAN, PUMP_DEPTH, PUMP_REACH, walkDistance } from '../../../src/core/analysis/walk';
import { footprintTiles, FOOTPRINTS, slopeHighSide, worldBlocks, type Orientation, type Placement } from '../../../src/core/format/footprints';
import { DIFFICULTY_RULES } from '../../../src/core/spec/mapspec';
import { WALK_BLOCKERS } from '../../../src/core/validate/playability';

export type Verdict = 'passed' | 'failed' | 'not measurable' | 'recorded';

export interface CheckDef {
  /** The check's id: an ingame-log id (A2, B1, …), a calibration point (cal-1 …) or a probe check. */
  id: string;
  title: string;
  /** measure: the probe decides it; partial: it decides the part named in `why`; none: needs a person or a colony. */
  how: 'measure' | 'partial' | 'none';
  why?: string;
}

export interface GameDef {
  id: string;
  title: string;
  group: string;
  /** The .timber bytes to play. */
  bytes: () => Uint8Array;
  faction: 'Folktails' | 'IronTeeth';
  mode: 'Easy' | 'Normal' | 'Hard';
  cycles: Cycle[];
  /** Game days after the start (the start is day 1 + 4/24). */
  days: number;
  tiles: (m: MapInfo) => [number, number][];
  sampleHours: number;
  /** Extra moments (day offsets from the start) with a whole-map snapshot. */
  snapshotsAt?: number[];
  /** Whole-map snapshots every day (model comparisons). */
  daily?: boolean;
  actions?: (m: MapInfo) => Action[];
  poses?: (m: MapInfo) => Pose[];
  /** Map look captures for this map (the map id in after.json). */
  lookMap?: string;
  checks: CheckDef[];
  /** Compare with the cycle model on the same schedule. */
  model?: boolean;
  /** Other games this one is compared with. */
  pairs?: string[];
  /** A tall map's entry in tall.json (tools/probe-tall.ts). */
  tall?: TallEntry;
}

/** One map of tall.json, the manifest tools/probe-tall.ts writes beside the tall maps. */
export interface TallEntry {
  id: string;
  title: string;
  tests: string;
  file: string;
  sha256: string;
  size: [number, number];
  maxHeight: number;
  tilesAbove16: number;
  tilesAt22: number;
  wetAbove16: number;
  objectsAbove16: number;
  plantsAbove16: number;
  sourcesAbove16: { template: string; x: number; y: number; z: number; strength: number }[];
  start: { x: number; y: number; z: number } | null;
  focus: [number, number];
  flowTiles: [number, number][];
  poolTiles: [number, number][];
}

/** The tall maps tools/probe-tall.ts wrote (none until it has run). */
export function tallMaps(): TallEntry[] {
  const f = join(tallDir(), 'tall.json');
  if (!existsSync(f)) return [];
  return (JSON.parse(readFileSync(f, 'utf8')) as { maps: TallEntry[] }).maps;
}

/** A tall map's bytes, exactly the file both validators checked (its sha256 in tall.json). */
function tallBytes(t: TallEntry): Uint8Array {
  const b = new Uint8Array(readFileSync(join(tallDir(), t.file)));
  if (createHash('sha256').update(b).digest('hex') !== t.sha256) throw new Error(`${t.file} is not the file tall.json describes: run npx tsx tools/probe-tall.ts again`);
  return b;
}

export const D0 = NEW_GAME_DAY;

// ------------------------------------------------------------------------------------ sources

const repoFile = (rel: string) => () => new Uint8Array(readFileSync(join(REPO, rel)));

/** The main checkout (local-only inputs live there: investigation/raw, out/m8/local). */
export function mainCheckout(): string {
  try {
    const common = execFileSync('git', ['-C', REPO, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    return join(common, '..');
  } catch {
    return REPO;
  }
}
const localFile = (rel: string) => () => new Uint8Array(readFileSync(join(mainCheckout(), rel)));
const localExists = (rel: string) => existsSync(join(mainCheckout(), rel));

const memo = <T>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

// ------------------------------------------------------------------------------------ poses

const GAME_YAW = -Math.PI / 6; // the game's camera: 30° east of north
const deg = (d: number) => (d * Math.PI) / 180;
const at = (m: MapInfo, x: number, y: number): [number, number, number] => [x + 0.5, m.heights[y * m.W + x], -(y + 0.5)];

/** The poses every game gets: the game's own opening view, an overview, the start and the largest water. */
export function standardPoses(m: MapInfo): Pose[] {
  const span = Math.max(m.W, m.H);
  let mean = 0;
  for (const h of m.heights) mean += h;
  mean /= m.heights.length;
  const poses: Pose[] = [
    { id: 'game-start', kind: 'current', target: [0, 0, 0], yaw: 0, pitch: 0, distance: 0, fovY: 0, width: 1280, height: 800 },
    { id: 'overview', kind: 'look', target: [m.W / 2, mean, -m.H / 2], yaw: GAME_YAW, pitch: deg(60), distance: span * 1.45, fovY: 40, width: 1280, height: 800 },
  ];
  if (m.start) poses.push({ id: 'start', kind: 'look', target: at(m, m.start.x, m.start.y), yaw: GAME_YAW, pitch: deg(55), distance: 45, fovY: 40, width: 1280, height: 800 });
  const water = wetAreas(m)[0];
  if (water) {
    // the wet tile nearest the area's centre (a river's centre can be dry ground)
    let best = water.tiles[0], bd = Infinity;
    for (const t of water.tiles) {
      const d = (t % m.W - water.cx) ** 2 + (((t / m.W) | 0) - water.cy) ** 2;
      if (d < bd) (bd = d), (best = t);
    }
    const x = best % m.W, y = (best / m.W) | 0;
    const t = at(m, x, y);
    t[1] = m.floor[best] >= 0 ? m.floor[best] + m.depth[best] : t[1];
    poses.push({ id: 'water', kind: 'look', target: t, yaw: GAME_YAW, pitch: deg(55), distance: Math.min(110, Math.max(35, Math.sqrt(water.tiles.length) * 2.2)), fovY: 40, width: 1280, height: 800 });
  }
  return poses;
}

interface LookShot {
  map: string;
  pose: string;
  file: string;
  size: [number, number];
  view: { mode: string; yaw: number; pitch: number; distance: number; target: [number, number, number] };
}
const lookShots = memo(() => (JSON.parse(readFileSync(join(REPO, 'docs', 'map-look', 'after', 'after.json'), 'utf8')) as { shots: LookShot[] }).shots);

/** Map look's poses for one of its maps, reproduced exactly (our 3D view: 40° vertical field of view). */
export function lookPoses(mapId: string): Pose[] {
  return lookShots()
    .filter((s) => s.map === mapId && s.view.mode === 'orbit' && s.size[0] > 0)
    .map((s) => ({ id: `look-${s.pose}`, kind: 'look' as const, target: s.view.target, yaw: s.view.yaw, pitch: s.view.pitch, distance: s.view.distance, fovY: 40, width: s.size[0], height: s.size[1], lookCapture: s.file }));
}

// ------------------------------------------------------------------------------------ helpers

/** checks.txt numbers: "(x, y) 0.49 deep" pairs on a line that contains `marker`. */
export function depthSamples(rel: string, marker: string): { x: number; y: number; depth: number; bad?: number }[] {
  const line = readFileSync(join(REPO, rel), 'utf8').split(/\r?\n/).find((l) => l.includes(marker)) ?? '';
  return [...line.matchAll(/\((\d+), (\d+)\) ([\d.]+) deep(?:, surface [\d.]+)?(?:, badwater (\d+)%)?/g)].map((m) => ({ x: +m[1], y: +m[2], depth: +m[3], bad: m[4] ? +m[4] / 100 : undefined }));
}

const within = (m: MapInfo, cx: number, cy: number, r: number, pred: (t: number) => boolean) => {
  const out: [number, number][] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(m.H - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(m.W - 1, cx + r); x++) if (pred(y * m.W + x)) out.push([x, y]);
  return out;
};

const calm: Cycle = { temperateDays: 60, hazard: 'drought', hazardDays: 0 };

// ------------------------------------------------------------------------------------ generic checks

const LOAD: CheckDef = { id: 'load', title: 'Loads cleanly: no loading issue, no error or exception in the game log, the start placed', how: 'measure' };
const OBJECTS: CheckDef = { id: 'objects', title: 'Every object in the file is in the game, at its tile', how: 'measure' };
const WATER: CheckDef = { id: 'water', title: 'The stored water holds: after a day the water matches the file within 0.1 deep', how: 'measure' };
const TERRAIN: CheckDef = { id: 'terrain', title: "The terrain is kept after the game's terrain physics", how: 'measure' };
const GENERIC = [LOAD, OBJECTS, WATER, TERRAIN];

/** The tall maps' checks (PLAN §20 D172: maps above 16 load and keep their terrain, water and objects).
 *  compare.ts states each one's tolerance in its verdict. */
export const TALL = {
  load: { id: 'tall-load', title: 'Loads: no loading issue, no error or exception in the log, the start placed', how: 'measure' },
  terrain: { id: 'tall-terrain', title: "Terrain kept voxel for voxel: the game's terrain columns equal the file's at the load and at the end", how: 'measure' },
  water: { id: 'tall-water', title: 'Stored water holds: at the load 99% of wet tiles within 0.1 deep of the file; after a day 95% within 0.1 and the volume within 10%; the same for the water above 16', how: 'measure' },
  objects: { id: 'tall-objects', title: 'Every object in the file is in the game at its tile and level, those above 16 included', how: 'measure' },
  start: { id: 'tall-start', title: 'The start above 16: the district center on the StartingLocation, 9 adults and 4 children', how: 'measure' },
  sources: { id: 'tall-sources', title: 'Every source above 16 is in the game at its strength and runs after a day', how: 'measure' },
  flow: { id: 'tall-flow', title: 'Water above 16 keeps flowing and standing: the sampled stream tiles stay wet all day and the pools keep their level (within 0.1)', how: 'measure' },
  shots: { id: 'tall-shots', title: 'The screenshots show nothing visibly broken', how: 'partial', why: 'judged by eye from the contact sheet' },
} satisfies Record<string, CheckDef>;

const none = (id: string, title: string, why: string): CheckDef => ({ id, title, how: 'none', why });
const BUILD = 'needs a building placed and built by beavers (a dam, levee, water wheel or pump); the probe does not play a colony yet (INTEGRATION.md: the bot colony)';
const WALK = 'needs a beaver sent along a path and watched; the probe does not direct beavers';
const EDITOR = "needs the game's map editor, which the probe does not open";

// ------------------------------------------------------------------------------------ the catalog

export function catalog(extraMaps: string[] = []): GameDef[] {
  const games: GameDef[] = [];
  const m1 = 'out/m1/River Valley (4242).timber';
  const m1gap = 'out/m1/River Valley (4242) F2 source gap.timber';
  const riverMouth = (m: MapInfo): [number, number][] => [[0, 77], [0, 78], [0, 79], [0, 80], [0, 81], [1, 79], [3, 79], [8, 79], [16, 79], [24, 79]].filter(([x, y]) => x < m.W && y < m.H) as [number, number][];

  // M1
  games.push({
    id: 'm1-rv', title: 'M1 · River Valley (4242), Folktails', group: 'M1', bytes: repoFile(m1), faction: 'Folktails', mode: 'Normal', cycles: [calm], days: 1.5,
    tiles: riverMouth, sampleHours: 1, snapshotsAt: [0.5, 1, 1.5], pairs: ['m1-rv-gap'],
    checks: [
      { id: 'A1', title: 'The map is listed and loads', how: 'partial', why: 'the probe loads the file directly; the New game list entry, thumbnail and description are seen only in the menu' },
      { id: 'A2', title: 'No loading issues; district center on the start, door north; 9 adults and 4 children', how: 'measure' },
      none('A3', 'Walk test on terraces and slopes', WALK),
      none('A4', 'Map editor: open, edit, save', EDITOR),
      { id: 'F2a', title: 'The river fills and keeps its water at the west edge', how: 'measure' },
      LOAD, OBJECTS, TERRAIN,
    ],
  });
  games.push({
    id: 'm1-rv-it', title: 'M1 · River Valley (4242), Iron Teeth', group: 'M1', bytes: repoFile(m1), faction: 'IronTeeth', mode: 'Normal', cycles: [calm], days: 0.5,
    tiles: () => [], sampleHours: 6, checks: [{ id: 'A5', title: 'Iron Teeth: the district center fits on the start and beavers spawn', how: 'measure' }, LOAD],
  });
  games.push({
    id: 'm1-rv-gap', title: 'M1 · River Valley (4242) F2 source gap', group: 'M1', bytes: repoFile(m1gap), faction: 'Folktails', mode: 'Normal', cycles: [calm], days: 1.5,
    tiles: riverMouth, sampleHours: 1, snapshotsAt: [0.5, 1, 1.5], pairs: ['m1-rv'],
    checks: [{ id: 'F2b', title: 'Water drains off the edge through the gap: the river is lower than in F2a', how: 'measure' }, LOAD],
  });

  // M2
  const m2 = 'out/m2/River Valley (4242).timber';
  const m2samples = depthSamples('out/m2/checks.txt', 'River depth samples');
  games.push({
    id: 'm2-rv', title: 'M2 · River Valley (4242), pre-filled water', group: 'M2', bytes: repoFile(m2), faction: 'Folktails', mode: 'Normal',
    // Normal's first drought: 13 temperate days (the shortest), then 3 days (0.38 × 5–9, rounded)
    cycles: [{ temperateDays: 13, hazard: 'drought', hazardDays: 3 }, calm], days: 16.4,
    tiles: () => [...m2samples.map((s) => [s.x, s.y] as [number, number]), [42, 38], [108, 94], [111, 91]],
    sampleHours: 2, snapshotsAt: [1, 4, 8, 12], pairs: ['m2-rv-empty'], model: true,
    checks: [
      { id: 'B1', title: 'Day 1: no surge, no drain; the depth samples as listed; no berry bush near the start dry', how: 'measure' },
      { id: 'B3', title: '15 days and the first drought: groves and bushes near the start alive, dead stands dead', how: 'measure' },
      { id: 'B4', title: 'Badwater stays in its pit, ditch and the river below; the start water stays clean', how: 'measure' },
      ...GENERIC,
    ],
  });
  games.push({
    id: 'm2-rv-empty', title: 'M2 · River Valley (4242), empty water', group: 'M2', bytes: repoFile('out/m2/River Valley (4242) (empty water).timber'), faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 2.2, tiles: () => [...m2samples.map((s) => [s.x, s.y] as [number, number]), [42, 38]], sampleHours: 2, snapshotsAt: [1, 2], pairs: ['m2-rv'],
    checks: [{ id: 'B2', title: 'The empty map fills within about a day and then looks like the pre-filled one; the same plants survive', how: 'measure' }, LOAD, OBJECTS, TERRAIN],
  });

  // M5
  const lip = (m: MapInfo): [number, number][] => [55, 60, 64, 69, 74].map((x) => [x, 118] as [number, number]).filter(([x, y]) => x < m.W && y < m.H);
  const fallPose = (m: MapInfo): Pose[] => [{ id: 'waterfall', kind: 'look', target: at(m, 64, 118), yaw: 0, pitch: deg(25), distance: 40, fovY: 40, width: 1280, height: 800 }];
  for (const [s, id] of [['S2', 'm5-f1-s2'], ['S8', 'm5-f1-s8']] as const)
    games.push({
      id, title: `M5 · River Valley (4242) F1 waterfall ${s}`, group: 'M5', bytes: repoFile(`out/m5/River Valley (4242) F1 waterfall ${s}.timber`), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: (m) => [...lip(m), [75, 123], [64, 120]], sampleHours: 2, snapshotsAt: [1], poses: fallPose,
      checks: [
        { id: 'F1', title: `The ${s === 'S2' ? '2' : '8'} water/s waterfall: every lip tile wet, about ${s === 'S2' ? '0.030' : '0.120'} deep`, how: 'partial', why: 'whether the sheet reads as a waterfall is judged from the screenshots; whether a water wheel turns needs a wheel built' },
        ...GENERIC,
      ],
    });
  games.push({
    id: 'm5-c1', title: 'M5 · River Valley (4242) C1 dam site', group: 'M5', bytes: repoFile('out/m5/River Valley (4242) C1 dam site.timber'), faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 1, tiles: () => [[83, 63], [83, 67], [83, 72], [80, 67], [86, 67]], sampleHours: 3, snapshotsAt: [1],
    checks: [none('C1', 'A dam 2 high on the gap fills the basin to level 10', BUILD), none('C2', 'A water wheel below a fall turns', BUILD), none('C3', 'The colony survives the first drought on the stored water', BUILD + ', and a colony played to the drought'), ...GENERIC],
  });
  games.push({
    id: 'm5-gorge', title: 'M5 · River Valley (4242) gorge stairs', group: 'M5', bytes: repoFile('out/m5/River Valley (4242) gorge stairs.timber'), faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 1, tiles: () => [[66, 20], [66, 18], [66, 24], [65, 20], [64, 20]], sampleHours: 3, snapshotsAt: [1],
    checks: [{ id: 'C-gorge', title: 'The stair notch and the water beside its landing', how: 'partial', why: WALK + '; a pump needs building. The probe measures the water beside the landing.' }, ...GENERIC],
  });

  // M6
  for (const [name, id, dam] of [['Canyon', 'm6-canyon', 'M6-1a'], ['Lake Basin', 'm6-lakebasin', 'M6-1b']] as const)
    games.push({
      id, title: `M6 · ${name} (4242)`, group: 'M6', bytes: repoFile(`out/m6/${name} (4242).timber`), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: (m) => (m.start ? [[m.start.x, m.start.y]] : []), sampleHours: 3, snapshotsAt: [1],
      checks: [
        { id: dam, title: 'The map loads with no issues', how: 'partial', why: 'the dam and the stair walk need building and a beaver: ' + BUILD },
        none('M6-1c', 'Levees on the badwater basin hold it until it fills', BUILD),
        ...GENERIC,
      ],
    });

  // M7
  const m7 = 'out/m7/Lake Basin (4242) D objects.timber';
  const plug: [number, number][] = [[54, 33], [55, 33], [56, 34]];
  games.push({
    id: 'm7-objects', title: 'M7 · Lake Basin (4242) D objects', group: 'M7', bytes: repoFile(m7), faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 6, tiles: (m) => [...weirTiles(m), ...lakeTiles(m)], sampleHours: 2, snapshotsAt: [0.8, 1.5, 2.5, 3.5, 5, 6],
    actions: () => [{ day: D0 + 1, kind: 'deleteEntities', template: 'Blockage', tiles: plug }],
    poses: (m) => [
      { id: 'plug', kind: 'look', target: at(m, 55, 33), yaw: GAME_YAW, pitch: deg(50), distance: 38, fovY: 40, width: 1280, height: 800 },
      { id: 'weir', kind: 'look', target: at(m, 11, 88), yaw: GAME_YAW, pitch: deg(50), distance: 30, fovY: 40, width: 1280, height: 800 },
    ],
    checks: [
      { id: 'D1', title: 'No loading issues; every object listed is there', how: 'measure' },
      { id: 'D2', title: 'The weir holds the water about 0.65 deeper upstream and water flows over it', how: 'measure' },
      none('D3', 'A beaver walks round the thorns; builders clear them', WALK),
      none('D4', 'Relics give science when demolished; the engine and the mine can be placed', BUILD),
      { id: 'D5', title: 'With the plug gone the lake drains one level to about 8 (about 3,290 water) and then keeps it', how: 'partial', why: 'the probe removes the 3 Blockage tiles itself (as a finished demolition would) instead of beavers demolishing them' },
      ...GENERIC,
    ],
  });

  // M8
  const m8 = 'out/m8/River Valley (4242) M8 preview.timber';
  games.push({
    id: 'm8-preview', title: 'M8 · River Valley (4242) M8 preview', group: 'M8', bytes: repoFile(m8), faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 1.2, tiles: () => [[63, 65], [60, 62], [66, 68], [22, 31], [21, 30], [92, 80], [90, 81], [93, 80], [89, 82]], sampleHours: 1, snapshotsAt: [0.5, 1],
    poses: (m) => [
      { id: 'lake', kind: 'look', target: at(m, 63, 65), yaw: GAME_YAW, pitch: deg(50), distance: 32, fovY: 40, width: 1280, height: 800 },
      { id: 'weir', kind: 'look', target: at(m, 91, 81), yaw: GAME_YAW, pitch: deg(50), distance: 28, fovY: 40, width: 1280, height: 800 },
    ],
    checks: [
      { id: 'M8-1a', title: "The water stands where the editor showed it (within about 0.1); the lake's level; the weir holds the river up", how: 'measure' },
      { id: 'ML-2', title: 'Ground and water in the game against our 3D view', how: 'partial', why: 'the probe takes the screenshots at matching poses; the comparison is by eye (RESULTS.md)' },
      ...GENERIC,
    ],
  });
  const canyonEdited = 'out/m8/local/Canyon (M8 edited).timber', canyon = 'investigation/raw/builtin/Canyon.timber';
  const cozyEdited = 'out/m8/local/Cozy Secret Valley (M8 edited).timber', cozy = 'investigation/raw/workshop/Cozy Secret Valley.timber';
  if (localExists(canyonEdited) && localExists(canyon)) {
    games.push({
      id: 'm8-canyon-edited', title: 'M8 · Canyon (M8 edited), local', group: 'M8', bytes: localFile(canyonEdited), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: () => [[76, 63], [72, 59], [80, 67]], sampleHours: 2, snapshotsAt: [1], pairs: ['m8-canyon-original'],
      checks: [{ id: 'M8-1b', title: 'The new lake fills from its spring; the tunnels flow as in the original Canyon', how: 'measure' }, LOAD, OBJECTS, TERRAIN],
    });
    games.push({
      id: 'm8-canyon-original', title: 'M8 · Canyon (official, unedited), local', group: 'M8', bytes: localFile(canyon), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: () => [[76, 63]], sampleHours: 6, snapshotsAt: [1], checks: [LOAD],
    });
  }
  if (localExists(cozyEdited) && localExists(cozy)) {
    games.push({
      id: 'm8-cozy-edited', title: 'M8 · Cozy Secret Valley (M8 edited), local', group: 'M8', bytes: localFile(cozyEdited), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: () => [[14, 12], [12, 10], [16, 14]], sampleHours: 2, snapshotsAt: [1], pairs: ['m8-cozy-original'],
      checks: [{ id: 'M8-1c', title: "The rivers run at the original's level; the lowered ground fills as the editor showed", how: 'measure' }, LOAD, OBJECTS, TERRAIN],
    });
    games.push({
      id: 'm8-cozy-original', title: 'M8 · Cozy Secret Valley (workshop, unedited), local', group: 'M8', bytes: localFile(cozy), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: () => [[14, 12]], sampleHours: 6, snapshotsAt: [1], checks: [LOAD],
    });
  }

  // Map look: our generated maps at Map look's poses (ML-2's reference, and the 3D view against the game)
  for (const [theme, size] of [['riverValley', 128], ['canyon', 128], ['highlands', 128], ['lakeBasin', 128], ['delta', 128], ['islands', 128], ['riverValley', 256]] as const) {
    const lookMap = `${theme}-${size}`;
    games.push({
      id: `look-${lookMap}`, title: `Map look · ${lookMap} (4242)`, group: 'Map look', bytes: memo(() => generated(theme, 4242, size)), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1, tiles: () => [], sampleHours: 6, snapshotsAt: [1], lookMap,
      checks: [...GENERIC, { id: 'ML-2', title: 'The game at the same poses as our 3D view', how: 'partial', why: 'compared by eye (RESULTS.md)' }],
    });
  }
  const beavertopia = 'investigation/raw/workshop/Beavertopia - 256x256.timber';
  if (localExists(beavertopia))
    games.push({
      id: 'look-beavertopia-256', title: 'Map look · Beavertopia (workshop), local', group: 'Map look', bytes: localFile(beavertopia), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 0.3, tiles: () => [], sampleHours: 6, lookMap: 'beavertopia-256', checks: [LOAD],
    });

  // High terrain (Kyler, 2026-09-25): terrain above 16, up to 21, for an optional high-verticality mode
  const HIGH: CheckDef[] = [
    { id: 'high-load', title: 'Loads: no loading issue, no error or exception', how: 'measure' },
    { id: 'high-terrain', title: "Terrain above 16 is kept after the game's terrain physics (every tile's height as in the file)", how: 'measure' },
    { id: 'high-water', title: 'The stored water holds on the high terrain (after a day, within 0.1 deep of the file)', how: 'measure' },
    { id: 'high-objects', title: 'Every object is kept, those above level 16 included', how: 'measure' },
  ];
  games.push({
    id: 'high-rv96-plus5', title: 'High terrain · River Valley 96² raised 5 levels (terrain 7–21)', group: 'High terrain',
    bytes: memo(() => raised(generated('riverValley', 4242, 96), 5, 'DGM Probe high-terrain test: River Valley (4242) 96², every column raised 5 levels (terrain up to 21).')),
    faction: 'Folktails', mode: 'Normal', cycles: [calm], days: 1, tiles: () => [], sampleHours: 6, snapshotsAt: [0.5, 1], checks: HIGH,
  });
  games.push({
    id: 'high-canyon128-plus5', title: 'High terrain · Canyon 128² raised 5 levels (rim at 21)', group: 'High terrain',
    bytes: memo(() => raised(generated('canyon', 4242, 128), 5, 'DGM Probe high-terrain test: Canyon (4242) 128², every column raised 5 levels (terrain up to 21).')),
    faction: 'Folktails', mode: 'Normal', cycles: [calm], days: 1, tiles: () => [], sampleHours: 6, snapshotsAt: [0.5, 1], checks: HIGH,
  });
  games.push({
    id: 'high-highlands-mesa21', title: 'High terrain · Highlands 128² with a level-21 mesa, a spring, trees and a bush on top', group: 'High terrain',
    bytes: memo(() => mesa(generated('highlands', 4242, 128), 53, 107, 21, 'DGM Probe high-terrain test: Highlands (4242) 128² with a stepped mesa rising to level 21 at (53, 107), a spring in a pit on its top, and trees and a bush up there.')),
    faction: 'Folktails', mode: 'Normal', cycles: [calm], days: 1.5, tiles: () => [[53, 107], [52, 106], [49, 103], [57, 111], [56, 107]], sampleHours: 2, snapshotsAt: [0.5, 1, 1.5],
    poses: (m) => [{ id: 'mesa', kind: 'look', target: at(m, 53, 107), yaw: GAME_YAW, pitch: deg(40), distance: 60, fovY: 40, width: 1280, height: 800 }],
    checks: HIGH,
  });

  // Tall maps (PLAN §20 D172): terrain up to 22 with the top layer empty, written and checked by both
  // validators with tools/probe-tall.ts into C:\dgm-probe\tall. A Normal calm day and a half: the records
  // at the load, after half a day, after a day and at the end, and the water above 16 every hour.
  for (const t of tallMaps()) {
    const checks: CheckDef[] = [TALL.load, TALL.terrain, TALL.water, TALL.objects];
    if (t.start && t.start.z > 16) checks.push(TALL.start);
    if (t.sourcesAbove16.length) checks.push(TALL.sources);
    if (t.flowTiles.length || t.poolTiles.length) checks.push(TALL.flow);
    checks.push(TALL.shots);
    const seen = new Set<string>();
    const tiles = [...t.flowTiles, ...t.poolTiles, ...t.sourcesAbove16.map((s) => [s.x, s.y] as [number, number]), ...(t.start ? [[t.start.x + 1, t.start.y + 1] as [number, number]] : [])].filter(([x, y]) => !seen.has(`${x},${y}`) && !!seen.add(`${x},${y}`));
    games.push({
      id: t.id, title: t.title, group: 'Tall maps', tall: t, bytes: memo(() => tallBytes(t)), faction: 'Folktails', mode: 'Normal',
      cycles: [calm], days: 1.5, tiles: () => tiles.slice(0, 20), sampleHours: 1, snapshotsAt: [0.5, 1],
      poses: (m) => [
        { id: 'tall', kind: 'look', target: at(m, t.focus[0], t.focus[1]), yaw: GAME_YAW, pitch: deg(45), distance: 50, fovY: 40, width: 1280, height: 800 },
        { id: 'tall-side', kind: 'look', target: at(m, t.focus[0], t.focus[1]), yaw: GAME_YAW + Math.PI / 2, pitch: deg(18), distance: 70, fovY: 40, width: 1280, height: 800 },
      ],
      checks,
    });
  }

  // The cycle model's calibration points (CALIBRATION.md on investigation/cycles-exact), under forced weather
  games.push({
    id: 'cal-rv2', title: 'Calibration · River Valley seed 2, 128²: source slowdown and badtide front', group: 'Calibration',
    bytes: memo(() => generated('riverValley', 2, 128)), faction: 'Folktails', mode: 'Normal',
    cycles: [{ temperateDays: 3, hazard: 'drought', hazardDays: 3 }, { temperateDays: 3, hazard: 'badtide', hazardDays: 3 }, calm], days: 12.5,
    tiles: () => [[90, 50], [72, 61], [18, 87]], sampleHours: 0.5, daily: true, model: true,
    checks: [
      { id: 'cal-1', title: 'Source slowdown: River Valley (90, 50) before the drought and through its first day', how: 'measure' },
      { id: 'cal-3', title: 'Badtide front: River Valley (72, 61) before the badtide and after its first day', how: 'measure' },
      { id: 'cal-timeline', title: "The map's water, moisture and plants day by day against the model", how: 'measure' },
      LOAD, OBJECTS, WATER,
    ],
  });
  games.push({
    id: 'cal-rv2-hard', title: 'Calibration · River Valley seed 2, 128², a 14-day Hard drought: plant timer', group: 'Calibration',
    bytes: memo(() => generated('riverValley', 2, 128)), faction: 'Folktails', mode: 'Hard',
    cycles: [{ temperateDays: 2, hazard: 'drought', hazardDays: 14 }, calm], days: 17,
    tiles: () => [[18, 87], [90, 50]], sampleHours: 1, daily: true, model: true,
    checks: [
      { id: 'cal-4', title: 'Plant timer: dry plants die 0.9–1.1 × their dry days after the soil dries (BlueberryBush (18, 87))', how: 'measure' },
      { id: 'cal-timeline', title: "The map's water, moisture and plants day by day against the model", how: 'measure' },
      LOAD,
    ],
  });
  games.push({
    id: 'cal-lb2-hard', title: 'Calibration · Lake Basin seed 2, 128², a 6-day Hard drought: evaporation', group: 'Calibration',
    bytes: memo(() => generated('lakeBasin', 2, 128)), faction: 'Folktails', mode: 'Hard',
    cycles: [{ temperateDays: 2, hazard: 'drought', hazardDays: 6 }, calm], days: 8.5,
    tiles: () => [[45, 36]], sampleHours: 1, daily: true, model: true,
    checks: [
      { id: 'cal-2', title: 'Evaporation: Lake Basin (45, 36) before the drought, at its start and on its fourth day', how: 'measure' },
      { id: 'cal-timeline', title: "The map's water, moisture and plants day by day against the model", how: 'measure' },
      LOAD,
    ],
  });

  // M9a's in-game gate (ROADMAP M9a, Release; PLAN §20 D116): generator 0.7.0's maps, their terrain
  // and water grown from processes, played in the game. Every game but the tall one: 3 temperate days,
  // a 3-day drought, 3 temperate days, a 3-day badtide, then calm (12.5 days), compared with the cycle
  // model day by day. The tolerances, stated before the batch runs: load (no loading issue, no error
  // or exception, the start placed); objects (every object at its tile); water (after a day 95% of
  // wet tiles within 0.1 deep of the file, the volume within 10%); terrain (every tile's height as in
  // the file); cal-timeline (the map's water volume and wet tiles within 5% of the model each day; the
  // wet tiles judged as D297 judges water, tiles within 0.01 of the 0.05 line left out, D302);
  // drought-start-water (the start's water, the water `start.water` counts, within 10% of its volume
  // of the model through the drought); m9a-badwater (before the badtide, the start's water under 5%
  // contamination, and badwater only within 3 tiles of the file's); m9a-weir (the water beside the weir within 0.1 deep of the
  // file's after a day, and at least 0.6 deep upstream); m9a-nobad (no badwater source, and the badtide
  // still turns the water bad); the tall map's high-* checks; m9a-shots (nothing visibly broken, by
  // eye from the contact sheet).
  const M9A_CYCLES: Cycle[] = [{ temperateDays: 3, hazard: 'drought', hazardDays: 3 }, { temperateDays: 3, hazard: 'badtide', hazardDays: 3 }, calm];
  const M9A_SHOTS: CheckDef = { id: 'm9a-shots', title: 'The screenshots show nothing visibly broken', how: 'partial', why: 'judged by eye from the contact sheet' };
  const M9A_WEATHER: CheckDef[] = [
    { id: 'cal-timeline', title: "The map's water, moisture and plants day by day against the model, through a drought and a badtide", how: 'measure' },
    { id: 'drought-start-water', title: "The start's water through a Normal drought, against the model", how: 'measure' },
  ];
  const M9A_BADWATER: CheckDef = { id: 'm9a-badwater', title: "Badwater stays in its hollow and its way down; the start's water stays clean until the badtide", how: 'measure' };
  const m9aGame = (id: string, title: string, bytes: () => Uint8Array, extra: CheckDef[] = [], mode: GameDef['mode'] = 'Normal', tiles: (m: MapInfo) => [number, number][] = (m) => startWater(m, mode).slice(0, 6)): GameDef => ({
    id, title: `M9a · ${title}`, group: 'M9a', bytes: memo(bytes), faction: 'Folktails', mode,
    cycles: M9A_CYCLES, days: 12.5, tiles, sampleHours: 1, daily: true, model: true,
    checks: [...GENERIC, ...M9A_WEATHER, ...extra, M9A_SHOTS],
  });
  for (const [theme, name] of [['any', 'Any'], ['riverValley', 'River Valley'], ['canyon', 'Canyon'], ['highlands', 'Highlands'], ['lakeBasin', 'Lake Basin'], ['delta', 'Delta'], ['islands', 'Islands']] as const)
    games.push(m9aGame(`m9a-${theme}-128`, `${name} 128² (seed 1)`, () => generatedFrom(`s=1&t=${theme}&z=128&d=n`), [M9A_BADWATER]));
  games.push(m9aGame('m9a-any-96', 'Any 96² (seed 2)', () => generatedFrom('s=2&t=any&z=96&d=n'), [M9A_BADWATER]));
  games.push(m9aGame('m9a-any-192', 'Any 192² (seed 3)', () => generatedFrom('s=3&t=any&z=192&d=n'), [M9A_BADWATER]));
  games.push(m9aGame('m9a-any-256', 'Any 256² (seed 4)', () => generatedFrom('s=4&t=any&z=256&d=n'), [M9A_BADWATER]));
  games.push(m9aGame('m9a-any-hard', 'Any 128², designed for Hard, played on Hard (seed 5)', () => generatedFrom('s=5&t=any&z=128&d=h'), [M9A_BADWATER], 'Hard'));
  games.push(
    m9aGame('m9a-no-badwater', 'Any 128², No badwater (seed 6)', () => generatedFrom('s=6&t=any&z=128&d=n&bw=0'), [
      { id: 'm9a-nobad', title: 'No badwater source on the map, and the badtide still turns its water bad', how: 'measure' },
    ]),
  );
  games.push(
    m9aGame('m9a-weir', 'Lake Basin 96², a pre-built weir (the first seed with one)', () => firstGenerated((seed) => `s=${seed}&t=lakeBasin&z=96&d=n`, (r) => r.features.some((f) => f.kind === 'mapObject' && f.params.kind === 'weir')), [
      M9A_BADWATER,
      { id: 'm9a-weir', title: 'The weir holds its river: the water beside it as in the file after a day, 0.6 deep or more upstream', how: 'measure' },
    ], 'Normal', (m) => [...weirTiles(m), ...startWater(m).slice(0, 4)]),
  );
  games.push(
    m9aGame('m9a-rise', 'Highlands 128², ruins on a rise (the first seed with one)', () => firstGenerated((seed) => `s=${seed}&t=highlands&z=128&d=n`, (r) => r.features.some((f) => f.kind === 'setPiece' && f.params.kind === 'obstaclePayoff')), [M9A_BADWATER]),
  );
  // a tall map (Verticality 85: land above 16, D172), a calm day and a half like the tall maps
  games.push({
    id: 'm9a-tall', title: 'M9a · Any 128², Verticality 85: land above 16 (seed 7)', group: 'M9a', bytes: memo(() => generatedFrom('s=7&t=any&z=128&d=n&vt=85')), faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 1.5, tiles: (m) => startWater(m).slice(0, 6), sampleHours: 1, snapshotsAt: [0.5, 1],
    checks: [
      { id: 'high-load', title: 'Loads: no loading issue, no error or exception', how: 'measure' },
      { id: 'high-terrain', title: "The land above 16 is kept after the game's terrain physics (every tile's height as in the file)", how: 'measure' },
      { id: 'high-water', title: 'The stored water holds on the tall land (after a day, within 0.1 deep of the file)', how: 'measure' },
      { id: 'high-objects', title: 'Every object is kept, those above level 16 included', how: 'measure' },
      M9A_SHOTS,
    ],
  });

  // M9b's pooled batch (PLAN §20 D308 (2), D325 step 7, D333 (1)): generator 0.8.0's maps from
  // feature/m9b, played through M9a's weather (3 temperate days, a 3-day drought, 3 temperate, a
  // 3-day badtide, then calm) and compared with the cycle model day by day, with M9a's tolerances
  // stated above. Two maps per theme at 128²; two chaos maps (Any at Variety 100 and Verticality 100,
  // 256², D273 (6)); two maps with Sources: None (D330: no source and no water, the land and plants
  // as generated). What batch 5 changed and these checks watch: the base raise and the edge lip (the
  // water holds as in the file after a day, and a river's head keeps its water: `water` and
  // cal-timeline's volume), living trees only (cal-timeline's plants against the model), and badwater
  // contained (m9a-badwater: before the badtide the start's water stays clean and badwater stays
  // within 3 tiles of the file's).
  const m9bGame = (id: string, title: string, fragment: string, extra: CheckDef[]): GameDef => ({
    id, title: `M9b · ${title}`, group: 'M9b', bytes: memo(() => generatedFrom(fragment)), faction: 'Folktails', mode: 'Normal',
    cycles: M9A_CYCLES, days: 12.5, tiles: (m) => startWater(m, 'Normal').slice(0, 6), sampleHours: 1, daily: true, model: true,
    checks: [...GENERIC, M9A_WEATHER[0], ...extra, M9A_SHOTS],
  });
  for (const [theme, name] of [['any', 'Any'], ['riverValley', 'River Valley'], ['canyon', 'Canyon'], ['highlands', 'Highlands'], ['lakeBasin', 'Lake Basin'], ['delta', 'Delta'], ['islands', 'Islands']] as const)
    for (const seed of [1, 2]) games.push(m9bGame(`m9b-${theme}-128-${seed}`, `${name} 128² (seed ${seed})`, `s=${seed}&t=${theme}&z=128&d=n`, [M9A_WEATHER[1], M9A_BADWATER]));
  for (const seed of [1, 2]) games.push(m9bGame(`m9b-chaos-256-${seed}`, `Chaos: Any 256², Variety 100, Verticality 100 (seed ${seed})`, `s=${seed}&t=any&z=256&d=n&vy=100&vt=100`, [M9A_WEATHER[1], M9A_BADWATER]));
  games.push(m9bGame('m9b-none-any', 'Any 128², Sources: None (seed 3)', 's=3&t=any&z=128&d=n&so=n', []));
  games.push(m9bGame('m9b-none-rv', 'River Valley 128², Sources: None (seed 5)', 's=5&t=riverValley&z=128&d=n&so=n', []));

  // Any time: E4, a map with no StartingLocation (last: the game may stop on it)
  const e4 = memo(() => withoutStart(new Uint8Array(readFileSync(join(REPO, m1)))));
  const e4game: GameDef = {
    id: 'e4-no-start', title: 'E4 · River Valley (4242) with no StartingLocation', group: 'Any time', bytes: e4, faction: 'Folktails', mode: 'Normal',
    cycles: [calm], days: 0.3, tiles: () => [], sampleHours: 6,
    checks: [
      { id: 'E4', title: 'Start a new game on a map with no StartingLocation: record what happens', how: 'measure' },
      none('E1', 'Terrain above 16 in the map editor', EDITOR + ' (the high-terrain maps check the game itself)'),
      none('E2', 'A beaver walks through a ruin column', WALK),
      none('E3', 'An aquifer with a powered drill in a drought', BUILD),
    ],
  };

  // Maps from the command line (the M9 prototypes, for example): a Normal drought, compared with the model
  for (const path of extraMaps) {
    const name = basename(path).replace(/\.timber$/i, '');
    games.push({
      id: 'map-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title: name, group: 'Given maps',
      bytes: memo(() => new Uint8Array(readFileSync(path))), faction: 'Folktails', mode: 'Normal',
      // 3 temperate days (every generated map's source ramp is under a day), then Normal's longest first drought (3 days)
      cycles: [{ temperateDays: 3, hazard: 'drought', hazardDays: 3 }, calm], days: 6.5,
      tiles: (m) => startWater(m).slice(0, 6), sampleHours: 1, daily: true, model: true,
      checks: [...GENERIC, { id: 'drought-start-water', title: "The start's water through a Normal drought, against the model and the map's brief", how: 'measure' }],
    });
  }
  games.push(e4game);
  return games;
}

// ------------------------------------------------------------------------------------ tile finders

/** The NaturalDam tiles and their wet neighbours on both sides (weirs). */
export function weirTiles(m: MapInfo): [number, number][] {
  const dams = m.entities.filter((e) => e.template === 'NaturalDam').map((e) => [e.x, e.y] as [number, number]);
  const out = new Map<number, [number, number]>();
  for (const [x, y] of dams) {
    out.set(y * m.W + x, [x, y]);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const nx = x + dx, ny = y + dy, t = ny * m.W + nx;
      if (nx >= 0 && ny >= 0 && nx < m.W && ny < m.H && m.depth[t] > 0.05 && !dams.some(([a, b]) => a === nx && b === ny)) out.set(t, [nx, ny]);
    }
  }
  return [...out.values()].slice(0, 16);
}

/** A few tiles of the largest body of water (the deepest and three more). */
export function lakeTiles(m: MapInfo): [number, number][] {
  const lake = wetAreas(m)[0];
  if (!lake) return [];
  const sorted = [...lake.tiles].sort((a, b) => m.depth[b] - m.depth[a]);
  return [sorted[0], sorted[Math.floor(sorted.length / 4)], sorted[Math.floor(sorted.length / 2)], sorted[Math.floor((3 * sorted.length) / 4)]].map((t) => [t % m.W, (t / m.W) | 0] as [number, number]);
}

export interface StartWater {
  /** The water tiles a pump on a shore the start walks to reaches, the shortest walk first. */
  pump: { x: number; y: number; walk: number }[];
  /** The bodies of water (4-connected, over 0.05 deep) those tiles are in: the start's water. */
  bodies: number[][];
  /** The rule's walk for the difficulty (12 / 20 / 28). */
  within: number;
}

const startWaterCache = new WeakMap<MapInfo, Map<string, StartWater>>();

/**
 * The start's water by the product's own water rule, `start.water` (PLAN §11.4, D153): clean water a
 * pump reaches (0.3 deep or more, under 5% badwater, its surface 0–2 levels below the shore) beside a
 * shore tile the start walks to within the rule's walk for the difficulty, over the map's own ground and
 * its slopes (never player stairs), from the district center's middle tile; walking blocked by the
 * same objects. The same pieces as `checkStart` in src/core/validate/playability.ts; the probe's self-test
 * checks the nearest against the product's own verdict. Nothing when the map has no start.
 */
export function startWaterOf(m: MapInfo, mode: GameDef['mode'] = 'Normal'): StartWater {
  let byMode = startWaterCache.get(m);
  if (!byMode) startWaterCache.set(m, (byMode = new Map()));
  const known = byMode.get(mode);
  if (known) return known;
  const { W, H, heights: h } = m;
  const N = W * H;
  const within = DIFFICULTY_RULES[mode.toLowerCase() as 'easy' | 'normal' | 'hard'].waterWithin;
  const result: StartWater = { pump: [], bodies: [], within };
  byMode.set(mode, result);
  if (!m.start) return result;
  const place = (e: MapInfo['entities'][number]): Placement => {
    const bo = e.components.BlockObject as { Flipped?: boolean } | undefined;
    return { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation as Orientation, flipped: bo?.Flipped === true };
  };
  const blocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const e of m.entities) {
    if (WALK_BLOCKERS.has(e.template) && FOOTPRINTS[e.template]) for (const [x, y] of footprintTiles(e.template, place(e))) if (x >= 0 && x < W && y >= 0 && y < H) blocked[y * W + x] = 1;
    if (e.template !== 'Slope' || e.x < 0 || e.x >= W || e.y < 0 || e.y >= H) continue;
    const [dx, dy] = slopeHighSide(e.orientation as Orientation);
    const hx = e.x + dx, hy = e.y + dy;
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) links.push([e.y * W + e.x, hy * W + hx]);
  }
  const cells = worldBlocks(FOOTPRINTS.StartingLocation, place(m.start)).filter((b) => b.localZ === 0);
  const sx = Math.round(cells.reduce((a, b) => a + b.x, 0) / cells.length);
  const sy = Math.round(cells.reduce((a, b) => a + b.y, 0) / cells.length);
  const walk = walkDistance(h, W, H, blocked, links, { x: sx, y: sy });
  const counted = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const d = m.depth[i];
    if (!(d >= PUMP_DEPTH) || !(m.contamination[i] < PUMP_CLEAN)) continue;
    const surface = h[i] + d;
    const x = i % W, y = (i - x) / W;
    let best = Infinity;
    for (const n of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1]) {
      if (n < 0 || !(walk[n] < best)) continue;
      if (surface >= h[n] - PUMP_REACH && surface <= h[n] + 0.01) best = walk[n];
    }
    if (best <= within) {
      result.pump.push({ x, y, walk: best });
      counted[i] = 1;
    }
  }
  const dist2 = (p: { x: number; y: number }) => (p.x - sx) ** 2 + (p.y - sy) ** 2;
  result.pump.sort((a, b) => a.walk - b.walk || dist2(a) - dist2(b) || a.y - b.y || a.x - b.x);
  result.bodies = wetAreas(m).filter((a) => a.tiles.some((t) => counted[t])).map((a) => a.tiles);
  return result;
}

/** The start's water tiles (the water `start.water` counts, the shortest walk first), or a lake's
 *  tiles on a map with no start. */
export function startWater(m: MapInfo, mode: GameDef['mode'] = 'Normal'): [number, number][] {
  if (!m.start) return lakeTiles(m);
  return startWaterOf(m, mode).pump.map((p) => [p.x, p.y]);
}

export { within, readMapBytes };
