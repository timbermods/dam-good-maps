// The terrain-3D group: the test maps T1–T6 for terrain above terrain (investigation/terrain3d/DESIGN.md
// §8; PLAN §20 D127, D279), written with tools/probe-3d.ts into C:\dgm-probe\terrain3d, and their checks.
// Every expectation comes from the map file itself and the 3D foundations' own modules: the terrain the
// support rule keeps (src/core/terrain/support.ts), the stacked water engine from the file's water
// (src/core/sim/stack.ts), and soil per run on the game's own water (src/core/sim/soil3d.ts). Needs DGM
// Probe 0.3.0 or later for the water columns' overflow and the soil of every terrain column.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckDef, GameDef, Verdict } from './catalog';
import type { Ctx } from './compare';
import { logProblems, objectsDiff } from './compare';
import { NEW_GAME_DAY, type Cycle, type MapSnapshot, type Pose, type WaterColumnRecord } from './job';
import type { MapInfo } from './mapfile';
import { terrain3dDir } from './paths';
import { isObject, type JsonObject } from '../../../src/core/format/json';
import { terrainColumns, voxelMasks, type TerrainColumns, type VoxelMasks, type WaterColumns } from '../../../src/core/sim/columns';
import { mapObjects, type MapObject } from '../../../src/core/sim/model';
import { StackSim, TICKS_PER_DAY } from '../../../src/core/sim/stack';
import { stackModel } from '../../../src/core/sim/stackModel';
import { soil3d } from '../../../src/core/sim/soil3d';
import { stackableTops, supportRule } from '../../../src/core/terrain/support';

/** One map of terrain3d.json, the manifest tools/probe-3d.ts writes beside the maps. */
export interface Terrain3dEntry {
  id: string;
  title: string;
  tests: string;
  file: string;
  sha256: string;
  size: [number, number];
  days: number;
  snapshots: number[];
  checks: string[];
  focus: { id: string; x: number; y: number; z: number; side?: boolean }[];
  samples: [number, number][];
  maxHeight: number;
  layeredTiles: number;
  predicted: {
    dropped: number;
    droppedCells: number[];
    plantsRemoved: { id: string; template: string; x: number; y: number; z: number; air: number }[];
    wetColumns: number;
    roofedWetColumns: number;
    pressurised: number;
    settle: { settled: boolean; ticks: number } | null;
  };
}

/** The maps tools/probe-3d.ts wrote (none until it has run). */
export function terrain3dMaps(): Terrain3dEntry[] {
  const f = join(terrain3dDir(), 'terrain3d.json');
  if (!existsSync(f)) return [];
  return (JSON.parse(readFileSync(f, 'utf8')) as { maps: Terrain3dEntry[] }).maps;
}

/** A map's bytes, exactly the file the tool described (its sha256 in terrain3d.json). */
function terrain3dBytes(t: Terrain3dEntry): Uint8Array {
  const b = new Uint8Array(readFileSync(join(terrain3dDir(), t.file)));
  if (createHash('sha256').update(b).digest('hex') !== t.sha256) throw new Error(`${t.file} is not the file terrain3d.json describes: run npx tsx tools/probe-3d.ts again`);
  return b;
}

const WALK = 'needs a beaver sent along a path and watched; the probe does not direct beavers';
const BUILD = 'needs a building placed and built by beavers (a pump); the probe does not play a colony yet';

/** The group's checks; compare.ts evaluates them (T3D_EVALS). */
export const T3D: Record<string, CheckDef> = {
  't3d-load': { id: 't3d-load', title: 'Loads: no error or exception in the log, the start placed; loading issues exactly when our rules predict the game deletes terrain or plants', how: 'measure' },
  't3d-support': { id: 't3d-support', title: "The game keeps exactly the terrain our support rule keeps: every tile's terrain columns (each one on layered tiles) at the load and at the end", how: 'measure' },
  't3d-objects': { id: 't3d-objects', title: 'Every object in the file is in the game at its tile and level', how: 'measure' },
  't3d-water': { id: 't3d-water', title: "Water columns at each record against the stacked engine run from the file's water: 95% of wet columns within 0.1 deep, wet columns IoU ≥ 0.95, volume within 10%, and 90% of the columns the engine pressurises under pressure", how: 'measure' },
  't3d-soil': { id: 't3d-soil', title: "Soil moisture and contamination on every terrain run against our soil rules on the game's own water: moist and dry agree on 99.5% of runs, 99% within 0.05", how: 'measure' },
  't3d-plants': { id: 't3d-plants', title: 'The plants that fit under their roof load and those that do not are removed (pines and oaks need 3 air cells, birches 2, bushes 1)', how: 'measure' },
  't3d-start': { id: 't3d-start', title: 'The start under its roof: the district center on the StartingLocation, 9 adults and 4 children', how: 'measure' },
  't3d-walk': { id: 't3d-walk', title: 'Beavers walk the tunnels 1 and 2 high, the slope under its roof and the ledge path', how: 'none', why: WALK },
  't3d-pumps': { id: 't3d-pumps', title: 'A pump on a ledge draws from the pool below it; one over a roofed pool cannot', how: 'none', why: BUILD },
  't3d-shots': { id: 't3d-shots', title: 'The screenshots show nothing visibly broken', how: 'partial', why: 'judged by eye from the contact sheet' },
};

const GAME_YAW = -Math.PI / 6;
const deg = (d: number) => (d * Math.PI) / 180;
const calm: Cycle = { temperateDays: 60, hazard: 'drought', hazardDays: 0 };

/** The group's games, from the manifest. */
export function terrain3dGames(): GameDef[] {
  return terrain3dMaps().map((t) => {
    const seen = new Set<string>();
    const tiles = [...t.samples, ...t.focus.map((f) => [f.x, f.y] as [number, number])].filter(([x, y]) => !seen.has(`${x},${y}`) && !!seen.add(`${x},${y}`));
    let bytes: Uint8Array | undefined;
    return {
      id: t.id,
      title: t.title,
      group: 'Terrain 3D',
      terrain3d: t,
      bytes: () => (bytes ??= terrain3dBytes(t)),
      faction: 'Folktails' as const,
      mode: 'Normal' as const,
      cycles: [calm],
      days: t.days,
      tiles: () => tiles.slice(0, 24),
      sampleHours: 1,
      snapshotsAt: t.snapshots,
      poses: (m: MapInfo): Pose[] =>
        t.focus.map((f) => ({
          id: `t3d-${f.id}`,
          kind: 'look' as const,
          target: [f.x + 0.5, f.z, -(f.y + 0.5)] as [number, number, number],
          yaw: f.side ? GAME_YAW + Math.PI / 2 : GAME_YAW,
          pitch: deg(f.side ? 20 : 45),
          distance: Math.min(60, Math.max(24, Math.max(m.W, m.H) / 3)),
          fovY: 40,
          width: 1280,
          height: 800,
        })),
      checks: t.checks.map((id) => T3D[id]).filter(Boolean),
    };
  });
}

// ------------------------------------------------------------------------------------------ models

interface Model {
  /** The file's terrain, and the terrain the support rule keeps. */
  file: VoxelMasks;
  kept: VoxelMasks;
  keptRuns: TerrainColumns;
  objects: MapObject[];
  /** The water columns on the kept terrain. */
  cols: WaterColumns;
  /** The file's water per column id: depth, overflow, contamination. */
  depth: Float64Array;
  overflow: Float64Array;
  contamination: Float64Array;
}

const models = new WeakMap<MapInfo, Model>();

/** The file's terrain, objects and water, read as the game loads them. */
export function modelOf(info: MapInfo): Model {
  const cached = models.get(info);
  if (cached) return cached;
  const w = info.file.world;
  const W = w.sizeX;
  const H = w.sizeY;
  const N = W * H;
  const file = voxelMasks(W, H, w.voxels, w.layers);
  const objects = mapObjects(w);
  const kept: VoxelMasks = { W, H, mask: supportRule(file, stackableTops(W, H, objects)).kept };
  const cols = stackModel(kept, objects).cols;
  const M = cols.L * N;
  const depth = new Float64Array(M);
  const overflow = new Float64Array(M);
  const contamination = new Float64Array(M);
  const wm = w.singletons.WaterMapNew;
  if (isObject(wm) && isObject(wm.WaterColumns)) {
    const levels = Number(wm.Levels ?? 1);
    const tokens = String((wm.WaterColumns as JsonObject).Array).split(' ');
    for (let i = 0; i < N; i++)
      for (let s = 0; s < Math.min(cols.count[i], levels); s++) {
        const t = tokens[s * N + i];
        if (!t || t === '0') continue;
        const f = t.split(':');
        depth[s * N + i] = Number(f[0]) || 0;
        contamination[s * N + i] = Number(f[1]) || 0;
        overflow[s * N + i] = Number(f[2]) || 0;
      }
  }
  const m: Model = { file, kept, keptRuns: terrainColumns(kept), objects, cols, depth, overflow, contamination };
  models.set(info, m);
  return m;
}

/** The engine's water at `days` after the start, run from the file's water (as the game loads it:
 *  depth, overflow and contamination by slot, no momentum), cached per map. */
type EngineWater = { depth: Float64Array; overflow: Float64Array; contamination: Float64Array };
const runs = new WeakMap<MapInfo, { sim: StackSim; ticks: number; at: Map<number, EngineWater> }>();
export function engineAt(info: MapInfo, days: number): EngineWater {
  const m = modelOf(info);
  let r = runs.get(info);
  if (!r) {
    const sim = new StackSim(stackModel(m.kept, m.objects));
    sim.setState({ depth: m.depth, overflow: m.overflow, contamination: m.contamination });
    r = { sim, ticks: 0, at: new Map() };
    runs.set(info, r);
  }
  const ticks = Math.round(days * TICKS_PER_DAY);
  const have = r.at.get(ticks);
  if (have) return have;
  if (ticks < r.ticks) throw new Error('records must be compared in time order');
  r.sim.run(ticks - r.ticks);
  r.ticks = ticks;
  const out = { depth: r.sim.D.slice(), overflow: r.sim.O.slice(), contamination: r.sim.C.slice() };
  r.at.set(ticks, out);
  return out;
}

/** The game's water at a record, per column id of our columns: its columns matched to ours by floor
 *  (every column on layered tiles, the top wet column elsewhere). `overflow` is null when the record
 *  has no overflow (a mod before 0.3.0). */
export function recordedWater(info: MapInfo, s: MapSnapshot): { depth: Float64Array; overflow: Float64Array | null; contamination: Float64Array; unmatched: number } {
  const m = modelOf(info);
  const { W, N, L } = m.cols;
  const depth = new Float64Array(L * N);
  const contamination = new Float64Array(L * N);
  let overflow: Float64Array | null = new Float64Array(L * N);
  let unmatched = 0;
  const place = (i: number, c: WaterColumnRecord) => {
    const [floor, d, cn] = c;
    for (let k = 0; k < m.cols.count[i]; k++) {
      const id = k * N + i;
      if (m.cols.floor[id] !== floor) continue;
      depth[id] = d;
      contamination[id] = cn;
      if (overflow) {
        if (c.length < 4) overflow = null;
        else overflow[id] = c[3] ?? 0;
      }
      return;
    }
    if (d > 0) unmatched++;
  };
  const layered = new Set<number>();
  for (const t of s.layered ?? []) {
    const i = t.y * W + t.x;
    layered.add(i);
    for (const c of t.columns) place(i, c);
  }
  for (let i = 0; i < N; i++) if (!layered.has(i) && s.depth[i] > 0) place(i, [s.floor[i], s.depth[i], s.contamination[i], 0]);
  return { depth, overflow, contamination, unmatched };
}

const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const D0 = NEW_GAME_DAY;
type Result = { verdict: Verdict; detail: string };

/** The records to judge: the snapshots after the start, in time order. */
function laterSnapshots(c: Ctx): MapSnapshot[] {
  const out: MapSnapshot[] = [];
  for (const m of c.L.prepared.map.moments) {
    if (!m.snapshot || m.id === 'start') continue;
    const s = c.L.snapshot(m.id);
    if (s) out.push(s);
  }
  return out.sort((a, b) => a.day - b.day);
}

// ------------------------------------------------------------------------------------------ checks

function loadCheck(c: Ctx): Result {
  const r = c.L.result!;
  const t = c.L.prepared.game.terrain3d!;
  const probs = logProblems(r);
  const issues = r.loadingIssues ?? [];
  const expectIssues = t.predicted.dropped > 0 || t.predicted.plantsRemoved.length > 0;
  const startOk = !c.L.info.start || !!r.start?.districtCenter;
  const ok = r.status === 'done' && probs.errors.length === 0 && startOk && expectIssues === issues.length > 0 && !(c.otherMods ?? []).length;
  return {
    verdict: ok ? 'passed' : 'failed',
    detail: [
      `status ${r.status}${r.failure ? ` (${r.failure})` : ''}`,
      `${issues.length} loading issues${issues.length ? `: ${issues.slice(0, 4).join('; ')}${issues.length > 4 ? ' …' : ''}` : ''} (our rules predict ${expectIssues ? `${t.predicted.dropped} voxels and ${t.predicted.plantsRemoved.length} plants removed` : 'none'})`,
      probs.errors.length ? `${probs.errors.length} errors in the log: ${probs.errors.slice(0, 3).join(' | ')}` : 'no error or exception in the log',
      c.L.info.start ? (r.start?.districtCenter ? `district center at (${r.start.districtCenter.x}, ${r.start.districtCenter.y}, ${r.start.districtCenter.z})` : 'no district center') : 'the map has no start',
    ].join('; '),
  };
}

function supportCheck(c: Ctx): Result {
  const info = c.L.info;
  const m = modelOf(info);
  const { N, W, count, floor, ceil } = m.keptRuns;
  const snaps = [c.L.snapshot('start'), c.L.snapshot('end')].filter((s): s is MapSnapshot => !!s);
  if (!snaps.length) return { verdict: 'not measurable', detail: 'the start and end records are missing' };
  const parts: string[] = [];
  let bad = 0;
  let runsChecked = true;
  for (const s of snaps) {
    let differ = 0;
    const ex: string[] = [];
    const layered = new Map((s.terrainLayered ?? []).map((t) => [t.y * W + t.x, t.runs] as const));
    if (!s.terrainLayered) runsChecked = false;
    for (let i = 0; i < N; i++) {
      const n = count[i];
      const top = ceil[(n - 1) * N + i];
      let same = s.terrainColumns[i] === n && s.terrain[i] === top;
      if (same && n > 1 && s.terrainLayered) {
        const g = layered.get(i);
        same = !!g && g.length === n && g.every((r, k) => r[0] === floor[k * N + i] && r[1] === ceil[k * N + i]);
      }
      if (!same) {
        differ++;
        if (ex.length < 4) ex.push(`(${i % W}, ${(i / W) | 0}) ours ${n} run(s) to ${top}, game ${s.terrainColumns[i]} to ${s.terrain[i]}`);
      }
    }
    bad += differ;
    parts.push(`${s.momentId === 'start' ? 'at the load' : `after ${(s.day - D0).toFixed(2)} days`}: ${differ} tiles differ${ex.length ? ` (${ex.join('; ')})` : ''}`);
  }
  const t = c.L.prepared.game.terrain3d!;
  return {
    verdict: bad === 0 ? 'passed' : 'failed',
    detail: `our rule deletes ${t.predicted.dropped} of the file's voxels and keeps ${t.layeredTiles} layered tiles' runs; ${parts.join('; ')}${runsChecked ? '' : ' (the record has no terrain runs: a mod before 0.3.0, compared by count and top only)'}`,
  };
}

function objectsCheck(c: Ctx): Result {
  const t = c.L.prepared.game.terrain3d!;
  const removed = new Set(t.predicted.plantsRemoved.map((p) => p.id));
  const o = objectsDiff(c.L.info, c.L.result!);
  const missing = o.missing.filter((d) => !t.predicted.plantsRemoved.some((p) => d.startsWith(`${p.template} (${p.x}, ${p.y}, ${p.z})`)));
  const ok = missing.length === 0 && o.moved.length === 0;
  return { verdict: ok ? 'passed' : 'failed', detail: `${o.found} of ${o.expected} objects at their tile and level (${removed.size} plants expected removed)${missing.length ? `; missing ${missing.length}: ${missing.slice(0, 8).join(', ')}` : ''}${o.moved.length ? `; moved ${o.moved.length}: ${o.moved.slice(0, 5).join(', ')}` : ''}` };
}

function waterCheck(c: Ctx): Result {
  const info = c.L.info;
  const m = modelOf(info);
  const snaps = laterSnapshots(c);
  if (!snaps.length) return { verdict: 'not measurable', detail: 'no record after the start' };
  const { N, L } = m.cols;
  let ok = true;
  const parts: string[] = [];
  for (const s of snaps) {
    const e = engineAt(info, s.day - D0);
    const g = recordedWater(info, s);
    let wetEither = 0, wetBoth = 0, within = 0, max = 0, worst = -1, volE = 0, volG = 0, pressE = 0, pressBoth = 0, maxO = 0;
    let roofedEither = 0, roofedWithin = 0;
    for (let c2 = 0; c2 < L * N; c2++) {
      const i = c2 % N;
      if ((c2 - i) / N >= m.cols.count[i]) continue;
      const de = e.depth[c2];
      const dg = g.depth[c2];
      volE += de + e.overflow[c2];
      volG += dg + (g.overflow ? g.overflow[c2] : 0);
      const we = de > 0.05;
      const wg = dg > 0.05;
      if (we || wg) {
        wetEither++;
        if (we && wg) wetBoth++;
        const d = Math.abs(de - dg);
        if (d <= 0.1) within++;
        if (d > max) (max = d), (worst = c2);
        if (m.cols.ceil[c2] < 34) {
          roofedEither++;
          if (d <= 0.1) roofedWithin++;
        }
      }
      if (e.overflow[c2] > 0.01) {
        pressE++;
        if (g.overflow && g.overflow[c2] > 0) pressBoth++;
        if (g.overflow) maxO = Math.max(maxO, Math.abs(e.overflow[c2] - g.overflow[c2]));
      }
    }
    const shareWithin = wetEither ? within / wetEither : 1;
    const iou = wetEither ? wetBoth / wetEither : 1;
    const vol = volE > 0 ? Math.abs(volG / volE - 1) : 0;
    const press = pressE ? pressBoth / pressE : 1;
    const good = shareWithin >= 0.95 && iou >= 0.95 && vol <= 0.1 && (!g.overflow || press >= 0.9);
    if (!good) ok = false;
    const at = worst >= 0 ? ` (worst: tile (${(worst % N) % info.W}, ${((worst % N) / info.W) | 0}) slot ${Math.floor(worst / N)}, ours ${f3(e.depth[worst])}, game ${f3(g.depth[worst])})` : '';
    parts.push(
      `after ${(s.day - D0).toFixed(2)} days: ${pct(shareWithin)} of ${wetEither} wet columns within 0.1 deep (roofed ${roofedEither ? pct(roofedWithin / roofedEither) : '-'} of ${roofedEither}), wet IoU ${f3(iou)}, max |Δ| ${f3(max)}${at}, volume ${volE.toFixed(1)} → ${volG.toFixed(1)}; ${pressE} columns under pressure in the engine, ${g.overflow ? `${pressBoth} of them in the game (max |Δ overflow| ${f3(maxO)})` : 'the record has no overflow (a mod before 0.3.0)'}${g.unmatched ? `; ${g.unmatched} wet game columns match no column of ours` : ''}`,
    );
  }
  return { verdict: ok ? 'passed' : 'failed', detail: parts.join('. ') };
}

function soilCheck(c: Ctx): Result {
  const info = c.L.info;
  const m = modelOf(info);
  const snaps = laterSnapshots(c).filter((s) => s.terrainLayered);
  if (!snaps.length) return { verdict: 'not measurable', detail: 'no record with the soil of every terrain run (DGM Probe 0.3.0 or later)' };
  const { N, W, count } = m.keptRuns;
  let ok = true;
  const parts: string[] = [];
  for (const s of snaps) {
    const water = recordedWater(info, s);
    const ours = soil3d(m.kept, m.cols, { depth: water.depth, contamination: water.contamination }, m.objects, 'game');
    const layered = new Map((s.terrainLayered ?? []).map((t) => [t.y * W + t.x, t.runs] as const));
    let runs = 0, agree = 0, within = 0, max = 0, worst = '';
    let lRuns = 0, lAgree = 0, cWithin = 0;
    for (let i = 0; i < N; i++)
      for (let k = 0; k < count[i]; k++) {
        const n = k * N + i;
        const g = count[i] > 1 ? layered.get(i)?.[k] : undefined;
        const gm = count[i] > 1 ? g?.[2] : s.moisture[i];
        const gc = count[i] > 1 ? g?.[3] : s.soilContamination[i];
        if (gm === undefined || gc === undefined) continue;
        runs++;
        const mo = ours.moisture[n];
        const same = mo > 0 === gm > 0;
        if (same) agree++;
        const d = Math.abs(mo - gm);
        if (d <= 0.05) within++;
        if (Math.abs(ours.contamination[n] - gc) <= 0.05) cWithin++;
        if (d > max) (max = d), (worst = `(${i % W}, ${(i / W) | 0}) run ${k}: ours ${f3(mo)}, game ${f3(gm)}`);
        if (count[i] > 1) {
          lRuns++;
          if (same && d <= 0.05) lAgree++;
        }
      }
    const a = runs ? agree / runs : 1;
    const w = runs ? within / runs : 1;
    const cw = runs ? cWithin / runs : 1;
    if (!(a >= 0.995 && w >= 0.99 && cw >= 0.99)) ok = false;
    parts.push(`after ${(s.day - D0).toFixed(2)} days: moist and dry agree on ${pct(a)} of ${runs} runs, ${pct(w)} within 0.05 (layered tiles' runs ${lRuns ? pct(lAgree / lRuns) : '-'} of ${lRuns}), contamination ${pct(cw)} within 0.05; max |Δ| ${f3(max)}${worst ? ` at ${worst}` : ''}`);
  }
  return { verdict: ok ? 'passed' : 'failed', detail: parts.join('. ') };
}

function plantsCheck(c: Ctx): Result {
  const t = c.L.prepared.game.terrain3d!;
  const r = c.L.result!;
  const game = new Set((r.entitiesAtStart ?? []).map((e) => e.id));
  const removed = new Set(t.predicted.plantsRemoved.map((p) => p.id));
  const wrong: string[] = [];
  let plants = 0;
  for (const e of c.L.info.entities) {
    if (!/^(Pine|Oak|Birch|Succulent|BlueberryBush|Maple|Chestnut|Mangrove)$/.test(e.template)) continue;
    plants++;
    const here = game.has(e.id);
    if (here === removed.has(e.id)) wrong.push(`${e.template} (${e.x}, ${e.y}, ${e.z}) ${here ? 'loaded' : 'removed'}, our rule says ${removed.has(e.id) ? 'removed' : 'loaded'}`);
  }
  const end = (r.entitiesAtEnd ?? []).filter((e) => e.plant);
  const dead = end.filter((e) => e.plant!.dead).length;
  const dry = end.filter((e) => e.plant!.dry).length;
  return { verdict: wrong.length ? 'failed' : 'passed', detail: `${plants} plants, ${removed.size} predicted removed; ${wrong.length ? `wrong: ${wrong.join('; ')}` : 'every one as predicted'}; at the end ${end.length} plants, ${dead} dead, ${dry} dry` };
}

function startCheck(c: Ctx): Result {
  const r = c.L.result!;
  const s = c.L.info.start;
  if (!s) return { verdict: 'not measurable', detail: 'the map has no start' };
  const dc = r.start?.districtCenter;
  const on = !!dc && dc.x === s.x && dc.y === s.y && dc.z === s.z && dc.orientation === s.orientation;
  const ok = on && r.start.adults === 9 && r.start.children === 4;
  return { verdict: ok ? 'passed' : 'failed', detail: `StartingLocation (${s.x}, ${s.y}, ${s.z}) ${s.orientation}; district center ${dc ? `(${dc.x}, ${dc.y}, ${dc.z}) ${dc.orientation}` : 'missing'}; ${r.start?.adults ?? 0} adults, ${r.start?.children ?? 0} children` };
}

function shotsCheck(c: Ctx): Result {
  const shots = c.L.result!.shots ?? [];
  return {
    verdict: 'recorded',
    detail: `${shots.length} screenshots (${[...new Set(shots.map((s) => s.pose))].join(', ')}), in the run's shots folder and contact sheet. Judged by eye: caves, tunnels, ledges, bridges and overhangs whole, nothing floating that should fall, water in caves where the model puts it, no water hanging in the air`,
  };
}

export const T3D_EVALS: Record<string, (c: Ctx) => Result> = {
  't3d-load': loadCheck,
  't3d-support': supportCheck,
  't3d-objects': objectsCheck,
  't3d-water': waterCheck,
  't3d-soil': soilCheck,
  't3d-plants': plantsCheck,
  't3d-start': startCheck,
  't3d-shots': shotsCheck,
};
