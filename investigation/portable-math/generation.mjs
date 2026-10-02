import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {serialize} from 'node:v8';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
import {deps,ROOT,LOCAL,json,hash} from './common.mjs';
import {host} from './host.mjs';
const smoke=process.argv.includes('--smoke'),resume=process.argv.includes('--resume'),directory=resolve(LOCAL,smoke?'generation-smoke':'generation');mkdirSync(directory,{recursive:true});
const sizeFilter=process.env.DGM_SIZE?Number(process.env.DGM_SIZE):null;if(sizeFilter!==null&&![96,128,256].includes(sizeFilter))throw Error('Invalid size shard');
const cases=[];for(const size of sizeFilter?[sizeFilter]:[96,128,256])for(const theme of ['any','riverValley','canyon','highlands','lakeBasin','delta','islands'])for(let seed=1;seed<=(smoke?1:40);seed++)cases.push({id:`m9b-${theme}-${size}-${seed}`,size,theme,seed});
const fingerprint=hash(readFileSync(resolve(LOCAL,'build.json'))),source=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const summary={source,fingerprint,smoke,sizeShard:sizeFilter,total:cases.length,complete:0,engines:{},mismatches:[],errors:[],changes:{},platform:{os:os.platform(),arch:os.arch(),node:process.version,cpu:os.cpus()[0].model}};
const server=await host(),browsers=[],engines={},rows=[];
try{
  async function start(){for(const name of ['chromium','firefox','webkit']){const b=await deps('playwright')[name].launch({headless:true});browsers.push(b);engines[name]=b;if(summary.engines[name]&&summary.engines[name].version!==b.version())throw Error('Engine version changed');summary.engines[name]={version:b.version()};}}
  await start();
  let cursor=0;const lanes=Math.max(1,Number(process.env.DGM_JOBS??3));
  let used=0;
  async function lane(stop){while(cursor<stop){const c=cases[cursor++],path=resolve(directory,c.id+'.json');let row;
    if(resume&&existsSync(path)){const old=JSON.parse(readFileSync(path));if(old.fingerprint===fingerprint&&JSON.stringify(old.engines)===JSON.stringify(summary.engines))row=old;}
    if(!row){used++;row={id:c.id,fingerprint,engines:summary.engines,results:{}};
      await Promise.all(Object.keys(engines).map(async name=>{
        // Retire the page too: long-lived WebKit pages stopped delivering worker
        // messages after hundreds of successful worker lifetimes on Windows.
        const page=await engines[name].newPage();let timer;
        try{
          await page.goto(server.url,{waitUntil:'domcontentloaded',timeout:120000});if(!await page.evaluate(()=>crossOriginIsolated))throw Error('Isolation missing');
          const result=await Promise.race([page.evaluate(c=>window.job('generation-worker.js',{...c,model:c.model}),{...c,model:name==='chromium'}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(name+' '+c.id+' timed out')),300000);})]);
          if(result.error)throw Error(name+' '+c.id+': '+result.error);if(result.model){writeFileSync(resolve(directory,c.id+'.bin'),serialize({model:result.model,provenance:{source,fingerprint,id:c.id}}));delete result.model;}delete result.ms;row.results[name]=result;
        }finally{clearTimeout(timer);await page.close();}
      }));
      writeFileSync(path,JSON.stringify(row)+'\n');
    }
    for(const r of Object.values(row.results))delete r.ms;writeFileSync(path,JSON.stringify(row)+'\n');
    rows.push(row);const ref=row.results.chromium.adopted;
    for(const [name,result]of Object.entries(row.results)){
      if(result.adopted.hash!==ref.hash)summary.mismatches.push({id:c.id,engine:name,components:Object.keys(ref.components).filter(k=>ref.components[k]!==result.adopted.components[k])});
      for(const k of Object.keys(ref.components))if(result.baseline.components[k]!==result.adopted.components[k]){summary.changes[name]??={};summary.changes[name][k]=(summary.changes[name][k]??0)+1;}
    }
    summary.complete++;json(smoke?'generation-smoke-progress.json':'generation-progress.json',summary);
    if(summary.complete%10===0||summary.mismatches.length)console.log(`GEN ${summary.complete}/${cases.length} ${c.id} mismatches=${summary.mismatches.length}`);
  }}
  for(let stop=40;cursor<cases.length;stop+=40){await Promise.all(Array.from({length:lanes},()=>lane(Math.min(stop,cases.length))));if(used&&cursor<cases.length){await Promise.all(browsers.splice(0).map(b=>b.close()));await start();used=0;}}

}catch(e){summary.errors.push(String(e));throw e;}finally{await Promise.all(browsers.map(b=>b.close()));server.close();json(smoke?'generation-smoke-summary.json':'generation-summary.json',summary);}
json(smoke?'generation-smoke-manifest.json':'generation-manifest.json',rows.sort((a,b)=>a.id.localeCompare(b.id)));
console.log('Generation complete',summary.complete,'cross-engine mismatches',summary.mismatches.length,'changes',JSON.stringify(summary.changes));
if(summary.complete!==summary.total||summary.mismatches.length||summary.errors.length)process.exitCode=1;
