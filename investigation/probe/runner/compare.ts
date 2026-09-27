// Each check's verdict, with its numbers: the game's records against the file (the canonical settle the
// file stores), the milestone's own numbers (checks.txt), paired games, and the cycle model on the same
// schedule.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { type CheckDef, D0, startWater, type Verdict, weirTiles } from './catalog';
import type { MapResult, MapSnapshot, SampleRow } from './job';
import type { Prepared } from './jobs';
import { wetAreas, type MapInfo } from './mapfile';
import { isObject, num } from '../../../src/core/format/json';
import type { ModelRun } from './model';
import { REPO } from './paths';

export interface CheckResult {
  id: string;
  title: string;
  verdict: Verdict;
  detail: string;
}

export interface GameVerdicts {
  game: string;
  title: string;
  group: string;
  status: string;
  checks: CheckResult[];
}

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : String(v));
const pct = (v: number) => `${(100 * v).toFixed(1)}%`;
const hours = (d: number) => `${(d * 24).toFixed(1)} h`;

export class Loaded {
  private snaps = new Map<string, MapSnapshot | null>();
  constructor(readonly dir: string, readonly prepared: Prepared, readonly result: MapResult | null) {}
  get info(): MapInfo {
    return this.prepared.info;
  }
  snapshot(momentId: string): MapSnapshot | null {
    if (this.snaps.has(momentId)) return this.snaps.get(momentId)!;
    // the mod names them <map id>-<moment id>.snapshot.json.gz (exactly: "end" must not find "drought1-end")
    const name = `${safe(this.prepared.game.id)}-${safe(momentId)}.snapshot.json.gz`;
    const file = this.result?.snapshots?.find((s) => s === name);
    let s: MapSnapshot | null = null;
    if (file && existsSync(join(this.dir, file))) s = JSON.parse(gunzipSync(readFileSync(join(this.dir, file))).toString('utf8')) as MapSnapshot;
    this.snaps.set(momentId, s);
    return s;
  }
  /** The snapshot nearest `day` (game day), within `slack` days. */
  snapshotAt(day: number, slack = 0.05): MapSnapshot | null {
    const m = this.prepared.map.moments.filter((x) => x.snapshot).sort((a, b) => Math.abs(a.day - day) - Math.abs(b.day - day))[0];
    if (!m || Math.abs(m.day - day) > slack) return null;
    return this.snapshot(m.id);
  }
  samples(): SampleRow[] {
    return this.result?.samples ?? [];
  }
  /** A tile's top water column in a sample row. */
  static topWater(row: SampleRow, x: number, y: number): { depth: number; contamination: number; surface: number } {
    const t = row.tiles.find((s) => s.x === x && s.y === y);
    const cols = (t?.columns ?? []).filter((c) => c[1] > 0);
    const c = cols[cols.length - 1];
    return c ? { depth: c[1], contamination: c[2], surface: c[0] + c[1] } : { depth: 0, contamination: 0, surface: NaN };
  }
  /** The sample row nearest `day`. */
  sampleAt(day: number): SampleRow | null {
    let best: SampleRow | null = null;
    for (const r of this.samples()) if (!best || Math.abs(r.day - day) < Math.abs(best.day - day)) best = r;
    return best;
  }
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_');

// ------------------------------------------------------------------------------ generic measures

export interface WaterDiff {
  wetEither: number;
  within01: number;
  maxAbs: number;
  meanAbs: number;
  volumeFile: number;
  volumeGame: number;
  worst: string;
}

/** The game's top water against the file's, tile by tile (tiles wet in either, deeper than 0.05), on
 *  every tile or on the tiles `only` picks. */
export function waterDiff(info: MapInfo, s: MapSnapshot, ref?: { depth: ArrayLike<number> }, only?: (t: number) => boolean): WaterDiff {
  const a = ref?.depth ?? info.depth;
  let wet = 0, within = 0, max = 0, sum = 0, vf = 0, vg = 0, worst = -1;
  for (let t = 0; t < info.W * info.H; t++) {
    if (only && !only(t)) continue;
    const d0 = a[t] || 0, d1 = s.depth[t] || 0;
    vf += d0;
    vg += d1;
    if (!(d0 > 0.05 || d1 > 0.05)) continue;
    wet++;
    const e = Math.abs(d1 - d0);
    if (e <= 0.1) within++;
    sum += e;
    if (e > max) (max = e), (worst = t);
  }
  return { wetEither: wet, within01: wet ? within / wet : 1, maxAbs: max, meanAbs: wet ? sum / wet : 0, volumeFile: vf, volumeGame: vg, worst: worst >= 0 ? `(${worst % info.W}, ${(worst / info.W) | 0}) ${f3(a[worst] || 0)} → ${f3(s.depth[worst] || 0)}` : '-' };
}

export function waterText(d: WaterDiff): string {
  return `${pct(d.within01)} of ${d.wetEither} wet tiles within 0.1 deep; mean |Δ| ${f3(d.meanAbs)}, max ${f3(d.maxAbs)} at ${d.worst}; volume ${d.volumeFile.toFixed(0)} → ${d.volumeGame.toFixed(0)} (${pct(d.volumeFile ? d.volumeGame / d.volumeFile - 1 : 0)})`;
}

export function terrainDiff(info: MapInfo, s: MapSnapshot): { differ: number; above16: number; keptAbove16: number; examples: string[] } {
  let differ = 0, above = 0, kept = 0;
  const ex: string[] = [];
  for (let t = 0; t < info.W * info.H; t++) {
    const h = info.heights[t];
    if (h > 16) {
      above++;
      if (s.terrain?.[t] === h) kept++;
    }
    if (s.terrain && s.terrain[t] !== h) {
      differ++;
      if (ex.length < 5) ex.push(`(${t % info.W}, ${(t / info.W) | 0}) ${h} → ${s.terrain[t]}`);
    }
  }
  return { differ, above16: above, keptAbove16: kept, examples: ex };
}

/**
 * The file's terrain as the game's column map holds it, per tile: the number of columns and the top one's
 * ceiling. The game walks each voxel column from z = 0 and makes a column [floor, ceiling) of every solid
 * run, starting with an empty [0, 0) when the lowest voxel is air (Timberborn.TerrainSystem, the column
 * rebuild). A tile with one column is therefore solid exactly on [0, ceiling): equal count and ceiling is
 * equality voxel for voxel. Tiles with several columns are compared by count and top ceiling only (the
 * snapshot does not keep the inner columns).
 */
export function fileColumns(info: MapInfo): { count: Uint8Array; top: Uint8Array } {
  const w = info.file.world;
  const plane = w.sizeX * w.sizeY;
  const count = new Uint8Array(plane), top = new Uint8Array(plane);
  for (let t = 0; t < plane; t++) {
    let n = 0, solid = true, ceiling = 0;
    for (let z = 0; z < w.layers; z++) {
      if (w.voxels[z * plane + t]) solid = true;
      else {
        if (solid) (n++, (ceiling = z));
        solid = false;
      }
    }
    if (solid) (n++, (ceiling = w.layers));
    count[t] = n;
    top[t] = ceiling;
  }
  return { count, top };
}

export function voxelDiff(info: MapInfo, s: MapSnapshot): { differ: number; multi: number; above16: number; at22: number; examples: string[] } {
  const f = fileColumns(info);
  let differ = 0, multi = 0, above = 0, at22 = 0;
  const ex: string[] = [];
  if (!s.terrain || !s.terrainColumns) throw new NotMeasurable('the snapshot has no terrain columns');
  for (let t = 0; t < info.W * info.H; t++) {
    if (f.count[t] > 1) multi++;
    if (f.top[t] > 16) above++;
    if (f.top[t] === 22) at22++;
    if (s.terrainColumns[t] !== f.count[t] || s.terrain[t] !== f.top[t]) {
      differ++;
      if (ex.length < 5) ex.push(`(${t % info.W}, ${(t / info.W) | 0}) file ${f.count[t]} column(s) to ${f.top[t]}, game ${s.terrainColumns[t]} to ${s.terrain[t]}`);
    }
  }
  return { differ, multi, above16: above, at22, examples: ex };
}

export function objectsDiff(info: MapInfo, r: MapResult): { expected: number; found: number; missing: string[]; moved: string[]; above16: number; above16Found: number } {
  const game = new Map((r.entitiesAtStart ?? []).map((e) => [e.id, e]));
  const missing: string[] = [], moved: string[] = [];
  let expected = 0, found = 0, above = 0, aboveFound = 0;
  for (const e of info.entities) {
    if (e.template === 'StartingLocation') continue;
    expected++;
    if (e.z > 16) above++;
    const g = game.get(e.id);
    if (!g) {
      missing.push(`${e.template} (${e.x}, ${e.y}, ${e.z})`);
      continue;
    }
    if (g.x !== e.x || g.y !== e.y || g.z !== e.z || g.template !== e.template) moved.push(`${e.template} (${e.x}, ${e.y}, ${e.z}) → ${g.template} (${g.x}, ${g.y}, ${g.z})`);
    else {
      found++;
      if (e.z > 16) aboveFound++;
    }
  }
  return { expected, found, missing, moved, above16: above, above16Found: aboveFound };
}

export function logProblems(r: MapResult): { errors: string[]; warnings: number } {
  const errors = (r.log ?? []).filter((l) => l.type === 'Error' || l.type === 'Exception' || l.type === 'Assert').map((l) => `${l.type}: ${l.message.split('\n')[0].slice(0, 300)}`);
  return { errors, warnings: (r.log ?? []).filter((l) => l.type === 'Warning').length };
}

/** Sum of depth over a set of tiles. */
const volumeOf = (s: MapSnapshot | { depth: ArrayLike<number> }, tiles: number[]) => tiles.reduce((a, t) => a + (s.depth[t] || 0), 0);
const surfaceOf = (s: MapSnapshot, t: number) => (s.depth[t] > 0 ? s.floor[t] + s.depth[t] : NaN);
const median = (v: number[]) => {
  const a = v.filter(Number.isFinite).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : NaN;
};

// ------------------------------------------------------------------------------ evaluation

export interface Ctx {
  L: Loaded;
  others: Map<string, Loaded>;
  model: ModelRun | null;
  modelError: string | null;
  /** Mods other than DGM Probe that the game loaded during the run (the run is then not a clean one). */
  otherMods?: string[];
  /** The player's own mods, loaded by choice (a run with the installed mods): recorded, not a failure. */
  installedMods?: string[];
}

type Eval = (c: Ctx) => { verdict: Verdict; detail: string };

const need = (s: MapSnapshot | null, what: string) => {
  if (!s) throw new NotMeasurable(`the ${what} record is missing`);
  return s;
};
class NotMeasurable extends Error {}

function loadVerdict(c: Ctx): { verdict: Verdict; detail: string } {
  const r = c.L.result!;
  const probs = logProblems(r);
  const issues = r.loadingIssues ?? [];
  const startOk = !c.L.info.start || !!r.start?.districtCenter;
  const others = c.otherMods ?? [];
  const ok = r.status === 'done' && issues.length === 0 && probs.errors.length === 0 && startOk && others.length === 0;
  const parts = [
    `status ${r.status}${r.failure ? ` (${r.failure})` : ''}`,
    issues.length ? `loading issues: ${issues.join('; ')}` : 'no loading issues',
    probs.errors.length ? `${probs.errors.length} errors in the log: ${probs.errors.slice(0, 3).join(' | ')}` : 'no error or exception in the log',
    `${probs.warnings} warnings`,
    others.length ? `other mods were loaded (not the unmodified game): ${others.join(', ')}` : c.installedMods?.length ? `with the installed mods: ${c.installedMods.join(', ')}` : 'only DGM Probe loaded',
    c.L.info.start ? (r.start?.districtCenter ? `district center at (${r.start.districtCenter.x}, ${r.start.districtCenter.y}, ${r.start.districtCenter.z}) ${r.start.districtCenter.orientation}` : 'no district center') : 'the map has no start',
  ];
  return { verdict: ok ? 'passed' : 'failed', detail: parts.join('; ') };
}

const EVALS: Record<string, Eval> = {
  load: loadVerdict,
  'high-load': loadVerdict,

  objects(c) {
    const o = objectsDiff(c.L.info, c.L.result!);
    const ok = o.missing.length === 0 && o.moved.length === 0;
    return { verdict: ok ? 'passed' : 'failed', detail: `${o.found} of ${o.expected} objects at their tiles${o.missing.length ? `; missing ${o.missing.length}: ${o.missing.slice(0, 8).join(', ')}` : ''}${o.moved.length ? `; moved ${o.moved.length}: ${o.moved.slice(0, 5).join(', ')}` : ''}` };
  },
  'high-objects'(c) {
    const o = objectsDiff(c.L.info, c.L.result!);
    const ok = o.missing.length === 0 && o.moved.length === 0;
    return { verdict: ok ? 'passed' : 'failed', detail: `${o.found} of ${o.expected} objects kept, ${o.above16Found} of ${o.above16} standing above level 16${o.missing.length ? `; missing: ${o.missing.slice(0, 8).join(', ')}` : ''}${o.moved.length ? `; moved: ${o.moved.slice(0, 5).join(', ')}` : ''}` };
  },

  water(c) {
    const s = need(c.L.snapshotAt(D0 + 1, 0.1) ?? c.L.snapshot('end'), 'day-1');
    const d = waterDiff(c.L.info, s);
    const ok = d.within01 >= 0.95 && Math.abs(d.volumeGame / Math.max(1e-9, d.volumeFile) - 1) <= 0.1;
    return { verdict: ok ? 'passed' : 'failed', detail: `after ${f2(s.day - D0)} days: ${waterText(d)}` };
  },
  'high-water'(c) {
    return EVALS.water(c);
  },

  terrain(c) {
    const s = need(c.L.snapshot('end') ?? c.L.snapshot('start'), 'end');
    const t = terrainDiff(c.L.info, s);
    return { verdict: t.differ === 0 ? 'passed' : 'failed', detail: t.differ === 0 ? `every tile's height as in the file (${c.L.info.W}×${c.L.info.H}, highest ${c.L.info.maxHeight})` : `${t.differ} tiles differ: ${t.examples.join(', ')}` };
  },
  'high-terrain'(c) {
    const s = need(c.L.snapshot('end') ?? c.L.snapshot('start'), 'end');
    const t = terrainDiff(c.L.info, s);
    return { verdict: t.differ === 0 ? 'passed' : 'failed', detail: `${t.keptAbove16} of ${t.above16} tiles above level 16 kept (highest ${c.L.info.maxHeight}); ${t.differ} tiles differ from the file${t.examples.length ? ': ' + t.examples.join(', ') : ''}` };
  },

  // ---- tall maps (PLAN §20 D172)
  'tall-load': loadVerdict,
  'tall-terrain'(c) {
    const at = [need(c.L.snapshot('start'), 'start'), need(c.L.snapshot('end'), 'end')];
    const d = at.map((s) => voxelDiff(c.L.info, s));
    const ok = d.every((x) => x.differ === 0);
    const [a] = d;
    return {
      verdict: ok ? 'passed' : 'failed',
      detail: `${c.L.info.W}×${c.L.info.H}, highest ${c.L.info.maxHeight}: ${a.above16} tiles above 16 (${a.at22} at 22)${a.multi ? `, ${a.multi} with several columns (compared by count and top only)` : ''}; tiles whose terrain differs from the file: ${d.map((x, k) => `${x.differ} ${k ? `after ${f2(at[k].day - D0)} days` : 'at the load'}`).join(', ')}${d.some((x) => x.examples.length) ? ': ' + d.flatMap((x) => x.examples).slice(0, 5).join('; ') : ''}`,
    };
  },
  'tall-water'(c) {
    const info = c.L.info;
    const s0 = need(c.L.snapshot('start'), 'start'), s1 = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1');
    const high = (t: number) => info.heights[t] > 16;
    const a0 = waterDiff(info, s0), a1 = waterDiff(info, s1), h0 = waterDiff(info, s0, undefined, high), h1 = waterDiff(info, s1, undefined, high);
    const vol = (d: WaterDiff) => Math.abs(d.volumeGame / Math.max(1e-9, d.volumeFile) - 1);
    const hasHigh = h0.wetEither + h1.wetEither > 0;
    const okAll = a0.within01 >= 0.99 && a1.within01 >= 0.95 && vol(a1) <= 0.1;
    const okHigh = !hasHigh || (h0.within01 >= 0.99 && h1.within01 >= 0.95 && vol(h1) <= 0.1);
    return {
      verdict: okAll && okHigh ? 'passed' : 'failed',
      detail: `whole map at the load: ${waterText(a0)}; after ${f2(s1.day - D0)} days: ${waterText(a1)}. ${hasHigh ? `On terrain above 16 at the load: ${waterText(h0)}; after a day: ${waterText(h1)}` : 'No water on terrain above 16 in the file or the game.'}`,
    };
  },
  'tall-objects'(c) {
    const o = objectsDiff(c.L.info, c.L.result!);
    const at22 = c.L.info.entities.filter((e) => e.template !== 'StartingLocation' && e.z >= 22).length;
    const ok = o.missing.length === 0 && o.moved.length === 0;
    return { verdict: ok ? 'passed' : 'failed', detail: `${o.found} of ${o.expected} objects at their tile and level; ${o.above16Found} of ${o.above16} above level 16 (${at22} standing at 22)${o.missing.length ? `; missing ${o.missing.length}: ${o.missing.slice(0, 8).join(', ')}` : ''}${o.moved.length ? `; moved ${o.moved.length}: ${o.moved.slice(0, 5).join(', ')}` : ''}` };
  },
  'tall-start'(c) {
    const r = c.L.result!, s = c.L.info.start!, dc = r.start?.districtCenter;
    const onStart = !!dc && dc.x === s.x && dc.y === s.y && dc.z === s.z && dc.orientation === s.orientation;
    const ok = (r.loadingIssues ?? []).length === 0 && s.z > 16 && onStart && r.start.adults === 9 && r.start.children === 4;
    return { verdict: ok ? 'passed' : 'failed', detail: `StartingLocation (${s.x}, ${s.y}, ${s.z}) ${s.orientation}; district center ${dc ? `(${dc.x}, ${dc.y}, ${dc.z}) ${dc.orientation}` : 'missing'}; ${r.start.adults} adults, ${r.start.children} children, loading issues ${(r.loadingIssues ?? []).length}` };
  },
  'tall-sources'(c) {
    const info = c.L.info;
    const s1 = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1');
    const want = info.entities.filter((e) => /Source$/.test(e.template) && e.z > 16);
    const bad: string[] = [];
    for (const e of want) {
      const ws = e.components.WaterSource;
      const strength = isObject(ws) ? num(ws.SpecifiedStrength) : NaN;
      const g = s1.sources.find((x) => x.id === e.id);
      const wet = s1.depth[e.y * info.W + e.x] > 0;
      if (!g || g.x !== e.x || g.y !== e.y || g.z !== e.z) bad.push(`${e.template} (${e.x}, ${e.y}, ${e.z}) ${g ? `at (${g.x}, ${g.y}, ${g.z})` : 'missing'}`);
      else if (!g.source || Math.abs(g.source.specified - strength) > 0.01 || !(g.source.current > 0) || !wet) bad.push(`${e.template} (${e.x}, ${e.y}, ${e.z}): strength ${g.source ? `${f3(g.source.specified)} (file ${f3(strength)}), now ${f3(g.source.current)}` : 'none'}, water on its tile ${wet ? 'yes' : 'no'}`);
    }
    return { verdict: bad.length ? 'failed' : 'passed', detail: `${want.length - bad.length} of ${want.length} sources above 16 in place, at their strength and running after ${f2(s1.day - D0)} days (levels ${[...new Set(want.map((e) => e.z))].sort((a, b) => a - b).join(', ')})${bad.length ? ': ' + bad.slice(0, 6).join('; ') : ''}` };
  },
  'tall-flow'(c) {
    const t = c.L.prepared.game.tall!;
    const info = c.L.info;
    const rows = c.L.samples();
    if (!rows.length) throw new NotMeasurable('no samples');
    const row1 = c.L.sampleAt(D0 + 1)!;
    const dry: string[] = [], off: string[] = [], pools: string[] = [];
    for (const [x, y] of t.flowTiles) {
      const low = Math.min(...rows.map((r) => Loaded.topWater(r, x, y).depth));
      const d1 = Loaded.topWater(row1, x, y).depth, f = info.depth[y * info.W + x];
      if (!(low > 0.01)) dry.push(`(${x}, ${y}) down to ${f3(low)}`);
      if (Math.abs(d1 - f) > 0.1) off.push(`(${x}, ${y}) ${f3(f)} → ${f3(d1)}`);
    }
    for (const [x, y] of t.poolTiles) {
      const i = y * info.W + x;
      const want = info.floor[i] + info.depth[i], got = Loaded.topWater(row1, x, y).surface;
      if (!(Math.abs(got - want) <= 0.1)) pools.push(`(${x}, ${y}) surface ${f3(want)} → ${f3(got)}`);
    }
    const ok = dry.length === 0 && off.length <= Math.floor(t.flowTiles.length / 8) && pools.length === 0;
    return {
      verdict: ok ? 'passed' : 'failed',
      detail: `${rows.length} samples over ${f2(rows.at(-1)!.day - rows[0].day)} days. Moving water above 16: ${t.flowTiles.length} tiles, ${t.flowTiles.length - dry.length} wet in every sample${dry.length ? ` (dried: ${dry.slice(0, 4).join(', ')})` : ''}, ${t.flowTiles.length - off.length} within 0.1 of the file after a day${off.length ? ` (${off.slice(0, 4).join(', ')})` : ''}. Standing water above 16: ${t.poolTiles.length} tiles, ${t.poolTiles.length - pools.length} with the file's surface within 0.1${pools.length ? ` (${pools.slice(0, 4).join(', ')})` : ''}`,
    };
  },
  'tall-shots'(c) {
    const shots = c.L.result!.shots ?? [];
    return {
      verdict: 'recorded',
      detail: `${shots.length} screenshots (${[...new Set(shots.map((s) => s.pose))].join(', ')}) at the load and at the end, in the run's shots folder and contact sheet. Judged by eye: terrain whole up to 22 (no holes, no missing or cut-off tops), no floating or missing objects, no water hanging in the air or cut off, the start and the tall parts as built`,
    };
  },

  // ---- ceiling maps (PLAN §20 D244, step 1)
  'ceiling-watch'(c) {
    const e = c.L.prepared.game.ceiling!;
    const info = c.L.info;
    const until = firstHazard(c);
    const rows = c.L.samples().filter((r) => r.day < until - 1e-6);
    if (!rows.length) throw new NotMeasurable('no samples before the first hazard');
    const row1 = c.L.sampleAt(Math.min(D0 + 1, until - 0.05))!;
    const dry: string[] = [], off: string[] = [], pools: string[] = [];
    let high = 0;
    for (const [x, y] of e.flowTiles) {
      const i = y * info.W + x;
      if (info.heights[i] > 16) high++;
      const low = Math.min(...rows.map((r) => Loaded.topWater(r, x, y).depth));
      const d1 = Loaded.topWater(row1, x, y).depth, f = info.depth[i];
      if (!(low > 0.01)) dry.push(`(${x}, ${y}) down to ${f3(low)}`);
      if (Math.abs(d1 - f) > 0.1) off.push(`(${x}, ${y}) ${f3(f)} → ${f3(d1)}`);
    }
    for (const [x, y] of e.poolTiles) {
      const i = y * info.W + x;
      const want = info.floor[i] + info.depth[i], got = Loaded.topWater(row1, x, y).surface;
      if (!(Math.abs(got - want) <= 0.1)) pools.push(`(${x}, ${y}) surface ${f3(want)} → ${f3(got)}`);
    }
    const n = e.flowTiles.length;
    const ok = dry.length === 0 && off.length <= Math.floor(n / 8) && pools.length === 0;
    return {
      verdict: ok ? 'passed' : 'failed',
      detail: `${rows.length} samples over the ${f2(until - rows[0].day)} days before the first hazard. The editor's flowing water near its edits: ${n} tiles (${high} above 16), ${n - dry.length} wet in every sample${dry.length ? ` (dried: ${dry.slice(0, 4).join(', ')})` : ''}, ${n - off.length} within 0.1 deep of the file after ${f2(row1.day - D0)} days${off.length ? ` (${off.slice(0, 4).join(', ')})` : ''}. Its standing water: ${e.poolTiles.length} tiles, ${e.poolTiles.length - pools.length} with the file's surface within 0.1${pools.length ? ` (${pools.slice(0, 4).join(', ')})` : ''}`,
    };
  },
  'ceiling-hazards'(c) {
    if (!c.model) throw new NotMeasurable(`the model did not run${c.modelError ? ': ' + c.modelError : ''}`);
    const e = c.L.prepared.game.ceiling!;
    const t = timeline(c);
    const tiles = c.L.prepared.map.tiles;
    const watched = [...e.flowTiles, ...e.poolTiles].map(([x, y]) => ({ x, y, k: tiles.findIndex(([a, b]) => a === x && b === y) })).filter((w) => w.k >= 0);
    const moments = c.L.prepared.map.moments.filter((m) => /^(drought|badtide)\d+-(start|day1|end)$/.test(m.id)).sort((a, b) => a.day - b.day);
    let worstD = 0, worstC = 0;
    const rows: string[] = [];
    for (const m of moments) {
      const g = c.L.sampleAt(m.day);
      if (!g || !watched.length) continue;
      const badtide = m.id.startsWith('badtide');
      let gd = 0, md = 0, gc = 0, mc = 0;
      for (const w of watched) {
        const gw = Loaded.topWater(g, w.x, w.y), mw = modelSample(c.model, g.day, w.k);
        gd += gw.depth;
        md += mw.depth;
        gc += gw.contamination;
        mc += mw.contamination;
        worstD = Math.max(worstD, Math.abs(gw.depth - mw.depth));
        if (badtide) worstC = Math.max(worstC, Math.abs(gw.contamination - mw.contamination));
      }
      const n = watched.length;
      rows.push(`${m.id} (day ${f2(g.day - D0)}): depth ${f3(gd / n)} / ${f3(md / n)}${badtide ? `, contamination ${f3(gc / n)} / ${f3(mc / n)}` : ''}`);
    }
    if (t.verdict === 'not measurable' && !rows.length) throw new NotMeasurable('no snapshots or samples at the hazards');
    const ok = t.verdict === 'passed' && worstD <= 0.1 && worstC <= 0.15;
    return {
      verdict: ok ? 'passed' : 'failed',
      detail: `${t.detail}. The watched water at each hazard's start, first day and end (game / model, the mean of ${watched.length} watched tiles): ${rows.join('; ') || 'none'}; the largest difference on one watched tile: depth ${f3(worstD)}, contamination ${f3(worstC)}`,
    };
  },
  'ceiling-build'(c) {
    const e = c.L.prepared.game.ceiling!;
    const info = c.L.info, r = c.L.result!, W = info.W;
    const at = [need(c.L.snapshot('start'), 'start'), need(c.L.snapshot('end'), 'end')];
    if (at.some((s) => !s.terrain || !s.terrainColumns)) throw new NotMeasurable('the snapshots have no terrain columns');
    const f = fileColumns(info);
    const bad = at.map((s) => e.raised.filter(([x, y]) => s.terrainColumns[y * W + x] !== f.count[y * W + x] || s.terrain[y * W + x] !== f.top[y * W + x]).map(([x, y]) => `(${x}, ${y}) ${f.top[y * W + x]} → ${s.terrain[y * W + x]}`));
    const onRaised = new Set(e.raised.map(([x, y]) => y * W + x));
    const objs = info.entities.filter((o) => o.template !== 'StartingLocation' && onRaised.has(o.y * W + o.x));
    const kept = (list: MapResult['entitiesAtStart']) => {
      const g = new Map((list ?? []).map((x) => [x.id, x]));
      return objs.filter((o) => {
        const x = g.get(o.id);
        return !!x && x.x === o.x && x.y === o.y && x.z === o.z;
      }).length;
    };
    const k0 = kept(r.entitiesAtStart), k1 = kept(r.entitiesAtEnd);
    const kinds = new Map<string, number>();
    for (const o of objs) kinds.set(o.template, (kinds.get(o.template) ?? 0) + 1);
    const ok = bad.every((b) => b.length === 0) && k0 === objs.length;
    return {
      verdict: ok ? 'passed' : 'failed',
      detail: `${e.raised.length} tiles the editor raised above 16 (${e.raisedAt22} at 22): ground exact at the load ${bad[0].length ? `but on ${bad[0].length} (${bad[0].slice(0, 4).join(', ')})` : 'on every one'}, and after ${f2(at[1].day - D0)} days ${bad[1].length ? `but on ${bad[1].length} (${bad[1].slice(0, 4).join(', ')})` : 'on every one'}; ${objs.length} objects stand on them (${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ') || 'none'}): ${k0} at their tile and level at the load, ${k1} at the end`,
    };
  },

  A1(c) {
    const v = loadVerdict(c);
    return { verdict: v.verdict, detail: `measured part (the game loads the map from its file): ${v.detail}` };
  },
  A2(c) {
    const r = c.L.result!, s = c.L.info.start!, dc = r.start?.districtCenter;
    const onStart = !!dc && dc.x === s.x && dc.y === s.y && dc.z === s.z && dc.orientation === s.orientation;
    const ok = (r.loadingIssues ?? []).length === 0 && onStart && r.start.adults === 9 && r.start.children === 4;
    return { verdict: ok ? 'passed' : 'failed', detail: `loading issues ${(r.loadingIssues ?? []).length}; StartingLocation (${s.x}, ${s.y}, ${s.z}) ${s.orientation}, district center ${dc ? `(${dc.x}, ${dc.y}, ${dc.z}) ${dc.orientation}` : 'missing'}; ${r.start.adults} adults, ${r.start.children} children` };
  },
  A5(c) {
    const r = c.L.result!, s = c.L.info.start!, dc = r.start?.districtCenter;
    const ok = !!dc && dc.x === s.x && dc.y === s.y && r.start.adults + r.start.children > 0 && r.status === 'done';
    return { verdict: ok ? 'passed' : 'failed', detail: `Iron Teeth district center ${dc ? `(${dc.x}, ${dc.y}, ${dc.z}) ${dc.orientation}` : 'missing'}; ${r.start.adults} adults, ${r.start.children} children, ${r.start.bots} bots` };
  },
  F2a(c) {
    const west = westRiver(c.L.info);
    const s1 = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1'), s15 = need(c.L.snapshot('end'), 'end');
    const v1 = volumeOf(s1, west), v15 = volumeOf(s15, west);
    const row = c.L.sampleAt(D0 + 1.4)!;
    const d1 = Loaded.topWater(row, 1, 79).depth, d3 = Loaded.topWater(row, 3, 79).depth;
    const ok = d1 >= 0.1 && v15 >= 0.9 * v1 && v1 > 0;
    return { verdict: ok ? 'passed' : 'failed', detail: `west reach (x ≤ 24, ${west.length} tiles): ${v1.toFixed(1)} water after 1 day, ${v15.toFixed(1)} after ${f2(s15.day - D0)}; depth at (1, 79) ${f3(d1)}, (3, 79) ${f3(d3)}` };
  },
  F2b(c) {
    const a = c.others.get('m1-rv');
    if (!a?.result) throw new NotMeasurable('F2a (m1-rv) has no result to compare with');
    const west = westRiver(c.L.info);
    const gap = volumeOf(need(c.L.snapshot('end'), 'end'), west), full = volumeOf(need(a.snapshot('end'), 'F2a end'), west);
    const rg = c.L.sampleAt(D0 + 1.4)!, rf = a.sampleAt(D0 + 1.4)!;
    const dg = Loaded.topWater(rg, 1, 79).depth, df = Loaded.topWater(rf, 1, 79).depth;
    const lower = gap < 0.95 * full || dg < df - 0.05;
    return { verdict: lower ? 'passed' : 'failed', detail: `west reach water: gap file ${gap.toFixed(1)} against ${full.toFixed(1)} unmodified (${pct(full ? gap / full - 1 : 0)}); depth at (1, 79) ${f3(dg)} against ${f3(df)}; ${lower ? 'the gap loses water: river mouths need a source on every channel tile' : 'no measurable loss through the gap'}` };
  },

  B1(c) {
    const listed = depthSamplesCached('out/m2/checks.txt', 'River depth samples');
    const r0 = c.L.samples()[0], r1 = c.L.sampleAt(D0 + 1)!;
    const rows = listed.map((s) => ({ ...s, d0: Loaded.topWater(r0, s.x, s.y).depth, d1: Loaded.topWater(r1, s.x, s.y).depth }));
    const worst = Math.max(...rows.map((x) => Math.max(Math.abs(x.d0 - x.depth), Math.abs(x.d1 - x.depth))));
    const s0 = need(c.L.snapshot('start'), 'start'), s1 = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1');
    const v0 = s0.depth.reduce((a, b) => a + b, 0), v1 = s1.depth.reduce((a, b) => a + b, 0);
    const start = c.L.info.start!;
    const dryBushes = (s1.plants ?? []).filter((p) => p.template === 'BlueberryBush' && !p.plant?.dead && p.plant?.dry && Math.hypot(p.x - start.x, p.y - start.y) <= 20);
    const ok = worst <= 0.1 && Math.abs(v1 / v0 - 1) <= 0.05 && dryBushes.length === 0;
    return {
      verdict: ok ? 'passed' : 'failed',
      detail: `depth samples (listed → start → day 1): ${rows.map((x) => `(${x.x}, ${x.y}) ${f2(x.depth)} → ${f3(x.d0)} → ${f3(x.d1)}`).join('; ')}; worst ${f3(worst)}; whole-map water ${v0.toFixed(0)} → ${v1.toFixed(0)} (${pct(v1 / v0 - 1)}); berry bushes within 20 tiles of the start flagged dry on day 1: ${dryBushes.length}`,
    };
  },
  B2(c) {
    const pre = c.others.get('m2-rv');
    if (!pre?.result) throw new NotMeasurable('the pre-filled game (m2-rv) has no result');
    const e1 = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1'), e2 = need(c.L.snapshot('end'), 'end');
    const p1 = need(pre.snapshotAt(D0 + 1, 0.1), 'pre-filled day-1');
    const d1 = waterDiff(c.L.info, e1, p1), d2 = waterDiff(c.L.info, e2, p1);
    const deathsE = new Set((c.L.result!.plantDeaths ?? []).map((d) => d.id));
    const deathsP = new Set((pre.result.plantDeaths ?? []).filter((d) => d.day <= D0 + 2.2).map((d) => d.id));
    const same = deathsE.size === deathsP.size && [...deathsE].every((x) => deathsP.has(x));
    const ok = d2.within01 >= 0.9 && same;
    return { verdict: ok ? 'passed' : 'failed', detail: `against the pre-filled game on day 1: after 1 day ${pct(d1.within01)} of wet tiles within 0.1, after ${f2(e2.day - D0)} days ${pct(d2.within01)} (volume ${d2.volumeGame.toFixed(0)} against ${d2.volumeFile.toFixed(0)}); plants that died: ${deathsE.size} here, ${deathsP.size} in the pre-filled game over the same days${same ? ' (the same)' : ''}` };
  },
  B3(c) {
    const info = c.L.info, r = c.L.result!;
    const start = info.start!;
    const groves = grovesCached();
    const died = r.plantDeaths ?? [];
    const nearStart = died.filter((d) => d.template === 'BlueberryBush' && Math.hypot(d.x - start.x, d.y - start.y) <= 20);
    const inGroves = died.filter((d) => groves.some((g) => g.species === d.template && Math.hypot(d.x - g.x, d.y - g.y) <= 10));
    const deadAtStart = new Set((r.entitiesAtStart ?? []).filter((e) => e.plant?.dead).map((e) => e.id));
    const revived = (r.entitiesAtEnd ?? []).filter((e) => deadAtStart.has(e.id) && e.plant && !e.plant.dead).length;
    const ok = nearStart.length === 0 && inGroves.length === 0 && revived === 0;
    const bySpecies: Record<string, number> = {};
    for (const d of died) bySpecies[`${d.template} (${d.cause})`] = (bySpecies[`${d.template} (${d.cause})`] ?? 0) + 1;
    return { verdict: ok ? 'passed' : 'failed', detail: `over ${f2((r.samples.at(-1)?.day ?? D0) - D0)} days with a 3-day drought from day 14: ${died.length} plants died (${Object.entries(bySpecies).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}); berry bushes within 20 tiles of the start: ${nearStart.length} died; the four living groves: ${inGroves.length} died; dead stands alive again: ${revived}` };
  },
  B4(c) {
    const info = c.L.info;
    const maxStart = Math.max(...c.L.samples().map((r) => Loaded.topWater(r, 42, 38).contamination));
    const end = need(c.L.snapshot('end'), 'end');
    const fileBad: number[] = [];
    for (let t = 0; t < info.W * info.H; t++) if (info.depth[t] > 0.05 && info.contamination[t] > 0.1) fileBad.push(t);
    const near = new Uint8Array(info.W * info.H);
    for (const t of fileBad) for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = (t % info.W) + dx, y = ((t / info.W) | 0) + dy;
      if (x >= 0 && y >= 0 && x < info.W && y < info.H) near[y * info.W + x] = 1;
    }
    let bad = 0, outside = 0;
    const ex: string[] = [];
    for (let t = 0; t < info.W * info.H; t++)
      if (end.depth[t] > 0.05 && end.contamination[t] > 0.1) {
        bad++;
        if (!near[t]) {
          outside++;
          if (ex.length < 4) ex.push(`(${t % info.W}, ${(t / info.W) | 0}) ${pct(end.contamination[t])}`);
        }
      }
    const ok = maxStart < 0.05 && outside <= Math.max(2, 0.02 * bad);
    return { verdict: ok ? 'passed' : 'failed', detail: `the start water (42, 38): contamination at most ${pct(maxStart)}; badwater tiles (over 10%) at the end: ${bad}, of which ${outside} are more than 3 tiles from the file's badwater${ex.length ? ` (${ex.join(', ')})` : ''}` };
  },

  F1(c) {
    const s = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1');
    const expected = c.L.prepared.game.id.endsWith('s8') ? 0.12 : 0.03;
    const lip: number[] = [];
    for (let x = 55; x <= 74; x++) lip.push(s.depth[118 * c.L.info.W + x]);
    const wet = lip.filter((d) => d > 0.001).length;
    const mean = lip.reduce((a, b) => a + b, 0) / lip.length;
    const ok = wet === 20 && Math.abs(mean / expected - 1) <= 0.5;
    const file = [] as number[];
    for (let x = 55; x <= 74; x++) file.push(c.L.info.depth[118 * c.L.info.W + x]);
    return { verdict: ok ? 'passed' : 'failed', detail: `measured part: ${wet} of 20 lip tiles wet after a day, mean ${f3(mean)} deep (the port: ${f3(expected)}; the file stores ${f3(file.reduce((a, b) => a + b, 0) / 20)}); the look is in the screenshots` };
  },
  'C-gorge'(c) {
    const row = c.L.sampleAt(D0 + 1)!;
    const beside = [[66, 20], [66, 18], [66, 24]].map(([x, y]) => Loaded.topWater(row, x, y));
    const ok = beside[0].depth > 0.2;
    return { verdict: ok ? 'passed' : 'failed', detail: `measured part: the water beside the landing after a day: (66, 20) ${f3(beside[0].depth)} deep, (66, 18) ${f3(beside[1].depth)}, (66, 24) ${f3(beside[2].depth)}; the walk and the pump are not measured` };
  },
  'M6-1a'(c) {
    const v = loadVerdict(c);
    return { verdict: v.verdict, detail: 'measured part (loads with no issues): ' + v.detail };
  },
  'M6-1b'(c) {
    return EVALS['M6-1a'](c);
  },

  D1(c) {
    const o = objectsDiff(c.L.info, c.L.result!);
    const issues = c.L.result!.loadingIssues ?? [];
    const counts: Record<string, number> = {};
    for (const e of c.L.info.entities) if (/Blockage|NaturalDam|Thorns|Relic|Geothermal|UndergroundRuins/.test(e.template)) counts[e.template] = (counts[e.template] ?? 0) + 1;
    const game = new Map((c.L.result!.entitiesAtStart ?? []).map((e) => [e.id, e]));
    const foundCounts: Record<string, number> = {};
    for (const e of c.L.info.entities) if (counts[e.template] && game.get(e.id)) foundCounts[e.template] = (foundCounts[e.template] ?? 0) + 1;
    const ok = issues.length === 0 && o.missing.length === 0 && o.moved.length === 0;
    return { verdict: ok ? 'passed' : 'failed', detail: `loading issues ${issues.length}; ${Object.keys(counts).map((k) => `${k} ${foundCounts[k] ?? 0}/${counts[k]}`).join(', ')}; all objects ${o.found}/${o.expected}${o.missing.length ? `; missing: ${o.missing.slice(0, 6).join(', ')}` : ''}` };
  },
  D2(c) {
    const info = c.L.info;
    const s = need(c.L.snapshotAt(D0 + 0.8, 0.1), 'day-0.8');
    const dams = new Set(info.entities.filter((e) => e.template === 'NaturalDam').map((e) => e.y * info.W + e.x));
    const wet = weirTiles(info).map(([x, y]) => y * info.W + x).filter((t) => !dams.has(t));
    const surf = (t: number) => info.floor[t] + info.depth[t];
    const top = Math.max(...wet.map(surf));
    const up = wet.filter((t) => surf(t) > top - 0.3), down = wet.filter((t) => surf(t) <= top - 0.3);
    const upFile = median(up.map((t) => info.depth[t])), upGame = median(up.map((t) => s.depth[t]));
    const downGame = median(down.map((t) => s.depth[t]));
    const ok = up.length > 0 && down.length > 0 && Math.abs(upGame - upFile) <= 0.1 && downGame > 0.01;
    return { verdict: ok ? 'passed' : 'failed', detail: `upstream of the weir (${up.length} tiles): ${f3(upFile)} deep in the file, ${f3(upGame)} in the game after ${f2(s.day - D0)} days; downstream (${down.length} tiles): ${f3(downGame)} deep (water flows over)` };
  },
  D5(c) {
    const info = c.L.info, r = c.L.result!;
    const act = (r.actions ?? []).find((a) => a.template === 'Blockage');
    const lake = wetAreas(info)[0];
    const before = need(c.L.snapshot('before-deleteEntities'), 'before the plug');
    const end = need(c.L.snapshot('end'), 'end');
    const late = c.L.snapshotAt(D0 + 5, 0.1);
    const s0 = median(lake.tiles.map((t) => surfaceOf(before, t))), s1 = median(lake.tiles.map((t) => surfaceOf(end, t)));
    const sLate = late ? median(lake.tiles.map((t) => surfaceOf(late, t))) : NaN;
    const lost = volumeOf(before, lake.tiles) - volumeOf(end, lake.tiles);
    const ok = !!act && act.removed === 3 && Math.abs(s0 - s1 - 1) <= 0.35 && Math.abs(lost / 3290 - 1) <= 0.35 && (!Number.isFinite(sLate) || Math.abs(sLate - s1) <= 0.1);
    return { verdict: ok ? 'passed' : 'failed', detail: `plug: ${act ? `${act.removed} Blockage tiles removed at day ${f2(act.day - D0)}` : 'not removed'}; the lake (${lake.tiles.length} tiles) stood at ${f2(s0)}, ${f2(s1)} ${f2(end.day - act!.day)} days later${Number.isFinite(sLate) ? ` (${f2(sLate)} a day before the end)` : ''}; it lost ${lost.toFixed(0)} water (expected about 3,290 and one level)` };
  },

  'M8-1a'(c) {
    const s = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1');
    const d = waterDiff(c.L.info, s);
    const W = c.L.info.W;
    const lake = s.depth[65 * W + 63], weir = s.depth[80 * W + 92], lowered = s.depth[31 * W + 22];
    const ok = d.within01 >= 0.95 && Math.abs(lake - 1.51) <= 0.1 && Math.abs(weir - 0.6) <= 0.1 && lowered <= 0.05;
    return { verdict: ok ? 'passed' : 'failed', detail: `the file (the canonical settle; the editor's preview is within 0.016 of it) against the game after a day: ${waterText(d)}; the lake (63, 65): 1.51 in checks.txt, ${f3(lake)} in the game; the weir (92, 80): 0.60 → ${f3(weir)}; the lowered ground (22, 31): dry in the editor, ${f3(lowered)} in the game` };
  },
  'M8-1b'(c) {
    const o = c.others.get('m8-canyon-original');
    if (!o?.result) throw new NotMeasurable('the original Canyon has no result');
    const s = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1'), so = need(o.snapshotAt(D0 + 1, 0.1), 'original day-1');
    const W = c.L.info.W;
    const lakeT: number[] = [];
    for (let y = 59; y <= 67; y++) for (let x = 72; x <= 80; x++) lakeT.push(y * W + x);
    const lakeGame = volumeOf(s, lakeT) / lakeT.length, lakeFile = volumeOf(c.L.info, lakeT) / lakeT.length;
    const layered = new Map(so.layered.map((l) => [l.y * W + l.x, l]));
    let n = 0, within = 0, sum = 0;
    for (const l of s.layered) {
      const b = layered.get(l.y * W + l.x);
      if (!b) continue;
      const da = l.columns.reduce((a, c2) => a + c2[1], 0), db = b.columns.reduce((a, c2) => a + c2[1], 0);
      n++;
      sum += Math.abs(da - db);
      if (Math.abs(da - db) <= 0.1) within++;
    }
    const ok = lakeGame > 0.5 * lakeFile && n > 0 && within / n >= 0.9;
    return { verdict: ok ? 'passed' : 'failed', detail: `the new lake: mean depth ${f3(lakeGame)} after a day (the file ${f3(lakeFile)}); under roofs, ${n} tiles with several water columns: ${n ? pct(within / n) : '-'} within 0.1 of the original Canyon, mean |Δ| ${n ? f3(sum / n) : '-'}` };
  },
  'M8-1c'(c) {
    const o = c.others.get('m8-cozy-original');
    if (!o?.result) throw new NotMeasurable('the original Cozy Secret Valley has no result');
    const s = need(c.L.snapshotAt(D0 + 1, 0.1), 'day-1'), so = need(o.snapshotAt(D0 + 1, 0.1), 'original day-1');
    const W = c.L.info.W, H = c.L.info.H;
    const diffs: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (x >= 6 && x <= 22 && y >= 4 && y <= 20) continue; // away from the edit
        const t = y * W + x;
        if (s.depth[t] > 0.1 && so.depth[t] > 0.1) diffs.push(Math.abs(surfaceOf(s, t) - surfaceOf(so, t)));
      }
    const med = median(diffs);
    const edit: number[] = [];
    for (let y = 10; y <= 14; y++) for (let x = 12; x <= 16; x++) edit.push(y * W + x);
    const editGame = volumeOf(s, edit) / edit.length, editFile = volumeOf(c.L.info, edit) / edit.length;
    const ok = diffs.length > 0 && med <= 0.1 && Math.abs(editGame - editFile) <= 0.1;
    return { verdict: ok ? 'passed' : 'failed', detail: `water surfaces away from the edit against the original after a day: median |Δ| ${f3(med)} over ${diffs.length} tiles wet in both; the lowered ground: ${f3(editGame)} deep in the game, ${f3(editFile)} in the file` };
  },
  'ML-2'() {
    return { verdict: 'not measurable', detail: 'compared by eye from the screenshots (RESULTS.md)' };
  },

  'cal-1'(c) {
    return tileAgainstModel(c, 90, 50, 'depth', 'drought1-start', 'drought1-day1', (g, m) => `River Valley (90, 50) depth`);
  },
  'cal-2'(c) {
    const start = c.L.prepared.map.moments.find((m) => m.id === 'drought1-start')!.day;
    return tileAgainstModel(c, 45, 36, 'depth', 'drought1-start', null, () => 'Lake Basin (45, 36) depth', [start - 1, start, start + 3]);
  },
  'cal-3'(c) {
    return tileAgainstModel(c, 72, 61, 'contamination', 'badtide2-start', 'badtide2-day1', () => 'River Valley (72, 61) contamination');
  },
  'cal-4'(c) {
    return plantTimer(c);
  },
  'cal-timeline'(c) {
    return timeline(c);
  },
  'drought-start-water'(c) {
    return startWaterDrought(c);
  },
  E4(c) {
    const r = c.L.result!;
    const probs = logProblems(r);
    return { verdict: 'recorded', detail: `status ${r.status}${r.failure ? ` (${r.failure})` : ''}; loading issues: ${(r.loadingIssues ?? []).join('; ') || 'none'}; district center: ${r.start?.districtCenter ? 'placed' : 'none'}; ${r.start?.adults ?? 0} adults, ${r.start?.children ?? 0} children; log: ${probs.errors.slice(0, 4).join(' | ') || 'no error'}; notes: ${(r.notes ?? []).join('; ') || '-'}` };
  },
};

// ------------------------------------------------------------------------------ model comparisons

/** The first hazard's start (game day), or the end of the game when it has none. */
function firstHazard(c: Ctx): number {
  const m = c.L.prepared.map.moments.filter((x) => /^(drought|badtide)\d+-start$/.test(x.id)).sort((a, b) => a.day - b.day)[0];
  return m ? m.day : c.L.prepared.map.endDay;
}

function modelSample(m: ModelRun, day: number, tile: number): { depth: number; contamination: number } {
  let best = m.samples[0];
  for (const s of m.samples) if (Math.abs(s.day - day) < Math.abs(best.day - day)) best = s;
  const t = best.tiles[tile];
  return { depth: t.depth, contamination: t.contamination };
}

/** When a series first crosses `level` (downward for depth, upward for contamination). */
function crossing(series: { day: number; v: number }[], level: number, down: boolean): number | null {
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i];
    if (down ? a.v > level && b.v <= level : a.v < level && b.v >= level) return a.day + ((b.day - a.day) * (a.v - level)) / (a.v - b.v || 1);
  }
  return null;
}

function tileAgainstModel(c: Ctx, x: number, y: number, what: 'depth' | 'contamination', fromMoment: string, dayMoment: string | null, label: (g: number, m: number) => string, days?: number[]) {
  if (!c.model) throw new NotMeasurable(`the model did not run${c.modelError ? ': ' + c.modelError : ''}`);
  const tiles = c.L.prepared.map.tiles;
  const k = tiles.findIndex(([a, b]) => a === x && b === y);
  const from = c.L.prepared.map.moments.find((m) => m.id === fromMoment)?.day;
  if (k < 0 || from == null) throw new NotMeasurable('the tile or the moment is not in this game');
  const pts = days ?? [from - 0.5, from, from + 0.5, ...(dayMoment ? [c.L.prepared.map.moments.find((m) => m.id === dayMoment)!.day] : [from + 1])];
  const rows = pts.map((d) => {
    const g = c.L.sampleAt(d)!;
    const gv = what === 'depth' ? Loaded.topWater(g, x, y).depth : Loaded.topWater(g, x, y).contamination;
    const mv = modelSample(c.model!, g.day, k)[what];
    return { day: g.day, g: gv, m: mv };
  });
  const worst = Math.max(...rows.map((r) => Math.abs(r.g - r.m)));
  const gSeries = c.L.samples().map((r) => ({ day: r.day, v: what === 'depth' ? Loaded.topWater(r, x, y).depth : Loaded.topWater(r, x, y).contamination }));
  const mSeries = c.model.samples.map((s) => ({ day: s.day, v: s.tiles[k][what] }));
  const level = what === 'depth' ? 0.05 : 0.5;
  const gc = crossing(gSeries.filter((s) => s.day >= from - 0.5), level, what === 'depth');
  const mc = crossing(mSeries.filter((s) => s.day >= from - 0.5), level, what === 'depth');
  const timing = gc != null && mc != null ? `the game reaches ${what === 'depth' ? 'under 0.05 deep' : '50%'} at day ${f2(gc - D0)}, the model at ${f2(mc - D0)}: the model is ${mc < gc ? 'early' : 'late'} by ${hours(Math.abs(mc - gc))}` : `crossing ${what === 'depth' ? '0.05 deep' : '50%'}: game ${gc == null ? 'never' : f2(gc - D0)}, model ${mc == null ? 'never' : f2(mc - D0)}`;
  const ok = worst <= (what === 'depth' ? 0.05 : 0.1) && (gc == null) === (mc == null) && (gc == null || Math.abs(gc - mc!) <= 3 / 24);
  return { verdict: (ok ? 'passed' : 'failed') as Verdict, detail: `${label(0, 0)} (game / model): ${rows.map((r) => `day ${f2(r.day - D0)} ${f3(r.g)} / ${f3(r.m)}`).join('; ')}; ${timing}` };
}

const DRY_DAYS: Record<string, number> = { Pine: 13, Birch: 11, Oak: 15, BlueberryBush: 9, Succulent: 8 };

function plantTimer(c: Ctx) {
  if (!c.model) throw new NotMeasurable(`the model did not run${c.modelError ? ': ' + c.modelError : ''}`);
  const W = c.L.info.W;
  const byTile = new Map(c.model.plants.map((p) => [`${p.tile}:${p.species}`, p]));
  const deaths = (c.L.result!.plantDeaths ?? []).filter((d) => d.cause === 'dry soil');
  let inWindow = 0, early = 0, late = 0;
  const offsets: number[] = [];
  for (const d of deaths) {
    const p = byTile.get(`${d.y * W + d.x}:${d.template}`);
    if (!p?.dryFrom || !DRY_DAYS[d.template]) continue;
    const lo = p.dryFrom + 0.9 * DRY_DAYS[d.template], hi = p.dryFrom + 1.1 * DRY_DAYS[d.template];
    if (d.day >= lo - 0.1 && d.day <= hi + 0.1) inWindow++;
    else if (d.day < lo) early++;
    else late++;
    if (p.diedDay) offsets.push(p.diedDay - d.day);
  }
  const modelDeaths = c.model.plants.filter((p) => p.diedDay != null && p.cause === 'dry soil').length;
  const bush = deaths.find((d) => d.x === 18 && d.y === 87);
  const mb = c.model.plants.find((p) => p.tile === 87 * W + 18);
  const judged = inWindow + early + late;
  const ok = judged > 0 && inWindow / judged >= 0.9;
  return {
    verdict: (judged === 0 ? 'not measurable' : ok ? 'passed' : 'failed') as Verdict,
    detail: `${deaths.length} plants died of dry soil in the game, ${modelDeaths} in the model; of ${judged} the model also saw dry, ${inWindow} died within 0.9–1.1 of their dry days after the model's soil dried (${early} earlier, ${late} later); death day, model minus game: median ${offsets.length ? hours(median(offsets)) : '-'}; BlueberryBush (18, 87): game ${bush ? `day ${f2(bush.day - D0)}` : 'alive'}, model ${mb?.diedDay ? `day ${f2(mb.diedDay - D0)}` : 'alive'} (its soil dry from ${mb?.dryFrom ? `day ${f2(mb.dryFrom - D0)}` : '-'})`,
  };
}

function timeline(c: Ctx) {
  if (!c.model) throw new NotMeasurable(`the model did not run${c.modelError ? ': ' + c.modelError : ''}`);
  const rows: string[] = [];
  let worstV = 0, worstW = 0;
  for (const mm of c.model.maps) {
    const s = c.L.snapshotAt(mm.day, 0.05);
    if (!s) continue;
    let vg = 0, vm = 0, wg = 0, wm = 0, mg = 0, mo = 0, bg = 0, bm = 0;
    for (let t = 0; t < s.depth.length; t++) {
      vg += s.depth[t];
      vm += mm.depth[t];
      if (s.depth[t] > 0.05) wg++;
      if (mm.depth[t] > 0.05) wm++;
      if (s.moisture[t] > 0) mg++;
      if (mm.moisture[t] > 0) mo++;
      if (s.depth[t] > 0.05 && s.contamination[t] > 0.05) bg++;
      if (mm.depth[t] > 0.05 && mm.contamination[t] > 0.05) bm++;
    }
    // relative to the larger of the two (a map that has run dry in both is no difference)
    worstV = Math.max(worstV, Math.abs(vm - vg) / Math.max(1, vg, vm));
    worstW = Math.max(worstW, Math.abs(wm - wg) / Math.max(1, wg, wm));
    rows.push(`day ${f2(s.day - D0)}: water ${vg.toFixed(0)}/${vm.toFixed(0)}, wet ${wg}/${wm}, moist ${mg}/${mo}, badwater ${bg}/${bm}`);
  }
  const deadG = (c.L.result!.plantDeaths ?? []).length, deadM = c.model.plants.filter((p) => p.diedDay != null).length;
  const ok = rows.length > 0 && worstV <= 0.05 && worstW <= 0.05;
  return { verdict: (rows.length ? (ok ? 'passed' : 'failed') : 'not measurable') as Verdict, detail: `game/model by day: ${rows.join('; ')}; plants died ${deadG}/${deadM}; largest difference: water ${pct(worstV)}, wet tiles ${pct(worstW)}` };
}

function startWaterDrought(c: Ctx) {
  const info = c.L.info;
  const first = startWater(info)[0];
  if (!first) throw new NotMeasurable('no water near the start');
  const area = wetAreas(info).find((a) => a.tiles.includes(first[1] * info.W + first[0]));
  if (!area) throw new NotMeasurable('no water body at the start');
  const brief = briefFor(c.L.prepared.game.title);
  const hazard = c.L.prepared.map.moments.find((m) => m.id === 'drought1-start')!.day;
  const pts = [hazard - 0.01, hazard + 1, hazard + 2, hazard + 3];
  const rows: string[] = [];
  let worst = 0;
  const v0 = volumeOf(info, area.tiles);
  for (const d of pts) {
    const s = c.L.snapshotAt(d, 0.06);
    if (!s) continue;
    const g = volumeOf(s, area.tiles);
    const mm = c.model?.maps.find((x) => Math.abs(x.day - d) < 0.06);
    const m = mm ? volumeOf(mm, area.tiles) : NaN;
    if (Number.isFinite(m)) worst = Math.max(worst, Math.abs(g - m) / Math.max(1, v0));
    rows.push(`day ${f2(s.day - D0)}: ${pct(g / v0)} left${Number.isFinite(m) ? ` (model ${pct(m / v0)})` : ''}`);
  }
  const ok = c.model ? worst <= 0.1 : true;
  return {
    verdict: (rows.length ? (c.model ? (ok ? 'passed' : 'failed') : 'recorded') : 'not measurable') as Verdict,
    detail: `the start's water (${area.tiles.length} tiles, ${v0.toFixed(0)} water at the start; ${Math.hypot(first[0] - info.start!.x, first[1] - info.start!.y).toFixed(0)} tiles from the start) through a 3-day Normal drought from day ${f2(hazard - D0)}: ${rows.join('; ')}${c.model ? `; largest game–model gap ${pct(worst)} of the start volume` : ''}${brief ? `. The brief says: "${brief}"` : ''}`,
  };
}

// ------------------------------------------------------------------------------ cached inputs

const cache = new Map<string, unknown>();
function depthSamplesCached(rel: string, marker: string) {
  const key = rel + marker;
  if (!cache.has(key)) {
    const line = readFileSync(join(REPO, rel), 'utf8').split(/\r?\n/).find((l) => l.includes(marker)) ?? '';
    cache.set(key, [...line.matchAll(/\((\d+), (\d+)\) ([\d.]+) deep/g)].map((m) => ({ x: +m[1], y: +m[2], depth: +m[3] })));
  }
  return cache.get(key) as { x: number; y: number; depth: number }[];
}
function grovesCached(): { n: number; species: string; x: number; y: number }[] {
  if (!cache.has('groves')) {
    const line = readFileSync(join(REPO, 'out/m2/checks.txt'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('Trees:')) ?? '';
    cache.set('groves', [...line.matchAll(/(\d+) (\w+) around \((\d+), (\d+)\)/g)].map((m) => ({ n: +m[1], species: m[2], x: +m[3], y: +m[4] })));
  }
  return cache.get('groves') as { n: number; species: string; x: number; y: number }[];
}
function westRiver(info: MapInfo): number[] {
  const out: number[] = [];
  for (let y = 60; y <= 95 && y < info.H; y++) for (let x = 0; x <= 24; x++) out.push(y * info.W + x);
  return out;
}
/** The M9 brief's line for a prototype map (investigation/generative/out/README.md on its branch). */
function briefFor(title: string): string | null {
  if (!cache.has('briefs')) {
    let text = '';
    try {
      text = execFileSync('git', ['-C', REPO, 'show', 'origin/investigation/generative:investigation/generative/out/README.md'], { encoding: 'utf8' });
    } catch {
      // not available
    }
    cache.set('briefs', text);
  }
  const row = (cache.get('briefs') as string).split(/\r?\n/).find((l) => l.includes(`${title}.timber`));
  return row ? row.split('|').filter((x) => x.trim()).at(-1)!.trim() : null;
}

// ------------------------------------------------------------------------------ entry

export function evaluate(ctx: Ctx, checks: CheckDef[]): CheckResult[] {
  return checks.map((def) => {
    if (def.how === 'none') return { id: def.id, title: def.title, verdict: 'not measurable' as Verdict, detail: def.why ?? '' };
    if (!ctx.L.result) return { id: def.id, title: def.title, verdict: 'not measurable' as Verdict, detail: 'the game produced no result for this map' };
    if (ctx.L.result.status !== 'done' && !['load', 'high-load', 'tall-load', 'A1', 'E4', 'M6-1a', 'M6-1b'].includes(def.id))
      return { id: def.id, title: def.title, verdict: 'not measurable' as Verdict, detail: `the map did not finish (${ctx.L.result.status}${ctx.L.result.failure ? ': ' + ctx.L.result.failure : ''})` };
    const e = EVALS[def.id];
    if (!e) return { id: def.id, title: def.title, verdict: 'not measurable' as Verdict, detail: 'no evaluation for this check' };
    try {
      const v = e(ctx);
      const note = def.how === 'partial' && def.why ? ` (not measured: ${def.why})` : '';
      return { id: def.id, title: def.title, verdict: v.verdict, detail: v.detail + note };
    } catch (err) {
      return { id: def.id, title: def.title, verdict: 'not measurable' as Verdict, detail: err instanceof NotMeasurable ? err.message : `evaluation failed: ${(err as Error).message}` };
    }
  });
}
