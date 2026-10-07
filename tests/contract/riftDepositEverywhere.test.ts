// D356's cheap seeded click check, on slopes, flats, a peak, water and map edges.
import { expect, test } from "vitest";
import { fixture } from "./forceFixtures";
import { RiftRun, RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { DepositRun, DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { planInRust } from "../../src/core/forces/rust/bridge";
test("both new Rust forces visibly act at random clicks, including Power 0 at maximum Size",()=>{
 let seed=734119;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(const kind of ["plain","river","slide","lake"] as const)for(const power of [0,100]){
  const m=fixture(kind,64);const clicks=[{x:0,y:0},{x:63,y:63},{x:35,y:45},{x:18,y:30},...Array.from({length:8},()=>({x:Math.floor(next()*64),y:Math.floor(next()*64)}))];
  for(const p of clicks)for(const size of [4,64])for(const verb of ["rift","deposit"] as const){
   // (Deposit's Size starts at 8, a circle four tiles round: Kyler, #341)
   const settings=verb==="rift"?{...RIFT_DEFAULTS,power,size,seed}:{...DEPOSIT_DEFAULTS,power,size:Math.max(8,size),seed};
   const plan=planInRust({verb,map:m,settings,intent:{path:[p]},keep:null});
   expect(plan.stats.changed,`${kind}/${verb}/${power}/${size}/${p.x},${p.y}`).toBeGreaterThanOrEqual(9);
   expect(plan.raw.entities.every(e=>m.entities.some(b=>b.id===e.id))).toBe(true);
   expect(plan.raw.water).toEqual(m.water);
  }
 }
});

test("a deposit changes nothing outside its outline, a click's circle or a drag's band, and stays where it is placed (Kyler, #341)",()=>{
 let seed=341;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(const kind of ["plain","river","slide","lake"] as const)for(const power of [0,100]){
  const m=fixture(kind,64);
  const at=[{x:0,y:0},{x:63,y:63},{x:0,y:40},...Array.from({length:5},()=>({x:Math.floor(next()*64),y:Math.floor(next()*64)}))];
  for(const p of at)for(const size of [8,30,64])for(const drag of [false,true]){
   const path=drag?[p,{x:Math.min(63,Math.max(0,p.x+(next()<.5?-15:15))),y:Math.min(63,p.y+10)}]:[p];
   const plan=planInRust({verb:"deposit",map:m,settings:{...DEPOSIT_DEFAULTS,power,size,seed},intent:{path},keep:null}) as unknown as {raw:{heights:Uint8Array};mouth:{x:number;y:number};stats:{changed:number}};
   const away=(x:number,y:number)=>{if(!drag)return Math.hypot(x-p.x,y-p.y);const [a,b]=path;const ux=b.x-a.x,uy=b.y-a.y,l=ux*ux+uy*uy;const t=l?Math.max(0,Math.min(1,((x-a.x)*ux+(y-a.y)*uy)/l)):0;return Math.hypot(x-a.x-t*ux,y-a.y-t*uy);};
   const outside=Array.from(plan.raw.heights).filter((h,i)=>h!==m.heights[i]&&away(i%64,(i/64)|0)>size/2).length;
   const what=`${kind}/${power}/${size}/${drag?"drag":"click"}/${p.x},${p.y}`;
   expect(outside,what).toBe(0);
   expect(plan.stats.changed,what).toBeGreaterThanOrEqual(9);
   expect(plan.mouth,what).toEqual({x:p.x,y:p.y});
  }
 }
});
