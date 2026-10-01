import {Worker,isMainThread,workerData,parentPort} from 'node:worker_threads';
import {resolve} from 'node:path';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {LOCAL,json,hash,arg} from './common.mjs';
import {listCases} from './cases.mjs';
if(!isMainThread) {
  const {checkCase}=await import('./check-case.mjs');
  parentPort.on('message',c=>{
    if(!c)return;
    try {parentPort.postMessage({row:checkCase(c,workerData.buildId)});}
    catch(e) {parentPort.postMessage({error:e.stack,id:c.id});}
  });
} else {
  writeFileSync(resolve(LOCAL,'proof.pid'), String(process.pid));
  const buildId=hash(readFileSync(resolve(LOCAL,'baseline.cjs'))+readFileSync(resolve(LOCAL,'fast.cjs')));
  const cases=listCases().filter(c=>!arg('filter','')||c.id.includes(arg('filter','')));
  const workers=Number(arg('workers','4')),pending=[],rows=[];
  for(const c of cases) {
    const path=resolve(LOCAL,'proof',c.id+'.json');
    if(existsSync(path)) {const row=JSON.parse(readFileSync(path,'utf8'));if(row.buildId===buildId&&row.status==='pass'){rows.push(row);continue;}}
    pending.push(c);
  }
  const started=Date.now();let complete=rows.length,index=0;
  console.log(`proof ${complete}/${cases.length} cached; ${pending.length} pending; ${workers} workers`);
  const promises=Array.from({length:Math.min(workers,pending.length)},()=>new Promise((res,rej)=>{
    const w=new Worker(new URL(import.meta.url),{workerData:{buildId}});
    const next=()=>{if(index<pending.length)w.postMessage(pending[index++]);else w.terminate().then(res);};
    w.on('message',msg=>{
      if(msg.error){w.terminate();rej(Error(msg.id+'\n'+msg.error));return;}
      const row=msg.row;json(resolve(LOCAL,'proof',row.id+'.json'),row);rows.push(row);complete++;
      console.log(`PASS ${complete}/${cases.length} ${row.id} ${Math.round(row.elapsedMs/1000)}s ${row.checkpoints} checkpoints`);
      json(resolve(LOCAL,'proof-progress.json'),{complete,total:cases.length,started,buildId,workers});next();
    });
    w.on('error',rej);next();
  }));
  try {await Promise.all(promises);}catch(e){console.error(e);process.exit(1);}
  json(resolve(LOCAL,'proof.json'),{buildId,workers,started,elapsedMs:Date.now()-started,cases:rows.sort((a,b)=>a.id.localeCompare(b.id)),status:'pass'});
  console.log('PROOF COMPLETE',rows.length,'cases');
}
