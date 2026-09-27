import test from 'node:test';
import assert from 'node:assert/strict';
import { entityView, emptyColumns, waterFromDepth, surfaceWater, soilView, type MapView } from '../../src/render3d/model';
import { WaterSim,TICKS_PER_DAY,type WaterModel } from '../../src/core/sim/water';
import { badtideContamination,hazardDays } from '../../src/core/sim/weather';
import { moisture } from '../../src/core/sim/moisture';
import { soilContamination } from '../../src/core/sim/contamination';
import { climateData } from './seasons';
import { riverField } from './water-finish';
import { weatherSnapshots,type WeatherBase } from './weather';

function fixture():WeatherBase{
 const W=18,H=14,heights=new Uint8Array(W*H).fill(7);
 // Two genuinely disconnected basins: a live spring on the left, stored clean
 // water on the right. They must not share contamination during a badtide.
 for(let y=2;y<12;y++)for(let x=2;x<7;x++)heights[y*W+x]=3;
 for(let y=2;y<12;y++)for(let x=11;x<16;x++)heights[y*W+x]=3;
 const depth=Float64Array.from(heights,h=>h===3?1.4:0),contamination=new Float64Array(W*H);
 const model:WaterModel={W,H,floor:Float64Array.from(heights),dam:null,emitters:[{cells:[5*W+3],strength:.14,contamination:0}]};
 const view:MapView={W,H,heights,columns:emptyColumns(),entities:entityView([]),water:waterFromDepth(heights,depth,contamination),soil:soilView(moisture(heights,depth,contamination,W,H,null),soilContamination(heights,depth,contamination,W,H,null))};
 return {model,view,depth,contamination,difficulty:'normal'};
}
for(const hazard of ['drought','badtide'] as const)test(hazard+' snapshots equal the editor tick rules and preserve input',async()=>{
 const base=fixture(),before=structuredClone(base),days=hazardDays('normal',hazard),frames:Parameters<Parameters<typeof weatherSnapshots>[2]>[0][]=[];
 await weatherSnapshots(base,hazard,f=>frames.push(f),()=>false);
 assert.equal(frames.length,days);
 const independentModel={...base.model,emitters:base.model.emitters.map(e=>({...e}))};
 const independent=new WaterSim(independentModel,{depth:base.depth.slice(),contamination:base.contamination.slice()});
 let day=0;
 for(let tick=0;tick<days*TICKS_PER_DAY;){
  const gap=tick<TICKS_PER_DAY?12:96;
  if(hazard==='badtide')for(const e of independentModel.emitters)e.contamination=badtideContamination(tick/TICKS_PER_DAY,days);
  independent.run(gap,hazard==='drought'?0:1);tick+=gap;
  if(tick%TICKS_PER_DAY===0){
   assert.deepEqual(frames[day].water,waterFromDepth(base.view.heights,independent.D,independent.C));
   assert.deepEqual(frames[day].soil,soilView(moisture(base.view.heights,independent.D,independent.C,18,14,null),soilContamination(base.view.heights,independent.D,independent.C,18,14,null)));day++;
  }
 }
 assert.deepEqual(base,before);
 const last=surfaceWater(18,14,frames.at(-1)!.water);
 for(let y=3;y<11;y++)for(let x=12;x<15;x++)assert.equal(last.contamination[y*18+x],0,'isolated water stays clean');
 if(hazard==='drought')assert.ok(frames.at(-1)!.water.depth.reduce((a,b)=>a+b,0)<base.depth.reduce((a,b)=>a+b,0));
 else assert.ok(last.contamination[5*18+3]>.2,'source-connected water becomes contaminated');
});
test('seasonal dry mask never includes moist or submerged tiles',()=>{
 const base=fixture(),view=structuredClone(base.view);view.soil!.moisture.fill(0);view.soil!.moisture[0]=1;
 const {bytes}=climateData(view,base.view),sw=surfaceWater(view.W,view.H,view.water);
 assert.equal(bytes[0],0);
 for(let i=0;i<sw.depth.length;i++){if(sw.depth[i]>.001)assert.equal(bytes[i*4],0);if(view.soil!.moisture[i]>0)assert.equal(bytes[i*4],0);}
 assert.equal(bytes[4],255);
});
test('still water and dry land produce no invented river foam',()=>{
 const {view}=fixture(),field=riverField(view,new Float32Array(view.W*view.H*2));
 assert.ok(field.every(x=>x===0));
 const velocity=new Float32Array(view.W*view.H*2).fill(2),moving=riverField(view,velocity),sw=surfaceWater(view.W,view.H,view.water);
 for(let i=0;i<field.length;i++){assert.ok(Number.isFinite(moving[i]));if(sw.depth[i]<=.001)assert.equal(moving[i],0);}
 assert.ok(moving.some(x=>x>0));
});
test('cancelled weather emits nothing',async()=>{
 const frames:unknown[]=[];await weatherSnapshots(fixture(),'badtide',f=>frames.push(f),()=>true);assert.equal(frames.length,0);
});
