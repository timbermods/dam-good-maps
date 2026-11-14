// Re-encode retained deltas/current state using the final bounded codec; no gesture replay.
import assert from 'node:assert/strict';
import {readFileSync,openSync,readSync,writeSync,closeSync,statSync} from 'node:fs';
import {FileResults} from '../round2/node-store.mjs';
import * as L from '../local/round2/after.mjs';
function* chunks(path){const fd=openSync(path,'r');try{for(;;){const b=new Uint8Array(32768),n=readSync(fd,b);if(!n)break;yield b.subarray(0,n);}}finally{closeSync(fd);}}
for(const size of process.argv.slice(2).length?process.argv.slice(2).map(Number):[256,512]){const path='investigation/scaling/local/round4/'+(process.env.SCALING_R4_FIXTURES??'final')+'/'+size+'-0',oracle=JSON.parse(readFileSync(path+'.json'));assert(oracle.passed);const disk=new FileResults(path+'-normalize.cache');try{
 const h=await L.GestureHistory.open(chunks(path+'.dgm'),disk);
 const head=h.count,original=h.session.exportTimber().bytes;
 while(h.count>h.undoFloor){const at=h.count,after=h.session.checkpointExecution();assert(h.undo());const before=h.session.checkpointExecution();h.putPatch(at,before,after);}
 await h.seek(head);assert.deepEqual(h.session.exportTimber().bytes,original,'normalizing patches changed export bytes');
 const next=Math.max(2**43,...h.bank.index(h.bankKeys??h.bank.items?.keys()??[]).map(x=>x.key))+1;
 // Clear the old compression dictionary while allocating above every existing cold key.
 h.bank=new L.StateBank(disk,[],1,Math.max(next,...disk.offsets.keys())+1);
 const fd=openSync(path+'.final.dgm','w');try{await h.save(async b=>writeSync(fd,b));}finally{closeSync(fd);}console.log('Final codec',size,statSync(path+'.final.dgm').size);
}finally{disk.close();}}
