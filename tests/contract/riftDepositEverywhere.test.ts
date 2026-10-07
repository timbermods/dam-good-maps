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
   const settings=verb==="rift"?{...RIFT_DEFAULTS,power,size,seed}:{...DEPOSIT_DEFAULTS,power,size,seed};
   const plan=planInRust({verb,map:m,settings,intent:{path:[p]},keep:null});
   expect(plan.stats.changed,`${kind}/${verb}/${power}/${size}/${p.x},${p.y}`).toBeGreaterThanOrEqual(9);
   expect(plan.raw.entities.every(e=>m.entities.some(b=>b.id===e.id))).toBe(true);
   expect(plan.raw.water).toEqual(m.water);
  }
 }
});
