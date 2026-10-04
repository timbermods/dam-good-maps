import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {HERE,LOCAL,deps,hash,json} from './common.mjs';
// Compute native weather maths ONCE in Node. Browsers consume identical binary64 bytes.
const archive=resolve(process.env.DGM_CHECKS),reference=deps(resolve(archive,'fast.cjs')),p=deps(resolve(LOCAL,'protocol.cjs'));
const job=p.decodeJob(new Uint8Array(readFileSync(resolve(archive,'checks/m9b-lakeBasin-128-1-badtide.in'))));
const commands=Array.from({length:256},(_,i)=>({ticks:1,emitters:job.model.emitters.map(e=>({...e,contamination:e.contamination===0?reference.badtideContamination(i/768,8):e.contamination})),capture:i===255}));
const forcingDistinct=job.model.emitters.map((_,i)=>new Set(commands.map(c=>c.emitters[i].contamination)).size);
if(!forcingDistinct.some(n=>n>1))throw Error('Weather probe must exercise varying transcendental forcing');
const input=p.encodeJob(job.model,job.initial,job.opts,commands,job.out),sim=new reference.WaterSim(structuredClone(job.model),job.initial,job.opts);sim.out.set(job.out);
for(const c of commands){for(let i=0;i<sim.emitters.length;i++)Object.assign(sim.emitters[i],c.emitters[i]);sim.run(1);}
const expected=p.packSnapshots([p.snapshot(sim)]),folder=resolve(LOCAL,'weather-checks');mkdirSync(folder,{recursive:true});
writeFileSync(resolve(folder,'weather-one-tick.in'),input);writeFileSync(resolve(folder,'weather-one-tick.expected'),expected);
json('weather-input.json',{id:'weather-one-tick',W:128,H:128,ticks:256,input:hash(input),expected:hash(expected),forcingDistinct,forcing:'256 one-tick badtide updates on the initial rising curve, computed once in Node, identical input bytes in all engines'});
