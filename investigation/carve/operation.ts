import type { CarveMap, Settings } from './engine';
import type { EntitySpec } from '../../src/core/format/entities';
import type { CarveWater } from './water';

function freeze<T>(v:T):T {
  if(v && typeof v==='object' && !Object.isFrozen(v)) {
    for(const child of Object.values(v))freeze(child);
    Object.freeze(v);
  }
  return v;
}
/** JSON-safe exact values. Replay never calls erosion or water simulation. */
export interface CarveOperation {
  op: 'carveResult'; version: 1;
  params: { W: number; H: number; settings: Settings; intent?:{origin:number;end?:number}; steps: number; reason: string; reroll?:boolean;
    terrain: [tile: number, before: number, after: number][];
    entitiesBefore: EntitySpec[]; entitiesAfter: EntitySpec[];
    waterBefore: { depth: number[]; contamination: number[] };
    waterAfter: { depth: number[]; contamination: number[] };
    settled: boolean; settleTicks: number; waterSolve?:{method:'canonical'|'retained-oxbow';preClosure?:{settled:boolean;ticks:number}};
  };
}
export function operation(before: CarveMap, after: CarveMap, settings: Settings, steps: number, reason: string, water: CarveWater): CarveOperation {
  const terrain: [number, number, number][] = [];
  for (let i = 0; i < before.heights.length; i++) if (before.heights[i] !== after.heights[i]) terrain.push([i, before.heights[i], after.heights[i]]);
  return { op: 'carveResult', version: 1, params: { W: before.W, H: before.H, settings: { ...settings }, steps, reason, terrain,
    entitiesBefore: freeze(structuredClone(before.entities)), entitiesAfter: freeze(structuredClone(after.entities)),
    waterBefore: { depth: Array.from(before.water.depth), contamination: Array.from(before.water.contamination) },
    waterAfter: { depth: Array.from(water.depth), contamination: Array.from(water.contamination) },
    settled: water.settled, settleTicks: water.ticks, waterSolve:{method:water.method??'canonical',...(water.preClosure?{preClosure:water.preClosure}:{})} } };
}
export function applyOperation(map: CarveMap, op: CarveOperation, undo = false): CarveMap {
  const p = op.params;
  if (op.op !== 'carveResult' || op.version !== 1 || p.W !== map.W || p.H !== map.H) throw new Error('Operation does not fit this map');
  if(!Array.isArray(p.terrain)||!Number.isInteger(p.steps)||p.steps<0)throw new Error('Invalid operation');
  const h = map.heights.slice(), expected = undo ? 2 : 1, desired = undo ? 1 : 2;
  let previous=-1;
  for (const row of p.terrain) {
    const i = row[0];if(i<=previous)throw new Error('Unsorted or duplicate tile');previous=i;
    if (!Number.isInteger(i) || i < 0 || i >= h.length || h[i] !== row[expected] || !Number.isInteger(row[desired]) || row[desired] < 0 || row[desired] > map.maxHeight) throw new Error('Stale or invalid terrain operation');
    h[i] = row[desired];
  }
  const w = undo ? p.waterBefore : p.waterAfter;
  if (w.depth.length !== h.length || w.contamination.length !== h.length) throw new Error('Invalid water snapshot');
  if(!w.depth.every(v=>Number.isFinite(v)&&v>=0)||!w.contamination.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new Error('Invalid water values');
  return { ...map, heights: h, entities: freeze(undo ? p.entitiesBefore : p.entitiesAfter).slice(),
    water: { depth: Float64Array.from(w.depth), contamination: Float64Array.from(w.contamination) } };
}
