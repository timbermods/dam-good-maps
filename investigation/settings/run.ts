import { generate } from '../../src/core/gen/generate';
import { measure } from '../../src/core/analysis/metrics';
import { makeSpec, THEMES, highestTerrainDefault, type MapSpec } from '../../src/core/spec/mapspec';
import { mapObjects } from '../../src/core/sim/model';
import { entityJson } from '../../src/core/format/entities';
import { EXPERIMENTS, runExperiment, seedsFor } from '../../tools/settings-suite';
import { encodeSpecFragment as encodeSpec, decodeSpecFragment as decodeSpec } from '../../src/core/spec/codec';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
declare const SETTINGS_BUILD:{base:string;mode:string;overlayHash:string};
const arg=process.argv[2]??'smoke';
const out=resolve(process.argv[3]??'investigation/settings/local/results');mkdirSync(out,{recursive:true});
const mean=(a:number[])=>a.reduce((s,x)=>s+x,0)/a.length;
const hash=(a:Uint8Array)=>createHash('sha256').update(a).digest('hex');
function one(spec:MapSpec,id:string,repeat=false){
 const start=performance.now(), cpuStart=process.cpuUsage(); let landMs=0, landCalls=0; let firstLand:Uint8Array|null=null;
 const r=generate(spec,{onLand:land=>{landCalls++;landMs=performance.now()-start;firstLand=land.heights.slice();}});
 const ms=performance.now()-start,cpuUsed=process.cpuUsage(cpuStart);
 const cpuShare=Math.min(1,(cpuUsed.user+cpuUsed.system)/1000/Math.max(1,ms)),m=measure(r),b=r.built;
 const checks=r.report.checks.filter(c=>!c.ok).map(c=>({id:c.id,advisory:c.advisory,value:c.value,message:c.message}));
 const row={id,build:SETTINGS_BUILD,size:spec.size.x,theme:spec.theme,seed:spec.seed,vt:spec.settings.terrain.verticality,lakes:(spec.settings.water as any).lakeAmount??spec.settings.water.lakes,
 landCalls,landChanged:firstLand?b.heights.reduce((n,v,i)=>n+(v!==firstLand![i]&&!r.info.worn?.cut.includes(i)?1:0),0):null,fixes:r.info.fixes,
 cpu:{share:cpuShare,land:landMs*cpuShare,water:r.timings.firstWater*cpuShare,final:ms*cpuShare},
 ms,landMs,relief:m.heightRange,cliffs:m.cliffShare,max:m.maxHeight,min:Math.min(...b.heights),basins:m.basins20,water:m.waterShare,
 waterVolume:b.water.reduce((a,v)=>a+v,0),settled:b.settle.settled,ticks:b.settle.ticks,passed:r.report.passed,checks,outcomes:r.outcomes,attempts:r.attempts,
 failures:r.failures,stage:r.info.stage,hydro:r.info.hydro,timings:r.timings,
 hash:hash(r.bytes),deterministic:repeat?hash(r.bytes)===hash(generate(spec).bytes):null};
 writeFileSync(resolve(out,id+'.json'),JSON.stringify(row));
 writeFileSync(resolve(out,id+'.map.json'),JSON.stringify({heights:Array.from(b.heights),water:Array.from(b.water),contamination:Array.from(b.contamination),objects:mapObjects({entities:b.entities.map(entityJson)})}));
 console.log(JSON.stringify(row));return row;
}
if(arg==='experiment-maps'){
 const names=process.env.SETTINGS_EXPERIMENTS?.split(',')??['Verticality','Lakes and basins'];
 const rows:any[]=[];
 for(const e of EXPERIMENTS.filter(e=>names.includes(e.setting)))for(const seed of seedsFor(e,[1,2,3,4]))for(const value of e.values){
  const spec=makeSpec({theme:e.theme,seed,size:{x:96,y:96}});e.apply(spec,value);
  rows.push(one(spec,`nightly-${e.setting.toLowerCase().replaceAll(' ','-')}-${seed}-${value}`));
  writeFileSync(resolve(out,'summary.json'),JSON.stringify(rows,null,2));
 }
}else if(arg==='experiments'||arg==='adjacent'){
 const names=process.env.SETTINGS_EXPERIMENTS?.split(',')??(arg==='adjacent'?['Relief','Highest terrain','Terracing','Buildable land']:['Verticality','Lakes and basins']);
 const rows=EXPERIMENTS.filter(e=>names.includes(e.setting)).map(e=>runExperiment(e,seedsFor(e,[1,2,3,4]),96));
 writeFileSync(resolve(out,'experiments.json'),JSON.stringify(rows,null,2)); console.log(JSON.stringify(rows));
 process.exitCode=rows.every(r=>r.ok&&r.failed===0)?0:1;
}else if(arg==='sweep'||arg==='smoke'||arg==='baseline-sweep'||arg==='default'){
 const rows:any[]=[];const values=process.env.SETTINGS_VALUES?.split(',').map(Number)??(arg==='smoke'?[0,100]:[0,25,50,75,100]);
 const seeds=process.env.SETTINGS_SEEDS?.split(',').map(Number)??(arg==='smoke'?[1]:[1,2,3,4,5]);
 const themes=process.env.SETTINGS_THEMES?THEMES.filter(t=>process.env.SETTINGS_THEMES!.split(',').includes(t)):THEMES;
 for(const setting of (arg==='default'?['default']:(process.env.SETTINGS_CONTROLS?.split(',')??['verticality','lakes']))) for(const theme of themes)for(const seed of seeds)for(const value of (arg==='default'?[50]:values)){
  const side=Number(process.env.SETTINGS_SIZE??128);
  const spec=makeSpec({theme,seed,size:{x:side,y:side}});
  if(setting==='verticality'){spec.settings.terrain.verticality=value;spec.settings.terrain.highestTerrain=highestTerrainDefault(value);}
  if(process.env.SETTINGS_HIGHEST)spec.settings.terrain.highestTerrain=Number(process.env.SETTINGS_HIGHEST);
  else if(arg==='baseline-sweep')spec.settings.water.lakes=value===0?'none':value===25?'few':value===100?'many':'some';
  else if(setting==='lakes') (spec.settings.water as any).lakeAmount=value;
  const id=`${setting}-${theme}-${seed}-${value}`;
  rows.push(one(spec,id,arg==='smoke'));
  writeFileSync(resolve(out,'summary.json'),JSON.stringify(rows,null,2));
 }
 console.log('Finished '+rows.length+' maps.');
}else if(arg==='codec'){
 const s=makeSpec({seed:1}); (s.settings.water as any).lakeAmount=75;
 const encoded=encodeSpec(s),decoded=decodeSpec(encoded);
 console.log(JSON.stringify({encoded,decoded}));
 if(!decoded||(decoded.spec.settings.water as any).lakeAmount!==75||decoded.problems.length)throw Error('lakeAmount did not roundtrip');
}
