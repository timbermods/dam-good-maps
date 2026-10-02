import { WaterSim, type WaterState, type WaterModel, TICKS_PER_DAY } from './local/runtime';
import { OBSTACLES, waterColumns, type WaterColumns, type WaterObjectPlacement } from '../terrain3d/proto/columns';
import { StackSim } from '../terrain3d/proto/stackwater';
import type { StackEmitter } from '../terrain3d/proto/stackwater';
import { compileWall, barrierHeight, type Stroke, type Wall } from './wall';
import { ResidentWater, installResident, hasResident } from './resident';
import { spillLevels } from '../../src/core/sim/prefill';

export interface MapSnapshot {
  name: string; model: WaterModel; water: WaterState; out?: Float64Array;
  /** Explicit authored farmland; missing means unknown, never inferred from fertile ground. */
  farmland?: Uint8Array;
  startTiles: readonly number[];
  objects: readonly { id: string; template: string; tiles: readonly number[]; z: number; height: number }[];
  /** For roofed maps: original topology, sources and per-column water, retained exactly. */
  stacked?: {
    voxels: Uint8Array; layers: number; placements: readonly WaterObjectPlacement[];
    cols: WaterColumns; emitters: StackEmitter[];
    depth: Float64Array; contamination: Float64Array; overflow: Float64Array;
    momentum: { from: number; toTile: number; toSlot: number; flow: number }[];
  };
}
/** One supplied weather interval. No random schedule is generated from difficulty or map seed.
 * Supply one-tick intervals for changing ramps, or compress adjacent identical forcing. */
export interface WeatherFrame {
  ticks: number; kind: 'temperate' | 'drought' | 'badtide';
  strengths: readonly number[]; contamination: readonly number[];
}
export interface WeatherInput { provenance: string; frames: readonly WeatherFrame[] }
interface Sim {
  ticks: number; run(n: number): void; volume(): number;
  columns(): { floor: ArrayLike<number>; ceiling?: ArrayLike<number>; depth: Float64Array; overflow?: Float64Array; N: number };
  tileWater(): { depth: Float64Array; surface: Float64Array };
  force(f: WeatherFrame): void; dispose(): void;
}
function tileWater(floor: ArrayLike<number>, depth: Float64Array, overflow: Float64Array | undefined, N: number) {
  const d = new Float64Array(N), surface = new Float64Array(N).fill(-Infinity);
  for (let c = 0; c < depth.length; c++) {
    const i = c % N, water = depth[c] + (overflow?.[c] ?? 0);
    d[i] += water;
    if (water > 0) surface[i] = Math.max(surface[i], floor[c] + depth[c]);
  }
  return { depth: d, surface };
}
function heightSim(m: WaterModel, water: WaterState, out?: Float64Array): Sim {
  const sim = hasResident() ? new ResidentWater(m, water, out) : new WaterSim(m, water, { rules: 'game' });
  if (out && !(sim instanceof ResidentWater)) sim.out.set(out);
  return {
    get ticks() { return sim.ticks; },
    run(n) { sim.run(n); }, volume() { return sim.volume(); },
    columns() { return { floor: sim.F, depth: sim.D, N: sim.N }; },
    tileWater() { return tileWater(sim.F, sim.D, undefined, sim.N); },
    force(f) {
      if (sim instanceof ResidentWater) sim.force(f.strengths, f.contamination);
      else for (let k = 0; k < sim.emitters.length; k++) {
        sim.emitters[k].strength = f.strengths[k]; sim.emitters[k].contamination = f.contamination[k];
      }
    },
    dispose() { sim.dispose(); }
  };
}
function stackColumns(base: WaterModel, wall: Wall, original?: MapSnapshot['stacked']): WaterColumns {
  const N = base.W * base.H, voxels = original?.voxels ?? new Uint8Array(34 * N);
  if (!original) for (let i = 0; i < N; i++) for (let z = 0; z < base.floor[i]; z++) voxels[z * N + i] = 1;
  const objects: WaterObjectPlacement[] = original ? [...original.placements] : [], temp: string[] = [];
  const add = (tile: number, z: number, rule: typeof OBSTACLES[string]) => {
    const template = '__damSketch' + temp.length; temp.push(template); OBSTACLES[template] = rule;
    objects.push({ template, x: tile % base.W, y: Math.floor(tile / base.W), z, orientation: 'Cw0', flipped: false });
  };
  for (let i = 0; !original && i < N; i++) if (base.dam && base.dam[i] >= 0) {
    add(i, base.floor[i], { partial: { at: [0, 0], height: base.dam[i] } });
  }
  for (const p of wall.pieces) {
    // Every finished player dam/gate has a floor plane at its base.
    add(p.tile, p.z, { horizontal: [[0, 0, 0]] });
    const h = barrierHeight(p.piece);
    for (let z = 0; z < Math.floor(h); z++) add(p.tile, p.z + z, { full: [[0, 0]] });
    if (h % 1 > 0) add(p.tile, p.z + Math.floor(h), { partial: { at: [0, 0], height: h % 1 } });
  }
  try { return waterColumns(base.W, base.H, voxels, objects, original?.layers ?? 34); }
  finally { for (const key of temp) delete OBSTACLES[key]; }
}
function stackedSim(base: WaterModel, wall: Wall, initial: WaterState, original?: MapSnapshot['stacked'], initialOut?: Float64Array): Sim {
  const cols = stackColumns(base, wall, original), N = cols.N;
  const emitters = original ? original.emitters.map(e => ({ ...e, cols: e.cols.map(old => {
    const i = old % N, z = original.cols.floor[old];
    for (let k = 0; k < cols.count[i]; k++) if (cols.floor[k * N + i] === z) return k * N + i;
    throw Error('Wall removed a source column');
  }) })) : wall.model.emitters.map(e => ({ ...e, tiles: [...e.cells],
    cols: e.cells.map(i => {
      for (let k = 0; k < cols.count[i]; k++) if (cols.floor[k * N + i] === base.floor[i]) return k * N + i;
      throw Error('Emitter lost its column');
    })
  }));
  const sim = new StackSim({ cols, emitters }, 'game'), D = new Float64Array(sim.M),
    C = new Float64Array(sim.M), O = new Float64Array(sim.M);
  for (let i = 0; i < N; i++) for (let k = 0; k < cols.count[i]; k++) {
    const c = k * N + i;
    if (original) {
      let mass = 0;
      for (let s = 0; s < original.cols.count[i]; s++) {
        const old = s * N + i;
        const low = Math.max(cols.floor[c], original.cols.floor[old]),
          high = Math.min(cols.ceil[c], original.cols.floor[old] + original.depth[old]);
        const amount = Math.max(0, high - low); D[c] += amount; mass += amount * original.contamination[old];
        if (cols.floor[c] === original.cols.floor[old] && cols.ceil[c] === original.cols.ceil[old]) O[c] = original.overflow[old];
      }
      C[c] = D[c] > 0 ? mass / D[c] : 0;
    } else {
      const head = base.floor[i] + initial.depth[i];
      D[c] = Math.max(0, Math.min(head, cols.ceil[c]) - cols.floor[c]);
      C[c] = D[c] > 0 ? initial.contamination[i] : 0;
    }
  }
  sim.setState(D, O, C);
  const findSlot = (tile: number, z: number) => {
    for (let k = 0; k < cols.count[tile]; k++) {
      const c = k * N + tile;
      if (cols.floor[c] <= z && z < cols.ceil[c]) return k;
    }
    return -1;
  };
  const flows = original?.momentum ?? [];
  if (original) {
    const mapped = flows.flatMap(f => {
      const i = f.from % N, s = findSlot(i, original.cols.floor[f.from]);
      const target = f.toTile < 0 ? 0 : findSlot(f.toTile, original.cols.floor[f.toSlot * N + f.toTile]);
      return s < 0 || target < 0 ? [] : [{ ...f, from: s * N + i, toSlot: target }];
    });
    sim.setMomentum(mapped);
  } else if (initialOut) {
    const mapped: typeof flows = [];
    for (let i = 0; i < N; i++) for (let k = 0; k < 4; k++) {
      const flow = initialOut[4 * i + k]; if (!(flow > 0)) continue;
      const x = i % base.W, y = Math.floor(i / base.W),
        tx = x + (k === 1 ? -1 : k === 3 ? 1 : 0),
        ty = y + (k === 0 ? -1 : k === 2 ? 1 : 0);
      const s = findSlot(i, base.floor[i]), tile = tx < 0 || ty < 0 || tx >= base.W || ty >= base.H ? -1 : ty * base.W + tx;
      const target = tile < 0 ? 0 : findSlot(tile, base.floor[tile]);
      if (s >= 0 && target >= 0) mapped.push({ from: s * N + i, toTile: tile, toSlot: target, flow });
    }
    sim.setMomentum(mapped);
  }
  return {
    get ticks() { return sim.ticks; }, run(n) { sim.run(n); }, volume() { return sim.volume(); },
    columns() { return { floor: sim.Fl, ceiling: sim.Ce, depth: sim.D, overflow: sim.O, N }; },
    tileWater() { return tileWater(sim.Fl, sim.D, sim.O, N); },
    force(f) { for (let k = 0; k < sim.emitters.length; k++) {
      sim.emitters[k].strength = f.strengths[k]; sim.emitters[k].contamination = f.contamination[k];
    } }, dispose() {}
  };
}
const cloneModel = (m: WaterModel): WaterModel => ({ ...m, floor: m.floor.slice(), dam: m.dam?.slice() ?? null,
  emitters: m.emitters.map(e => ({ ...e, cells: [...e.cells], depthLimit: e.depthLimit && { ...e.depthLimit } })) });
function validateMap(map: MapSnapshot) {
  const { model: m, water: w } = map, N = m.W * m.H;
  if (!Number.isInteger(m.W) || !Number.isInteger(m.H) || m.W < 1 || m.H < 1 ||
    m.floor.length !== N || w.depth.length !== N || w.contamination.length !== N ||
    (m.dam && m.dam.length !== N) || (map.farmland && map.farmland.length !== N) ||
    (map.out && map.out.length !== 4 * N)) throw Error('Map array dimensions disagree');
  for (let i = 0; i < N; i++) {
    if (!Number.isInteger(m.floor[i]) || m.floor[i] < 0 || m.floor[i] >= 34 ||
      !Number.isFinite(w.depth[i]) || w.depth[i] < 0 || !Number.isFinite(w.contamination[i]) ||
      w.contamination[i] < 0 || w.contamination[i] > 1 ||
      (m.dam && (!Number.isFinite(m.dam[i]) || m.dam[i] < -1 || m.dam[i] >= 1))) throw Error('Invalid water column');
  }
  for (const e of m.emitters) if (!e.cells.length || e.cells.some(i => !Number.isInteger(i) || i < 0 || i >= N) ||
    !Number.isFinite(e.strength) || e.strength < 0 || !Number.isFinite(e.contamination) ||
    e.contamination < 0 || e.contamination > 1) throw Error('Invalid emitter');
  for (const i of [...map.startTiles, ...map.objects.flatMap(o => [...o.tiles])]) {
    if (!Number.isInteger(i) || i < 0 || i >= N) throw Error('Invalid footprint tile');
  }
}
export interface Result {
  phase: 'filling' | 'filled' | 'weather' | 'complete' | 'cancelled';
  backend: 'rust-heightfield' | 'typescript-heightfield' | 'typescript-stacked';
  fill: { settled: boolean; ticks: number; capped: boolean };
  ticks: number; wall: Wall;
  totalWaterM3: number; controlWaterM3: number; additionalWaterM3: number;
  reservoir: { tiles: number[]; volumeM3: number; surfaceRange: [number, number] | null }[];
  floods: { all: number[]; newly: number[]; start: number[]; farmland: number[] | null;
    objects: { id: string; template: string; tiles: number[] }[] };
  conflicts: { id: string; template: string; tile: number }[];
  drought: null | { provenance: string; coveredDays: number; observedDays: number;
    exhausted: boolean; censored: boolean; meaning: string };
  runtimeMs: number;
}
/**
 * Independent, cancellable sketch. Physics advances only by actual ticks from supplied state:
 * no priority-flood volume, automatic supports, candidate site search or analytical drought.
 * Control advances the same ticks on the unmodified map, separating wall effects from time.
 */
export class SketchJob {
  readonly wall: Wall; readonly backend: Result['backend'];
  private readonly wallMask: Uint8Array;
  private readonly storageMask: Uint8Array;
  private sim: Sim; private control: Sim; private phase: Result['phase'] = 'filling';
  private fill = { settled: false, ticks: 0, capped: false };
  private previous: Float64Array; private previousVolume: number; private sinceCheck = 0;
  private weatherIndex = 0; private inFrame = 0; private droughtTicks = 0;
  private firstDry: number | null = null; private reservoirMask: Uint8Array | null = null;
  private storedTiles: number[] = [];
  private runtimeMs = 0; private disposed = false;
  private disposedResult: Result | null = null;
  readonly conflicts: Result['conflicts'] = [];
  constructor(readonly map: MapSnapshot, strokes: readonly Stroke[], readonly weather?: WeatherInput,
    readonly fillTicks = 6 * TICKS_PER_DAY) {
    const t0 = performance.now(); validateMap(map);
    if (!Number.isInteger(fillTicks) || fillTicks < 128 || fillTicks % 128) throw Error('fillTicks must be a positive multiple of 128');
    if (weather && (!weather.provenance || !weather.frames.length)) throw Error('Weather needs its origin and actual forcing frames');
    for (const f of weather?.frames ?? []) {
      if (!['temperate', 'drought', 'badtide'].includes(f.kind) || !Number.isInteger(f.ticks) || f.ticks < 1 ||
        f.strengths.length !== map.model.emitters.length || f.contamination.length !== map.model.emitters.length ||
        f.strengths.some(s => !Number.isFinite(s) || s < 0) ||
        f.contamination.some(c => !Number.isFinite(c) || c < 0 || c > 1)) throw Error('Invalid weather frame');
    }
    let beganDrought = false, endedDrought = false;
    for (const f of weather?.frames ?? []) {
      if (f.kind === 'drought') {
        if (endedDrought) throw Error('Report one contiguous drought per sketch job');
        beganDrought = true;
      } else if (beganDrought) endedDrought = true;
    }
    this.wall = compileWall(map.model, strokes);
    this.wallMask = new Uint8Array(map.model.W * map.model.H);
    for (const i of this.wall.tiles) this.wallMask[i] = 1;
    // Exact priority flood only identifies which terrain basin the wall encloses.
    // It never supplies a depth, volume, fill time, drought loss or suggested wall.
    const beforeSpill = spillLevels(map.model), afterSpill = spillLevels(this.wall.model);
    this.storageMask = new Uint8Array(this.wallMask.length);
    for (let i = 0; i < this.storageMask.length; i++) {
      if (afterSpill[i] > beforeSpill[i] && !this.wallMask[i]) this.storageMask[i] = 1;
    }
    for (const p of this.wall.pieces) for (const o of map.objects) {
      if (o.tiles.includes(p.tile) && p.z < o.z + o.height && o.z < p.z +
        (p.piece.kind === 'floodgate' ? p.piece.maxHeight + 2 : 1)) {
        this.conflicts.push({ id: o.id, template: o.template, tile: p.tile });
      }
    }
    // A sketch may cross a tree or building. Report the exact construction conflicts;
    // no object is removed from the real map or silently cleared by the planner.
    this.control = map.stacked ? stackedSim(map.model, compileWall(map.model, []), map.water, map.stacked, map.out) :
      heightSim(cloneModel(map.model), map.water, map.out);
    if (this.wall.stacked || map.stacked || this.wall.pieces.some(p => p.z + barrierHeight(p.piece) >= 31)) {
      this.sim = stackedSim(map.model, this.wall, map.water, map.stacked, map.out); this.backend = 'typescript-stacked';
    } else {
      const initial = { depth: new Float64Array(map.water.depth.length), contamination: map.water.contamination.slice() };
      for (let i = 0; i < initial.depth.length; i++) {
        initial.depth[i] = Math.max(0, map.model.floor[i] + map.water.depth[i] - this.wall.model.floor[i]);
      }
      this.sim = heightSim(this.wall.model, initial, map.out);
      // Runtime installation is explicit; the wrapper's backend follows that decision.
      this.backend = backendInstalled() ? 'rust-heightfield' : 'typescript-heightfield';
    }
    this.previous = this.sim.columns().depth.slice(); this.previousVolume = this.sim.volume();
    this.runtimeMs = performance.now() - t0;
  }
  /** Run at most maxTicks; returning to the worker between calls provides cancellation. */
  advance(maxTicks: number): Result {
    if (this.disposed && this.phase !== 'cancelled') throw Error('Sketch disposed');
    if (!Number.isInteger(maxTicks) || maxTicks < 1) throw Error('Positive integer tick budget required');
    const t0 = performance.now();
    while (maxTicks > 0 && (this.phase === 'filling' || this.phase === 'weather')) {
      if (this.phase === 'filling') {
        const n = Math.min(maxTicks, 128 - this.sinceCheck, this.fillTicks - this.sim.ticks);
        this.sim.run(n); this.control.run(n); maxTicks -= n; this.sinceCheck += n;
        if (this.sinceCheck === 128) {
          this.sinceCheck = 0;
          const d = this.sim.columns().depth, volume = this.sim.volume();
          let moved = 0; for (let i = 0; i < d.length; i++) if (Math.abs(d[i] - this.previous[i]) > .005) moved++;
          const settled = Math.abs(volume - this.previousVolume) / Math.max(volume, 1e-9) < .002 &&
            moved <= .005 * this.map.model.W * this.map.model.H;
          this.previous.set(d); this.previousVolume = volume;
          if (settled || this.sim.ticks === this.fillTicks) {
            this.fill = { settled, ticks: this.sim.ticks, capped: !settled };
            this.phase = this.weather ? 'weather' : 'filled';
            if (this.weather) {
              this.reservoirMask = this.impoundedMask();
              this.storedTiles = [...this.reservoirMask.keys()].filter(i => this.reservoirMask![i]);
            }
          }
        }
      } else {
        const f = this.weather!.frames[this.weatherIndex];
        if (f.kind === 'drought' && this.droughtTicks === 0) {
          this.reservoirMask = this.impoundedMask();
          this.storedTiles = [...this.reservoirMask.keys()].filter(i => this.reservoirMask![i]);
          if (!this.hasStoredWater()) this.firstDry = 0;
        }
        this.sim.force(f); this.control.force(f);
        // One tick checks for exhaustion exactly; no inferred evaporation rate or drain estimate.
        this.sim.run(1); this.control.run(1); maxTicks--; this.inFrame++;
        if (f.kind === 'drought') {
          this.droughtTicks++;
          if (this.firstDry === null && !this.hasStoredWater()) this.firstDry = this.droughtTicks - 1;
        }
        if (this.inFrame === f.ticks) {
          this.inFrame = 0; this.weatherIndex++;
          if (this.weatherIndex === this.weather!.frames.length) this.phase = 'complete';
        }
      }
    }
    this.runtimeMs += performance.now() - t0;
    return this.result();
  }
  private impoundedMask(): Uint8Array {
    const water = this.sim.tileWater(), control = this.control.tileWater();
    const mask = new Uint8Array(water.depth.length);
    for (let i = 0; i < mask.length; i++) if (water.depth[i] > 0 &&
      (this.backend === 'typescript-stacked' ? water.surface[i] > control.surface[i] && !this.wallMask[i] : this.storageMask[i])) mask[i] = 1;
    return mask;
  }
  private hasStoredWater(): boolean {
    const { depth, overflow, N } = this.sim.columns();
    for (const i of this.storedTiles) for (let c = i; c < depth.length; c += N) {
      if (depth[c] + (overflow?.[c] ?? 0) > 0) return true;
    }
    return false;
  }
  result(): Result {
    if (this.disposedResult) return this.disposedResult;
    const t0 = performance.now();
    const water = this.sim.tileWater(), control = this.control.tileWater(), N = water.depth.length, W = this.map.model.W;
    const mask = this.reservoirMask ?? this.impoundedMask(), seen = new Uint8Array(N);
    const reservoir: Result['reservoir'] = [], all: number[] = [], newly: number[] = [];
    for (let i = 0; i < N; i++) {
      if (water.depth[i] > 0) all.push(i);
      if (water.depth[i] > 0 && control.depth[i] === 0) newly.push(i);
      if (!mask[i] || seen[i]) continue;
      const tiles = [i]; seen[i] = 1; let volumeM3 = 0, lo = Infinity, hi = -Infinity;
      for (let k = 0; k < tiles.length; k++) {
        const c = tiles[k], x = c % W, y = Math.floor(c / W);
        volumeM3 += water.depth[c];
        if (water.depth[c] > 0) { lo = Math.min(lo, water.surface[c]); hi = Math.max(hi, water.surface[c]); }
        for (const n of [y > 0 ? c - W : -1, x > 0 ? c - 1 : -1,
          y < this.map.model.H - 1 ? c + W : -1, x < W - 1 ? c + 1 : -1]) {
          if (n >= 0 && mask[n] && !seen[n]) { seen[n] = 1; tiles.push(n); }
        }
      }
      reservoir.push({ tiles, volumeM3, surfaceRange: lo < Infinity ? [lo, hi] : null });
    }
    const columns = this.sim.columns();
    const wetAt = (i: number, z: number) => {
      for (let c = i; c < columns.depth.length; c += N) {
        if (columns.floor[c] <= z && z < (columns.ceiling?.[c] ?? 34) &&
          columns.floor[c] + columns.depth[c] > z) return true;
      }
      return false;
    };
    const objects = this.map.objects.map(o => ({ id: o.id, template: o.template,
      tiles: o.tiles.filter(i => wetAt(i, o.z)) })).filter(o => o.tiles.length);
    const drought = this.weather && this.weather.frames.some(f => f.kind === 'drought') ? {
      provenance: this.weather.provenance, coveredDays: (this.firstDry ?? this.droughtTicks) / TICKS_PER_DAY,
      observedDays: this.droughtTicks / TICKS_PER_DAY, exhausted: this.firstDry !== null,
      censored: this.firstDry === null,
      meaning: 'Water remains on the wall-impounded tiles. Hydrological persistence; no colony demand or pump reach inferred.'
    } : null;
    this.runtimeMs += performance.now() - t0;
    return { phase: this.phase, backend: this.backend, fill: { ...this.fill }, ticks: this.sim.ticks, wall: this.wall,
      totalWaterM3: this.sim.volume(), controlWaterM3: this.control.volume(),
      additionalWaterM3: this.sim.volume() - this.control.volume(), reservoir,
      floods: { all, newly, start: this.map.startTiles.filter(i => wetAt(i, this.map.model.floor[i])),
        farmland: this.map.farmland ? all.filter(i => this.map.farmland![i] && wetAt(i, this.map.model.floor[i])) : null, objects },
      conflicts: this.conflicts, drought, runtimeMs: this.runtimeMs };
  }
  cancel(): void { this.phase = 'cancelled'; this.dispose(); }
  dispose(): void {
    if (!this.disposed) {
      this.disposedResult = this.result();
      this.sim.dispose(); this.control.dispose(); this.disposed = true;
    }
  }
}
// Install once per worker, and fail visibly when a requested Rust experiment cannot initialize.
export function install(bytes: BufferSource): void {
  installResident(bytes);
}
export function backendInstalled() { return hasResident(); }
