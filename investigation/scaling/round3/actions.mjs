import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,openSync,readSync,writeSync,closeSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {FileResults} from '../round2/node-store.mjs';
const dir=fileURLToPath(new URL('.',import.meta.url)),out=resolve(dir,'../local/round3/runs'),L=await import(pathToFileURL(resolve(dir,'../local/round2/after.mjs')).href);
function* chunks(file){const fd=openSync(file,'r');try{for(;;){const b=new Uint8Array(32768),n=readSync(fd,b);if(!n)break;yield b.subarray(0,n);}}finally{closeSync(fd);}}
const gc=async()=>{await new Promise(r=>setImmediate(r));global.gc?.();await new Promise(r=>setImmediate(r));global.gc?.();};
const raw=s=>{const d=createHash('sha256'),b=s.built;for(const v of [b.heights,b.water,b.contamination,b.moisture,b.soilContamination])if(v)d.update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength));d.update(JSON.stringify(b.entities));d.update(JSON.stringify(s.features));const lava=L.rockOf(s);if(lava)d.update(new Uint8Array(lava.buffer,lava.byteOffset,lava.byteLength));d.update(JSON.stringify([...L.fallenOf(s)]));return d.digest('hex');};
for(const size of process.argv.slice(2).length?process.argv.slice(2).map(Number):[256,512]){
 const file=resolve(out,size+'-32.dgm'),oracle=JSON.parse(readFileSync(resolve(out,size+'-32.json'),'utf8')),data={size,rows:[],revision:'Final codec: UTF16 strings, distinct shared-component instances, full input hash version 2; old hashes remain version 1.'};
 const row=(name,at,ms,extra={})=>data.rows.push({name,at,ms,...extra});
 for(let repeat=1;repeat<=3;repeat++){
  const cold=new FileResults(resolve(out,`${size}-final-${repeat}.cache`));let h;
  try{
   await gc();let at=Date.now(),t=performance.now();h=await L.GestureHistory.open(chunks(file),cold);row('open',at,performance.now()-t,{repeat,replayed:0});assert.equal(raw(h.session),oracle.finalState);await gc();row('memory-open',Date.now(),null,{repeat,memory:process.memoryUsage(),cache:h.checkpointStats});
   at=Date.now();t=performance.now();h.apply([{op:'brush',params:{tool:'raise',size:5.5,strength:1,seed:9123,level:10,dabs:[200,200]}}]);row('first-edit',at,performance.now()-t,{repeat});const edited=raw(h.session);
   at=Date.now();t=performance.now();assert(h.undo());row('recent-undo',at,performance.now()-t,{repeat});assert.equal(raw(h.session),oracle.finalState);
   at=Date.now();t=performance.now();assert(h.redo());row('recent-redo',at,performance.now()-t,{repeat});assert.equal(raw(h.session),edited);h.undo();
   at=Date.now();t=performance.now();await h.seek(2047);row('deep-undo',at,performance.now()-t,{repeat,target:2047,...h.lastSeek});assert.equal(raw(h.session),oracle.trace[2047]);await h.seek(2048);assert.equal(raw(h.session),oracle.finalState);
   const destination=file+'.final-'+repeat,fd=openSync(destination,'w');at=Date.now();t=performance.now();try{await h.save(async b=>{let offset=0;while(offset<b.length)offset+=writeSync(fd,b,offset,b.length-offset);});}finally{closeSync(fd);}row('save',at,performance.now()-t,{repeat,bytes:statSync(destination).size});
   const savedCold=new FileResults(resolve(out,`${size}-saved-${repeat}.cache`));let saved;try{at=Date.now();t=performance.now();saved=await L.GestureHistory.open(chunks(destination),savedCold);row('saved-file-open',at,performance.now()-t,{repeat,replayed:0});assert.equal(raw(saved.session),oracle.finalState);assert.equal(createHash('sha256').update(saved.session.exportTimber().bytes).digest('hex'),oracle.exportHash);}finally{saved=null;savedCold.close();}
   // Explicitly drop the last action's controller before measuring post-close retention.
   h=null;await gc();row('memory-closed',Date.now(),null,{repeat,memory:process.memoryUsage()});
  }finally{h=null;cold.close();}
  writeFileSync(resolve(out,size+'-final-actions.json'),JSON.stringify(data,null,2));
 }
 data.passed=true;data.savedFileRoundTrips=true;writeFileSync(resolve(out,size+'-final-actions.json'),JSON.stringify(data,null,2));console.log('Final actions passed',size);
}
