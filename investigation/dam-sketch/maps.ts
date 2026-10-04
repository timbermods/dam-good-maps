import { readTimber } from '../../src/core/format/timber';
import { normalizeImport } from '../../src/core/format/normalize';
import { floorsOf, surfaceOf, type WorldModel } from '../../src/core/format/world';
import { mapObjects, waterModelFromWorld } from '../../src/core/sim/model';
import { FOOTPRINTS, worldBlocks } from '../../src/core/format/footprints';
import { isObject, num } from '../../src/core/format/json';
import type { MapSnapshot } from './engine';
import { waterColumns, slotAt } from '../terrain3d/proto/columns';
import type { StackEmitter } from '../terrain3d/proto/stackwater';

/** Read an actual generated/imported map. No source/weather/population/farmland inferred. */
export function fromWorld(world: WorldModel, name: string, farmland?: Uint8Array): MapSnapshot {
  const placements = mapObjects(world);
  let useStacked = floorsOf(world).some(n => n > 1) ||
    placements.some(o => /NaturalOverhang|BadtideDrain/.test(o.template));
  const model = waterModelFromWorld(world, surfaceOf(world)), N = model.W * model.H;
  const depth = new Float64Array(N), contamination = new Float64Array(N);
  const water = world.singletons.WaterMapNew;
  if (!isObject(water) || !isObject(water.WaterColumns)) throw Error('Map requires explicit initial water');
  const levels = num(water.Levels ?? 1), cols = waterColumns(model.W, model.H, world.voxels, placements, world.layers);
  const columnDepth = new Float64Array(cols.L * N), columnContamination = new Float64Array(cols.L * N),
    overflow = new Float64Array(cols.L * N);
  const tokens = String(water.WaterColumns.Array).split(' ');
  if (!Number.isInteger(levels) || levels < 1 || tokens.length !== levels * N) throw Error('Stored water length disagrees with map');
  const out = new Float64Array(4 * N), momentum: NonNullable<MapSnapshot['stacked']>['momentum'] = [];
  if (isObject(water.ColumnOutflows)) {
    const flowTokens = String(water.ColumnOutflows.Array).split(' '), PX = model.W + 2, PP = PX * (model.H + 2);
    if (flowTokens.length !== levels * N) throw Error('Stored momentum length disagrees with map');
    for (let c = 0; c < flowTokens.length; c++) if (flowTokens[c] !== '0') {
      const parts = flowTokens[c].split(':');
      for (const [k, part] of parts.entries()) if (part !== '0') {
        const pair = part.split('|').map(Number), [index, flow] = pair;
        if (pair.length !== 2 || !Number.isInteger(index) || index < 0 || !Number.isFinite(flow) || flow < 0) throw Error('Invalid stored momentum');
        const slot = Math.floor(index / PP), rest = index % PP, x = rest % PX - 1, y = Math.floor(rest / PX) - 1;
        const inside = x >= 0 && x < model.W && y >= 0 && y < model.H, tile = inside ? y * model.W + x : -1;
        momentum.push({ from: c, toTile: tile, toSlot: slot, flow });
        if (c < N && k < 4 && slot === 0) out[4 * c + k] = flow;
        else useStacked = true;
      }
    }
  }
  for (let c = 0; c < tokens.length; c++) if (tokens[c] !== '0') {
    const i = c % N, parts = tokens[c].split(':').map(Number);
    if (c >= columnDepth.length || Math.floor(c / N) >= cols.count[i] || parts.length < 5 ||
      !parts.every(Number.isFinite) || parts[0] < 0 || parts[1] < 0 || parts[1] > 1 || parts[2] < 0 ||
      parts[3] !== cols.floor[c] || parts[0] > cols.ceil[c] - cols.floor[c]) throw Error('Stored water column disagrees with topology');
    columnDepth[c] = parts[0]; columnContamination[c] = parts[1]; overflow[c] = parts[2];
    useStacked ||= parts[2] > 0 || cols.L > 1;
    depth[i] += parts[0] + parts[2]; contamination[i] += (parts[0] + parts[2]) * parts[1];
  }
  for (let i = 0; i < N; i++) if (depth[i] > 0) contamination[i] /= depth[i];
  const objects: MapSnapshot['objects'][number][] = [], startTiles: number[] = [];
  for (const [k, p] of placements.entries()) {
    const fp = FOOTPRINTS[p.template]; if (!fp) throw Error('Unknown footprint ' + p.template);
    const tiles = [...new Set(worldBlocks(fp, p).filter(b => b.x >= 0 && b.x < model.W && b.y >= 0 && b.y < model.H)
      .map(b => b.y * model.W + b.x))];
    if (p.template === 'StartingLocation') startTiles.push(...tiles);
    objects.push({ id: String(world.entities[k]?.Id ?? k), template: p.template, tiles,
      z: p.z, height: fp.size[2] });
  }
  const map: MapSnapshot = { name, model, water: { depth, contamination }, out, farmland, startTiles, objects };
  if (useStacked) {
    // waterModel's source order is map object order, so weather forcing keeps the same indices.
    const sources = placements.filter(o => ['WaterSource', 'BadwaterSource', 'WaterSeep',
      'BadwaterSeep', 'Aquifer', 'BadtideDrain'].includes(o.template));
    const emitters: StackEmitter[] = model.emitters.map((e, k) => {
      const source = sources[k], ec = e.cells.map(i => {
        const slot = slotAt(cols, i, source.z);
        if (slot < 0) throw Error('Source has no water column'); return slot * N + i;
      });
      return { cols: ec, tiles: [...e.cells], strength: e.strength, contamination: e.contamination,
        depthLimit: e.depthLimit && { ...e.depthLimit, anchor: ec[0] } };
    });
    map.stacked = { voxels: world.voxels, layers: world.layers, placements, cols, emitters,
      depth: columnDepth, contamination: columnContamination, overflow, momentum };
  }
  return map;
}
export function fromTimber(bytes: Uint8Array, name: string, farmland?: Uint8Array) {
  const file = readTimber(bytes); normalizeImport(file);
  return fromWorld(file.world, name, farmland);
}
