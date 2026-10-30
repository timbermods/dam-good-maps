import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,openSync,readSync,writeSync,closeSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {FileResults} from '../round2/node-store.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),out=resolve(dir,'../local/round3',process.env.SCALING_R3_OUT??'runs');mkdirSync(out,{recursive:true});
const size=Number(process.argv[2]??256),spacing=Number(process.argv[3]??32),limit=Number(process.env.SCALING_R3_STEPS??2048),name=`${size}-${spacing}`;
const L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href);
const source=resolve(dir,`../local/round2/accepted/after-${size}-1-128.damgoodmaps.json`),baseline=JSON.parse(readFileSync(source.replace('.damgoodmaps.json','.json'),'utf8'));
function* chunks(file){const fd=openSync(file,'r');try{for(;;){const b=new Uint8Array(32768),n=readSync(fd,b);if(!n)break;yield b.subarray(0,n);}}finally{closeSync(fd);}}
const original=await L.readProject(chunks(source)),cold=new FileResults(resolve(out,name+'.cache'));
const h=new L.GestureHistory(original.base,cold,'round3-'+size,0,{checkpointEvery:spacing}),s=h.session;
const hash=b=>createHash('sha256').update(b).digest('hex');
function raw(session,extra=false){const b=session.built,d=createHash('sha256');for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination])if(v)d.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));d.update(JSON.stringify(b.entities));d.update(JSON.stringify(session.features));if(extra){const lava=L.rockOf(session);if(lava)d.update(new Uint8Array(lava.buffer,lava.byteOffset,lava.byteLength));d.update(JSON.stringify([...L.fallenOf(session)]));}return d.digest('hex');}
const data={size,spacing,steps:limit,pid:process.pid,started:Date.now(),rows:[],trace:[raw(s,true)],baseTrace:[raw(s)],forces:{},checkpoints:[]};
const row=(name,at,ms,extra={})=>data.rows.push({name,at,ms,...extra});
const record=()=>writeFileSync(resolve(out,name+'.json'),JSON.stringify(data,null,2));
function memory(step){global.gc?.();row('memory',Date.now(),null,{step,memory:process.memoryUsage(),maxRSS_KiB:process.resourceUsage().maxRSS,cache:h.results.stats,checkpoints:h.checkpointStats,disk:cold.end});record();console.log(name,'step',step,h.checkpointStats);}
try{
memory(0);
for(let n=1;n<=Math.min(limit,original.entries.length);n++){
 const at=Date.now(),t=performance.now(),e=original.entries[n-1];await h.replayEntry(e);row('edit',at,performance.now()-t,{step:n,kind:e.kind});
 const state=raw(s);assert.equal(state,baseline.trace[n-1],'Round 2 forward state '+n);data.baseTrace.push(state);data.trace.push(raw(s,true));if(e.kind==='force')data.forces[e.gesture.verb]=(data.forces[e.gesture.verb]??0)+1;
 if([64,256,512,1024,1536,2048].includes(n)||n===limit)memory(n);
}
const preCanonical=raw(s,true);s.settleCanonical();data.finalState=raw(s,true);data.canonicalChanges=preCanonical!==data.finalState;data.exportHash=hash(s.exportTimber().bytes);if(limit===2048)assert.equal(data.exportHash,baseline.final.exportHash);
const file=resolve(out,name+'.dgm');let at=Date.now(),t=performance.now(),fd=openSync(file,'w');try{await h.save(async b=>writeSync(fd,b));}finally{closeSync(fd);}row('save',at,performance.now()-t,{bytes:statSync(file).size});data.bytes=statSync(file).size;data.checkpoints=h.checkpointStats;data.trace[data.trace.length-1]=data.finalState;record();
const targets=[h.count-1,Math.min(h.count-2,2000),Math.min(h.count-3,1535),Math.min(h.count-4,1023),Math.min(h.count-5,511),Math.min(h.count-6,127),1,0,h.count].filter(n=>n>=0);
for(let repeat=1;repeat<=3;repeat++){
 const disk=new FileResults(resolve(out,`${name}-open-${repeat}.cache`));try{
  at=Date.now();t=performance.now();const opened=await L.GestureHistory.open(chunks(file),disk);row('open',at,performance.now()-t,{repeat,replayed:0});assert.equal(raw(opened.session,true),data.finalState);
  const op={op:'brush',params:{tool:'raise',size:5.5,strength:1,seed:9123,level:10,dabs:[200,200]}};at=Date.now();t=performance.now();opened.apply([op]);row('first-edit',at,performance.now()-t,{repeat});assert(opened.undo());assert.equal(raw(opened.session,true),data.finalState);
  // Branching cleared redo; use a fresh opening for historical seeks.
  const historical=await L.GestureHistory.open(chunks(file),disk);
  for(const target of targets){at=Date.now();t=performance.now();await historical.seek(target);row('seek',at,performance.now()-t,{repeat,target,...historical.lastSeek});assert.equal(raw(historical.session,true),data.trace[target],'cold seek '+target);}
  at=Date.now();t=performance.now();await historical.seek(h.count-1);row('undo-recent',at,performance.now()-t,{repeat});at=Date.now();t=performance.now();await historical.seek(h.count);row('redo-recent',at,performance.now()-t,{repeat});assert.equal(raw(historical.session,true),data.finalState);
  fd=openSync(file+'.repeat-'+repeat,'w');at=Date.now();t=performance.now();try{await historical.save(async b=>writeSync(fd,b));}finally{closeSync(fd);}row('save-repeat',at,performance.now()-t,{repeat,bytes:statSync(file+'.repeat-'+repeat).size});record();
 }finally{disk.close();}
}
data.passed=true;memory('done');console.log('DONE',name,data.bytes,data.exportHash);
}catch(error){data.error={message:String(error),stack:error.stack};record();throw error;}finally{cold.close();}
