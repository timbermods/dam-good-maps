// Original synthetic scene recipes and Probe job data only. No launch/build/install/game imports.
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {SketchJob,install,type MapSnapshot} from './engine';
import type {Stroke} from './wall';
import {fromWorld} from './maps';
import {emptySimulationSingletons,voxelsFromHeights,type WorldModel} from '../../src/core/format/world';
import {waterColumns} from '../terrain3d/proto/columns';
import type {Job,JobMap} from '../probe/runner/job';
const dir=process.cwd(),local=resolve(dir,'local/calibration');mkdirSync(local,{recursive:true});
install(readFileSync(resolve(dir,'local/water.wasm')));
const W=16,N=W*W,D0=1+4/24,horizon=90*768;
const definitions:{id:string;stack:Stroke['stack'];path:Stroke['path'];head:number;varying?:boolean;roof?:boolean}[]=[
 {id:'dam',stack:[{kind:'dam'}],path:[[6,9],[9,9]],head:1.9},
 {id:'levee',stack:[{kind:'levee'}],path:[[6,9],[9,9]],head:2.2},
 {id:'gate-1.5',stack:[{kind:'floodgate',maxHeight:2,height:1.5}],path:[[6,9],[9,9]],head:2.8},
 {id:'stacked-dams',stack:[{kind:'dam'},{kind:'dam'}],path:[[6,9],[9,9]],head:2.9},
 {id:'bent-foundations',stack:[{kind:'levee'},{kind:'dam'}],path:[[6,9],[7,9],[7,10],[9,10]],head:3.1,varying:true},
 {id:'roofed',stack:[{kind:'dam'}],path:[[6,9],[9,9]],head:4.9,roof:true}
];
const recipes:any[]=[],maps:JobMap[]=[],predictions:any[]=[];
for(const c of definitions){
 const floor=new Uint8Array(N).fill(7);for(let y=2;y<W;y++)for(let x=6;x<=9;x++)floor[y*W+x]=c.roof?4:1;
 if(c.varying)for(let y=9;y<=10;y++)for(let x=8;x<=9;x++)floor[y*W+x]=2;
 const voxels=voxelsFromHeights(floor,W,W);
 if(c.roof)for(let y=2;y<12;y++)for(let x=6;x<=9;x++)for(let z=1;z<3;z++)voxels[z*N+y*W+x]=0;
 const cols=waterColumns(W,W,voxels,[],23),levels=cols.L,tokens=new Array(levels*N).fill('0');
 for(let y=2;y<9;y++)for(let x=6;x<=9;x++){
  const i=y*W+x,top=(cols.count[i]-1)*N+i,d=Math.max(0,c.head-cols.floor[top]);
  if(d)tokens[top]=`${d}:0:0:${cols.floor[top]}:${d}`;
  if(c.roof)tokens[i]=`.2:0:0:1:.2`;
 }
 const singletons=emptySimulationSingletons(W,W,levels);
 (singletons.WaterMapNew as any).WaterColumns.Array=tokens.join(' ');
 const world:WorldModel={gameVersion:'1.1.2.4-52e959e-sw',timestamp:'2026-10-02 00:00:00',sizeX:W,sizeY:W,layers:23,voxels,entities:[],singletons};
 const map:MapSnapshot=fromWorld(world,c.id);map.startTiles=[2*W+2];
 const strokes:Stroke[]=[{path:c.path,stack:c.stack}],weather={provenance:'Calibration: no emitters, no colony consumption; explicit 90-day drought observation',frames:[{ticks:horizon,kind:'drought' as const,strengths:[],contamination:[]}]};
 const job=new SketchJob(map,strokes,weather);let r=job.result();
 const initial=(job as any).sim.columns();
 const scene={size:[W,W],layers:23,floor:[...floor],voxels:[...voxels],waterColumns:tokens,emitters:[],momentum:'all zero',start:[2,2,7],pieces:job.wall.pieces,
   postWallColumns:{floor:[...initial.floor],ceiling:initial.ceiling?[...initial.ceiling]:null,depth:[...initial.depth],overflow:initial.overflow?[...initial.overflow]:null}};
 writeFileSync(resolve(local,c.id+'-scene.json'),JSON.stringify(scene));
 const early:any[]=[];
 while(r.phase==='filling'){
  r=job.advance(8);
  if([128,192,384,768,1536].includes(r.ticks)){
   const columns=(job as any).sim.columns();early.push({tick:r.ticks,totalWaterM3:r.totalWaterM3,columns:[...new Set([7*W+7,10*W+7])].map(tile=>({tile,water:Array.from({length:columns.depth.length/N},(_,k)=>{const at=k*N+tile;return [columns.floor[at],columns.depth[at],columns.overflow?.[at]??0];})}))});
  }
 }
 const filled={ticks:r.fill.ticks,settled:r.fill.settled,volumeM3:r.reservoir.reduce((s,p)=>s+p.volumeM3,0),totalWaterM3:r.totalWaterM3,surfaceRanges:r.reservoir.map(p=>p.surfaceRange),tiles:r.reservoir.flatMap(p=>p.tiles),pieces:r.wall.counts,backend:r.backend};
 // Probe must sum columns at the fixed fill-time impoundment mask, never reselect wet tiles later.
 const mask=(job as any).storedTiles as number[],samples:any[]=[];
 const snapshot=()=>{const cols=(job as any).sim.columns();return {tick:r.ticks,phase:r.phase,reservoirM3:mask.reduce((s,i)=>{for(let k=i;k<cols.depth.length;k+=N)s+=cols.depth[k]+(cols.overflow?.[k]??0);return s;},0),columns:[...new Set([...mask,...[7*W+7,10*W+7]])].map(i=>({tile:i,water:Array.from({length:cols.depth.length/N},(_,k)=>{const at=k*N+i;return [cols.floor[at],cols.depth[at],cols.overflow?.[at]??0];})}))};};
 samples.push(snapshot());
 while(r.phase==='weather'){r=job.advance(128);if((r.ticks-filled.ticks)%768===0||r.phase==='complete')samples.push(snapshot());}
 const prediction={id:c.id,inputSha256:createHash('sha256').update(JSON.stringify(scene)).digest('hex'),filled,drought:r.drought,finalTotalM3:r.totalWaterM3,earlyChecks:early,measurementTiles:mask.map(i=>[i%W,Math.floor(i/W)]),sampledChecks:samples.map(s=>({tick:s.tick,reservoirM3:s.reservoirM3}))};
 predictions.push(prediction);writeFileSync(resolve(local,c.id+'-prediction.json'),JSON.stringify({prediction,samples}));
 const fillDay=D0+filled.ticks/768;
 maps.push({id:'sketch-'+c.id,title:'Dam sketch calibration: '+c.id,mapFile:resolve(local,'staged',c.id+'.timber'),faction:'Folktails',mode:'Normal',cycles:[{temperateDays:0,hazard:'drought',hazardDays:120}],endDay:fillDay+90+8/768,timeoutSeconds:1800,tiles:[...new Set([...mask,7*W+7,10*W+7])].map(i=>[i%W,Math.floor(i/W)] as [number,number]),sampleHours:24*8/768,moments:[{id:'initial',day:D0,snapshot:true,shots:[]},...early.map(e=>({id:'early-'+e.tick,day:D0+e.tick/768,snapshot:true,shots:[]})),{id:'fill',day:fillDay,snapshot:true,shots:[]},...Array.from({length:90},(_,k)=>({id:'dry-'+(k+1),day:fillDay+k+1,snapshot:true,shots:[]}))],actions:[],poses:[]});
 recipes.push({id:c.id,sceneFile:c.id+'-scene.json',placement:'Completed real dam/levee/floodgate pieces at listed x/y/z, bottom to top; gate selected height exactly 1.5. No construction delay or colony consumption.',initialWater:'Apply the explicitly supplied columns AFTER wall topology is present, clipping/remapping exactly as SketchJob initialization does. Before advancing, record and compare every water column, zero momentum and actual object placement.',roof:c.roof?'Keep the lower .2-depth chamber at floor 1 and the independent upper pool at floor 4. Compare both; a visible top-column snapshot alone cannot prove the roof case.':null});
 job.dispose();console.log(c.id,filled.volumeM3,r.drought?.coveredDays,r.drought?.censored?'censored':'dry');
}
const job:Job={version:1,runId:'dam-sketch-calibration-pending',createdAt:'2026-10-02T00:00:00Z',settings:{speed:99,lowGraphics:true,heartbeatSeconds:2,mapTimeoutSeconds:1800,quitWhenDone:true},maps};
writeFileSync(resolve(local,'probe-job-template.json'),JSON.stringify(job,null,2));
writeFileSync(resolve(dir,'calibration-batch.json'),JSON.stringify({status:'WRITTEN, NOT RUN; scene staging required',gameVersion:'1.1.2.4',probeSchema:1,initialDay:D0,ticksPerDay:768,recipes,predictions,tolerances:{waterLevelAbsolute:0.01,reservoirVolume:'max(0.05 m3, 1% of predicted volume)',dryOutDayAbsolute:8/768,wetDefinition:'depth + overflow > 0; no .05 pump/plant threshold',censored:'Must remain wet through all 90 observed days; never score the censoring horizon as a dry-out day',roof:'Compare all columns, including lower chamber; volume counts depth + overflow exactly once'},requiredProbeBridge:'The current Probe JobMap actions only delete entities; it cannot place finished player walls or restore specified column state. On the dedicated machine, stage verified scenes through a construction/state adapter before using this job template. Reject unstaged files or differing initial columns; do not run the unchanged terrain as if it contained a wall.'},null,2)+'\n');
const cells=(row:any[])=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');
writeFileSync(resolve(dir,'calibration-measurements.csv'),[cells(['case','fill_tick','settled','predicted_surface_ranges','predicted_volume_m3','predicted_dry_days','level_tolerance','volume_tolerance_m3','dry_day_tolerance','game_level','game_volume_m3','game_dry_days','verdict']),...predictions.map(p=>cells([p.id,p.filled.ticks,p.filled.settled,JSON.stringify(p.filled.surfaceRanges),p.filled.volumeM3,p.drought.coveredDays,.01,Math.max(.05,.01*p.filled.volumeM3),8/768,'','','','NOT RUN']))].join('\n')+'\n');
