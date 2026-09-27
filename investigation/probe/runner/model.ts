// The weather-cycle model (branch investigation/cycles-exact, investigation/cycles/: FIDELITY.md) run on
// the same file with the same forced weather as the game, so the two can be compared tick for tick.
// The model is not on dev: its four source files are taken from git at a fixed commit into the ignored
// .cache/cycles/, with their imports of src/ pointed back at this checkout (the same approach the cycles
// study uses for its first model). src/core/sim, gen and features are unchanged between that branch's base
// and dev, so its predictions hold for this checkout's maps. The model starts from what the game loads:
// the file's water and the outflows the file stores (its momentum; M9a's probe re-run
// 20260927-1443-batch: started at rest instead, the model missed the game on files that store them).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cycle } from './job';
import { readMapBytes, storedOutflows } from './mapfile';
import { CACHE, REPO } from './paths';

export const MODEL_COMMIT = 'a9cdb86';
const FILES = ['model.ts', 'weather.ts', 'game-water.ts', 'game-soil.ts'];
const DIR = join(CACHE, 'cycles');

export function ensureModel(): string {
  mkdirSync(DIR, { recursive: true });
  const stamp = join(DIR, `.commit-${MODEL_COMMIT}`);
  if (existsSync(stamp)) return DIR;
  for (const f of FILES) {
    const text = execFileSync('git', ['-C', REPO, 'show', `${MODEL_COMMIT}:investigation/cycles/${f}`], { encoding: 'utf8', maxBuffer: 16 << 20 });
    // investigation/cycles/x.ts imports '../../src/…'; .cache/cycles/x.ts sits two levels deeper.
    writeFileSync(join(DIR, f), text.replace(/(['"])\.\.\/\.\.\/src\//g, '$1../../../../src/'));
  }
  writeFileSync(stamp, new Date().toISOString());
  return DIR;
}

export interface ModelTile {
  depth: number;
  contamination: number;
  surface: number;
  moisture: number;
  soilContamination: number;
}

export interface ModelRun {
  /** Per requested day: per requested tile. */
  samples: { day: number; tiles: ModelTile[] }[];
  /** Whole-map water per requested snapshot day. */
  maps: { day: number; depth: Float32Array; contamination: Float32Array; moisture: Float32Array; soilContamination: Float32Array }[];
  plants: { tile: number; species: string; initialDead: boolean; diedDay: number | null; cause: string | null; dryFrom: number | null }[];
  W: number;
  H: number;
  cpuSeconds: number;
  /** How the water's momentum started: the file's stored outflows, or at rest. */
  momentum: string;
}

/**
 * Runs the model from the map's stored state (a new game: day 1, 04:00) through `cycles`, sampling
 * `tiles` at each of `sampleDays` and the whole map at each of `mapDays` (game days, as the mod counts).
 */
export function runModel(bytes: Uint8Array, name: string, cycles: Cycle[], endDay: number, tiles: [number, number][], sampleDays: number[], mapDays: number[]): ModelRun {
  ensureModel();
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { CycleModel, newGame } = require(join(DIR, 'model.ts'));
  const { TICKS_PER_DAY } = require(join(DIR, 'weather.ts'));
  const { MapSession } = require('../../../src/core/doc/session');
  const cpu0 = process.cpuUsage();
  // The terrain, objects and water model from the project's importer; the starting water and soil from the
  // file itself, which is what the game loads (an unedited import keeps its water in the file).
  const imported = MapSession.importMap(bytes, name).built;
  const file = readMapBytes(bytes);
  const N = imported.W * imported.H;
  // The importer's objects carry no components (it keeps them in the file); the model reads sources'
  // strengths, timers and plants' death state from them, so they are taken from the file by id.
  const byId = new Map(file.entities.map((e) => [e.id, e.components]));
  const entities = imported.entities.map((e: { id: string; components: object; before?: object }) => {
    const c = byId.get(e.id);
    return c ? { ...e, before: {}, components: c } : e;
  });
  // The water's momentum as the game loads it: the outflows the file stores (FORMAT.md §4.3; generator
  // 0.7.0 writes the settled water's own). A file that stores none (all "0", as official maps and
  // earlier generators ship) starts every river from rest, in the game and here alike.
  const flows = storedOutflows(file.file);
  const built = {
    ...imported,
    entities,
    water: Float64Array.from(file.depth),
    contamination: Float64Array.from(file.contamination),
    moisture: Float64Array.from(file.moisture),
    soilContamination: Float64Array.from(file.soilContamination),
    settle: { ...imported.settle, sat: imported.settle?.sat?.length === N ? imported.settle.sat : undefined, out: flows?.out },
  };
  const plans = [...cycles, ...Array.from({ length: 4 }, () => ({ temperateDays: 60, hazard: 'drought', hazardDays: 0 }))].map((c, i) => ({
    cycle: i + 1,
    temperate: c.temperateDays,
    hazard: c.hazard,
    hazardDays: c.hazardDays,
    occurrence: 1,
    badtideChance: null,
  }));
  // settleMomentum: the model's own option to start from `settle.out` instead of zeros
  const model = new CycleModel(built, newGame(plans), flows ? { settleMomentum: true } : {});
  const W: number = built.W, H: number = built.H;
  const day = () => model.clock.dayNumber + model.clock.ticksToday / TICKS_PER_DAY;
  const sDays = [...sampleDays].sort((a, b) => a - b);
  const mDays = [...mapDays].sort((a, b) => a - b);
  const momentum = !flows
    ? 'at rest (the file stores no outflows the model can play: more than one water level, or none)'
    : flows.flowing
      ? `the file's outflows (${flows.flowing} flowing${flows.skipped ? `, ${flows.skipped} with an unexpected target left at 0` : ''})`
      : 'at rest (the file stores every outflow as 0)';
  const out: ModelRun = { samples: [], maps: [], plants: [], W, H, cpuSeconds: 0, momentum };
  const dryFrom = new Map<number, number>();
  const tileOf = (x: number, y: number): ModelTile => {
    const i = y * W + x;
    const d = model.sim.D[i];
    return { depth: d, contamination: d > 0 ? model.sim.C[i] : 0, surface: model.sim.F[i] + d, moisture: model.M[i], soilContamination: model.SC[i] };
  };
  const take = () => {
    const now = day();
    while (sDays.length && now >= sDays[0] - 1e-9) {
      sDays.shift();
      out.samples.push({ day: now, tiles: tiles.map(([x, y]) => tileOf(x, y)) });
    }
    while (mDays.length && now >= mDays[0] - 1e-9) {
      mDays.shift();
      const N = W * H;
      const m = { day: now, depth: new Float32Array(N), contamination: new Float32Array(N), moisture: new Float32Array(N), soilContamination: new Float32Array(N) };
      for (let i = 0; i < N; i++) {
        m.depth[i] = model.sim.D[i];
        m.contamination[i] = model.sim.D[i] > 0 ? model.sim.C[i] : 0;
        m.moisture[i] = model.M[i];
        m.soilContamination[i] = model.SC[i];
      }
      out.maps.push(m);
    }
  };
  take();
  let ticks = 0;
  while (day() < endDay) {
    model.tick();
    ticks++;
    take();
    if (ticks % 8 === 0)
      for (let k = 0; k < model.plants.length; k++) {
        const p = model.plants[k];
        if (!p.dead && p.isDry && !dryFrom.has(k)) dryFrom.set(k, day());
        if (!p.isDry) dryFrom.delete(k);
      }
  }
  const startDay = 1 + 128 / TICKS_PER_DAY;
  out.plants = model.plants.map((p: any, k: number) => ({
    tile: p.tile,
    species: p.species,
    initialDead: p.initialDead,
    diedDay: p.diedAt == null ? null : startDay + p.diedAt,
    cause: p.cause,
    dryFrom: dryFrom.get(k) ?? null,
  }));
  const cpu = process.cpuUsage(cpu0);
  out.cpuSeconds = (cpu.user + cpu.system) / 1e6;
  return out;
}
