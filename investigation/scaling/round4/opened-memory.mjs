// Capacity check of the final wire/cache representation, separate from timed runs.
import assert from 'node:assert/strict';
import {openSync,readSync,closeSync,writeFileSync} from 'node:fs';
import {FileResults} from '../round2/node-store.mjs';
import * as L from '../local/round2/after.mjs';
function* chunks(path){const fd=openSync(path,'r');try{for(;;){const b=new Uint8Array(32768),n=readSync(fd,b);if(!n)break;yield b.subarray(0,n);}}finally{closeSync(fd);}}
for(const size of process.argv.slice(2).length?process.argv.slice(2).map(Number):[256,512]){
 const path=`investigation/scaling/local/round4/final/${size}-0`,disk=new FileResults(path+'-opened-memory.cache'),rows=[];
 try{const h=await L.GestureHistory.open(chunks(path+'.final.dgm'),disk),head=h.count;
  const sample=phase=>{global.gc?.();const cache=h.checkpointStats;assert(cache.recentCount<=100);assert(cache.recentBytes<=64*1024**2||cache.recentCount===1);rows.push({phase,memory:process.memoryUsage(),cache,results:h.results.stats});};
  sample('open');for(let depth=1;depth<=100;depth++){assert(h.undo());if(depth%25===0)sample('undo-'+depth);}assert(!h.undo());
  for(let depth=100;depth>=1;depth--){assert(h.redo());if(depth%25===0)sample('redo-'+depth);}assert.equal(h.count,head);sample('head');
  writeFileSync(`investigation/scaling/local/round4/final/${size}-opened-memory.json`,JSON.stringify({size,passed:true,rows},null,2));console.log('Final cache capacity',size,rows.at(-1).cache);
 }finally{disk.close();}
}
