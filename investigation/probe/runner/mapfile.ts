// What a .timber file holds, read with the project's own format code: terrain, stored water and soil,
// entities and the start. The probe's expected values come from here.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isObject, num, type JsonObject } from '../../../src/core/format/json';
import { readTimber, type TimberFile } from '../../../src/core/format/timber';
import { storedSoil, storedWater, surfaceOf } from '../../../src/core/format/world';

export interface FileEntity {
  id: string;
  template: string;
  x: number;
  y: number;
  z: number;
  orientation: string;
  components: JsonObject;
}

export interface MapInfo {
  path: string;
  sha256: string;
  file: TimberFile;
  W: number;
  H: number;
  /** Surface height per tile (first air level of the top solid voxel run). */
  heights: Uint8Array;
  maxHeight: number;
  /** The top wet column per tile: depth, contamination, floor (-1 without water). */
  depth: Float32Array;
  contamination: Float32Array;
  floor: Float32Array;
  moisture: Float32Array;
  soilContamination: Float32Array;
  entities: FileEntity[];
  start: FileEntity | null;
  /** Tiles with more than one wet column (water under roofs). */
  layeredWet: number;
}

export function entitiesOf(file: TimberFile): FileEntity[] {
  return file.world.entities.map((e) => {
    const c = (isObject(e.Components) ? e.Components : {}) as JsonObject;
    const bo = isObject(c.BlockObject) ? (c.BlockObject as JsonObject) : {};
    const co = isObject(bo.Coordinates) ? (bo.Coordinates as JsonObject) : {};
    return {
      id: String(e.Id),
      template: String(e.Template),
      x: num(co.X),
      y: num(co.Y),
      z: num(co.Z),
      orientation: typeof bo.Orientation === 'string' ? bo.Orientation : 'Cw0',
      components: c,
    };
  });
}

export function readMap(path: string): MapInfo {
  return readMapBytes(new Uint8Array(readFileSync(path)), path);
}

export function readMapBytes(bytes: Uint8Array, path = ''): MapInfo {
  const file = readTimber(bytes);
  const w = file.world;
  const W = w.sizeX, H = w.sizeY, N = W * H;
  const heights = surfaceOf(w);
  const depth = new Float32Array(N), contamination = new Float32Array(N), floor = new Float32Array(N).fill(-1);
  const water = storedWater(w.singletons, W, H);
  const wetColumns = new Uint8Array(N);
  for (let k = 0; k < water.tile.length; k++) {
    const t = water.tile[k];
    wetColumns[t]++;
    // the top wet column is the one seen from above (the highest floor)
    if (floor[t] < 0 || water.floor[k] >= floor[t]) {
      floor[t] = water.floor[k];
      depth[t] = water.depth[k];
      contamination[t] = water.contamination[k];
    }
  }
  const soil = storedSoil(w.singletons, W, H, () => 0);
  const entities = entitiesOf(file);
  let maxHeight = 0;
  for (let i = 0; i < N; i++) maxHeight = Math.max(maxHeight, heights[i]);
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    file,
    W,
    H,
    heights,
    maxHeight,
    depth,
    contamination,
    floor,
    moisture: soil.moisture,
    soilContamination: soil.contamination,
    entities,
    start: entities.find((e) => e.template === 'StartingLocation') ?? null,
    layeredWet: [...wetColumns].filter((n) => n > 1).length,
  };
}

/**
 * The water's momentum the file stores (`WaterMapNew.ColumnOutflows`, FORMAT.md §4.3), which the game
 * loads with the water: four values per tile in the file's order Bottom, Left, Top, Right (y − 1,
 * x − 1, y + 1, x + 1), the cycle model's order too. Only for a plain heightfield (one water level),
 * the only map the model plays; null otherwise, or when the array does not fit the map. A part whose
 * target is not that neighbour in the game's padded grid is left at 0 (`skipped` counts them).
 */
export function storedOutflows(file: TimberFile): { out: Float64Array; flowing: number; skipped: number } | null {
  const w = file.world;
  const W = w.sizeX, H = w.sizeY, N = W * H;
  const wm = w.singletons.WaterMapNew;
  if (!isObject(wm) || !isObject(wm.ColumnOutflows) || ('Levels' in wm && num(wm.Levels) !== 1)) return null;
  const tokens = String(wm.ColumnOutflows.Array).split(' ');
  if (tokens.length !== N) return null;
  const out = new Float64Array(4 * N);
  const stride = W + 2;
  let flowing = 0, skipped = 0;
  for (let i = 0; i < N; i++) {
    if (tokens[i] === '0') continue;
    const x = i % W, y = (i - x) / W;
    const targets = [y * stride + x + 1, (y + 1) * stride + x, (y + 2) * stride + x + 1, (y + 1) * stride + x + 2];
    tokens[i].split(':').slice(0, 4).forEach((part, k) => {
      if (part === '0') return;
      const [target, flow] = part.split('|');
      const f = Number(flow);
      if (Number(target) !== targets[k] || !(f > 0)) {
        skipped++;
        return;
      }
      out[4 * i + k] = f;
      flowing++;
    });
  }
  return { out, flowing, skipped };
}

/** Connected wet areas (4-neighbour, depth > min), largest first. */
export function wetAreas(m: Pick<MapInfo, 'W' | 'H' | 'depth'>, min = 0.05): { tiles: number[]; volume: number; cx: number; cy: number; deepest: number }[] {
  const { W, H, depth } = m;
  const seen = new Uint8Array(W * H);
  const out: { tiles: number[]; volume: number; cx: number; cy: number; deepest: number }[] = [];
  for (let s = 0; s < W * H; s++) {
    if (seen[s] || !(depth[s] > min)) continue;
    const tiles: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const t = stack.pop()!;
      tiles.push(t);
      const x = t % W, y = (t / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!seen[n] && depth[n] > min) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    let volume = 0, sx = 0, sy = 0, deepest = tiles[0];
    for (const t of tiles) {
      volume += depth[t];
      sx += t % W;
      sy += (t / W) | 0;
      if (depth[t] > depth[deepest]) deepest = t;
    }
    out.push({ tiles, volume, cx: sx / tiles.length, cy: sy / tiles.length, deepest });
  }
  return out.sort((a, b) => b.volume - a.volume);
}

export const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
