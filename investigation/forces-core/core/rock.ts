import type { ForceMap,Land } from './map';
/** A bit is volcanic material in voxel z. Layer 22 is always empty. */
export function hardAt(m:Land,tile:number,height:number):boolean{return !!((m.lava?.[tile]??0)&(1<<Math.max(0,height-1)));}
export function trimRock(m:ForceMap){for(let i=0;i<m.lava.length;i++)m.lava[i]&=(1<<m.heights[i])-1;}
export function transportRock(before:ForceMap,after:ForceMap,source:Uint32Array,vertical:boolean){
 for(let j=0;j<source.length;j++){
  const i=source[j],dz=vertical?after.heights[j]-before.heights[i]:0,bits=before.lava[i];
  after.lava[j]=(dz>=0?bits<<dz:bits>>>-dz)&((1<<after.heights[j])-1);
 }trimRock(after);
}
