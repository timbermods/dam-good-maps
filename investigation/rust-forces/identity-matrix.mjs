// Bounded, resumable identity/export shards; run after the timing gate.
// Completed case rows are reusable only for the exact current executable/bundle bytes.
import {readFileSync,writeFileSync,existsSync,readdirSync,createWriteStream} from 'node:fs';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {HERE,LOCAL,arg,hash,json} from './common.mjs';
const count=Number(arg('count','2000')),chunk=Number(arg('chunk','25')),parallel=Number(arg('parallel','6'));
if(![count,chunk,parallel].every(n=>Number.isInteger(n)&&n>0)||parallel>8)throw Error('Positive counts; at most eight concurrent shards on this shared PC');
const build=JSON.parse(readFileSync(resolve(LOCAL,'build.json')));
const bytes=names=>Buffer.concat(names.map(n=>readFileSync(resolve(LOCAL,n))));
const fingerprint=hash(bytes(['forces.wasm','api.cjs','api.js','worker.js','target/release/forces-batch.exe']));
const nativeFingerprint=hash(bytes(['forces.wasm','api.cjs','target/release/forces-batch.exe']));
const browserFingerprint=hash(bytes(['forces.wasm','worker.js']));
const cached=new Map();
for(const file of readdirSync(LOCAL).filter(n=>/^(checks|browser)-matrix-.*\.jsonl$/.test(n))){
 const lines=readFileSync(resolve(LOCAL,file),'utf8').split(/\r?\n/);
 for(let i=0;i<lines.length;i++){
  if(!lines[i])continue;let row;try{row=JSON.parse(lines[i]);}catch(error){if(i===lines.length-1)break;throw error;}
  const native=file.startsWith('checks-'),target=native?'native':row.engine;
  if(row.fingerprint!==(native?nativeFingerprint:browserFingerprint)||!native&&row.ok!==true)continue;
  const [verb,size,k,kind]=native?[row.verb,row.size,row.k,row.random?'random':'fixture']:row.id.split('/');
  if(kind!=='random'||!['glaciate','carve','erupt','craterize','quake'].includes(verb)||![128,256,512].includes(+size)||!Number.isInteger(+k)||+k<0||!/[a-f0-9]{64}/.test(row.sha256)||!row.error&&!/[a-f0-9]{64}/.test(row.exportSha256))continue;
  const key=[target,verb,+size,+k].join('/'),old=cached.get(key);
  if(old&&(old.sha256!==row.sha256||old.exportSha256!==row.exportSha256))throw Error('Conflicting current-build checkpoint '+key);
  cached.set(key,row);
 }
}
console.log('Reusable current-build cases:',cached.size);
const jobs=[];
// Cover every force/size early, then deepen all of them to the required count.
for(let start=0;start<count;start+=chunk)for(const size of [512,256,128])for(const verb of ['glaciate','carve','erupt','craterize','quake'])for(const target of ['native','chromium','firefox','webkit']){
 const n=Math.min(chunk,count-start),name=`matrix-${target}-${verb}-${size}-${start}-${n}`,prefix=target==='native'?'checks':'browser';
 jobs.push({target,verb,size,start,count:n,name,file:prefix+'-'+name+'.json',manifest:name+'-build.json'});
}
let next=0,completed=0,failed=null;const shards=[];
const saveProgress=()=>json('matrix-progress.json',{fingerprint,completed,total:jobs.length,failed});
async function worker(){while(!failed&&next<jobs.length){const job=jobs[next++],file=resolve(LOCAL,job.file),manifest=resolve(LOCAL,job.manifest),prefix=[];
 for(let k=job.start;k<job.start+job.count;k++){const r=cached.get([job.target,job.verb,job.size,k].join('/'));if(!r)break;prefix.push(r);}
 const outputRows=rows=>job.target==='native'?rows:{rows,build,fingerprint};
 if(prefix.length===job.count){json(job.file,outputRows(prefix));json(job.manifest,{fingerprint,build});shards.push({...job,sha256:hash(readFileSync(file))});completed++;saveProgress();continue;}
 const args=[job.target==='native'?'check.mjs':'browser.mjs','--verbs',job.verb,'--sizes',String(job.size),'--start',String(job.start+prefix.length),'--count',String(job.count-prefix.length),'--random','--exports','--name',job.name,...(job.target==='native'?['--server']:['--engines',job.target])];
 const logPath=resolve(LOCAL,job.name+'.log'),log=createWriteStream(logPath,{flags:'w'});
 const jsonl=resolve(LOCAL,(job.target==='native'?'checks-':'browser-')+job.name+'.jsonl');
 writeFileSync(jsonl,prefix.map(r=>JSON.stringify(r)+'\n').join(''));
 const code=await new Promise((done,reject)=>{const child=spawn(process.execPath,args,{cwd:HERE,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.on('error',reject);child.on('exit',done);});
 await new Promise(r=>log.end(r));
 if(code!==0){failed={...job,code,log:logPath};saveProgress();console.error('IDENTITY FAILED',job.name,readFileSync(logPath,'utf8').slice(-3000));continue;}
 const data=JSON.parse(readFileSync(file)),fresh=job.target==='native'?data:data.rows,rows=[...prefix,...fresh];
 if(rows.length!==job.count||rows.some((r,i)=>(job.target==='native'?r.k:+r.id.split('/')[2])!==job.start+i))throw Error('Incomplete or unordered successful shard '+job.name);
 json(job.file,outputRows(rows));json(job.manifest,{fingerprint,build});shards.push({...job,sha256:hash(readFileSync(file))});completed++;
 console.log(`Identity shards ${completed}/${jobs.length}: ${job.name} PASS (${prefix.length} resumed)`);saveProgress();
}}
await Promise.all(Array.from({length:parallel},worker));
if(failed){json('matrix-failure.json',failed);throw Error('Stopped scheduling after identity failure: '+failed.name);}
const checks=[],browsers=[];
for(const job of jobs){const data=JSON.parse(readFileSync(resolve(LOCAL,job.file)));(job.target==='native'?checks:browsers).push(...(job.target==='native'?data:data.rows));}
json('checks-random-final.json',checks);json('browser-random-final.json',{rows:browsers,build,fingerprint});
json('identity-matrix.json',{status:'pass',fingerprint,build,count,chunk,parallel,cases:checks.length,browserComparisons:browsers.length,shards});
console.log('Complete identity/export matrix:',checks.length,'native/Node-Wasm and',browsers.length,'browser cases');
