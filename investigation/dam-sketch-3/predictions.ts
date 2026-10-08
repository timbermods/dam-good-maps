import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {loadKernel} from './kernel.ts';
import {createJob} from './engine.ts';
import {channel,scenes,drought} from './scenes.ts';
const folder=import.meta.dirname,local=resolve(folder,'local/calibration');mkdirSync(local,{recursive:true});
const kernel=loadKernel(readFileSync(resolve(folder,'local/kernel/rust/target/wasm32-unknown-unknown/release/water.wasm')));
const json=(v:unknown)=>JSON.stringify(v,(_key,value)=>ArrayBuffer.isView(value)?Array.from(value as unknown as ArrayLike<number>):value,2)+'\n';
const summary=[];
for(const scene of scenes){
 const map=channel(),job=createJob(kernel,map,[scene.stroke],{drought});const initial=job.result();let r=initial;
 const checkpoints=[];
 while(r.phase==='filling'){r=job.advance(128);if([128,384,768].includes(r.ticks))checkpoints.push({tick:r.ticks,water:r.water});}
 const filled=r,mask=r.reservoir.filter(c=>c.volumeM3>0).map(c=>c.column);
 while(r.phase==='drought'){r=job.advance(Math.min(128,768-r.ticks%768));if((r.ticks-filled.ticks)%768===0||r.phase==='complete')checkpoints.push({tick:r.ticks,water:r.water});}
 const recipe={id:scene.id,map,stroke:scene.stroke,postWall:initial.water,fill:filled,drought:r.drought,measurementColumns:mask,checkpoints};
 writeFileSync(resolve(local,scene.id+'.json'),json(recipe));
 summary.push({id:scene.id,fillTicks:filled.fill!.ticks,settled:filled.fill!.settled,crest:scene.crest,waterHeldM3:filled.waterHeldM3,tiles:filled.wall.tiles,pieces:filled.wall.counts,surfaceRange:[Math.min(...filled.reservoir.map(c=>c.surface)),Math.max(...filled.reservoir.map(c=>c.surface))],dryDays:r.drought!.coveredDays,recipeSha256:createHash('sha256').update(json(recipe)).digest('hex')});
 job.dispose();
}
writeFileSync(resolve(local,'summary.json'),json(summary));
if(process.argv.includes('--summary'))writeFileSync(resolve(folder,'predictions-summary.json'),json(summary));
console.log('Wrote five original recipes and exact column checkpoints under local/calibration/. No game execution.');
