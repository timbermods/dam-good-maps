import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {cpus,freemem} from 'node:os';
import {loadSampler} from './load.mjs';
import {HERE,LOCAL,deps,arg,hash,json} from './common.mjs';
const build=JSON.parse(readFileSync(resolve(LOCAL,'build.json'))),nativeSha256=hash(readFileSync(resolve(LOCAL,'target/release/forces-batch.exe')));
const api=deps(resolve(LOCAL,'api.cjs')),reps=Number(arg('reps','3')),rows=[],sampler=loadSampler();
try{for(const verb of arg('verbs','footprint,craterize,erupt,quake').split(','))for(const size of arg('sizes','128,256,512').split(',').map(Number))for(const k of arg('cases','0').split(',').map(Number)){
 const j=api.job(verb,size,k);j.settings.power=100;if(verb==='erupt'||verb==='craterize')j.settings.size=null;
 const input=api.encode(j),expected=api.encode(api.referenceWithRecord(j)),preWarmup={ts:[]};j.trace=false;let result;for(let p=0;p<3;p++){const t=performance.now();result=api.referenceWithRecord(j);preWarmup.ts.push(performance.now()-t);}writeFileSync(resolve(LOCAL,'bench-input.bin'),input);
 const times={ts:[]};for(let w=0;w<5;w++)api.referenceWithRecord(j);sampler.reset();await sampler.observe();for(let r=0;r<reps;r++){const t=performance.now();api.referenceWithRecord(j);times.ts.push(performance.now()-t);}
 const processResult=await promisify(execFile)(resolve(LOCAL,'target/release/forces-batch.exe'),['--bench-plan',resolve(LOCAL,'bench-input.bin'),resolve(LOCAL,'bench-output.bin'),String(reps)],{encoding:'utf8',windowsHide:true}),measurement=JSON.parse(processResult.stderr.trim());times.native=measurement.times;times.nativeCompute=measurement.compute;if(!times.nativeCompute)throw Error("Rebuild native with --features bench-clock");preWarmup.native=measurement.preWarmup;
 if(!Buffer.from(expected).equals(readFileSync(resolve(LOCAL,'bench-output.bin'))))throw Error('Timed native bytes changed');await sampler.observe();const row={verb,size,k,times,preWarmup,sha256:hash(expected),load:{...sampler.summary(),freeMemory:freemem()}};rows.push(row);appendFileSync(resolve(LOCAL,'native-'+arg('name','bench')+'.jsonl'),JSON.stringify(row)+'\n');console.log(verb,size,k,times);
}json('native-'+arg('name','bench')+'.json',{rows,build,nativeSha256,machine:cpus()[0].model,logicalCores:cpus().length});}finally{sampler.stop();}
