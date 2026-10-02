import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {HERE,LOCAL,hash} from './common.mjs';
const read=name=>JSON.parse(readFileSync(resolve(LOCAL,name+'.json'),'utf8'));
const median=a=>{a=[...a].sort((x,y)=>x-y);return a.length%2?a[a.length>>1]:(a[a.length/2-1]+a[a.length/2])/2;};
const rootHash=directory=>hash(readdirSync(resolve(LOCAL,directory)).filter(n=>n.endsWith('.json')).sort().map(n=>n+'\0'+hash(readFileSync(resolve(LOCAL,directory,n)))+'\n').join(''));
const batch=read('batch-summary'),survey=read('survey-summary'),forced=read('forced-summary'),weather=read('weather-summary'),bench=read('benchmark-summary'),slow=read('slow-benchmark-summary'),gen=read('generation-summary'),runtime=read('runtime-summary'),isolation=read('isolation'),fallback=read('fallback'),curves=read('curve-probe'),failure=read('failure'),inputs=read('m9b-generation');
for(const [name,data,complete]of [['batch',batch,1050],['survey',survey,52],['forced',forced,24],['weather',weather,9],['benchmark',bench,21],['slow-benchmark',slow,6],['generation',gen,6],['runtime',runtime,1]]){
  assert.equal(data.complete,complete,name+' incomplete');assert.equal(data.errors.length,0,name+' errors');
  if(name!=='generation')assert.equal((data.crossEngine??data.mismatches).length,0,name+' identity mismatch');
}
const evidence={
  base:'6c29b7e5',faster:'ed6fc4fb',determinism:'f306fd49',
  machine:{cpu:os.cpus()[0].model,logical:os.cpus().length,memoryGiB:os.totalmem()/2**30,os:os.type()+' '+os.release(),node:process.version},
  sources:Object.fromEntries(['water.ts','runtime.ts','helper.ts','isolation-sw.js','isolation-register.js','adoption.patch','coordinator.ts','weather-coordinator.ts','generation-coordinator.ts'].map(n=>[n,hash(readFileSync(resolve(HERE,n),'utf8').replaceAll('\r\n','\n'))])),
  engines:batch.engines,counts:Object.values(batch.engines)[0].counts,
  timingContext:'Investigation verification/input/timing jobs sequenced; other host activity uncontrolled. Three pairs at 128/256, one long pair at 512.',
  inputs:{complete:inputs.complete,refused:inputs.cases.filter(r=>!r.passed).length,api:inputs.fingerprint,recordsRoot:rootHash('m9b-inputs')},
  suites:{},isolation:isolation.engines,fallback,failure,forcingCounterexample:curves.mismatches,
  slowSelection:read('slow-selection'),
  benchmark:[],generation:gen.comparisons.map(({engine,id,requested,threads,hash,waterHash,exportHash,ticks,settled,passed,bytes,startupMs,baseline,candidate})=>({engine,id,requested,threads,hash,waterHash,exportHash,ticks,settled,passed,bytes,startupMs,baseline,candidate})),
  generationCrossEngine:gen.crossEngine,
};
for(const [name,data]of Object.entries({batch,survey,forced,weather,benchmark:bench,'slow-benchmark':slow,generation:gen,runtime})){
  evidence.suites[name]={build:data.build,complete:data.complete,records:data.comparisons?.length??1050*15,tickOrSliceChecks:data.comparisons?.reduce((s,r)=>s+(r.checks??0),0),directScalarChecks:data.comparisons?.reduce((s,r)=>s+(r.directChecks??0),0),frameHashes:data.comparisons?.reduce((s,r)=>s+(r.rows?.length??0),0),errors:data.errors.length,mismatches:(data.crossEngine??data.mismatches).length,recordsRoot:rootHash(name)};
}
const groups=new Map();
for(const [cohort,data]of Object.entries({representative:bench,'lake-tail':slow}))for(const r of data.comparisons){const key=cohort+'|'+r.engine+'|'+r.id+'|'+r.requested;const group=groups.get(key)??[];group.push(r);groups.set(key,group);}
for(const [key,rows]of groups){
  assert.equal(rows.length,key.includes('-512|')?1:3,'paired samples required: '+key);
  const [cohort,engine,id,t]=key.split('|');
  evidence.benchmark.push({cohort,engine,id,threads:+t,ticks:rows[0].ticks,settled:rows[0].result?.settled,n:rows.length,scalarMs:median(rows.map(r=>r.fastMs)),parallelMs:median(rows.map(r=>r.parallelMs)),pairedSpeedup:median(rows.map(r=>r.fastMs/r.parallelMs)),range:rows.map(r=>r.fastMs/r.parallelMs).sort((a,b)=>a-b),startupMs:rows.map(r=>r.startupMs),dispatch:rows.map(r=>r.dispatch)});
}
writeFileSync(resolve(HERE,'EVIDENCE.json'),JSON.stringify(evidence,null,2)+'\n');
console.log('Engine,size,threads,median paired speedup over faster scalar');
for(const engine of Object.keys(batch.engines))for(const size of[128,256,512])console.log(engine,size,...[1,2,4,8,16].map(t=>median(evidence.benchmark.filter(r=>r.cohort==='representative'&&r.engine===engine&&r.threads===t&&r.id.includes('-'+size)).map(r=>r.pairedSpeedup)).toFixed(2)));
console.log('Complete compact evidence; large records remain ignored under local/');
