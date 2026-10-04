// D444: the new Rust force's core contracts from its first commit.
import { describe, expect, test } from "vitest";
import { RiftRun, RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { fixture } from "./forceFixtures";
import { jobBytes, executeInRust, planInRust } from "../../src/core/forces/rust/bridge";
import { decode } from "../../src/core/forces/rust/protocol";
import { forceParamsOf } from "../../src/core/forces/result";
import { forceProblems } from "../../src/core/forces/op";
import { planForce } from "../../src/core/forces/start";
import { keptForceParams } from "../../src/core/forces/keep";
const path = [{x:12,y:30},{x:32,y:33},{x:52,y:29}];
function plain() { const m=fixture("plain",64); m.heights.fill(15); return m; }
describe("Rust Rift",()=>{
 test("a broad dropped block keeps the old relief between two faults",()=>{
  const m=plain();for(let y=0;y<64;y++)for(let x=0;x<64;x++)m.heights[y*64+x]=12+Math.floor(x/16);
  const r=new RiftRun(m,{...RIFT_DEFAULTS,power:100,size:22,walls:"sheer"},{path}).finishAll();
  expect(r.plan0.stats.changed).toBeGreaterThan(200);expect(r.plan0.stats.drop).toBeGreaterThan(8);
  expect(r.map.heights[5*64+32]).toBe(m.heights[5*64+32]);
  expect(new Set(Array.from(r.map.heights.slice(31*64+20,31*64+45))).size).toBeGreaterThan(1);
  expect(r.map.heights.every((h,i)=>h<=m.heights[i])).toBe(true);
 });
 test("a wide short or repeated stroke retains a visible Power-zero middle",()=>{
  for(const path of [[{x:20,y:20},{x:32,y:45},{x:45,y:32}],[{x:31,y:32},{x:32,y:32}],[{x:32,y:32},{x:32,y:32}]]){
   const m=plain();const r=new RiftRun(m,{...RIFT_DEFAULTS,power:0,size:64},{path}).finishAll();
   expect(r.plan0.stats.changed).toBeGreaterThan(8);expect(r.plan0.stats.drop).toBe(1);
  }
 });
 test("Power zero visibly drops land at clicks, edges, water, and max Size",()=>{
  for(let seed=1;seed<=8;seed++)for(const p of [{x:0,y:0},{x:63,y:63},{x:32,y:32}]){
   const m=plain();if(seed%2)m.water.depth.fill(.2);
   const r=new RiftRun(m,{...RIFT_DEFAULTS,power:0,size:64,seed},{path:[p]}).finishAll();
   expect(r.plan0.stats.changed).toBeGreaterThan(0);expect(r.plan0.stats.drop).toBe(1);
   expect(r.map.water).toEqual(m.water);expect(r.map.entities.map(e=>e.id)).toEqual(m.entities.map(e=>e.id));
   expect(r.map.fallen).toEqual(m.fallen);
  }
 });
 test("Floor and kept land are respected, sources ride upright with unchanged strength",()=>{
  const m=fixture("river",64),keep=new Uint8Array(4096);keep[32*64+32]=1;
  const r=new RiftRun(m,{...RIFT_DEFAULTS,power:100,size:64,floor:6},{path},keep).finishAll();
  expect(r.map.heights.every((h,i)=>h>=Math.min(m.heights[i],6))).toBe(true);
  expect(r.map.heights[32*64+32]).toBe(m.heights[32*64+32]);
  for(const e of r.map.entities){const b=m.entities.find(b=>b.id===e.id)!;expect(b).toBeDefined();expect(e.x).toBe(b.x);expect(e.y).toBe(b.y);expect(e.z-b.z).toBe(r.map.heights[e.y*64+e.x]-m.heights[b.y*64+b.x]);if(e.template==='WaterSource')expect(e.before).toEqual(b.before);}
 });
 test("no end pop; repeat, typed boundary and packed diagnostics agree; literal record validates",()=>{
  const m=plain();const r=new RiftRun(m,RIFT_DEFAULTS,{path});r.planAll();while(!r.done)r.step();
  expect(r.map).toEqual(r.final());expect(new RiftRun(m,RIFT_DEFAULTS,{path}).finishAll().map).toEqual(r.map);
  const job={verb:"rift" as const,map:m,settings:RIFT_DEFAULTS,intent:{path},keep:null};
  const packed=decode(executeInRust(jobBytes(job))) as any;
  expect(packed.raw.heights).toEqual(Array.from(planInRust(job).raw.heights));expect(packed.arrival).toEqual(Array.from(r.plan0.arrival));
  const op=forceParamsOf(m,r.map,{verb:"rift",settings:RIFT_DEFAULTS,where:{path:path.map(p=>[p.x,p.y])},cut:null,steps:r.total,reason:"done"})!;
  expect(forceProblems(op,64,64,22)).toEqual([]);expect(op.tiles.length).toBeGreaterThan(0);expect(op.source).toBeUndefined();expect(op.sources).toBeUndefined();
 });
 test("core planForce and keptForceParams handle the request without the page",()=>{
  const m=plain(),state:any={W:64,H:64,pre:m.heights.slice(),protect:new Uint8Array(4096),channel:new Uint8Array(4096)};
  const p=planForce({base:m,request:{verb:"rift",settings:RIFT_DEFAULTS,path,cut:null,natural:true},state,caves:[],newId:()=>{throw Error("Rift must not request an id");}});
  expect(p.ok).toBe(true);if(!p.ok)return;p.staged!.finishAll();const kept=keptForceParams({before:p.before,request:p.request,carve:null,staged:p.staged});expect(kept.ok).toBe(true);
 });
 test("refusals are one-line reasons and preserve input bytes",()=>{
  const m=plain(),before=m.heights.slice();expect(()=>new RiftRun(m,{...RIFT_DEFAULTS,power:-1},{path})).toThrow("a rift's power is 0 to 100");
  expect(()=>new RiftRun(m,RIFT_DEFAULTS,{path:[]})).toThrow("Draw the Rift on the map");
  expect(()=>new RiftRun(m,{...RIFT_DEFAULTS,floor:22},{path})).toThrow("the Floor leaves no ground to drop here");expect(m.heights).toEqual(before);
 });
});
