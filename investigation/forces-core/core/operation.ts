import { json,snapshot,validateMap,type ForceMap } from './map';
import type { ForceRequest } from '../verbs';
type Change=[number,number,number];
export interface ForceOperation {
 op:'forceResult';params:{
  version:1;model:'forces-core/1';id:string;request:ForceRequest;W:number;H:number;maxHeight:number;
  before:string;after:string;replaces?:string;steps:number;settled:boolean;ticks:number;
  terrain:Change[];rock:Change[];water:Change[];contamination:Change[];
  entities:[ForceMap['entities'],ForceMap['entities']];fallen:[ForceMap['fallen'],ForceMap['fallen']];
  layers:[number[],number[]];
 };
}
export function signature(m:ForceMap):string {
 let a=2166136261,b=0x9e3779b9;
 const byte=(v:number)=>{a=Math.imul(a^v,16777619);b=Math.imul(b+v,0x85ebca6b)^(b>>>13);};
 for(const arr of [m.heights,m.lava,m.water.depth,m.water.contamination])for(const v of new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength))byte(v);
 for(const c of JSON.stringify([m.W,m.H,m.maxHeight,m.entities,m.fallen,m.rockLayers])){const n=c.charCodeAt(0);byte(n&255);byte(n>>>8);}
 return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function changes(a:ArrayLike<number>,b:ArrayLike<number>):Change[]{const out:Change[]=[];for(let i=0;i<a.length;i++)if(a[i]!==b[i])out.push([i,a[i],b[i]]);return out;}
export function operation(before:ForceMap,after:ForceMap,request:ForceRequest,steps:number,water:{settled:boolean;ticks:number},replaces?:string):ForceOperation {
 validateMap(before);validateMap(after);
 const b=signature(before),a=signature(after);
 return {op:'forceResult',params:{version:1,model:'forces-core/1',id:b+':'+a+':'+request.verb,request:json(request),W:before.W,H:before.H,maxHeight:before.maxHeight,
 before:b,after:a,...(replaces?{replaces}:{}),steps,settled:water.settled,ticks:water.ticks,
 terrain:changes(before.heights,after.heights),rock:changes(before.lava,after.lava),water:changes(before.water.depth,after.water.depth),
 contamination:changes(before.water.contamination,after.water.contamination),entities:[json(before.entities),json(after.entities)],
 fallen:[json(before.fallen),json(after.fallen)],layers:[before.rockLayers.slice(),after.rockLayers.slice()]}};
}
export function applyOperation(m:ForceMap,op:ForceOperation,reverse=false):ForceMap {
 const p=op?.params;
 if(op?.op!=='forceResult'||p?.version!==1||p.W!==m.W||p.H!==m.H||p.maxHeight!==m.maxHeight||
 !['carve','craterize','erupt','quake'].includes(p.request?.verb)||!Number.isInteger(p.steps)||p.steps<0||
 !Number.isInteger(p.ticks)||p.ticks<0||typeof p.settled!=='boolean')throw Error('Invalid force operation');
 if(p.id!==p.before+':'+p.after+':'+p.request.verb||(p.replaces!==undefined&&typeof p.replaces!=='string'))throw Error('Invalid force identity');
 if(signature(m)!==(reverse?p.after:p.before))throw Error('Force conflicts with this land');
 const out=snapshot(m),n=m.W*m.H,side=reverse?1:2;
 const apply=(array:Uint8Array|Uint32Array|Float64Array,list:Change[],max:number,integer=false)=>{
  if(!Array.isArray(list)||list.length>n)throw Error('Invalid force changes');
  let previous=-1;
  for(const c of list){
   if(!Array.isArray(c)||c.length!==3||!Number.isInteger(c[0])||c[0]<=previous||c[0]>=n||
   !c.slice(1).every(v=>Number.isFinite(v)&&v>=0&&v<=max&&(!integer||Number.isInteger(v)))||
   array[c[0]]!==c[reverse?2:1])throw Error('Invalid force change');
   previous=c[0];array[c[0]]=c[side];
  }
 };
 apply(out.heights,p.terrain,m.maxHeight,true);apply(out.lava,p.rock,2**22-1,true);
 apply(out.water.depth,p.water,Number.MAX_VALUE);apply(out.water.contamination,p.contamination,1);
 const index=reverse?0:1;
 if(![p.entities,p.fallen,p.layers].every(a=>Array.isArray(a)&&a.length===2))throw Error('Invalid force objects');
 out.entities=structuredClone(p.entities[index]);out.fallen=structuredClone(p.fallen[index]);out.rockLayers=p.layers[index].slice();
 validateMap(out);
 if(signature(out)!==(reverse?p.before:p.after))throw Error('Force result checksum differs');
 return out;
}
