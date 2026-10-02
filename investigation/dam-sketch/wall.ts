import type { WaterModel } from '../../src/core/sim/water';
export type Piece = { kind: 'levee' } | { kind: 'dam' } |
  { kind: 'floodgate'; maxHeight: 1 | 2 | 3; height: number };
export interface Stroke { path: readonly (readonly [number, number])[]; stack: readonly Piece[] }
export interface PlacedPiece { tile: number; x: number; y: number; z: number; piece: Piece }
export interface Wall {
  model: WaterModel; pieces: PlacedPiece[]; tiles: number[]; stacked: boolean;
  counts: { dam: number; levee: number; floodgate1: number; floodgate2: number; floodgate3: number };
}
export function physicalHeight(p: Piece): number { return p.kind === 'floodgate' ? p.maxHeight + 2 : 1; }
export function barrierHeight(p: Piece): number {
  return p.kind === 'levee' ? 1 : p.kind === 'dam' ? .65 : p.height;
}
// Grid stroke, four-connected. A corner tie advances x, then y; no hidden diagonal leak.
// This raster is the exact set of drawn tiles, returned to the caller for displaying the wall.
export function raster(path: Stroke['path'], W: number, H: number): number[] {
  if (!path.length) throw Error('A stroke needs at least one point');
  for (const [x, y] of path) if (!Number.isInteger(x) || !Number.isInteger(y) ||
    x < 0 || y < 0 || x >= W || y >= H) throw Error('Stroke point outside the tile grid');
  const tiles = new Set<number>();
  let [x, y] = path[0]; tiles.add(y * W + x);
  for (const [tx, ty] of path.slice(1)) {
    const dx = Math.abs(tx - x), dy = Math.abs(ty - y), sx = Math.sign(tx - x), sy = Math.sign(ty - y);
    let ix = 0, iy = 0;
    while (ix < dx || iy < dy) {
      if (ix < dx && (iy === dy || (2 * ix + 1) * dy <= (2 * iy + 1) * dx)) { x += sx; ix++; }
      else { y += sy; iy++; }
      tiles.add(y * W + x);
    }
  }
  return [...tiles];
}
export function compileWall(base: WaterModel, strokes: readonly Stroke[]): Wall {
  const model: WaterModel = { ...base, floor: base.floor.slice(),
    dam: base.dam?.slice() ?? new Float64Array(base.W * base.H).fill(-1),
    emitters: base.emitters.map(e => ({ ...e, cells: [...e.cells], depthLimit: e.depthLimit && { ...e.depthLimit } })) };
  const pieces: PlacedPiece[] = [], at = new Map<number, string>();
  const counts = { dam: 0, levee: 0, floodgate1: 0, floodgate2: 0, floodgate3: 0 };
  let stacked = false;
  for (const s of strokes) {
    if (!s.stack.length) throw Error('Explicit pieces required; no inferred supports');
    for (const p of s.stack) {
      if (!['dam', 'levee', 'floodgate'].includes(p.kind)) throw Error('Unknown piece');
      if (p.kind === 'floodgate' && (![1, 2, 3].includes(p.maxHeight) || !Number.isFinite(p.height) ||
        p.height < 0 || p.height > p.maxHeight)) throw Error('Floodgate height outside its game range');
    }
    if (s.stack.slice(0, -1).some(p => p.kind === 'floodgate')) throw Error('Floodgates are not stackable');
    for (const i of raster(s.path, base.W, base.H)) {
      const key = JSON.stringify(s.stack), previous = at.get(i);
      if (previous !== undefined) {
        if (previous !== key) throw Error('Conflicting stacks at a stroke intersection');
        continue;
      }
      if (!Number.isInteger(base.floor[i]) || (base.dam && base.dam[i] >= 0)) {
        throw Error('Wall needs an explicit free foundation; existing partial obstacle at wall tile');
      }
      if (base.emitters.some(e => e.cells.includes(i))) throw Error('Wall intersects a water emitter');
      at.set(i, key);
      let z = base.floor[i];
      for (const [k, p] of s.stack.entries()) {
        const ph = physicalHeight(p);
        if (z + ph > 34) throw Error('Piece exceeds game water height 34');
        pieces.push({ tile: i, x: i % base.W, y: Math.floor(i / base.W), z, piece: { ...p } });
        if (p.kind === 'floodgate') counts[('floodgate' + p.maxHeight) as 'floodgate1']++;
        else counts[p.kind]++;
        if (p.kind === 'dam' && k !== s.stack.length - 1) stacked = true;
        const barrier = barrierHeight(p), full = Math.floor(barrier);
        model.floor[i] = z + full;
        model.dam![i] = barrier % 1 > 0 ? barrier % 1 : -1;
        z += ph;
      }
    }
  }
  return { model, pieces, tiles: [...at.keys()], stacked, counts };
}
