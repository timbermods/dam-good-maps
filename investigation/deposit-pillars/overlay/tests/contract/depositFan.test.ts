// Deposit's connected fan and predictable short-line contract (D342).
import {describe,expect,test} from "vitest";
import {DepositRun,DEPOSIT_DEFAULTS} from "../../src/core/forces/deposit";
import {fixture} from "./forceFixtures";
function fan(before:Uint8Array,h:Uint8Array,W:number){
 const raised=new Set<number>();
 const neighbours=(i:number)=>[i%W>0?i-1:-1,i%W+1<W?i+1:-1,i-W,i+W].filter(j=>j>=0&&j<h.length);
 for(let i=0;i<h.length;i++)if(h[i]>before[i]){raised.add(i);expect(neighbours(i).some(j=>h[i]-h[j]<3)).toBe(true);}
 expect(raised.size).toBeGreaterThanOrEqual(9);
 const todo=[raised.values().next().value!];raised.delete(todo[0]);
 while(todo.length)for(const j of neighbours(todo.pop()!))if(raised.delete(j))todo.push(j);
 expect(raised.size).toBe(0);expect(h.reduce((s,v)=>s+v,0)).toBe(before.reduce((s,v)=>s+v,0));
}
describe("Deposit fan shaping",()=>{
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
 test("every seed refuses a short line with the same actionable line and preserves input",()=>{
  for(const seed of [0,1,2,7,41,0xffffffff])for(const power of [0,35,70,100]){
   const m=fixture("plain",64),before=m.heights.slice();
   expect(()=>new DepositRun(m,{...DEPOSIT_DEFAULTS,power,seed},{path:[{x:30,y:30},{x:35,y:30}]})).toThrow("Draw a longer line for a fan (at least 8 tiles)");
   expect(m.heights).toEqual(before);
  }
 });
 test("a working area too small for a fan refuses atomically",()=>{
  const m=fixture("plain",64),before=m.heights.slice(),area=new Uint8Array(4096);
  for(let x=18;x<30;x++)area[30*64+x]=2;
  for(let x=30;x<35;x++)area[30*64+x]=2;
  expect(()=>new DepositRun(m,DEPOSIT_DEFAULTS,{path:[{x:30,y:30},{x:42,y:30}]},null,area)).toThrow("the map leaves no room for sediment here");
  expect(m.heights).toEqual(before);
 });
});
