// D355/D381/D444: direct Rust aging, legacy Young pins, literal undo and reopen.
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { CarveRun, DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import { CarvePlay } from "../../src/core/forces/carve/play";
import { carveForceParams, forceMapOf } from "../../src/core/forces/carve/result";
import type { ForceMap } from "../../src/core/forces/force";
import { fixture } from "./forceFixtures";
import { geology } from "../../src/core/forces/random";
import { carveNature, carveMaturity } from "../../src/core/forces/nature";
import { jobBytes, executeInRust, planInRust } from "../../src/core/forces/rust/bridge";
import { decode } from "../../src/core/forces/rust/protocol";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { modelOf } from "../../src/core/forces/runs";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { F } from "../../src/core/format/json";
import { entityJson } from "../../src/core/format/entities";
import { writeTimber, mapMetadata } from "../../src/core/format/timber";
import { voxelsFromHeights, settledSimulationSingletons, GAME_VERSION, LAYERS } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
const intent={origin:20*64+35,end:52*64+35,via:[24*64+35,36*64+35,48*64+35]};
const set:CarveSettings={...DEFAULTS,mode:"aim",maturity:"mature",power:100,seed:4,defyGravity:true};
const changed=(a:ArrayLike<number>,b:ArrayLike<number>)=>Array.from(a).filter((h,i)=>h!==b[i]).length;
const sum=(a:ArrayLike<number>)=>Array.from(a).reduce((s,h)=>s+h,0);
function run(m:ForceMap=fixture("river",64),s:Partial<CarveSettings>={},i=intent){const r=new CarveRun(m,{...set,...s},i);r.finish();return r;}
export function demo(id:"young"|"narrow"|"long"){
 const j=JSON.parse(gunzipSync(readFileSync(`investigation/meander/maps/${id}.json.gz`)).toString());const heights=Uint8Array.from(j.heights);
 return {...j,heights,lava:new Uint32Array(heights.length),fallen:j.fallen??[],rockLayers:geology(heights),water:{depth:Float64Array.from(j.water.depth),contamination:Float64Array.from(j.water.contamination)}};
}
describe("Rust Carve Maturity",()=>{
 test("explicit Young and an absent setting keep the complete old computation and records",()=>{
  const m=fixture("river",64);for(const power of [0,100]){
   const s={...DEFAULTS,power,seed:4};const i={origin:52*64+20};
   const a={verb:"carve" as const,map:m,settings:s,intent:i,keep:null};
   expect(executeInRust(jobBytes({...a,settings:{...s,maturity:"young"}}))).toEqual(executeInRust(jobBytes(a)));
   const x=new CarveRun(m,s,i),y=new CarveRun(m,{...s,maturity:"young"},i);x.finish();y.finish();expect(x.map).toEqual(y.map);expect(y.records.maturity).toBeUndefined();
  }
 });
 test("an existing river ages directly, balances whole blocks and adds no objects",()=>{
  const m=fixture("river",64),old=m.heights.slice();const r=run(m);const a=r.records.maturity!;
  expect(a.existingRiver).toBe(true);expect(a.youngSteps).toBe(0);expect(a.changed).toBeGreaterThan(80);expect(a.eroded).toBe(a.deposited);expect(sum(r.map.heights)).toBe(sum(old));expect(m.heights).toEqual(old);
  expect(r.map.entities.every(e=>m.entities.some(b=>b.id===e.id))).toBe(true);
  for(const e of r.map.entities.filter(e=>e.template.includes("Source"))){const b=m.entities.find(b=>b.id===e.id)!;expect(e.x).toBe(b.x);expect(e.y).toBe(b.y);expect(e.before).toEqual(b.before);expect(e.z-b.z).toBe(r.map.heights[e.y*64+e.x]-old[e.y*64+e.x]);}
 });
 test("Power zero visibly ages narrow, Auto and wide rivers; no objects are added",()=>{
  for(const width of [2,null,24]){const m=fixture("river",64);const r=run(m,{power:0,width});expect(changed(r.map.heights,m.heights),`Width ${width}`).toBeGreaterThan(8);expect(r.map.entities.every(e=>m.entities.some(b=>b.id===e.id))).toBe(true);}
 });
 test("a deep canyon keeps its bluffs when there is no balanced room for migration",()=>{
  const m=fixture("plain",64),i={origin:50*64+35,end:12*64+35,via:[40*64+35,24*64+35]};const r=run(m,{power:55,width:6},i);expect(r.records.maturity!.bluffLimited).toBeGreaterThan(0);expect(r.records.maturity!.existingRiver).toBe(false);expect(changed(r.map.heights,m.heights)).toBeGreaterThan(8);expect(r.records.maturity!.eroded).toBe(r.records.maturity!.deposited);
 });
 test("new land gets Young's carve first, then conserved aging; a dry carve adds no objects",()=>{
  const m=fixture("plain",64);const r=run(m,{dry:true,power:0},{origin:50*64+35,end:12*64+35,via:[40*64+35,24*64+35]});
  expect(r.records.maturity!.existingRiver).toBe(false);expect(r.records.maturity!.youngSteps).toBeGreaterThan(0);expect(r.steps).toBeGreaterThan(r.records.maturity!.youngSteps);expect(changed(r.map.heights,m.heights)).toBeGreaterThan(8);expect(r.records.maturity!.eroded).toBe(r.records.maturity!.deposited);expect(r.map.entities.every(e=>m.entities.some(b=>b.id===e.id))).toBe(true);
 });
 test("Floor and Keep hold; water and badwater mass are carried without minting water",()=>{
  const m=fixture("river",64);m.water.depth=m.water.depth.map(d=>d>0?.5:0);m.water.contamination.fill(.5);const keep=new Uint8Array(4096);keep[30*64+40]=1;
  const r=new CarveRun(m,{...set,floor:6},intent,{keep});r.finish();expect(r.map.heights[30*64+40]).toBe(m.heights[30*64+40]);expect(r.map.heights.every((h,i)=>h>=Math.min(6,m.heights[i]))).toBe(true);
  expect(sum(r.map.water.depth)).toBe(sum(m.water.depth));
  expect(r.map.water.contamination.every((c,i)=>r.map.water.depth[i]===0||c===.5)).toBe(true);
 });
 test("native tape, typed boundary and forward/reversed playback finish at identical land and objects",()=>{
  const m=fixture("river",64),j={verb:"carve" as const,map:m,settings:set,intent,keep:null};const packed=decode(executeInRust(jobBytes(j))) as any;const native=planInRust(j);
  expect(packed.raw.heights).toEqual(Array.from(native.raw.heights));expect(packed.maturity.original).toEqual(native.maturity!.original);
  for(const reverse of [false,true]){const r=new CarveRun(m,set,intent);const p=new CarvePlay(r,reverse);p.plan();for(let k=1;k<=p.total;k++){p.showTo(k);for(const e of p.map.entities.filter(e=>e.template.includes("Source")))expect(e.z).toBe(p.map.heights[e.y*64+e.x]);}expect(p.map.heights).toEqual(r.map.heights);expect(p.map.entities).toEqual(r.map.entities);expect(p.head).toEqual(r.records.heads[r.steps]);}
 });
 test("the approved long valley makes a real wet closed oxbow, kept in its literal operation",()=>{
  const m=demo("long"),intent={"origin":973,"end":5241,"via":[1100,1356,1612,1868,2124,2380,2636,2892,3148,3276,3533,3789,3917,4174,4303,4304,4434,4436,4438,4440,4442,4443,4445,4574,4703,4832,4961,5218,5346,5475,5732,5861,5989,6246,6374,6504,6505,6507,6380,6253,5998,5870,5614,5358,5231,5104,4978,4979,4981,5110,5239]};const r=run(m,{power:100},intent);expect(r.records.maturity!.oxbows).toBeGreaterThan(0);const lake=r.retained!;expect(lake.tiles.length).toBeGreaterThan(3);expect(lake.tiles.every((i,k)=>k===0||i>lake.tiles[k-1])).toBe(true);expect(lake.depth.every(d=>d>0)).toBe(true);
  const model=modelOf(r.map);model.retained=[lake];const wet=canonicalSettle(model);expect(lake.tiles.filter(i=>wet.depth[i]>0).length).toBeGreaterThan(3);
  const params=carveForceParams(m,r,{settings:set,origin:[intent.origin%128,Math.floor(intent.origin/128)],end:[intent.end%128,Math.floor(intent.end/128)],cut:null})!;expect(params.lake).toEqual(lake);expect(params.source).toBeUndefined();expect(r.map.entities.every(e=>m.entities.some((b:any)=>b.id===e.id))).toBe(true);
 });
 test("a newly carved river plays its Young prefix backwards, then its age increments forwards",()=>{
  const m=fixture("plain",64),settings={...set,power:0,width:6};const i={origin:50*64+35,end:12*64+35,via:[40*64+35,24*64+35]};
  for(const reverse of [false,true]){const r=new CarveRun(m,settings,i);const p=new CarvePlay(r,reverse);p.plan();expect(r.records.maturity!.youngSteps).toBeGreaterThan(0);expect(r.records.maturity!.youngSteps).toBeLessThan(p.total);for(let k=1;k<=p.total;k++){p.showTo(k);for(const e of p.map.entities.filter(e=>e.template.includes("Source")))expect(e.z).toBe(p.map.heights[e.y*64+e.x]);}expect(p.map.heights).toEqual(r.map.heights);expect(p.map.entities).toEqual(r.map.entities);expect(p.head).toEqual(r.records.heads[r.steps]);}
 });
 test("Auto is map- and seed-dependent, explicit Young and old Auto draws stay unchanged",()=>{
  const m=fixture("plain",64),g={W:64,H:64,heights:m.heights,at:32*64+32};
  const s={...DEFAULTS,seed:4};const a=carveNature(s,g);const b=carveNature({...s,maturity:null},g);expect(b.maturity).toBe(carveMaturity(g,4));const {maturity,...legacy}=b;expect(legacy).toEqual(a);
  expect(new Set(Array.from({length:32},(_,seed)=>carveMaturity(g,seed))).size).toBe(2);
 });
 test("one-line refusal preserves the input when settings, Floor or Keep leave no operation",()=>{
  const m=fixture("river",64),old=m.heights.slice();expect(()=>run(m,{maturity:"old" as any})).toThrow("a carve's maturity is Young, Mature or Auto");
  expect(()=>run(m,{power:-1})).toThrow("a carve's power is 0 to 100");expect(()=>run(m,{floor:22})).toThrow("the Floor or kept ground leaves no room to age this river");expect(m.heights).toEqual(old);
 });
 test("an aged existing river's real oxbow, land and object ids survive undo and project/file reopening",()=>{
  const original=demo("long"),N=128*128,zero=new Float64Array(N);
  const bytes=writeTimber({metadata:mapMetadata(128,128,"Original Meander study"),thumbnail:null,versionTxt:GAME_VERSION,extraFiles:[],world:{gameVersion:GAME_VERSION,timestamp:"2026-01-01 00:00:00",sizeX:128,sizeY:128,layers:LAYERS,voxels:voxelsFromHeights(original.heights,128,128),singletons:settledSimulationSingletons(128,128,{floor:original.heights,depth:original.water.depth,contamination:original.water.contamination,moisture:zero,soilContamination:zero,sat:zero}),entities:JSON.parse(JSON.stringify(original.entities.map(entityJson)),(_k,v)=>typeof v==="number"&&!Number.isInteger(v)?F(v):v)}});
  const s=MapSession.importMap(bytes,"meander-long.timber");s.setWaterMode("defer");const m=forceMapOf(s.built,original.water),old=m.heights.slice(),ids=s.built.entities.map(e=>e.id).sort();const intent={"origin":973,"end":5241,"via":[1100,1356,1612,1868,2124,2380,2636,2892,3148,3276,3533,3789,3917,4174,4303,4304,4434,4436,4438,4440,4442,4443,4445,4574,4703,4832,4961,5218,5346,5475,5732,5861,5989,6246,6374,6504,6505,6507,6380,6253,5998,5870,5614,5358,5231,5104,4978,4979,4981,5110,5239]};const r=run(m,{power:100},intent);expect(r.records.maturity!.changed).toBeGreaterThan(100);expect(r.retained!.tiles.length).toBeGreaterThan(3);
  const params=carveForceParams(m,r,{settings:set,origin:[intent.origin%128,Math.floor(intent.origin/128)],end:[intent.end%128,Math.floor(intent.end/128)],cut:null})!;expect(s.apply({op:"forceResult",params},"user").errors).toEqual([]);expect(s.built.heights).toEqual(r.map.heights);s.settleCanonical();const water=s.built.water.slice();const exported=s.exportTimber().bytes;
  const reopened=MapSession.open(decodeProject(s.project()));reopened.settleCanonical();expect(reopened.built.heights).toEqual(s.built.heights);expect(reopened.built.water).toEqual(water);expect(reopened.built.entities.map(e=>e.id).sort()).toEqual(s.built.entities.map(e=>e.id).sort());expect(Buffer.from(reopened.exportTimber().bytes)).toEqual(Buffer.from(exported));
  const file=MapSession.importMap(exported,"mature.timber");expect(file.built.heights).toEqual(s.built.heights);expect(Buffer.from(file.exportTimber().bytes)).toEqual(Buffer.from(exported));
  expect(s.undo()).toBe(true);expect(s.built.heights).toEqual(old);expect(s.built.entities.map(e=>e.id).sort()).toEqual(ids);expect(s.redo()).toBe(true);s.settleCanonical();expect(s.built.water).toEqual(water);
 });
 test("Mature's literal operation survives undo, redo, project reopen and identical exported bytes",()=>{
  const generated=generate(makeSpec({theme:"highlands",seed:3,size:{x:96,y:96}}));const s=MapSession.fromGenerated(generated,generated.file);s.setWaterMode("defer");const m=forceMapOf(s.built),old=m.heights.slice();
  const st=m.entities.find(e=>e.template==="StartingLocation")!;let origin=0,best=-Infinity;for(let i=0;i<m.heights.length;i++){const d=(i%96-st.x)**2+(Math.floor(i/96)-st.y)**2;if(m.heights[i]>3&&d>best){origin=i;best=d;}}
  const settings={...DEFAULTS,maturity:"mature" as const,power:80,seed:4};const r=new CarveRun(m,settings,{origin},{sourceId:"0c0ffee0-0000-4000-8000-000000000001"});r.finish();
  const params=carveForceParams(m,r,{settings,origin:[origin%96,Math.floor(origin/96)],cut:null})!;expect(params.settings).toHaveProperty("maturity","mature");expect(s.apply({op:"forceResult",params},"user").errors).toEqual([]);const final=s.built.heights.slice();expect(s.undo()).toBe(true);expect(s.built.heights).toEqual(old);expect(s.redo()).toBe(true);expect(s.built.heights).toEqual(final);
  const reopened=MapSession.open(decodeProject(s.project()));expect(reopened.built.heights).toEqual(final);s.settleCanonical();reopened.settleCanonical();expect(Buffer.from(reopened.exportTimber().bytes)).toEqual(Buffer.from(s.exportTimber().bytes));
 });
});
