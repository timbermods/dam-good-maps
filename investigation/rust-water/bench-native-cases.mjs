import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {HERE,LOCAL,deps,api,arg,json,hash} from './common.mjs';
import {loadSampler} from './load.mjs';
const p=deps(resolve(LOCAL,'protocol.cjs')),variants={old:api('old'),fast:api()},cases=JSON.parse(readFileSync(resolve(LOCAL,'checks.json'))).cases.filter(c=>/^m9b-(riverValley|lakeBasin|islands)-(96|128|256)-1$/.test(c.id)||/^stress-.*-512$/.test(c.id));
const reps=Number(arg('reps','3')),rows=[],sampler=loadSampler();
function run(a,input){const job=p.decodeJob(input),sim=new a.WaterSim(job.model,job.initial,job.opts);sim.out.set(job.out);const result=a.settle(sim,job.commands[0].settle);return p.packSnapshots([p.snapshot(sim,result)]);}
try{for(const c of cases){const input=readFileSync(resolve(LOCAL,'checks',c.id+'.in')),times={old:[],fast:[],native:[]};sampler.reset();
 for(const variant of ['old','fast']){run(variants[variant],input);for(let rep=0;rep<reps;rep++){const t=performance.now(),out=run(variants[variant],input);times[variant].push(performance.now()-t);assert.equal(hash(out),c.expected,c.id+'/'+variant);}}
 const result=await new Promise((res,rej)=>{const exe=process.env.DGM_NATIVE??resolve(LOCAL,'target/release/water-batch'+(process.platform==='win32'?'.exe':'')),proc=spawn(exe,['--bench',resolve(LOCAL,'checks',c.id+'.in'),resolve(LOCAL,'checks',c.id+'.native'),String(reps)],{windowsHide:true});let err='';proc.stderr.on('data',b=>err+=b);proc.on('error',rej);proc.on('exit',code=>code?rej(Error(err)):res(JSON.parse(err)));});times.native=result.times;assert.equal(hash(readFileSync(resolve(LOCAL,'checks',c.id+'.native'))),c.expected);rows.push({id:c.id,size:c.W,times,load:sampler.summary()});json('native-cases.json',{rows});console.log(c.id,times);}}
finally{sampler.stop();}
