// D444: the new Rust force's core contracts from its first commit.
import { describe, expect, test } from "vitest";
import { RiftRun, RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { fixture } from "./forceFixtures";
import { jobBytes, executeInRust, planInRust } from "../../src/core/forces/rust/bridge";
import { decode } from "../../src/core/forces/rust/protocol";
import { forceParamsOf } from "../../src/core/forces/result";
import { riddenLevel } from "../../src/core/forces/clear";
import { forceProblems } from "../../src/core/forces/op";
import { planForce } from "../../src/core/forces/start";
import { keptForceParams } from "../../src/core/forces/keep";
const path = [{x:12,y:30},{x:32,y:33},{x:52,y:29}];
function plain() { const m=fixture("plain",64); m.heights.fill(15); return m; }
describe("Rust Rift",()=>{
 test("a broad dropped block keeps the old relief between two faults",()=>{
  const m=plain();for(let y=0;y<64;y++)for(let x=0;x<64;x++)m.heights[y*64+x]=12+Math.floor(x/16);
  const r=new RiftRun(m,{...RIFT_DEFAULTS,power:100,size:22,walls:"sheer"},{path}).finishAll();
  expect(r.plan0.stats.changed).toBeGreaterThan(200);
  // (Power 100 drops about 8 since the force audit's finding 6 halved the throw, was more than 8; D148)
  expect(r.plan0.stats.drop).toBeGreaterThanOrEqual(7);expect(r.plan0.stats.drop).toBeLessThanOrEqual(9);
  expect(r.map.heights[5*64+32]).toBe(m.heights[5*64+32]);
  expect(new Set(Array.from(r.map.heights.slice(31*64+20,31*64+45))).size).toBeGreaterThan(1);
  expect(r.map.heights.every((h,i)=>h<=m.heights[i])).toBe(true);
 });
 test("the default click is a rift valley that reads as one (the force audit's findings 6 and 7): long and narrow with pointed tips, one sheer wall and one stepped, no one-tile pillar or pit; on ground water reaches it drains, its lake at most 2 deep",()=>{
  const W=128;
  // (where water would stand before it leaves the map: a priority flood from the map's edges)
  const drain=(h:ArrayLike<number>,add:ArrayLike<number>)=>{const lv=new Float64Array(W*W).fill(Infinity),q:number[]=[];
   for(let i=0;i<W*W;i++){const x=i%W,y=(i/W)|0;if(!x||!y||x===W-1||y===W-1){lv[i]=h[i]+add[i];q.push(i);}}
   while(q.length){let b=0;for(let k=1;k<q.length;k++)if(lv[q[k]]<lv[q[b]])b=k;const i=q[b];q[b]=q[q.length-1];q.pop();const x=i%W,y=(i/W)|0;
    for(const [ok,j] of [[x>0,i-1],[x<W-1,i+1],[y>0,i-W],[y<W-1,i+W]] as [boolean,number][])if(ok){const v=Math.max(h[j]+add[j],lv[i]);if(v<lv[j]){lv[j]=v;q.push(j);}}}
   return lv;};
  for(const kind of ["plain","river"] as const)for(const seed of [0,1,42])for(const power of [70,100]){
   const m=fixture(kind,W);m.entities=m.entities.filter(e=>e.template!=="StartingLocation");
   const r=new RiftRun(m,{...RIFT_DEFAULTS,seed,power},{path:[{x:66,y:60}]}).finishAll();
   const h=r.map.heights,b=m.heights,pts=r.plan0.fault.points,a=pts[0],z=pts[pts.length-1],what=`${kind} ${seed} ${power}`;
   const L=Math.hypot(z.x-a.x,z.y-a.y),ux=(z.x-a.x)/L,uy=(z.y-a.y)/L;
   expect(L,`${what}: a click's length`).toBeGreaterThanOrEqual(3*r.plan0.stats.width);
   const lo=new Array(10).fill(Infinity),hi=new Array(10).fill(-Infinity),edge=[[0,0],[0,0]];let lone=0;
   for(let y=1;y<W-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x;if(h[i]===b[i])continue;
    const t=((x-a.x)*ux+(y-a.y)*uy)/L,d=(x-a.x)*-uy+(y-a.y)*ux,k=Math.max(0,Math.min(9,Math.floor(t*10)));lo[k]=Math.min(lo[k],d);hi[k]=Math.max(hi[k],d);
    const n=[h[i-1],h[i+1],h[i-W],h[i+W]];if(h[i]>Math.max(...n)||h[i]<Math.min(...n))lone++;
    if(t>0.3&&t<0.7)for(const j of [i-1,i+1,i-W,i+W])if(h[j]===b[j]){const sd=d>0?1:0;edge[sd][0]+=b[i]-h[i];edge[sd][1]++;}}
   const wide=(k:number)=>hi[k]-lo[k]+1;
   expect(lone,`${what}: one-tile pillars and pits`).toBe(0);
   // (its tips pointed: a tenth of its length from either end it is at most half as wide as at its middle)
   expect(Math.max(wide(0),wide(9)),`${what}: its tips`).toBeLessThanOrEqual(0.5*Math.max(wide(4),wide(5)));
   if(kind==="plain"){
    // (one wall sheer, the other stepping down: the drop at the main wall's brink twice and more the other's)
    const [p,q]=edge.map(([s,n])=>s/n);
    expect(Math.max(p,q),`${what}: the sheer wall`).toBeGreaterThanOrEqual(3.5);
    expect(Math.min(p,q),`${what}: the stepped side's first step`).toBeLessThanOrEqual(Math.max(p,q)/1.6);
   }else{
    // (deeper only where water stood before, by the level its floor still drops)
    const lv=drain(h,m.water.depth),was=drain(b,m.water.depth);let deep=0;
    for(let i=0;i<W*W;i++)if(h[i]<b[i])deep=Math.max(deep,lv[i]-h[i]-Math.max(0,was[i]-b[i]+1-2));
    expect(deep,`${what}: the deepest water on its floor`).toBeLessThanOrEqual(2);
   }
  }
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
 test("a source rides its block by its ridden level (clear.ts riddenLevel, whole), never snapped to the surface",()=>{
  const m=fixture("river",64);const src=m.entities.find(e=>e.template==="WaterSource")!;
  // (a source standing two levels over its ground, on the rift's floor)
  const i=31*64+32;Object.assign(src,{x:32,y:31,z:m.heights[i]+2});
  const r=new RiftRun(m,{...RIFT_DEFAULTS,power:100,size:22,sources:"ride"},{path}).finishAll();
  const e=r.map.entities.find(q=>q.id===src.id)!;
  expect(r.map.heights[i]).toBeLessThan(m.heights[i]);
  expect(e.z).toBe(riddenLevel(src.z,m.heights[i],r.map.heights[i],undefined,true));
  expect(e.z).toBe(r.map.heights[i]+2);
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
