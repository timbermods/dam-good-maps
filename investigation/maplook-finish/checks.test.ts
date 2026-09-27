import test from 'node:test';
import assert from 'node:assert/strict';
import { entityView, emptyColumns, waterFromDepth, surfaceWater, soilView, type MapView } from '../../src/render3d/model';
import { WaterSim,TICKS_PER_DAY,type WaterModel } from '../../src/core/sim/water';
import { badtideContamination,hazardDays } from '../../src/core/sim/weather';
import { moisture } from '../../src/core/sim/moisture';
import { soilContamination } from '../../src/core/sim/contamination';
import { climateData } from './seasons';
import { riverField } from './water-finish';
import {riverAnalysis} from './river';
import {PlantDrought} from './plants';
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
 assert.ok(moving.every(x=>x===0),'uniform ordinary flow has no added froth');
});
test('rough foam is relative to each river and stays at rapids, obstacles and short fall tails',()=>{
 const W=36,H=24,heights=new Uint8Array(W*H).fill(2),depth=new Float32Array(W*H),v=new Float32Array(W*H*2);
 for(let y=8;y<16;y++)for(let x=0;x<W;x++){const i=y*W+x;heights[i]=0;depth[i]=1;v[i*2]=6;}
 const make=():MapView=>({W,H,heights,columns:emptyColumns(),entities:entityView([]),water:waterFromDepth(heights,depth,new Float32Array(W*H))});
 assert.ok(riverField(make(),v).every(x=>x===0),'uniform channel stays clean despite fast absolute flow');
 for(let y=8;y<16;y++)for(let x=23;x<26;x++)v[(y*W+x)*2]=12;
 const rock=12*W+15;heights[rock]=2;depth[rock]=0;for(const j of [rock-1,rock+1,rock-W,rock+W])v[j*2]=11;
 let a=riverAnalysis(make(),v);assert.ok(a.counts.rapids>0);assert.ok(a.counts.obstacles>0);
 assert.equal(a.field[10*W+5],0,'ordinary upstream reach has no extra foam');
 assert.equal(a.field[rock],0,'dry rock has no foam');
 for(const j of [rock+1,rock+W,rock+W+1]){heights[j]=2;depth[j]=0;}
 for(const j of [rock-1,rock-W,rock+2,rock+2*W])v[j*2]=11;
 assert.ok(riverAnalysis(make(),v).counts.obstacles>0,'a wider rock also creates a local wake');
 a=riverAnalysis(make(),v);
 assert.deepEqual(a.field,riverAnalysis(make(),Float32Array.from(v,x=>x*2)).field,'doubling the whole river does not expand the foam');
 v.fill(0);for(let y=8;y<16;y++)for(let x=0;x<W;x++){v[(y*W+x)*2]=6;if(x<7)heights[y*W+x]=2;}
 a=riverAnalysis(make(),v);assert.ok(a.counts.falls>0);
 assert.equal(a.falls[10*W+12],0,'fall foam dies out within a few downstream tiles');
});
test('plants use zero-moisture species timers, reset when rewetted, and retain death',()=>{
 const map=fixture().view;
 map.entities=entityView([{template:'BlueberryBush',x:8,y:4,z:7},{template:'Pine',x:9,y:4,z:7},{template:'Birch',x:10,y:4,z:7}].map(e=>({...e,orientation:'Cw0',owner:'study'})));
 const moisture=new Uint8Array(map.W*map.H);moisture[4*map.W+10]=1;
 const p=new PlantDrought(map);p.advance(moisture,8);
 assert.equal(p.snapshot().killed,0,'no species dies before the earliest possible delay');
 assert.ok(p.snapshot().stress[0]>.7);assert.equal(p.snapshot().stress[2],0,'even a little moisture keeps a plant green');
 p.advance(moisture,2);assert.equal(p.snapshot().dead[0],1,'berry passes its maximum 9.9-day delay');assert.equal(p.snapshot().dead[1],0,'pine cannot die before 11.7 days');
 moisture.fill(1);p.advance(moisture,.1);assert.equal(p.snapshot().stress[1],0);assert.equal(p.snapshot().dead[0],1,'dead form persists within the preview');
 moisture.fill(0);p.advance(moisture,10);assert.equal(p.snapshot().dead[1],0,'rewetting reset the timer');
 p.advance(moisture,7);assert.equal(p.snapshot().dead[1],1);
});
test('cancelled weather emits nothing',async()=>{
 const frames:unknown[]=[];await weatherSnapshots(fixture(),'badtide',f=>frames.push(f),()=>true);assert.equal(frames.length,0);
});
