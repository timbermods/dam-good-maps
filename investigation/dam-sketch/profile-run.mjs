import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {HERE,LOCAL,json,localJson,hash,loadSampler} from './round2-common.mjs';
import {resolve} from 'node:path';
const sampler=loadSampler();
try{
 await sampler.ready();
 const start=Date.now(),child=spawn(process.execPath,['local/profile-round2.cjs'],{cwd:HERE,stdio:'inherit',windowsHide:true});
 const code=await new Promise(r=>child.on('exit',r));if(code!==0)throw Error('Identity profiler failed '+code);
 const raw=JSON.parse(readFileSync(resolve(LOCAL,'profile-results.json')));
 const rows=raw.rows.map(row=>({...row,load:sampler.summary(row.started,row.ended)}));
 json('profile-timings.json',{method:'Paired diagnostic runs, before then after; one pass per actual round-one map/wall. Includes lossless result/column hashing and profiler overhead: not a browser latency benchmark. runtimeMs alone is excluded. Distinct typed-array bytes, negative zero and nonfinite numbers are preserved by the digest. No physics or traversal-order changes.',load:sampler.summary(start),comparisons:raw.comparisons,allBytesEqual:true,rows,totals:raw.totals,exclusiveSamples:raw.exclusiveSamples,rawProfileSha256:hash(readFileSync(resolve(LOCAL,'round2.cpuprofile')))});
 localJson('profile-with-load.json',{...raw,rows});
}finally{sampler.stop();}
