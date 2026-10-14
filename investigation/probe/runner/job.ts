// The job file the mod reads (job.json in the folder given with -dgmprobeHome: C:\dgm-probe) and the
// results it writes.
// The C# side mirrors these shapes (mod/src/Job.cs, mod/src/Results.cs); keep the two in step.

/** Game time as the game counts it: day 1 starts at 00:00 of the first day, and a new game starts at
 *  04:00, so the first moment of a game is day 1 + 4/24. Hazards start at 00:00 of a day. */
export type GameDay = number;
export const NEW_GAME_DAY: GameDay = 1 + 4 / 24;

export type Hazard = 'drought' | 'badtide';

/** One weather cycle: temperate days, then the hazard. The mod imposes each cycle as it starts. */
export interface Cycle {
  temperateDays: number;
  hazard: Hazard;
  hazardDays: number;
}

/**
 * A camera pose. `current`: the camera exactly as the game has it (its opening view). `game`: the numbers
 * below with the game's own field of view.
 * `look`: our 3D view's orbit camera, in the view's world (x east, y up, z = −north), vertical field
 * of view `fovY` degrees and an image of `width` × `height`; the mod renders the same frame.
 */
export interface Pose {
  id: string;
  kind: 'look' | 'game' | 'current';
  target: [number, number, number];
  yaw: number;
  pitch: number;
  distance: number;
  fovY: number;
  width: number;
  height: number;
  /** The Map look capture this pose reproduces, relative to docs/map-look/after/. */
  lookCapture?: string;
}

export interface Moment {
  id: string;
  day: GameDay;
  /** A whole-map record: water, soil and plants on every tile. */
  snapshot: boolean;
  shots: string[];
}

export interface Action {
  day: GameDay;
  /** Remove every entity of `template` standing on one of `tiles` (all of them without tiles), as a
   *  finished demolition would. */
  kind: 'deleteEntities';
  template: string;
  tiles?: [number, number][];
}

export interface JobMap {
  id: string;
  title: string;
  /** Absolute path of the .timber the mod starts. */
  mapFile: string;
  faction: 'Folktails' | 'IronTeeth';
  mode: 'Easy' | 'Normal' | 'Hard';
  cycles: Cycle[];
  /** Stop the game at this day. */
  endDay: GameDay;
  /** Real seconds this map may take before the mod gives up on it. */
  timeoutSeconds: number;
  /** Tiles whose water and soil are recorded every `sampleHours`. */
  tiles: [number, number][];
  sampleHours: number;
  moments: Moment[];
  actions: Action[];
  poses: Pose[];
  /** How smoothly the game runs the map (mod/src/PerfMeter.cs): absent for most maps. */
  perf?: PerfSpec;
}

/**
 * Frame times after the map's first day (PLAN §20 D357 (9)): each phase holds a game speed (0: the job's speed) for
 * `seconds` real seconds while the camera pans over the whole map at its own zoom and angles, with the player's
 * graphics; the first `warmup` seconds of a phase are not counted. Nothing else is recorded meanwhile: the moments,
 * samples and the end wait until the phases are done.
 */
export interface PerfSpec {
  /** The game day the phases start at. */
  startDay: GameDay;
  /** Tiles between the pan's rows down the long axis. */
  rowSpacing: number;
  phases: { id: string; speed: number; seconds: number; warmup: number }[];
}

export interface PerfPhaseResult {
  id: string;
  speed: number;
  /** Real seconds measured (after the warm-up) and the frames in them. */
  seconds: number;
  frames: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  over50Ms: number;
  over100Ms: number;
  /** Game days the phase ran, and game seconds a real second (1 at normal speed when the game keeps up). */
  days: number;
  speedReached: number;
  workingSetMb: number;
}

export interface PerfResult {
  environment?: { screen: string; vSync: number; targetFrameRate: number; qualityLevel: string; gpu: string; cpu: string; memoryMb: number };
  camera?: string;
  phases: PerfPhaseResult[];
}

export interface JobSettings {
  /** The game speed to hold (the UI's fastest is 3); the mod lowers it if frames get too slow. */
  speed: number;
  lowGraphics: boolean;
  heartbeatSeconds: number;
  /** Real seconds a map may take before the mod gives up on it and moves on. */
  mapTimeoutSeconds: number;
  quitWhenDone: boolean;
}

export interface Job {
  version: 1;
  runId: string;
  createdAt: string;
  settings: JobSettings;
  maps: JobMap[];
}

// ---------------------------------------------------------------------------------------- results

/** A water column as the mod records it: floor, depth, contamination, and (from mod 0.3.0) overflow, a
 *  full cave's pressure (0 in the open). */
export type WaterColumnRecord = [number, number, number] | [number, number, number, number];
/** A terrain column (a solid run) as the mod records it (from 0.3.0): floor, ceiling (its top, where
 *  plants stand), moisture, soil contamination. */
export type TerrainRunRecord = [number, number, number, number];

export interface TileSample {
  x: number;
  y: number;
  /** Every water column on the tile, bottom up. */
  columns: WaterColumnRecord[];
  moisture: number;
  soilContamination: number;
  /** On a tile with more than one terrain column (from mod 0.3.0): every terrain column, bottom up. */
  runs?: TerrainRunRecord[];
}

export interface SampleRow {
  day: GameDay;
  tick: number;
  weather: string;
  tiles: TileSample[];
}

export interface EntityRecord {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: string;
  /** Plants: living, dead, dry, flooded, contaminated; growth 0..1. */
  plant?: { dead: boolean; dry: boolean; flooded: boolean; contaminated: boolean; growth: number; diedDay?: GameDay; cause?: string };
  /** Water and badwater sources: specified and current strength, contamination. */
  source?: { specified: number; current: number; contamination: number };
}

export interface MapSnapshot {
  momentId: string;
  day: GameDay;
  tick: number;
  weather: string;
  width: number;
  height: number;
  /** Per tile, the top water column (the one a player sees): depth, contamination, its floor. */
  depth: number[];
  contamination: number[];
  floor: number[];
  moisture: number[];
  soilContamination: number[];
  /** The terrain after the game's terrain physics: the top terrain column's ceiling (first air level)
   *  and the number of terrain columns (1 without caves). */
  terrain: number[];
  terrainColumns: number[];
  /** Tiles with more than one water column (caves, overhangs): x, y and every column. */
  layered: { x: number; y: number; columns: WaterColumnRecord[] }[];
  /** Tiles with more than one terrain column (from mod 0.3.0): x, y and every terrain column, so the soil
   *  of cave floors and roofs is recorded, not only the top one's. */
  terrainLayered?: { x: number; y: number; runs: TerrainRunRecord[] }[];
  plants: EntityRecord[];
  sources: EntityRecord[];
}

export interface Shot {
  momentId: string;
  pose: string;
  file: string;
  day: GameDay;
}

export interface LogLine {
  realTime: string;
  type: string;
  message: string;
  stack?: string;
}

export interface MapResult {
  runId: string;
  mapId: string;
  title: string;
  mapFile: string;
  status: 'done' | 'failed' | 'timeout';
  failure?: string;
  gameVersion: string;
  modVersion: string;
  startedAt: string;
  endedAt: string;
  /** Real seconds, and the game speed actually held. */
  realSeconds: number;
  ticks: number;
  meanSpeed: number;
  /** The weather as the game ran it: each cycle's temperate length, hazard and hazard length. */
  weather: { cycle: number; temperateDays: number; hazard: string; hazardDays: number }[];
  weatherEvents: { day: GameDay; event: string }[];
  loadingIssues: string[];
  start: { districtCenter: { x: number; y: number; z: number; orientation: string } | null; adults: number; children: number; bots: number };
  entitiesAtStart: EntityRecord[];
  entitiesAtEnd: EntityRecord[];
  plantDeaths: { id: string; template: string; x: number; y: number; day: GameDay; cause: string }[];
  samples: SampleRow[];
  snapshots: string[];
  shots: Shot[];
  log: LogLine[];
  actions: { day: GameDay; kind: string; template: string; removed: number }[];
  notes: string[];
  /** Real seconds from starting the new game to the game's interface, and the game's memory then (mod 0.2.1). */
  loadSeconds?: number;
  workingSetAtLoadMb?: number;
  perf?: PerfResult;
}
