// Original Meander primitive meshes only. No TypeScript Meander planner is imported.
import { geology } from "./local/workspace/src/core/forces/random";
import { CarveRun, DEFAULTS } from "./local/workspace/src/core/forces/carve/run";
import { View } from "./local/workspace/investigation/meander/view";
import { modelOf } from "./local/workspace/src/core/forces/runs";
import { PreviewJob } from "./local/workspace/src/core/sim/preview";
const specimens={young:{origin:64*128+46,power:65},narrow:{origin:12*128+91,power:75},long:{origin:12*128+75,power:100},existing:{origin:12*128+75,power:100}};
(window as any).capture=async(id:keyof typeof specimens)=>{
 const c=specimens[id],j=await(await fetch(`/maps/${id==="existing"?"long":id}`)).json(),heights=Uint8Array.from(j.heights);
 const before={...j,heights,rockLayers:geology(heights),fallen:j.fallen??[],lava:new Uint32Array(heights.length),water:{depth:Float64Array.from(j.water.depth),contamination:Float64Array.from(j.water.contamination)}};
 const find=new CarveRun(before,{...DEFAULTS,maturity:"mature",power:0,seed:4},{origin:c.origin});const original=find.records.maturity!.original;
 const ps=(id==="existing"?original.slice(14,35):original.slice(4,-4));const tile=(p:{x:number;y:number})=>Math.round(p.y)*128+Math.round(p.x);
 const intent={origin:tile(ps[0]),end:tile(ps.at(-1)!),via:ps.slice(1,-1).map(tile)};
 const run=new CarveRun(before,{...DEFAULTS,maturity:"mature",mode:"aim",power:c.power,seed:4,defyGravity:true},intent);run.finish();
 const after=run.map;const next=modelOf(after);if(run.retained)next.retained=[run.retained];const water=new PreviewJob({model:modelOf(before),water:{...before.water,settled:true,ticks:0,sat:new Uint8Array(heights.length),out:new Float64Array(heights.length*4)}},next);
 let result;do{result=water.advance(64);}while(!result);after.water={depth:result.depth,contamination:result.contamination};water.sim.dispose();
 document.querySelector("h1")!.textContent=`${id==="existing"?"Carve along an existing river":`Meander demo: ${id}`} · Mature, Power ${c.power}, seed 4`;
 for(const [k,map]of[before,after].entries()){const view=new View(document.querySelectorAll("canvas")[k]);view.load(map);}
 const a=run.records.maturity!;return {maturity:{...a,original:undefined},intent,retained:run.records.retained?{tiles:run.records.retained.tiles.length,volume:Array.from(run.records.retained.depth).reduce((s,d)=>s+d,0)}:null,water:{settled:result.settled,ticks:result.ticks}};
};
