import { JsonFloat } from '../../../src/core/format/json';
import type { EntitySpec } from '../../../src/core/format/entities';
import { waterModel } from '../../../src/core/sim/model';
import type { WaterState } from '../../../src/core/sim/water';
import { geology } from './random';
export interface Fallen {id:string;x:number;y:number;z:number;dx:number;dy:number;length:number}
export interface Land {
 name:string;W:number;H:number;heights:Uint8Array;entities:EntitySpec[];water:WaterState;maxHeight:number;
 rockLayers?:number[];fallen?:Fallen[];lava?:Uint32Array;
}
export interface ForceMap extends Land {rockLayers:number[];fallen:Fallen[];lava:Uint32Array}
export const plainEntities=(e:EntitySpec[]):EntitySpec[]=>JSON.parse(JSON.stringify(e,(_k,v)=>v instanceof JsonFloat?v.value:v));
export const objects=(e:EntitySpec[])=>e.map(e=>({...e,components:{...e.before,...e.components}}));
export const modelFor=(m:Land)=>waterModel(m.W,m.H,m.heights,objects(m.entities));
export function snapshot<T extends Land>(m:T):T {
 return {...m,heights:m.heights.slice(),entities:plainEntities(m.entities),
  ...(m.rockLayers?{rockLayers:m.rockLayers.slice()}:{}),...(m.fallen?{fallen:structuredClone(m.fallen)}:{}),
  ...(m.lava?{lava:m.lava.slice()}:{}),
  water:{depth:m.water.depth.slice(),contamination:m.water.contamination.slice()}};
}
export function normalize(m:Land):ForceMap {
 const r=snapshot(m);return {...r,rockLayers:r.rockLayers??geology(r.heights),fallen:r.fallen??[],lava:r.lava??new Uint32Array(r.W*r.H)};
}
export function validateMap(m:Land):void {
 const n=m?.W*m?.H;
 if(!Number.isInteger(m?.W)||!Number.isInteger(m?.H)||m.W<4||m.H<4||m.W>256||m.H>256||
 ![16,22].includes(m.maxHeight)||m.heights?.length!==n||!m.heights.every(v=>Number.isInteger(v)&&v>=0&&v<=m.maxHeight)||
 m.water?.depth?.length!==n||m.water?.contamination?.length!==n||
 !m.water.depth.every(v=>Number.isFinite(v)&&v>=0)||!m.water.contamination.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||
 !Array.isArray(m.entities))throw Error('Invalid land');
 if(m.rockLayers&&(m.rockLayers.length!==23||!m.rockLayers.every(v=>Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid rock layers');
 if(m.lava&&(m.lava.length!==n||!m.lava.every((v,i)=>Number.isInteger(v)&&v>=0&&v<2**22&&(v>>>m.heights[i])===0)))throw Error('Invalid volcanic rock');
 const ids=new Set<string>();
 for(const e of m.entities){
  if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.template!=='string'||typeof e.owner!=='string'||
  !Number.isInteger(e.x)||!Number.isInteger(e.y)||!Number.isInteger(e.z)||e.x<0||e.y<0||e.x>=m.W||e.y>=m.H||e.z<0||e.z>22||
  !['Cw0','Cw90','Cw180','Cw270'].includes(e.orientation)||typeof e.flipped!=='boolean'||!e.components||typeof e.components!=='object')throw Error('Invalid object');
  ids.add(e.id);
 }
 if(m.fallen)for(const f of m.fallen)if(!ids.has(f.id)||![f.x,f.y,f.z,f.dx,f.dy,f.length].every(Number.isFinite)||f.x<0||f.y<0||f.x>=m.W||f.y>=m.H||f.length<=0||f.length>10)throw Error('Invalid fallen object');
}
export function storedMap(raw:any):ForceMap {
 // Validate before narrowing numbers into typed arrays.
 validateMap(raw);
 return normalize({...raw,heights:Uint8Array.from(raw.heights),lava:raw.lava?Uint32Array.from(raw.lava):undefined,
 water:{depth:Float64Array.from(raw.water.depth),contamination:Float64Array.from(raw.water.contamination)}});
}
export const json=(v:unknown):any=>JSON.parse(JSON.stringify(v,(_k,x)=>ArrayBuffer.isView(x)?Array.from(x as unknown as number[]):x));
