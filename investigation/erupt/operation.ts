import { snapshot, type EruptMap, type Settings, type Intent, type Fallen } from './engine';
import type { EntitySpec } from '../../src/core/format/entities';
export interface EruptOperation {
  op:'eruptResult'|'carveStudyResult';version:1;params:{
    W:number;H:number;settings:Settings;intent:Intent;terrain:[number,number,number][];
    entitiesBefore:EntitySpec[];entitiesAfter:EntitySpec[];fallenBefore:Fallen[];fallenAfter:Fallen[];
    waterBefore:{depth:number[];contamination:number[]};waterAfter:{depth:number[];contamination:number[]};
    settled:boolean;settleTicks:number;reroll:boolean;lava:[number,number,number][];
  };
}
export function operation(before:EruptMap,after:EruptMap,settings:Settings,intent:Intent,result:{settled:boolean;ticks:number},reroll=false):EruptOperation {
  const terrain:[number,number,number][]=[];
  before.heights.forEach((h,i)=>{if(h!==after.heights[i])terrain.push([i,h,after.heights[i]]);});
  const water=(m:EruptMap)=>({depth:Array.from(m.water.depth),contamination:Array.from(m.water.contamination)});
  return {op:'eruptResult',version:1,params:{W:before.W,H:before.H,settings:{...settings},intent:{...intent},terrain,
    entitiesBefore:structuredClone(before.entities),entitiesAfter:structuredClone(after.entities),fallenBefore:structuredClone(before.fallen),fallenAfter:structuredClone(after.fallen),
    waterBefore:water(before),waterAfter:water(after),settled:result.settled,settleTicks:result.ticks,reroll,
    lava:Array.from(before.lava).flatMap((v,i)=>v===after.lava[i]?[]:[[i,v,after.lava[i]] as [number,number,number]])}};
}
/** Assign saved results; never re-run crater or water code on undo/redo/replay. */
export function applyOperation(map:EruptMap,op:EruptOperation,undo=false):EruptMap {
  const p=op.params;if(!['eruptResult','carveStudyResult'].includes(op.op)||op.version!==1||p.W!==map.W||p.H!==map.H)throw Error('Operation does not fit this map');
  const expected=undo?2:1,desired=undo?1:2;
  const water=undo?p.waterBefore:p.waterAfter,entities=undo?p.entitiesBefore:p.entitiesAfter,fallen=undo?p.fallenBefore:p.fallenAfter;
  if(!Array.isArray(p.terrain)||!Array.isArray(entities)||!Array.isArray(fallen))throw Error('Invalid result');
  let previous=-1;
  for(const row of p.terrain){const i=row[0];if(!Number.isInteger(i)||i<=previous||i>=map.heights.length||
    row[expected]!==map.heights[i]||!Number.isInteger(row[desired])||row[desired]<0||row[desired]>Math.min(22,map.maxHeight))throw Error('Stale or invalid terrain result');previous=i;}
  if(water.depth.length!==map.heights.length||water.contamination.length!==map.heights.length||
    !water.depth.every(v=>Number.isFinite(v)&&v>=0)||!water.contamination.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid water result');
  const expectedEntities=undo?p.entitiesAfter:p.entitiesBefore,expectedFallen=undo?p.fallenAfter:p.fallenBefore,expectedWater=undo?p.waterAfter:p.waterBefore;
  if(JSON.stringify(map.entities)!==JSON.stringify(expectedEntities)||JSON.stringify(map.fallen)!==JSON.stringify(expectedFallen)||
    map.water.depth.some((v,i)=>v!==expectedWater.depth[i])||map.water.contamination.some((v,i)=>v!==expectedWater.contamination[i]))throw Error('Stale map result');
  previous=-1;
  if(!Array.isArray(p.lava))throw Error('Missing lava history');
  for(const row of p.lava){const i=row[0];if(!Number.isInteger(i)||i<=previous||i>=map.lava.length||map.lava[i]!==row[expected]||!Number.isInteger(row[desired])||row[desired]<0||row[desired]>=1<<22)throw Error('Stale or invalid lava result');previous=i;}
  const out=snapshot(map);for(const row of p.terrain)out.heights[row[0]]=row[desired];for(const row of p.lava)out.lava[row[0]]=row[desired];
  out.entities=structuredClone(entities);out.fallen=structuredClone(fallen);
  out.water={depth:Float64Array.from(water.depth),contamination:Float64Array.from(water.contamination)};return out;
}
