import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {serialize} from 'node:v8';
import {HERE,LOCAL,deps,json,hash} from './common.mjs';
const apiPath=resolve(LOCAL,'api.cjs'), fingerprint=hash(readFileSync(apiPath));
const directory=resolve(LOCAL,'m9b-inputs');mkdirSync(directory,{recursive:true});
if(!isMainThread){
  const api=deps(apiPath);
  parentPort.on('message',c=>{
    try{
      const start=performance.now(),g=api.generate(api.makeSpec({seed:c.seed,theme:c.theme,size:{x:c.size,y:c.size}}));
      const input={model:g.built.waterModel,provenance:{base:'6c29b7e5',api:fingerprint},generationMs:performance.now()-start,timings:g.timings,passed:g.report.passed,attempts:g.attempts,exportHash:hash(g.bytes)};
      writeFileSync(resolve(directory,c.id+'.bin'),serialize(input));
      parentPort.postMessage({id:c.id,...input,model:undefined});
    }catch(e){parentPort.postMessage({id:c.id,error:String(e)});}
  });
}else{
  const api=deps(apiPath),cases=[];
  for(const size of [128,256])for(const theme of api.AVAILABLE_THEMES)for(let seed=1;seed<=(size===128?100:50);seed++)cases.push({id:`m9b-${theme}-${size}-${seed}`,theme,size,seed});
  const rows=[],pending=cases.filter(c=>{const path=resolve(directory,c.id+'.json');if(!existsSync(path))return true;const row=JSON.parse(readFileSync(path));if(row.provenance.api!==fingerprint)return true;rows.push(row);return false;});
  let index=0;const jobs=Number(process.env.DGM_JOBS??4);
  console.log('M9b batch',cases.length,'pending',pending.length);
  await Promise.all(Array.from({length:Math.min(jobs,pending.length)},()=>new Promise((resolveJob,reject)=>{
    const worker=new Worker(new URL(import.meta.url));
    const next=()=>{if(index<pending.length)worker.postMessage(pending[index++]);else worker.terminate().then(resolveJob);};
    worker.on('message',row=>{if(row.error){worker.terminate();reject(Error(row.id+' '+row.error));return;}
      writeFileSync(resolve(directory,row.id+'.json'),JSON.stringify(row)+'\n');rows.push(row);
      json('m9b-progress.json',{complete:rows.length,total:cases.length,fingerprint});
      if(rows.length%10===0)console.log(rows.length+'/'+cases.length,row.id,Math.round(row.generationMs)+'ms');next();});
    worker.on('error',reject);next();
  })));
  json('m9b-generation.json',{fingerprint,cases:rows.sort((a,b)=>a.id.localeCompare(b.id)),complete:rows.length,total:cases.length});
  console.log('M9b batch complete',rows.length);
}
