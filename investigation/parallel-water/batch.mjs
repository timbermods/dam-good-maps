import {resolve} from 'node:path';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {deserialize} from 'node:v8';
import {staticHost,openIsolated,job} from './host.mjs';
import {LOCAL,deps,json,hash} from './common.mjs';
const directory=resolve(LOCAL,'m9b-inputs'),out=resolve(LOCAL,'batch');mkdirSync(out,{recursive:true});
const worker=process.env.DGM_COORDINATOR??'coordinator.js';
const api=deps(resolve(LOCAL,'api.cjs')),build=hash(readFileSync(resolve(LOCAL,worker))+readFileSync(resolve(LOCAL,'helper.js')));
const cases=[];for(const size of [128,256])for(const theme of api.AVAILABLE_THEMES)for(let seed=1;seed<=(size===128?100:50);seed++)cases.push({id:`m9b-${theme}-${size}-${seed}`,size,theme,seed});
const host=await staticHost(worker,true),evidence={build,base:'6c29b7e5',complete:0,total:cases.length,engines:{},mismatches:[],errors:[]};
const browsers=[],contexts={};
try{
  for(const name of ['chromium','firefox','webkit']) {
    const browser=await deps('playwright')[name].launch({headless:true});browsers.push(browser);
    contexts[name]=await openIsolated(browser,host.url);evidence.engines[name]={version:browser.version(),counts:contexts[name].counts};
  }
  for(const c of cases){
    if(existsSync(resolve(LOCAL,'pause-batch')))break;
    const inputPath=resolve(directory,c.id+'.bin'),rowPath=resolve(out,c.id+'.json');
    while(!existsSync(inputPath))await new Promise(r=>setTimeout(r,1000));
    const input=readFileSync(inputPath),inputHash=hash(input);
    if(existsSync(rowPath)){const previous=JSON.parse(readFileSync(rowPath));if(previous.build===build&&previous.inputHash===inputHash&&JSON.stringify(previous.engines)===JSON.stringify(evidence.engines)){evidence.complete++;continue;}}
    const start=performance.now(),{model}=deserialize(input),row={id:c.id,build,inputHash,engines:evidence.engines,comparisons:[],verificationMs:0};
    let reference;
    async function check(name,threads) {
      const result=await job(contexts[name].page,{id:c.id,model},threads,threads!==1);
      if(result.error){evidence.errors.push({engine:name,id:c.id,threads,error:result.error});throw Error(JSON.stringify(evidence.errors.at(-1)));}
      if(result.threads!==threads)throw Error('Unexpected scalar fallback in isolated proof');
      const identity={hash:result.hash,ticks:result.ticks,volume:result.volume,result:result.result};
      if(!reference)reference=identity;else if(JSON.stringify(identity)!==JSON.stringify(reference)){evidence.mismatches.push({engine:name,id:c.id,threads,identity,reference});throw Error('Batch byte/tick mismatch');}
      row.comparisons.push({engine:name,requested:threads,...identity,checks:result.checks,dispatch:result.dispatch});
    }
    for(const threads of [...new Set(Object.values(contexts).flatMap(c=>c.counts))]) {
      const names=Object.keys(contexts).filter(name=>contexts[name].counts.includes(threads));
      const thin=row.comparisons.filter(r=>r.requested===4).length===3&&row.comparisons.filter(r=>r.requested===4).every(r=>r.dispatch?.parallel===0);
      if(threads<=4||thin||(c.size===128&&threads===16))await Promise.all(names.map(name=>check(name,threads)));
      else if(threads===8){await Promise.all(names.slice(0,2).map(name=>check(name,threads)));for(const name of names.slice(2))await check(name,threads);}
      else for(const name of names)await check(name,threads);
    }
    row.verificationMs=performance.now()-start;writeFileSync(rowPath,JSON.stringify(row)+'\n');evidence.complete++;json('batch-progress.json',evidence);
    if(evidence.complete%5===0)console.log('BATCH',evidence.complete+'/'+cases.length,c.id);
  }
}finally{for(const {page} of Object.values(contexts))await page.evaluate(()=>window.closeWorkers());await Promise.all(browsers.map(b=>b.close()));host.close();json('batch-summary.json',evidence);}
console.log('BATCH COMPLETE',evidence.complete);
