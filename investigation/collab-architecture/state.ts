// Investigation only. Materialized core data, never a replay on different ground.
import type { MapSession } from '../../src/core/doc/session';
import type { EntitySpec } from '../../src/core/format/entities';
import { entityTiles } from '../../src/core/forces/force';
import { JsonFloat } from '../../src/core/format/json';
import { geology } from '../../src/core/forces/random';
import type { RetainedWater } from '../../src/core/sim/water';
export type Player = 'host' | 'guest';
export type State = { W: number; H: number; heights: Uint8Array; lava: Uint32Array;
  columns: [number, number[]][]; entities: EntitySpec[]; fallen: any[]; rockLayers:number[];
  retained:{id:string;water:RetainedWater}[];
  water: Float64Array; contamination: Float64Array; moisture: Float64Array; soilContamination: Float64Array };
export function fromSession(s: MapSession): State {
  const b = s.built;
  return { W: b.W, H: b.H, heights: b.heights.slice(), lava: new Uint32Array(b.W*b.H),
    columns: [...s.columns].map(([i,c])=>[i,[...c]]), entities: plain(b.entities), fallen: [],rockLayers:geology(s.openedHeights),
    retained:(b.waterModel.retained??[]).map((water,k)=>({id:`base-lake-${k}`,water:clone(water)})),
    water: b.water.slice(), contamination: b.contamination.slice(), moisture: b.moisture.slice(), soilContamination: b.soilContamination.slice() };
}
export function clone<T>(x:T): T { return structuredClone(x); }
// JsonFloat objects must be normalized before cloning: otherwise their prototype is lost.
export const plain = (x: unknown): any => JSON.parse(JSON.stringify(x, (_k,v)=>v instanceof JsonFloat ? v.value : v));
export function stable(x: any): string {
  const sort = (v:any):any => ArrayBuffer.isView(v) ? Array.from(v as any) : Array.isArray(v) ? v.map(sort) :
    v && typeof v==='object' ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])) : v;
  return JSON.stringify(sort(plain(x)));
}
export class Mask {
  words: Uint32Array;
  constructor(readonly N: number, full=false) { this.words=new Uint32Array(Math.ceil(N/32)); if(full) for(let i=0;i<N;i++) this.add(i); }
  add(i:number) { if(!Number.isInteger(i)||i<0||i>=this.N) throw Error('tile outside map'); this.words[i>>>5] |= 1<<(i&31); return this; }
  has(i:number) { return !!(this.words[i>>>5] & (1<<(i&31))); }
  union(m:Mask) { for(let i=0;i<this.words.length;i++)this.words[i]|=m.words[i]; return this; }
  intersects(m:Mask) { for(let i=0;i<this.words.length;i++)if(this.words[i]&m.words[i])return true; return false; }
  tiles() { const out:number[]=[]; for(let i=0;i<this.N;i++)if(this.has(i))out.push(i); return out; }
}
export type Patch = { ground: [number, number, number, number, number][];
  objects: [string, EntitySpec|null, EntitySpec|null][];
  fallen: [string, any|null, any|null][]; retained:[string,any|null,any|null][] };
export function difference(a:State,b:State): { patch:Patch; writes:Mask; keys:Set<string> } {
  const writes=new Mask(a.W*a.H), keys=new Set<string>();
  const ground:Patch['ground']=[];
  for(let i=0;i<a.heights.length;i++)if(a.heights[i]!==b.heights[i]||a.lava[i]!==b.lava[i]) {
    ground.push([i,a.heights[i],b.heights[i],a.lava[i],b.lava[i]]);writes.add(i);
  }
  const pairs = (before:any[],after:any[],objects:boolean):any[] => {
    if(before===after)return [];
    const aa=new Map(before.map(e=>[e.id,e])),bb=new Map(after.map(e=>[e.id,e])),out:any[]=[];
    for(const id of new Set([...aa.keys(),...bb.keys()])) {
      const x=aa.get(id)??null,y=bb.get(id)??null;
      if(stable(x)===stable(y))continue;
      out.push([id,clone(x),clone(y)]);keys.add('entity:'+id);
      if(objects) { for(const e of [x,y])if(e)for(const i of entityTiles(a.W,a.H,e))writes.add(i); }
      else if(x||y) { const e=x??y; writes.add(Math.floor(e.y)*a.W+Math.floor(e.x)); }
    }
    return out;
  };
  const retained:any[]=[],aa=new Map(a.retained.map(r=>[r.id,r])),bb=new Map(b.retained.map(r=>[r.id,r]));
  for(const id of new Set([...aa.keys(),...bb.keys()])) { const x=aa.get(id)??null,y=bb.get(id)??null;if(stable(x)===stable(y))continue;
    retained.push([id,clone(x),clone(y)]);keys.add('lake:'+id);for(const r of [x,y])if(r)for(const i of r.water.tiles)writes.add(i);
  }
  return {patch:{ground,objects:pairs(a.entities,b.entities,true),fallen:pairs(a.fallen,b.fallen,false),retained},writes,keys};
}
export function put(s:State,p:Patch,inverse=false) {
  for(const [i,b,a,lb,la] of p.ground){s.heights[i]=inverse?b:a;s.lava[i]=inverse?lb:la;}
  const objects=(list:any[],changes:any[])=>{
    const byId=new Map(list.map(e=>[e.id,e]));
    for(const [id,b,a] of changes){const v=inverse?b:a;if(v===null)byId.delete(id);else byId.set(id,clone(v));}
    return [...byId.values()];
  };
  s.entities=objects(s.entities,p.objects);s.fallen=objects(s.fallen,p.fallen);s.retained=objects(s.retained,p.retained);
}
export function tileValue(s:State,i:number) {
  return stable([s.heights[i],s.lava[i],s.columns.find(c=>c[0]===i),s.water[i],s.contamination[i],s.moisture[i],s.soilContamination[i],
    s.entities.filter(e=>entityTiles(s.W,s.H,e).includes(i)).sort((a,b)=>a.id.localeCompare(b.id)),
    s.fallen.filter(e=>Math.floor(e.y)*s.W+Math.floor(e.x)===i),s.retained.filter(r=>r.water.tiles.includes(i))]);
}
