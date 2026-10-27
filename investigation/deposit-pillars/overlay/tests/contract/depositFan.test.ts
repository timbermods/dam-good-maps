// Deposit lobes are sediment bodies; short gestures remain visible (D342/D356).
import {describe,expect,test} from "vitest";
import {DepositRun,DEPOSIT_DEFAULTS} from "../../src/core/forces/deposit";
import {fixture} from "./forceFixtures";
function fan(before:Uint8Array,h:Uint8Array,W:number){
 const raised=new Set<number>();
 const neighbours=(i:number)=>[i%W>0?i-1:-1,i%W+1<W?i+1:-1,i-W,i+W].filter(j=>j>=0&&j<h.length);
 for(let i=0;i<h.length;i++)if(h[i]>before[i]){raised.add(i);expect(neighbours(i).some(j=>h[i]-h[j]<3)).toBe(true);}
 expect(raised.size).toBeGreaterThanOrEqual(4);
 for(const i of raised){const x=i%W,y=(i/W)|0;
  const squares=[[-1,-1],[-1,0],[0,-1],[0,0]].filter(([dx,dy])=>x+dx>=0&&y+dy>=0&&x+dx+1<W&&(y+dy+1)*W<h.length)
   .map(([dx,dy])=>(y+dy)*W+x+dx);
  expect(squares.some(j=>[j,j+1,j+W,j+W+1].every(k=>raised.has(k)))).toBe(true);
 }
 expect(h.reduce((s,v)=>s+v,0)).toBe(before.reduce((s,v)=>s+v,0));
}
describe("Deposit fan shaping",()=>{
 test("a split cone retains separate bodies, original volume and extent without bridging the barrier",()=>{
  const m=fixture("plain",64);m.entities=[];
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)m.heights[y*64+x]=x<28?12:y>=31&&y<=33?14:7;
  const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,seed:2},{path:[{x:30,y:30},{x:53,y:30}]}).finishAll();
  fan(m.heights,r.map.heights,64);expect(r.plan0.stats.deposited).toBe(1685);expect(r.plan0.reach).toBe(23);
  const raised=Array.from(r.map.heights).flatMap((h,i)=>h>m.heights[i]?[i]:[]),xs=raised.map(i=>i%64),ys=raised.map(i=>(i/64)|0);
  expect(Math.max(...xs)-Math.min(...xs)+1).toBeGreaterThanOrEqual(24);
  expect(Math.max(...ys)-Math.min(...ys)+1).toBeGreaterThanOrEqual(29);
  expect(ys.some(y=>y<31)).toBe(true);expect(ys.some(y=>y>33)).toBe(true);
  expect(raised.some(i=>i%64>=36&&(i/64|0)>=31&&(i/64|0)<=33)).toBe(false);
 });
 test("a small material budget covers connected ground before building relief",()=>{
  for(const seed of [0,1,2,7,41])for(const power of [0,35,70,100]){
   const m=fixture("plain",64);m.entities=[];m.heights.fill(1);
   // Only a narrow upstream bank pays for a broad fan.
   for(let y=27;y<=33;y++)for(let x=20;x<=26;x++)m.heights[y*64+x]=5;
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power,seed,size:40},{path:[{x:30,y:30},{x:53,y:30}]}).finishAll();
   fan(m.heights,r.map.heights,64);expect(r.plan0.stats.balance).toBe(0);
  }
 });
 test("donor cuts cannot leave a raised tile standing over all neighbours",()=>{
  for(const seed of [0,1,2,7]){
   const m=fixture("slide",64);m.entities=[];
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power:100,seed},{path:[{x:22,y:30},{x:46,y:30}]}).finishAll();
   fan(m.heights,r.map.heights,64);
  }
 });
 test("short draws and clicks make visible connected fans at every sampled Power and seed",()=>{
  for(const seed of [0,1,2,7,41,0xffffffff])for(const power of [0,35,70,100])for(const path of [[{x:30,y:30}],[{x:30,y:30},{x:35,y:30}]]){
   const m=fixture("plain",64),before=m.heights.slice();
   const r=new DepositRun(m,{...DEPOSIT_DEFAULTS,power,seed},{path}).finishAll();
   fan(before,r.map.heights,64);expect(r.plan0.stats.changed).toBeGreaterThanOrEqual(9);expect(m.heights).toEqual(before);
  }
 });
 test("a real working-area restriction refuses atomically",()=>{
  const m=fixture("plain",64),before=m.heights.slice(),area=new Uint8Array(4096);
  expect(()=>new DepositRun(m,DEPOSIT_DEFAULTS,{path:[{x:30,y:30},{x:35,y:30}]},null,area)).toThrow("the working area leaves nothing to take sediment from");
  expect(m.heights).toEqual(before);
 });

});
