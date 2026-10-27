// Diagnostic pictures only: approved demos' original primitive meshes, new Rust computation.
import { geology } from "./local/workspace/src/core/forces/random";
import { RiftRun, RIFT_DEFAULTS } from "./local/workspace/src/core/forces/rift";
import { DepositRun, DEPOSIT_DEFAULTS } from "./local/workspace/src/core/forces/deposit";
import { modelOf } from "./local/workspace/src/core/forces/runs";
import { PreviewJob } from "./local/workspace/src/core/sim/preview";
import { View as RiftView } from "./local/workspace/investigation/rift/view";
import { View as DepositView } from "./local/workspace/investigation/deposit/view";
const studies = {
  "rift-plateau": { verb: "rift", map: "rift/highlands", power: 70, size: 22, path: [{x:86,y:39},{x:95,y:53},{x:93,y:73},{x:106,y:94}] },
  "rift-river": { verb: "rift", map: "rift/highlands", power: 100, size: 26, path: [{x:40,y:38},{x:61,y:46},{x:81,y:52},{x:101,y:60}] },
  "deposit-canyon": { verb: "deposit", map: "deposit/canyon", power: 100, size: 64, path: [{x:36,y:48}] },
  "deposit-dry": { verb: "deposit", map: "deposit/highlands", power: 100, size: 64, path: [{x:88,y:20}] },
  "deposit-lake": { verb: "deposit", map: "deposit/lake", power: 100, size: 64, path: [{x:52,y:48}] },
} as const;
(window as any).capture = async (id: keyof typeof studies) => {
  const c=studies[id], j=await (await fetch(`/maps/${c.map}`)).json();
  const heights=Uint8Array.from(j.heights);
  const before={...j,heights,rockLayers:j.rockLayers??geology(heights),fallen:j.fallen??[],lava:Uint32Array.from(j.lava??new Uint32Array(heights.length)),water:{depth:Float64Array.from(j.water.depth),contamination:Float64Array.from(j.water.contamination)}};
  const run=c.verb === "rift" ? new RiftRun(before,{...RIFT_DEFAULTS,seed:2,power:c.power,size:c.size},{path:[...c.path]}) : new DepositRun(before,{...DEPOSIT_DEFAULTS,seed:2,power:c.power,size:c.size},{path:[...c.path]});
  run.finishAll();
  const after=run.map, View=c.verb === "rift" ? RiftView : DepositView;
  const water=new PreviewJob({model:modelOf(before),water:{...before.water,settled:true,ticks:0,sat:new Uint8Array(heights.length),out:new Float64Array(heights.length*4)}},modelOf(after));
  let result;do{result=water.advance(64);}while(!result);after.water={depth:result.depth,contamination:result.contamination};water.sim.dispose();
  document.querySelector("h1")!.textContent=`${id} · approved demo gesture, planned directly in Rust`;
  for(const [k,map] of [before,after].entries()) {
    const view=new View(document.querySelectorAll("canvas")[k]); view.load(map);
    if(c.verb==="rift"){(view as any).base=before; view.show(map);}
    if(c.verb==="deposit")(view as DepositView).focus(run.plan0.mouth!,1.65);
  }
  return {stats:run.plan0.stats,water:{settled:result.settled,steady:result.steadyTicks!==undefined,ticks:result.ticks}};
};
