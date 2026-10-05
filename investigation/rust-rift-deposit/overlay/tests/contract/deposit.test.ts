// D342/D444: native-planned force, no page required.
import { describe, expect, test } from "vitest";
import { DepositRun, DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { fixture } from "./forceFixtures";
import { jobBytes, executeInRust, planInRust } from "../../src/core/forces/rust/bridge";
import { decode } from "../../src/core/forces/rust/protocol";
import { forceParamsOf } from "../../src/core/forces/result";
import { forceProblems } from "../../src/core/forces/op";
import { planForce } from "../../src/core/forces/start";
import { keptForceParams } from "../../src/core/forces/keep";
const path=[{x:30,y:30},{x:53,y:30}];
const sum=(a:Uint8Array)=>a.reduce((s,v)=>s+v,0);
const plain=()=>fixture("plain",64);
describe("Rust Deposit",()=>{
 test("sediment is taken upstream, a lobed fan keeps channels, and no material is minted",()=>{
  const m=plain();for(let y=0;y<64;y++)for(let x=0;x<64;x++)m.heights[y*64+x]=x<27?12:7;
  const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,size:40},{path}).finishAll();
  expect(r.plan0.stats.eroded).toBeGreaterThan(100);expect(r.plan0.stats.deposited).toBe(r.plan0.stats.eroded);
  expect(sum(r.map.heights)).toBe(sum(m.heights));expect(r.plan0.stats.balance).toBe(0);
  expect(r.plan0.branches.length).toBeGreaterThan(1);expect(r.plan0.channelStages).toHaveLength(3);
  expect(r.plan0.channelStages[0]).not.toEqual(r.plan0.channelStages[1]);
  expect(new Set(Array.from(r.map.heights.slice(32*64+30,32*64+52))).size).toBeGreaterThan(2);
  expect(r.map.heights.some((h,i)=>h<m.heights[i]&&i%64<30)).toBe(true);
 });
 test("objects ride the current channel bed throughout playback",()=>{
  const m=plain(),r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,size:40},{path});r.planAll();
  while(!r.done){r.step();for(const e of r.map.entities){const b=m.entities.find(b=>b.id===e.id)!;
   expect(e.z).toBe(b.z+r.map.heights[e.y*64+e.x]-m.heights[b.y*64+b.x]);
  }}
 });
 test("Power zero has a visible conserved effect on flat ground, edges and submerged ground",()=>{
  for(const p of [{x:30,y:30},{x:0,y:0},{x:63,y:63}])for(const wet of [false,true]){
   const m=plain();if(wet)m.water.depth.fill(.5);
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:0,size:64},{path:[p]}).finishAll();
   expect(r.plan0.stats.changed).toBeGreaterThan(0);expect(r.plan0.stats.deposited).toBeGreaterThan(0);
   expect(sum(r.map.heights)).toBe(sum(m.heights));expect(r.map.water).toEqual(m.water);
   expect(r.map.entities.every(e=>m.entities.some(b=>b.id===e.id))).toBe(true);
  }
 });
 test("Floor, kept tiles and area depth enter the material budget before playback",()=>{
  const m=plain(),keep=new Uint8Array(4096),area=new Uint8Array(4096);area.fill(1);keep[30*64+30]=1;
  for(let y=20;y<40;y++)area[y*64+10]=0;
  const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,size:40,floor:8},{path},keep,area).finishAll();
  expect(sum(r.map.heights)).toBe(sum(m.heights));expect(r.map.heights.every((h,i)=>Math.abs(h-m.heights[i])<=area[i])).toBe(true);
  expect(r.map.heights[30*64+30]).toBe(m.heights[30*64+30]);expect(r.map.heights.every(h=>h>=8)).toBe(true);
 });
 test("a native wet outlet is not filled; sources keep their ids, strength and positions",()=>{
  const m=fixture("river",64),r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,size:64},{path:[{x:35,y:20},{x:35,y:55}]}).finishAll();
  expect(sum(r.map.heights)).toBe(sum(m.heights));expect(r.map.water).toEqual(m.water);
  const sources=m.entities.filter(e=>e.template==='WaterSource');expect(r.map.entities.filter(e=>e.template==='WaterSource')).toHaveLength(sources.length);
  for(const b of sources){const e=r.map.entities.find(e=>e.id===b.id)!;expect(e.x).toBe(b.x);expect(e.y).toBe(b.y);expect(e.before).toEqual(b.before);}
  const seen=new Set<number>(),todo=[20*64+35];let outlet=false;
  while(todo.length){const i=todo.pop()!;if(seen.has(i)||m.water.depth[i]<=.05||r.map.heights[i]>m.heights[i])continue;seen.add(i);if(Math.floor(i/64)===63)outlet=true;
   for(const j of [i-1,i+1,i-64,i+64])if(j>=0&&j<4096&&Math.abs(j%64-i%64)<=1)todo.push(j);
  }
  expect(outlet).toBe(true);
 });
 test("final playback is kept exactly, records validate, and typed/packed plans agree",()=>{
  const m=plain(),r=new DepositRun(m,DEPOSIT_DEFAULTS,{path}).finishAll();expect(r.map).toEqual(r.final());
  expect(new DepositRun(m,DEPOSIT_DEFAULTS,{path}).finishAll().map).toEqual(r.map);
  const job={verb:"deposit" as const,map:m,settings:DEPOSIT_DEFAULTS,intent:{path},keep:null};
  const packed=decode(executeInRust(jobBytes(job))) as any;expect(packed.raw.heights).toEqual(Array.from(planInRust(job).raw.heights));
  expect(packed.channelStages).toEqual(r.plan0.channelStages.map(s=>Array.from(s)));
  const op=forceParamsOf(m,r.map,{verb:"deposit",settings:DEPOSIT_DEFAULTS,where:{path:path.map(p=>[p.x,p.y])},cut:null,steps:r.total,reason:"done"})!;
  expect(forceProblems(op,64,64,22)).toEqual([]);expect(op.source).toBeUndefined();expect(op.sources).toBeUndefined();
 });
 test("the core accepts and records Deposit without requesting any object ids",()=>{
  const m=plain(),state:any={W:64,H:64,pre:m.heights.slice(),protect:new Uint8Array(4096),channel:new Uint8Array(4096)};
  const p=planForce({base:m,request:{verb:"deposit",settings:DEPOSIT_DEFAULTS,path,cut:null},state,caves:[],newId:()=>{throw Error("Deposit must not request an id");}});
  expect(p.ok).toBe(true);if(!p.ok)return;p.staged!.finishAll();const kept=keptForceParams({before:p.before,request:p.request,carve:null,staged:p.staged});
  expect(kept.ok).toBe(true);if(kept.ok&&kept.params)expect(kept.params.verb).toBe("deposit");
 });
 test("one-line refusals leave all input bytes unchanged",()=>{
  const m=plain(),h=m.heights.slice();expect(()=>new DepositRun(m,{...DEPOSIT_DEFAULTS,power:-1},{path})).toThrow("a deposit's power is 0 to 100");
  expect(()=>new DepositRun(m,DEPOSIT_DEFAULTS,{path:[]})).toThrow("Draw Deposit on the map");
  expect(()=>new DepositRun(m,{...DEPOSIT_DEFAULTS,floor:22},{path})).toThrow("the Floor leaves nothing to take sediment from");
  expect(()=>new DepositRun(m,DEPOSIT_DEFAULTS,{path},new Uint8Array(4096).fill(1))).toThrow("the working area leaves nothing to take sediment from");
  expect(m.heights).toEqual(h);
 });
});
