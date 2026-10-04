import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {cpus,freemem} from 'node:os';
import {HERE,LOCAL,arg,json,hash} from './common.mjs';
import {loadSampler} from './load.mjs';
const cases=JSON.parse(readFileSync(resolve(LOCAL,'checks.json'))).cases;
const exe=process.env.DGM_NATIVE??resolve(LOCAL,'target/release/water-batch'+(process.platform==='win32'?'.exe':''));
const threads=Number(arg('threads',String(cpus().length)));
const sampler=loadSampler();
const call=args=>new Promise((res,rej)=>{const start=performance.now(),p=spawn(exe,args,{windowsHide:true});let stderr='';p.stderr.on('data',b=>stderr+=b);p.on('error',rej);p.on('exit',c=>c?rej(Error(stderr)):res({ms:performance.now()-start,stderr}));});
try{writeFileSync(resolve(LOCAL,'native-manifest.tsv'),cases.map(c=>`${resolve(LOCAL,'checks',c.id+'.in')}\t${resolve(LOCAL,'checks',c.id+'.native')}`).join('\n'));const r=await call(['--batch',resolve(LOCAL,'native-manifest.tsv'),String(threads)]);
 for(const c of cases){const expected=readFileSync(resolve(LOCAL,'checks',c.id+'.expected')),actual=readFileSync(resolve(LOCAL,'checks',c.id+'.native'));assert.ok(actual.equals(expected),c.id+' native bytes');assert.equal(hash(actual),c.expected);}
 json('native.json',{cases:cases.length,commands:cases.reduce((s,c)=>s+c.commands,0),checkpoints:cases.reduce((s,c)=>s+c.captures,0),threads,...r,status:'pass'});console.log('Native',cases.length,'cases PASS',r);
 if(process.argv.includes('--bench')){const batch=cases.filter(c=>/^m9b-.*-(96|128|256)-\d+$/.test(c.id)&&!/-live$/.test(c.id));assert.equal(batch.length,840,'full M9b batch required');writeFileSync(resolve(LOCAL,'native-bench.tsv'),batch.map(c=>`${resolve(LOCAL,'checks',c.id+'.in')}\t${resolve(LOCAL,'checks',c.id+'.native')}`).join('\n'));const rows=[];
 for(const n of [1,threads])for(let rep=0;rep<Number(arg('reps','3'));rep++){sampler.reset();const r=await call(['--batch',resolve(LOCAL,'native-bench.tsv'),String(n)]);rows.push({threads:n,rep,...r,load:{...sampler.summary(),freeMemory:freemem()}});console.log('native batch',n,rep,r.ms);json('native-bench.json',{machine:cpus()[0].model,rows});}
 }
}finally{sampler.stop();}
